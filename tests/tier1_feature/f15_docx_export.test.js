import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import JSZip from 'jszip';
import app from '../../server/src/index';
import { generateTypeEvaluationDocx } from '../../server/src/services/docxTypeEvaluationReport';
import { NOT_COVERED } from '../../server/src/services/pdfTypeEvaluationReport';
import { buildDemoData } from '../../server/src/lib/demoSeed';

/**
 * Tier 1: Feature 15 - editable Word (.docx) copy of the Type Evaluation Test Report.
 */
const jwtSecret = process.env.JWT_SECRET || 'nawi-reportpro-jwt-test-secret-2026';
const token = jwt.sign(
  { id: 'usr-officer-01', email: 'inspector@nawi.gov.in', name: 'Shri Vikramaditya Sharma', role: 'INSPECTOR', isActive: true },
  jwtSecret,
  { expiresIn: '1h' }
);
const auth = (r) => r.set('Authorization', `Bearer ${token}`);
const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

const demo = buildDemoData();
const sessions = demo.testSessions || demo.sessions || [];
// the in-memory database seals completed sessions when it boots, so the seed rows carry no seal yet
const sealedTE = sessions.find((s) => s.verificationType === 'TYPE_EVALUATION' && s.status === 'COMPLETED');
const openTE = sessions.find((s) => s.verificationType === 'TYPE_EVALUATION' && s.status === 'IN_PROGRESS');
const sealedVerification = sessions.find((s) => s.verificationType !== 'TYPE_EVALUATION' && s.status === 'COMPLETED');

async function documentText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

describe('Tier 1: Feature 15 - Word export of the Type Evaluation Test Report', () => {
  it('F15-TC1: the demo data has the sessions these tests need', () => {
    expect(sealedTE).toBeTruthy();
    expect(openTE).toBeTruthy();
    expect(sealedVerification).toBeTruthy();
  });

  it('F15-TC2: requires authentication', async () => {
    const res = await request(app).get(`/api/reports/${sealedTE.id}/docx`);
    expect(res.status).toBe(401);
  });

  it('F15-TC3: returns a valid .docx for a sealed type evaluation session', async () => {
    const res = await auth(request(app).get(`/api/reports/${sealedTE.id}/docx`)).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('wordprocessingml.document');
    expect(res.headers['content-disposition']).toContain(`TypeEvaluationReport_${sealedTE.certificateNo}.docx`);
    expect(res.body.subarray(0, 2).toString()).toBe('PK'); // a .docx is a zip archive
    const text = await documentText(res.body);
    expect(text).toContain('OIML R 76 TYPE EVALUATION TEST REPORT');
    expect(text).toContain(sealedTE.certificateNo);
    const stored = await auth(request(app).get(`/api/tests/${sealedTE.id}`));
    const seal = stored.body.data.verificationSeal;
    expect(seal).toMatch(/^[0-9a-f]{64}$/i);
    expect(text).toContain(seal); // the Word copy quotes the seal of the official record
  });

  it('F15-TC4: carries all five report sections, the six test rows and every test not covered', async () => {
    const res = await auth(request(app).get(`/api/reports/${sealedTE.id}/docx`)).buffer(true).parse(binary);
    const text = await documentText(res.body);
    for (const h of ['1. General information on the type', '2. Test equipment and conditions', '3. Summary of the type evaluation', '4. R 76-2 tests not covered by this report', '5. Conclusion']) {
      expect(text).toContain(h);
    }
    for (const clause of ['A.4.4', 'A.4.10', 'A.4.7', 'A.5.3', 'A.5.2', 'A.4.11']) expect(text).toContain(clause);
    for (const [, clause] of NOT_COVERED) expect(text).toContain(clause);
    expect(text.split('NOT TESTED').length - 1).toBe(NOT_COVERED.length);
  });

  it('F15-TC5: says plainly that it is an editable copy and not a certificate of approval', async () => {
    const res = await auth(request(app).get(`/api/reports/${sealedTE.id}/docx`)).buffer(true).parse(binary);
    const text = await documentText(res.body);
    expect(text).toContain('EDITABLE COPY');
    expect(text).toContain('sealed PDF report is the official record');
    expect(text).toContain('not a certificate of approval');
  });

  it('F15-TC6: refuses a session that is not sealed yet (409)', async () => {
    const res = await auth(request(app).get(`/api/reports/${openTE.id}/docx`));
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('F15-TC7: refuses a verification certificate session (400): Word export is for type evaluation reports', async () => {
    const res = await auth(request(app).get(`/api/reports/${sealedVerification.id}/docx`));
    expect(res.status).toBe(400);
  });

  it('F15-TC8: unknown session gives 404', async () => {
    const res = await auth(request(app).get('/api/reports/no-such-session/docx'));
    expect(res.status).toBe(404);
  });

  it('F15-TC9: the generator copes with a sparse session and marks a failed sample', async () => {
    const buf = await generateTypeEvaluationDocx({
      certificateNo: 'TER-TEST-0001',
      overallResult: 'FAIL',
      verificationType: 'TYPE_EVALUATION',
      instrument: { maxCapacity: 30, verificationInterval: 0.005, accuracyClass: 'CLASS_III', unit: 'kg' },
      testResults: [],
    });
    const text = await documentText(buf);
    expect(text).toContain('ONE OR MORE FAILED');
    expect(text).toContain('Test sample fails one or more tests in section 3.');
    expect(text).toContain('UNSEALED');
  });
});

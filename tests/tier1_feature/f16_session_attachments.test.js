import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import JSZip from 'jszip';
import app from '../../server/src/index';
import attachmentsRouter from '../../server/src/routes/attachments.routes';

/**
 * Tier 1: Feature 16 - photographs and supporting documents on a test session.
 * Demo data: sess-036 is an open type evaluation session of usr-officer-01;
 * sess-029 is a sealed one.
 */
const secret = process.env.JWT_SECRET || 'nawi-reportpro-jwt-test-secret-2026';
const tokenFor = (id, role) => jwt.sign({ id, email: `${id}@nawi.gov.in`, name: id, role, isActive: true }, secret, { expiresIn: '1h' });
const owner = tokenFor('usr-officer-01', 'INSPECTOR');
const otherOfficer = tokenFor('usr-officer-02', 'INSPECTOR');
const admin = tokenFor('usr-admin-01', 'ADMIN');
const viewer = tokenFor('usr-viewer-01', 'VIEWER');
const as = (token, r) => r.set('Authorization', `Bearer ${token}`);
const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

const OPEN = 'sess-036';
const SEALED = 'sess-029';
const pad = (head, n = 64) => Buffer.concat([head, Buffer.alloc(n, 0x41)]);
const PNG = pad(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const JPEG = pad(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
const PDF = pad(Buffer.from('%PDF-1.7\n'));
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x40, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(40, 1)]);
const EXE = pad(Buffer.from('MZ\x90\x00'));

const post = (token, session, buf, name, caption) => {
  const r = as(token, request(app).post(`/api/tests/${session}/attachments`)).attach('file', buf, name);
  return caption === undefined ? r : r.field('caption', caption);
};

describe('Tier 1: Feature 16 - session attachments', () => {
  let pngId;

  it('F16-TC1: an open session starts with no attachments and states the limits', async () => {
    const res = await as(owner, request(app).get(`/api/tests/${OPEN}/attachments`));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.limits).toMatchObject({ maxFiles: 10, maxFileBytes: 5 * 1024 * 1024 });
  });

  it('F16-TC2: the session owner attaches a photograph; type, size and SHA-256 are recorded', async () => {
    const res = await post(owner, OPEN, PNG, 'load receptor.png', 'Load receptor with 30 kg standard weight');
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ fileName: 'load receptor.png', mimeType: 'image/png', size: PNG.length, caption: 'Load receptor with 30 kg standard weight' });
    expect(res.body.data.sha256).toBe(crypto.createHash('sha256').update(PNG).digest('hex'));
    expect(res.body.data).not.toHaveProperty('data'); // metadata only
    pngId = res.body.data.id;
  });

  it('F16-TC3: JPEG, WebP and PDF are accepted', async () => {
    for (const [buf, name, mime] of [[JPEG, 'plate.jpg', 'image/jpeg'], [WEBP, 'seal.webp', 'image/webp'], [PDF, 'calibration certificate.pdf', 'application/pdf']]) {
      const res = await post(owner, OPEN, buf, name);
      expect(res.status).toBe(201);
      expect(res.body.data.mimeType).toBe(mime);
    }
  });

  it('F16-TC4: the download returns exactly the bytes that were uploaded', async () => {
    const res = await as(viewer, request(app).get(`/api/tests/${OPEN}/attachments/${pngId}`)).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-disposition']).toContain('attachment;');
    expect(Buffer.compare(res.body, PNG)).toBe(0);
  });

  it('F16-TC5: the type comes from the file content, not its name or the declared type', async () => {
    const disguised = await post(owner, OPEN, EXE, 'photo.png');
    expect(disguised.status).toBe(400);
    const renamed = await post(owner, OPEN, PNG, 'evil.exe');
    expect(renamed.status).toBe(201);
    expect(renamed.body.data).toMatchObject({ fileName: 'evil.png', mimeType: 'image/png' });
    const text = await post(owner, OPEN, Buffer.from('just some text, long enough to be sniffed'), 'notes.pdf');
    expect(text.status).toBe(400);
  });

  it('F16-TC6: path and markup characters are removed from file names', async () => {
    const res = await post(owner, OPEN, PNG, '../../etc/<script>pass wd.png');
    expect(res.status).toBe(201);
    expect(res.body.data.fileName).not.toMatch(/[\\/<>]/);
    expect(res.body.data.fileName.endsWith('.png')).toBe(true);
    expect(attachmentsRouter.safeName('..\\..\\secret.txt', 'pdf')).toBe('secret.pdf');
    expect(attachmentsRouter.safeName('', 'jpg')).toBe('file.jpg');
  });

  it('F16-TC7: a file over 5 MB is refused with 413', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await post(owner, OPEN, big, 'huge.png');
    expect(res.status).toBe(413);
  });

  it('F16-TC8: a request without a file is refused', async () => {
    const res = await as(owner, request(app).post(`/api/tests/${OPEN}/attachments`)).field('caption', 'nothing attached');
    expect(res.status).toBe(400);
  });

  it('F16-TC9: authentication and roles: no token 401, Auditor 403, another officer 403, Controller allowed', async () => {
    expect((await request(app).get(`/api/tests/${OPEN}/attachments`)).status).toBe(401);
    expect((await request(app).post(`/api/tests/${OPEN}/attachments`).attach('file', PNG, 'a.png')).status).toBe(401);
    expect((await post(viewer, OPEN, PNG, 'a.png')).status).toBe(403);
    expect((await post(otherOfficer, OPEN, PNG, 'a.png')).status).toBe(403);
    expect((await as(otherOfficer, request(app).delete(`/api/tests/${OPEN}/attachments/${pngId}`))).status).toBe(403);
    expect((await post(admin, OPEN, PNG, 'controller.png')).status).toBe(201);
    expect((await as(viewer, request(app).get(`/api/tests/${OPEN}/attachments`))).status).toBe(200); // read access for the Auditor
  });

  it('F16-TC10: a sealed session accepts no new attachments and no removals', async () => {
    expect((await post(admin, SEALED, PNG, 'late.png')).status).toBe(409);
    expect((await as(admin, request(app).delete(`/api/tests/${SEALED}/attachments/anything`))).status).toBe(409);
    expect((await as(admin, request(app).get(`/api/tests/${SEALED}/attachments`))).body.data).toEqual([]);
  });

  it('F16-TC11: unknown session and unknown attachment give 404', async () => {
    expect((await as(owner, request(app).get('/api/tests/no-such-session/attachments'))).status).toBe(404);
    expect((await as(owner, request(app).get(`/api/tests/${OPEN}/attachments/no-such-file`))).status).toBe(404);
    expect((await as(owner, request(app).delete(`/api/tests/${OPEN}/attachments/no-such-file`))).status).toBe(404);
  });

  it('F16-TC12: an attachment cannot be fetched through a different session', async () => {
    const res = await as(admin, request(app).get(`/api/tests/${SEALED}/attachments/${pngId}`));
    expect(res.status).toBe(404);
  });

  it('F16-TC13: the owner can remove an attachment while the session is open', async () => {
    const before = (await as(owner, request(app).get(`/api/tests/${OPEN}/attachments`))).body.data.length;
    expect((await as(owner, request(app).delete(`/api/tests/${OPEN}/attachments/${pngId}`))).status).toBe(200);
    const after = (await as(owner, request(app).get(`/api/tests/${OPEN}/attachments`))).body.data;
    expect(after.length).toBe(before - 1);
    expect(after.find((a) => a.id === pngId)).toBeUndefined();
  });

  it('F16-TC14: at most 10 attachments per session', async () => {
    let count = (await as(owner, request(app).get(`/api/tests/${OPEN}/attachments`))).body.data.length;
    while (count < 10) {
      expect((await post(owner, OPEN, JPEG, `fill-${count}.jpg`)).status).toBe(201);
      count += 1;
    }
    expect((await post(owner, OPEN, JPEG, 'eleventh.jpg')).status).toBe(409);
  });

  it('F16-TC15: sniffType recognises only the four allowed formats', () => {
    const { sniffType } = attachmentsRouter;
    expect(sniffType(PNG).mime).toBe('image/png');
    expect(sniffType(JPEG).mime).toBe('image/jpeg');
    expect(sniffType(WEBP).mime).toBe('image/webp');
    expect(sniffType(PDF).mime).toBe('application/pdf');
    expect(sniffType(EXE)).toBeNull();
    expect(sniffType(Buffer.from('GIF89a' + 'x'.repeat(20)))).toBeNull();
    expect(sniffType(Buffer.alloc(4))).toBeNull();
    expect(sniffType('not a buffer')).toBeNull();
  });

  it('F16-TC16: the Word report lists attachments in its annex (and says so when there are none)', async () => {
    const res = await as(admin, request(app).get(`/api/reports/${SEALED}/docx`)).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    const xml = await (await JSZip.loadAsync(res.body)).file('word/document.xml').async('string');
    const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(text).toContain('Annex: photographs and supporting documents');
    expect(text).toContain('No photographs or documents were attached to this session.');
    expect(text).toContain('rule set OIML-R76-2006');
  });
});

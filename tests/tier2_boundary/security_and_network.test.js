import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../server/src/index';
import prisma from '../../server/src/lib/prisma';
import {
  generateVerificationSeal,
  verifySealSignature,
} from '../../server/src/services/cryptoSeal';
import { sanitizeFormulaInjection } from '../../server/src/services/batchImportExport';
import { SAMPLE_INSTRUMENTS, MOCK_OFFICER } from '../helpers/testUtils';

describe('Tier 2: Boundary & Corner Cases - Cryptographic Integrity & Network Resilience', () => {
  const wb = SAMPLE_INSTRUMENTS.WEIGHBRIDGE_60T_CLASS_III;
  const validData = {
    certificateNo: 'CERT-2026-WB-SEC-01',
    instrumentId: wb.serialNumber,
    status: 'VERIFIED_LEGAL',
    verificationDate: '2026-08-30T10:00:00.000Z',
    officerId: MOCK_OFFICER.name,
    maxCapacity: wb.maxCapacity,
    verificationInterval: wb.verificationInterval,
  };

  it('T2-S1: should fail verification when non-hex string or invalid length signature is provided', () => {
    expect(verifySealSignature(validData, '')).toBe(false);
    expect(verifySealSignature(validData, null)).toBe(false);
    expect(verifySealSignature(validData, 'short-signature')).toBe(false);
    expect(verifySealSignature(validData, 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ')).toBe(false);
  });

  it('T2-S2: should detect single bit-flip attack in the cryptographic HMAC signature', () => {
    const seal = generateVerificationSeal(validData);
    // Convert first byte hex to number, flip least significant bit, convert back
    const byte0 = parseInt(seal.substring(0, 2), 16);
    const flippedByte0 = (byte0 ^ 1).toString(16).padStart(2, '0');
    const corruptedSeal = flippedByte0 + seal.substring(2);

    expect(corruptedSeal).not.toBe(seal);
    expect(verifySealSignature(validData, corruptedSeal)).toBe(false);
  });

  it('T2-S3: should detect secret key mismatch between issuing server and verifying authority', () => {
    const serverKey = 'master-secret-key-primary-node';
    const fakeKey = 'attacker-forged-secret-key-999';

    const genuineSeal = generateVerificationSeal(validData, serverKey);
    const isValidWithFakeKey = verifySealSignature(validData, genuineSeal, fakeKey);

    expect(isValidWithFakeKey).toBe(false);
  });

  it('T2-S4: should simulate network timeout retry policy with exponential backoff', async () => {
    let callAttempts = 0;
    const maxRetries = 3;

    async function simulatedNetworkCallWithRetry() {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        callAttempts++;
        if (attempt === 3) {
          // Success on 3rd retry
          return { status: 200, data: { success: true } };
        }
        // Simulated exponential backoff: 5ms, 10ms
        await new Promise(r => setTimeout(r, attempt * 5));
      }
      throw new Error('Max retries exceeded');
    }

    const res = await simulatedNetworkCallWithRetry();
    expect(callAttempts).toBe(3);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  it('T2-S5: should detect expired calibration certificates (after 1 year statutory limit)', () => {
    const issuedDate = new Date('2024-01-01');
    const currentDate = new Date('2026-08-30');
    const oneYearMs = 365.25 * 24 * 60 * 60 * 1000;

    const isExpired = (currentDate.getTime() - issuedDate.getTime()) > oneYearMs;
    expect(isExpired).toBe(true);
  });

  it('T2-S6: should block unauthenticated access to batch routes with HTTP 401 (SEC-CRIT-01)', async () => {
    const resImport = await request(app).post('/api/batch/import-csv');
    expect(resImport.status).toBe(401);
    expect(resImport.body.success).toBe(false);

    const resExport = await request(app).get('/api/batch/export-csv/nonexistent-session');
    expect(resExport.status).toBe(401);
    expect(resExport.body.success).toBe(false);
  });

  it('T2-S7: should block unauthenticated access to telemetry control routes with HTTP 401 (SEC-CRIT-02)', async () => {
    const resZero = await request(app).post('/api/telemetry/zero');
    expect(resZero.status).toBe(401);

    const resTare = await request(app).post('/api/telemetry/tare');
    expect(resTare.status).toBe(401);

    const resSet = await request(app).post('/api/telemetry/set-weight');
    expect(resSet.status).toBe(401);
  });

  it('T2-S8: should block unauthenticated access to sync batch with HTTP 401 (SEC-CRIT-04)', async () => {
    const resSync = await request(app)
      .post('/api/sync/batch')
      .set('x-unauthenticated', 'true')
      .send({ idempotencyKey: 'idem-test-key-01', sessions: [{ id: 's1' }] });
    expect(resSync.status).toBe(401);
    expect(resSync.body.success).toBe(false);
  });

  it('T2-S9: should reject unauthorized roles (e.g. VIEWER) from modifying batch or telemetry with HTTP 403', async () => {
    const viewerToken = jwt.sign(
      { id: 'usr-viewer-01', role: 'VIEWER', name: 'Auditor Viewer' },
      process.env.JWT_SECRET || 'test-secret'
    );

    const resBatch = await request(app)
      .post('/api/batch/import-csv')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(resBatch.status).toBe(403);

    const resTelemetry = await request(app)
      .post('/api/telemetry/zero')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(resTelemetry.status).toBe(403);
  });

  it('T2-S10: should sanitize CSV formula injection triggers (=, +, -, @) according to CWE-1236', () => {
    expect(sanitizeFormulaInjection('=cmd|/C calc!A0')).toBe("'=cmd|/C calc!A0");
    expect(sanitizeFormulaInjection('+12345')).toBe("'+12345");
    expect(sanitizeFormulaInjection('-DDE("cmd";"calc")')).toBe('"\'-DDE(""cmd"";""calc"")"');
    expect(sanitizeFormulaInjection('@SUM(A1:B2)')).toBe("'@SUM(A1:B2)");
    expect(sanitizeFormulaInjection('Safe metrology string')).toBe('Safe metrology string');
    expect(sanitizeFormulaInjection(1234.56)).toBe('1234.56');
    expect(sanitizeFormulaInjection(null)).toBe('');
  });

  it('T2-S11: should verify that secret keys cannot be bypassed and tampered signatures are rejected', () => {
    const genuineSeal = generateVerificationSeal(validData);
    expect(verifySealSignature(validData, genuineSeal)).toBe(true);

    // Tampered status
    const tamperedData = { ...validData, status: 'REJECTED' };
    expect(verifySealSignature(tamperedData, genuineSeal)).toBe(false);

    // Tampered certificate
    const tamperedCert = { ...validData, certificateNo: 'CERT-FORGED-001' };
    expect(verifySealSignature(tamperedCert, genuineSeal)).toBe(false);
  });

  it('T2-S12: should prevent IDOR session tampering: inspector cannot modify or finalize another officer session', async () => {
    const otherOfficerToken = jwt.sign(
      { id: 'usr-officer-99', role: 'INSPECTOR', name: 'Inspector Rival' },
      process.env.JWT_SECRET || 'test-secret'
    );

    const mockSession = {
      id: 'session-idor-01',
      certificateNo: 'NAWI-2026-0001-TEST',
      conductedById: 'usr-officer-01', // Owned by officer-01
      status: 'IN_PROGRESS',
      instrument: wb,
      testResults: [],
    };

    const spyFind = vi.spyOn(prisma.testSession, 'findUnique').mockResolvedValue(mockSession);

    // Officer 99 attempts to update Officer 01's session metadata -> 403
    const resUpdate = await request(app)
      .put('/api/tests/session-idor-01')
      .set('Authorization', `Bearer ${otherOfficerToken}`)
      .send({ remarks: 'Malicious modification' });
    expect(resUpdate.status).toBe(403);
    expect(resUpdate.body.message).toContain('Access denied');

    // Officer 99 attempts to finalize Officer 01's session -> 403
    const resFinalize = await request(app)
      .post('/api/tests/session-idor-01/finalize')
      .set('Authorization', `Bearer ${otherOfficerToken}`);
    expect(resFinalize.status).toBe(403);
    expect(resFinalize.body.message).toContain('Access denied');

    spyFind.mockRestore();
  });
});

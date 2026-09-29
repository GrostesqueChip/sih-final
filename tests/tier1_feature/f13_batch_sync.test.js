import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../server/src/index';
import { idempotencyStore } from '../../server/src/controllers/sync.controller';
import { demoFieldReadings } from '../helpers/testUtils';

describe('Tier 1: Feature 13 - Backend Idempotent Batch Sync Transactional Endpoint', () => {
  beforeEach(() => {
    idempotencyStore.clear();
  });

  it('F13-TC1: should accept valid batch sync payload and return success with synced session IDs', async () => {
    const payload = {
      idempotencyKey: 'test_sync_key_001',
      timestamp: new Date().toISOString(),
      offlineOfficerId: 'officer-001',
      sessions: [
        {
          localId: 'local-session-001',
          testDate: new Date().toISOString(),
          ...demoFieldReadings('PASS'),
        },
      ],
    };

    const res = await request(app).post('/api/sync/batch').send(payload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.syncedCount).toBe(1);
    expect(res.body.sessionIds).toHaveLength(1);
    expect(res.body.idempotentReplay).toBe(false);
    expect(res.body.results[0].sessionStatus).toBe('COMPLETED');
    expect(res.body.results[0].overallResult).toBe('PASS');
    expect(res.body.results[0].certificateNo).toMatch(/^NAWI-\d{4}-\d{6}$/);
  });

  it('F13-TC2: should return cached result without duplicate insertions on duplicate replay (Idempotency)', async () => {
    const payload = {
      idempotencyKey: 'test_sync_key_replay_002',
      timestamp: new Date().toISOString(),
      offlineOfficerId: 'officer-001',
      sessions: [
        { localId: 'local-session-002', ...demoFieldReadings('PASS') },
      ],
    };

    // First call
    const res1 = await request(app).post('/api/sync/batch').send(payload);
    expect(res1.status).toBe(200);
    expect(res1.body.idempotentReplay).toBe(false);
    const sessionIds1 = res1.body.sessionIds;

    // Second call with same idempotencyKey
    const res2 = await request(app).post('/api/sync/batch').send(payload);
    expect(res2.status).toBe(200);
    expect(res2.body.idempotentReplay).toBe(true);
    expect(res2.body.syncedCount).toBe(1);
    expect(res2.body.sessionIds).toEqual(sessionIds1);
  });

  it('F13-TC3: should reject batch sync payload with missing or empty idempotencyKey (400 Bad Request)', async () => {
    const invalidPayload = {
      timestamp: new Date().toISOString(),
      sessions: [{ localId: 's-1' }],
    };

    const res = await request(app).post('/api/sync/batch').send(invalidPayload);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('idempotencyKey');
  });

  it('F13-TC4: should reject payload with empty sessions array (400 Bad Request)', async () => {
    const emptyPayload = {
      idempotencyKey: 'test_sync_empty_003',
      timestamp: new Date().toISOString(),
      sessions: [],
    };

    const res = await request(app).post('/api/sync/batch').send(emptyPayload);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('sessions');
  });

  it('F13-TC5: should process multi-session batches atomically and report sync status', async () => {
    const multiPayload = {
      idempotencyKey: 'test_sync_multi_004',
      timestamp: new Date().toISOString(),
      offlineOfficerId: 'officer-001',
      sessions: [
        { localId: 'multi-1', ...demoFieldReadings('PASS', 0) },
        { localId: 'multi-2', ...demoFieldReadings('PASS', 1) },
        { localId: 'multi-3', ...demoFieldReadings('FAIL', 0) },
      ],
    };

    const res = await request(app).post('/api/sync/batch').send(multiPayload);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.syncedCount).toBe(3);
    expect(res.body.sessionIds).toHaveLength(3);
    expect(res.body.results.map((r) => r.overallResult)).toEqual(['PASS', 'PASS', 'FAIL']);

    // Verify GET /api/sync/status endpoint
    const statusRes = await request(app).get('/api/sync/status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe('ONLINE');
    expect(statusRes.body.idempotencyCacheSize).toBeGreaterThanOrEqual(1);
  });

  it('F13-TC6: should compute the verdict from readings and ignore a verdict claimed by the device', async () => {
    const res = await request(app).post('/api/sync/batch').send({
      idempotencyKey: 'test_sync_claimed_verdict_005',
      sessions: [
        {
          localId: 'claims-pass',
          overallStatus: 'VERIFIED_LEGAL',
          overallResult: 'PASS',
          ...demoFieldReadings('FAIL'),
        },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.results[0].overallResult).toBe('FAIL');

    const verify = await request(app).get(`/api/reports/verify/${res.body.results[0].certificateNo}`);
    expect(verify.body.authentic).toBe(true);
    expect(verify.body.verdict).toBe('FAIL');
    expect(verify.body.valid).toBe(false);
  });

  it('F13-TC7: should not issue a sealed certificate for a session without readings', async () => {
    const res = await request(app).post('/api/sync/batch').send({
      idempotencyKey: 'test_sync_no_readings_006',
      sessions: [{ localId: 'no-readings', instrumentId: demoFieldReadings('PASS').instrumentId, overallStatus: 'VERIFIED_LEGAL', results: [] }],
    });

    expect(res.status).toBe(200);
    expect(res.body.results[0].sessionStatus).toBe('IN_PROGRESS');
    expect(res.body.results[0].overallResult).toBe(null);

    const verify = await request(app).get(`/api/reports/verify/${res.body.results[0].certificateNo}`);
    expect(verify.body.valid).toBe(false);
    expect(verify.body.authentic).toBe(false);
  });

  it('F13-TC8: should reject sessions for instruments that are not on the register', async () => {
    const res = await request(app).post('/api/sync/batch').send({
      idempotencyKey: 'test_sync_unknown_instrument_007',
      sessions: [{ localId: 'ghost', ...demoFieldReadings('PASS'), instrumentId: 'inst-does-not-exist' }],
    });

    expect(res.status).toBe(207);
    expect(res.body.syncedCount).toBe(0);
    expect(res.body.failedCount).toBe(1);
    expect(res.body.results[0].status).toBe('FAILED');
    expect(res.body.results[0].error).toContain('not on the register');
  });
});

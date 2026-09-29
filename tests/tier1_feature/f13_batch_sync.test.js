import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../server/src/index';
import { idempotencyStore } from '../../server/src/controllers/sync.controller';

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
          instrumentId: 'inst-wb-60t',
          testDate: new Date().toISOString(),
          overallStatus: 'VERIFIED_LEGAL',
          results: [
            {
              testType: 'WEIGHING_PERFORMANCE',
              passed: true,
              data: { points: [{ load: 10000, reading: 10000 }] },
              calculations: { overallPass: true },
            },
          ],
        },
      ],
    };

    const res = await request(app).post('/api/sync/batch').send(payload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.syncedCount).toBe(1);
    expect(res.body.sessionIds).toHaveLength(1);
    expect(res.body.idempotentReplay).toBe(false);
  });

  it('F13-TC2: should return cached result without duplicate insertions on duplicate replay (Idempotency)', async () => {
    const payload = {
      idempotencyKey: 'test_sync_key_replay_002',
      timestamp: new Date().toISOString(),
      offlineOfficerId: 'officer-001',
      sessions: [
        {
          localId: 'local-session-002',
          instrumentId: 'inst-wb-60t',
          overallStatus: 'VERIFIED_LEGAL',
        },
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
        { localId: 'multi-1', instrumentId: 'inst-1', overallStatus: 'VERIFIED_LEGAL' },
        { localId: 'multi-2', instrumentId: 'inst-2', overallStatus: 'VERIFIED_LEGAL' },
        { localId: 'multi-3', instrumentId: 'inst-3', overallStatus: 'REJECTED' },
      ],
    };

    const res = await request(app).post('/api/sync/batch').send(multiPayload);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.syncedCount).toBe(3);
    expect(res.body.sessionIds).toHaveLength(3);

    // Verify GET /api/sync/status endpoint
    const statusRes = await request(app).get('/api/sync/status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe('ONLINE');
    expect(statusRes.body.idempotencyCacheSize).toBeGreaterThanOrEqual(1);
  });
});

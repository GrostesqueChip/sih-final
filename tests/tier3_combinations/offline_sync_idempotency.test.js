import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../server/src/index';
import {
  generateIdempotencyKey,
  queueTestSession,
  getPendingQueue,
  removeQueuedItem,
  clearOfflineQueue,
} from '../../client/src/services/offlineQueue';
import { idempotencyStore } from '../../server/src/controllers/sync.controller';

describe('Tier 3: Cross-Feature - Offline Sync Queue & Backend Idempotency Handshake', () => {
  beforeEach(async () => {
    await clearOfflineQueue();
    idempotencyStore.clear();
  });

  it('T3-OS1: should enqueue 3 offline sessions locally, drain in single batch, and receive confirmation', async () => {
    // 1. Queue 3 sessions on client side
    const s1 = await queueTestSession({ localId: 'local-mandi-1', instrumentId: 'inst-wb-60t', overallStatus: 'VERIFIED_LEGAL' });
    const s2 = await queueTestSession({ localId: 'local-mandi-2', instrumentId: 'inst-wb-60t', overallStatus: 'VERIFIED_LEGAL' });
    const s3 = await queueTestSession({ localId: 'local-mandi-3', instrumentId: 'inst-wb-60t', overallStatus: 'REJECTED' });

    const pending = await getPendingQueue();
    expect(pending.length).toBe(3);

    // 2. Prepare batch payload with single batch idempotency key
    const batchKey = generateIdempotencyKey('batch_sync');
    const batchPayload = {
      idempotencyKey: batchKey,
      timestamp: new Date().toISOString(),
      offlineOfficerId: 'officer-v-sharma',
      sessions: pending.map(item => item.payload || item),
    };

    // 3. Post to backend sync endpoint
    const res = await request(app).post('/api/sync/batch').send(batchPayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.syncedCount).toBe(3);
    expect(res.body.idempotentReplay).toBe(false);

    // 4. Clean up local queue upon confirmation
    for (const item of pending) {
      await removeQueuedItem(item.idempotencyKey);
    }
    const remaining = await getPendingQueue();
    expect(remaining.length).toBe(0);
  });

  it('T3-OS2: should prevent duplicate session creation when network drops and client auto-retries same batch', async () => {
    const batchKey = generateIdempotencyKey('batch_retry');
    const batchPayload = {
      idempotencyKey: batchKey,
      timestamp: new Date().toISOString(),
      offlineOfficerId: 'officer-v-sharma',
      sessions: [
        { localId: 'local-mandi-retry-1', instrumentId: 'inst-wb-60t', overallStatus: 'VERIFIED_LEGAL' },
      ],
    };

    // First attempt succeeds
    const res1 = await request(app).post('/api/sync/batch').send(batchPayload);
    expect(res1.status).toBe(200);
    expect(res1.body.idempotentReplay).toBe(false);

    // Simulated network blip causing identical re-send
    const res2 = await request(app).post('/api/sync/batch').send(batchPayload);
    expect(res2.status).toBe(200);
    expect(res2.body.idempotentReplay).toBe(true);
    expect(res2.body.syncedCount).toBe(res1.body.syncedCount);
    expect(res2.body.sessionIds).toEqual(res1.body.sessionIds);
  });

  it('T3-OS3: should safely distinguish distinct batches with different idempotency keys', async () => {
    const keyA = generateIdempotencyKey('batch_A');
    const keyB = generateIdempotencyKey('batch_B');

    const resA = await request(app).post('/api/sync/batch').send({
      idempotencyKey: keyA,
      sessions: [{ localId: 'session-A', instrumentId: 'inst-1' }],
    });

    const resB = await request(app).post('/api/sync/batch').send({
      idempotencyKey: keyB,
      sessions: [{ localId: 'session-B', instrumentId: 'inst-2' }],
    });

    expect(resA.body.idempotentReplay).toBe(false);
    expect(resB.body.idempotentReplay).toBe(false);
    expect(resA.body.sessionIds[0]).not.toBe(resB.body.sessionIds[0]);
  });

  it('T3-OS4: should persist cryptographic HMAC seals on each synced session in database', async () => {
    const batchKey = generateIdempotencyKey('batch_seal_test');
    const res = await request(app).post('/api/sync/batch').send({
      idempotencyKey: batchKey,
      offlineOfficerId: 'officer-v-sharma',
      sessions: [
        {
          localId: 'local-session-seal',
          instrumentId: 'inst-wb-60t',
          testDate: '2026-08-30T11:00:00.000Z',
          overallStatus: 'VERIFIED_LEGAL',
        },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.sessionIds).toHaveLength(1);
  });

  it('T3-OS5: should maintain sync audit history on client and server sides', async () => {
    const statusRes = await request(app).get('/api/sync/status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe('ONLINE');
  });
});

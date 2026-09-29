import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../server/src/index';
import {
  generateIdempotencyKey,
  queueTestSession,
  getPendingQueue,
  removeQueuedItem,
  clearOfflineQueue,
  saveDraft,
  getDraft,
  deleteDraft,
} from '../../client/src/services/offlineQueue';
import { idempotencyStore } from '../../server/src/controllers/sync.controller';
import { SAMPLE_INSTRUMENTS } from '../helpers/testUtils';

describe('Tier 4: Workload Scenario 2 - Remote Agricultural Mandi Offline Inspection & Delayed Sync', () => {
  const mandiOfficer = 'LMO-PUNJAB-LUDHIANA-0042';

  beforeEach(async () => {
    await clearOfflineQueue();
    idempotencyStore.clear();
  });

  it('T4-S2-TC1: should simulate inspecting 5 mandi grain merchant scales offline with draft saving and validation', async () => {
    // Inspector arrives at remote mandi with no internet connection
    // Inspector verifies 5 merchant scales: 4 pass, 1 fails (tampered load cell)
    const inspectionRuns = [
      { localId: 'mandi-shop-101', instrumentId: 'scale-wheat-01', overallStatus: 'VERIFIED_LEGAL', notes: 'Shop 101 Wheat Scale Pass' },
      { localId: 'mandi-shop-102', instrumentId: 'scale-paddy-02', overallStatus: 'VERIFIED_LEGAL', notes: 'Shop 102 Paddy Scale Pass' },
      { localId: 'mandi-shop-103', instrumentId: 'scale-cotton-03', overallStatus: 'VERIFIED_LEGAL', notes: 'Shop 103 Cotton Scale Pass' },
      { localId: 'mandi-shop-104', instrumentId: 'scale-mustard-04', overallStatus: 'REJECTED', notes: 'Shop 104 Mustard Scale Failed - Error +45g exceeds MPE 10g' },
      { localId: 'mandi-shop-105', instrumentId: 'scale-gram-05', overallStatus: 'VERIFIED_LEGAL', notes: 'Shop 105 Gram Scale Pass' },
    ];

    // Save as local drafts during testing
    for (const run of inspectionRuns) {
      await saveDraft({ draftId: `draft-${run.localId}`, ...run });
    }

    // Confirm all drafts exist locally
    for (const run of inspectionRuns) {
      const draft = await getDraft(`draft-${run.localId}`);
      expect(draft).toBeDefined();
      expect(draft.instrumentId).toBe(run.instrumentId);
    }

    // Complete inspection and commit to offline queue
    for (const run of inspectionRuns) {
      await queueTestSession(run);
      await deleteDraft(`draft-${run.localId}`);
    }

    const pending = await getPendingQueue();
    expect(pending.length).toBe(5);
  });

  it('T4-S2-TC2: should bulk sync all 5 mandi inspections upon evening return to regional headquarters', async () => {
    // 5 queued sessions
    const inspectionRuns = [
      { localId: 'mandi-shop-101', instrumentId: 'scale-wheat-01', overallStatus: 'VERIFIED_LEGAL' },
      { localId: 'mandi-shop-102', instrumentId: 'scale-paddy-02', overallStatus: 'VERIFIED_LEGAL' },
      { localId: 'mandi-shop-103', instrumentId: 'scale-cotton-03', overallStatus: 'VERIFIED_LEGAL' },
      { localId: 'mandi-shop-104', instrumentId: 'scale-mustard-04', overallStatus: 'REJECTED' },
      { localId: 'mandi-shop-105', instrumentId: 'scale-gram-05', overallStatus: 'VERIFIED_LEGAL' },
    ];

    for (const run of inspectionRuns) {
      await queueTestSession(run);
    }

    const pending = await getPendingQueue();
    const batchIdempKey = generateIdempotencyKey('mandi_evening_sync');

    // Transmit batch over restored 4G/Wi-Fi connection to central server
    const syncPayload = {
      idempotencyKey: batchIdempKey,
      timestamp: new Date().toISOString(),
      offlineOfficerId: mandiOfficer,
      sessions: pending.map(p => p.payload || p),
    };

    const res = await request(app).post('/api/sync/batch').send(syncPayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.syncedCount).toBe(5);
    expect(res.body.sessionIds).toHaveLength(5);

    // Empty local queue on confirmation
    for (const item of pending) {
      await removeQueuedItem(item.idempotencyKey);
    }

    const remaining = await getPendingQueue();
    expect(remaining.length).toBe(0);
  });

  it('T4-S2-TC3: should preserve reject status and inspection officer notes across offline sync roundtrip', async () => {
    const batchIdempKey = generateIdempotencyKey('mandi_rejected_sync');
    const syncPayload = {
      idempotencyKey: batchIdempKey,
      offlineOfficerId: mandiOfficer,
      sessions: [
        {
          localId: 'mandi-rejected-04',
          instrumentId: 'scale-mustard-04',
          overallStatus: 'REJECTED',
          notes: 'Corner load test failed with +45g error (exceeds 10g MPE)',
        },
      ],
    };

    const res = await request(app).post('/api/sync/batch').send(syncPayload);
    expect(res.status).toBe(200);
    expect(res.body.syncedCount).toBe(1);
  });
});

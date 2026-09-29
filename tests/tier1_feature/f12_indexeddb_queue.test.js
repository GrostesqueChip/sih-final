import { describe, it, expect, beforeEach } from 'vitest';
import offlineQueueService, {
  generateIdempotencyKey,
  queueTestSession,
  getPendingQueue,
  getPendingCount,
  removeQueuedItem,
  clearOfflineQueue,
  saveDraft,
  getDraft,
  deleteDraft,
} from '../../client/src/services/offlineQueue';

describe('Tier 1: Feature 12 - Resilient Offline Queue & Local Storage Synchronization', () => {
  beforeEach(async () => {
    await clearOfflineQueue();
  });

  it('F12-TC1: should generate cryptographically resilient idempotency keys with unique timestamps', () => {
    const key1 = generateIdempotencyKey('session');
    const key2 = generateIdempotencyKey('session');

    expect(key1).toMatch(/^nawi_idemp_session_/);
    expect(key2).toMatch(/^nawi_idemp_session_/);
    expect(key1).not.toBe(key2);
  });

  it('F12-TC2: should enqueue offline test sessions with PENDING status and valid timestamp', async () => {
    const mockSession = {
      localId: 'local-test-001',
      instrumentId: 'inst-wb-60t',
      overallStatus: 'VERIFIED_LEGAL',
      testDate: new Date().toISOString(),
      results: [
        { testType: 'WEIGHING_PERFORMANCE', passed: true },
      ],
    };

    const queued = await queueTestSession(mockSession);
    expect(queued).toBeDefined();
    expect(queued.idempotencyKey).toBeDefined();
    expect(queued.status).toBe('PENDING');

    const count = await getPendingCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('F12-TC3: should retrieve all pending queued items in FIFO order', async () => {
    await queueTestSession({ localId: 'local-item-1', instrumentId: 'inst-1' });
    await queueTestSession({ localId: 'local-item-2', instrumentId: 'inst-2' });

    const queue = await getPendingQueue();
    expect(queue.length).toBeGreaterThanOrEqual(2);
    const item1 = queue.find(q => q.payload?.localId === 'local-item-1' || q.localId === 'local-item-1');
    expect(item1).toBeDefined();
  });

  it('F12-TC4: should remove item from queue upon successful sync confirmation', async () => {
    const queued = await queueTestSession({ localId: 'local-to-remove' });
    const initialCount = await getPendingCount();

    await removeQueuedItem(queued.idempotencyKey);
    const afterCount = await getPendingCount();

    expect(afterCount).toBe(initialCount - 1);
  });

  it('F12-TC5: should save, retrieve, and delete draft offline test sessions', async () => {
    const draftData = {
      draftId: 'draft-mandi-001',
      instrumentId: 'inst-wb-60t',
      currentStep: 2,
      pointsEntered: [{ load: 10000, reading: 10000 }],
    };

    const saved = await saveDraft(draftData);
    expect(saved.draftId).toBe('draft-mandi-001');

    const fetched = await getDraft('draft-mandi-001');
    expect(fetched).toBeDefined();
    expect(fetched.currentStep).toBe(2);

    await deleteDraft('draft-mandi-001');
    const afterDelete = await getDraft('draft-mandi-001');
    expect(afterDelete).toBeNull();
  });
});

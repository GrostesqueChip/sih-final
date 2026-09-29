import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateIdempotencyKey,
  queueTestSession,
  getPendingQueue,
  getPendingCount,
  removeQueuedItem,
  clearOfflineQueue,
  saveDraft,
  getDraft,
  listDrafts,
  deleteDraft,
  cacheInstruments,
  getCachedInstruments,
  addSyncAuditLog,
  getSyncAuditLogs,
  drainQueue,
} from '../../client/src/services/offlineQueue';
import { syncBatch, getSyncStatus, verifyKeys } from '../../server/src/controllers/sync.controller';
import prisma from '../../server/src/lib/prisma';
import { SAMPLE_INSTRUMENTS, MOCK_OFFICER } from '../helpers/testUtils';

describe('Tier 1: Feature 9 - Resilient Offline Queue & Backend Idempotent Sync Gateway', () => {
  beforeEach(async () => {
    await clearOfflineQueue();
  });

  describe('1. Idempotency Key Generator & Uniqueness', () => {
    it('F9-TC1: should generate unique idempotency keys conforming to NAWI format', () => {
      const key1 = generateIdempotencyKey('session');
      const key2 = generateIdempotencyKey('session');

      expect(key1).toMatch(/^nawi_idemp_session_[a-f0-9]+_\d+$/);
      expect(key2).toMatch(/^nawi_idemp_session_[a-f0-9]+_\d+$/);
      expect(key1).not.toBe(key2);
    });

    it('F9-TC2: should ensure zero collisions across 500 consecutive key generations', () => {
      const keys = new Set();
      for (let i = 0; i < 500; i++) {
        const key = generateIdempotencyKey('test');
        expect(keys.has(key)).toBe(false);
        keys.add(key);
      }
      expect(keys.size).toBe(500);
    });
  });

  describe('2. Browser-Side Resilient Offline Queue & Drafts', () => {
    it('F9-TC3: should enqueue test sessions and retrieve them in chronological order', async () => {
      const session1 = {
        instrumentId: SAMPLE_INSTRUMENTS.WEIGHBRIDGE_60T_CLASS_III.id,
        testDate: new Date('2026-08-30T10:00:00Z').toISOString(),
        overallResult: 'PASS',
        remarks: 'Morning inspection',
      };

      const session2 = {
        instrumentId: SAMPLE_INSTRUMENTS.DUAL_INTERVAL_RETAIL_CLASS_III.id,
        testDate: new Date('2026-08-30T11:00:00Z').toISOString(),
        overallResult: 'PASS',
        remarks: 'Midday inspection',
      };

      const queued1 = await queueTestSession(session1);
      const queued2 = await queueTestSession(session2);

      expect(queued1.idempotencyKey).toBeDefined();
      expect(queued2.idempotencyKey).toBeDefined();

      const pending = await getPendingQueue();
      expect(pending).toHaveLength(2);
      expect(await getPendingCount()).toBe(2);

      // Remove session1
      await removeQueuedItem(queued1.idempotencyKey);
      expect(await getPendingCount()).toBe(1);
      const remaining = await getPendingQueue();
      expect(remaining[0].idempotencyKey).toBe(queued2.idempotencyKey);
    });

    it('F9-TC4: should manage offline inspection drafts with save, retrieve, list, and delete', async () => {
      const draftId = 'draft-wb-khanna-001';
      const draftData = {
        instrumentId: SAMPLE_INSTRUMENTS.WEIGHBRIDGE_60T_CLASS_III.id,
        currentStep: 3,
        partialReadings: [100, 200, 300],
      };

      await saveDraft(draftId, draftData);
      const retrieved = await getDraft(draftId);
      expect(retrieved).not.toBeNull();
      expect(retrieved.currentStep).toBe(3);
      expect(retrieved.partialReadings).toEqual([100, 200, 300]);

      const allDrafts = await listDrafts();
      expect(allDrafts.some((d) => d.draftId === draftId)).toBe(true);

      await deleteDraft(draftId);
      const afterDelete = await getDraft(draftId);
      expect(afterDelete).toBeNull();
    });

    it('F9-TC5: should store and retrieve cached instrument reference data for offline UI dropdowns', async () => {
      const instrumentList = [
        SAMPLE_INSTRUMENTS.WEIGHBRIDGE_60T_CLASS_III,
        SAMPLE_INSTRUMENTS.DUAL_INTERVAL_RETAIL_CLASS_III,
      ];

      await cacheInstruments(instrumentList);
      const cached = await getCachedInstruments();
      expect(cached).toHaveLength(2);
      expect(cached[0].serialNumber).toBe(SAMPLE_INSTRUMENTS.WEIGHBRIDGE_60T_CLASS_III.serialNumber);
    });

    it('F9-TC6: should record and retrieve sync audit logs for inspection traceability', async () => {
      await addSyncAuditLog({
        batchId: 'batch-001',
        status: 'SUCCESS',
        syncedCount: 5,
      });

      const logs = await getSyncAuditLogs();
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].batchId).toBe('batch-001');
      expect(logs[0].status).toBe('SUCCESS');
    });
  });

  describe('3. Backend Idempotent Sync Gateway', () => {
    it('F9-TC7: GET /api/sync/status should return health and Legal Metrology standard metadata', async () => {
      const req = {};
      let jsonResponse = null;
      let statusCode = 200;
      const res = {
        status: (code) => {
          statusCode = code;
          return res;
        },
        json: (data) => {
          jsonResponse = data;
          return res;
        },
      };

      await getSyncStatus(req, res);
      expect(statusCode).toBe(200);
      expect(jsonResponse.success).toBe(true);
      expect(jsonResponse.status).toBe('ONLINE');
      expect(jsonResponse.standards).toContain('OIML R-76');
    });

    it('F9-TC8: POST /api/sync/batch should reject non-array sessions payload', async () => {
      const req = {
        body: { sessions: 'invalid-string' },
      };
      let jsonResponse = null;
      let statusCode = 200;
      const res = {
        status: (code) => {
          statusCode = code;
          return res;
        },
        json: (data) => {
          jsonResponse = data;
          return res;
        },
      };

      await syncBatch(req, res, () => {});
      expect(statusCode).toBe(400);
      expect(jsonResponse.success).toBe(false);
      expect(jsonResponse.message).toContain('array');
    });

    it('F9-TC9: POST /api/sync/batch should transactionally insert session and detect idempotency duplicate', async () => {
      const mockKey = generateIdempotencyKey('unit_test');
      const testSessionPayload = {
        localId: 'local-test-01',
        idempotencyKey: mockKey,
        testDate: new Date().toISOString(),
        overallStatus: 'COMPLETED',
        overallResult: 'PASS',
        temperature: 24.5,
        humidity: 55,
        remarks: 'Mandi field verification run',
        results: [
          {
            testType: 'WEIGHING_PERFORMANCE',
            status: 'COMPLETED',
            result: 'PASS',
            data: { points: [{ load: 100, error: 0 }] },
          },
        ],
      };

      // Mock Prisma methods
      const mockCreatedSession = {
        id: 'sess-uuid-12345',
        certificateNo: 'NAWI-2026-999901',
      };

      vi.spyOn(prisma.user, 'findFirst').mockResolvedValue({ id: 'usr-officer-01' });
      vi.spyOn(prisma.instrument, 'findUnique').mockResolvedValue({
        id: 'inst-01',
        name: 'Scale',
        serialNumber: 'SN-100',
        accuracyClass: 'CLASS_III',
        maxCapacity: 150,
        minCapacity: 1,
        verificationInterval: 0.05,
        unit: 'kg',
      });
      vi.spyOn(prisma.instrument, 'findFirst').mockResolvedValue({
        id: 'inst-01',
        name: 'Scale',
        serialNumber: 'SN-100',
        accuracyClass: 'CLASS_III',
        maxCapacity: 150,
        minCapacity: 1,
        verificationInterval: 0.05,
        unit: 'kg',
      });

      // First run: No prior audit log
      let auditLogLookup = null;
      vi.spyOn(prisma.auditLog, 'findFirst').mockImplementation(async () => auditLogLookup);
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        const txMock = {
          testSession: { create: vi.fn().mockResolvedValue(mockCreatedSession) },
          testResult: { create: vi.fn().mockResolvedValue({ id: 'res-1' }) },
          auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
        };
        return callback(txMock);
      });

      const req1 = {
        user: { id: 'usr-officer-01' },
        body: {
          idempotencyKey: 'batch-01',
          sessions: [testSessionPayload],
        },
      };

      let json1 = null;
      const res1 = {
        status: () => res1,
        json: (d) => {
          json1 = d;
          return res1;
        },
      };

      await syncBatch(req1, res1, () => {});
      expect(json1.success).toBe(true);
      expect(json1.syncedCount).toBe(1);
      expect(json1.duplicateCount).toBe(0);
      expect(json1.sessionIds).toContain(mockCreatedSession.id);

      // Second run: Simulate duplicate submission with same idempotencyKey
      auditLogLookup = {
        entityId: mockCreatedSession.id,
        createdAt: new Date(),
      };

      let json2 = null;
      const res2 = {
        status: () => res2,
        json: (d) => {
          json2 = d;
          return res2;
        },
      };

      await syncBatch(req1, res2, () => {});
      expect(json2.success).toBe(true);
      expect(json2.syncedCount).toBe(0);
      expect(json2.duplicateCount).toBe(1);
      expect(json2.results[0].status).toBe('DUPLICATE_SKIPPED');
      expect(json2.sessionIds).toContain(mockCreatedSession.id);
    });

    it('F9-TC10: POST /api/sync/verify-keys should return existing keys matched in audit records', async () => {
      const keys = ['key-alpha-123', 'key-beta-456'];
      vi.spyOn(prisma.auditLog, 'findMany').mockResolvedValue([
        {
          details: 'IdempotencyKey: key-alpha-123 | LocalId: loc-1',
          entityId: 'sess-alpha',
        },
      ]);

      const req = {
        body: { keys },
      };
      let jsonResponse = null;
      const res = {
        json: (d) => {
          jsonResponse = d;
          return res;
        },
      };

      await verifyKeys(req, res, () => {});
      expect(jsonResponse.success).toBe(true);
      expect(jsonResponse.existingCount).toBe(1);
      expect(jsonResponse.existingKeys[0].key).toBe('key-alpha-123');
      expect(jsonResponse.existingKeys[0].sessionId).toBe('sess-alpha');
    });
  });
});

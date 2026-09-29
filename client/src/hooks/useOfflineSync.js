import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  queueTestSession as queueSessionService,
  getPendingQueue,
  getPendingCount,
  clearOfflineQueue,
  saveDraft as saveDraftService,
  getDraft as getDraftService,
  listDrafts as listDraftsService,
  deleteDraft as deleteDraftService,
  cacheInstruments as cacheInstrumentsService,
  getCachedInstruments as getCachedInstrumentsService,
  getSyncAuditLogs,
  drainQueue,
  subscribeToQueue,
} from '../services/offlineQueue';

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingItems, setPendingItems] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [syncLogs, setSyncLogs] = useState([]);

  // Refresh queue status
  const refreshQueueStatus = useCallback(async () => {
    try {
      const items = await getPendingQueue();
      setPendingItems(items);
      setPendingCount(items.length);

      const savedDrafts = await listDraftsService();
      setDrafts(savedDrafts);

      const logs = await getSyncAuditLogs();
      setSyncLogs(logs);
    } catch (err) {
      console.warn('[useOfflineSync] Error refreshing queue status:', err);
    }
  }, []);

  // Initial load and event listeners
  useEffect(() => {
    refreshQueueStatus();

    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Connection restored. Auto-syncing pending test records...', { id: 'network-status' });
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast('Operating in Offline Mode. All test entries will be safely cached.', {
        id: 'network-status',
        icon: '📡',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Subscribe to internal offline queue events
    const unsubscribe = subscribeToQueue((event) => {
      if (event.type === 'SYNC_STARTED') {
        setIsSyncing(true);
        setSyncError(null);
      } else if (event.type === 'SYNC_COMPLETED') {
        setIsSyncing(false);
        setLastSyncTime(new Date().toISOString());
        setSyncError(null);
        refreshQueueStatus();
      } else if (event.type === 'SYNC_FAILED') {
        setIsSyncing(false);
        setSyncError(event.error);
        refreshQueueStatus();
      } else {
        refreshQueueStatus();
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, [refreshQueueStatus]);

  // Trigger manual sync
  const triggerSync = useCallback(async () => {
    if (!navigator.onLine) {
      toast.error('Cannot sync while offline. Please check internet connection.');
      return { success: false, offline: true };
    }

    setIsSyncing(true);
    const toastId = toast.loading('Syncing offline test records to central database...');

    try {
      const result = await drainQueue();
      if (result.success) {
        if (result.syncedCount > 0) {
          toast.success(`Successfully synchronized ${result.syncedCount} test session(s)!`, { id: toastId });
        } else {
          toast.success('Offline queue is clean. All records are up to date.', { id: toastId });
        }
        setLastSyncTime(new Date().toISOString());
      } else {
        toast.error(result.error || 'Failed to sync offline records. Will retry on reconnect.', { id: toastId });
      }
      refreshQueueStatus();
      return result;
    } catch (err) {
      toast.error(err.message || 'Unexpected sync failure', { id: toastId });
      return { success: false, error: err.message };
    } finally {
      setIsSyncing(false);
    }
  }, [refreshQueueStatus]);

  // Queue a test session
  const queueTestSession = useCallback(
    async (sessionData) => {
      const item = await queueSessionService(sessionData);
      refreshQueueStatus();

      if (!navigator.onLine) {
        toast.success('Test session saved locally to offline queue.', { icon: '💾' });
      }

      return item;
    },
    [refreshQueueStatus]
  );

  // Draft operations
  const saveDraft = useCallback(
    async (draftId, draftData) => {
      const res = await saveDraftService(draftId, draftData);
      refreshQueueStatus();
      return res;
    },
    [refreshQueueStatus]
  );

  const getDraft = useCallback(async (draftId) => {
    return getDraftService(draftId);
  }, []);

  const deleteDraft = useCallback(
    async (draftId) => {
      await deleteDraftService(draftId);
      refreshQueueStatus();
    },
    [refreshQueueStatus]
  );

  const clearQueue = useCallback(async () => {
    await clearOfflineQueue();
    refreshQueueStatus();
    toast.success('Offline queue cleared.');
  }, [refreshQueueStatus]);

  const cacheInstruments = useCallback(async (instruments) => {
    await cacheInstrumentsService(instruments);
  }, []);

  const getCachedInstruments = useCallback(async () => {
    return getCachedInstrumentsService();
  }, []);

  return {
    isOnline,
    pendingCount,
    pendingItems,
    isSyncing,
    lastSyncTime,
    syncError,
    drafts,
    syncLogs,
    triggerSync,
    queueTestSession,
    saveDraft,
    getDraft,
    deleteDraft,
    clearQueue,
    cacheInstruments,
    getCachedInstruments,
    refreshQueueStatus,
  };
}

export default useOfflineSync;

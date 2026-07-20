import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { getIncomingRequests } from './api/requests';
import { useAuth } from './auth';

type RequestsBadgeContextValue = {
  pendingCount: number;
  refresh: () => void;
};

const RequestsBadgeContext = createContext<RequestsBadgeContextValue>({
  pendingCount: 0,
  refresh: () => {},
});

const POLL_INTERVAL_MS = 20000;

export function RequestsBadgeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!session) {
      setPendingCount(0);
      return;
    }
    try {
      const incoming = await getIncomingRequests();
      setPendingCount(incoming.length);
    } catch {
      // transient error — next poll will retry
    }
  }, [session]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <RequestsBadgeContext.Provider value={{ pendingCount, refresh }}>
      {children}
    </RequestsBadgeContext.Provider>
  );
}

export function useRequestsBadge() {
  return useContext(RequestsBadgeContext);
}

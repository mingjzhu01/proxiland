import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { getIncomingRequests } from './api/requests';
import { getIncomingRevealRequests } from './api/reveal';
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
      // Two separate request systems feed the same badge: connection_requests (requests to an
      // already-visible profile, e.g. coffee) and reveal_requests (the anonymous "Ask to
      // connect" from the Nearby feed) — both need to count, or asking to connect from Nearby
      // silently never shows up as a notification.
      const [incoming, incomingReveals] = await Promise.all([
        getIncomingRequests(),
        getIncomingRevealRequests(),
      ]);
      setPendingCount(incoming.length + incomingReveals.length);
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

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { getUnreadMessageCount } from './api/messages';
import { useAuth } from './auth';

type MessagesBadgeContextValue = {
  unreadCount: number;
  refresh: () => void;
};

const MessagesBadgeContext = createContext<MessagesBadgeContextValue>({
  unreadCount: 0,
  refresh: () => {},
});

const POLL_INTERVAL_MS = 20000;

export function MessagesBadgeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!session) {
      setUnreadCount(0);
      return;
    }
    try {
      setUnreadCount(await getUnreadMessageCount());
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
    <MessagesBadgeContext.Provider value={{ unreadCount, refresh }}>
      {children}
    </MessagesBadgeContext.Provider>
  );
}

export function useMessagesBadge() {
  return useContext(MessagesBadgeContext);
}

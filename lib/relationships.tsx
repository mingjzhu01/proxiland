// The one source of truth for who the user is connected to, has asked, or has been asked by —
// per the event-connections handoff, every surface (event tabs, event sheet, global
// Connections, profile, tab badge) reads from here and mutates through here, so a change in one
// place is reflected everywhere at once. Mutations are optimistic: the UI flips first, the
// request follows, and a failure rolls back and rethrows so the caller can toast.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import {
  getIncomingRequests,
  getOutgoingRequests,
  getAcceptedConnectRequests,
  sendRequest,
  respondToRequest,
} from './api/requests';
import { getMyConnections } from './api/connections';
import { getIncomingRevealRequests, revealRequest, type IncomingRevealRequest } from './api/reveal';
import type { Connection, ConnectionRequest } from './types';

export type RelationshipStatus =
  | { kind: 'self' }
  | { kind: 'none' }
  | { kind: 'outgoing'; request: ConnectionRequest }
  | { kind: 'incoming'; request: ConnectionRequest }
  | { kind: 'connected'; connection: Connection };

type RelationshipsValue = {
  myId: string | null;
  isLoaded: boolean;
  incoming: ConnectionRequest[];
  outgoing: ConnectionRequest[];
  connections: Connection[];
  incomingReveals: IncomingRevealRequest[];
  badgeCount: number;
  refresh: () => Promise<void>;
  statusFor: (userId: string) => RelationshipStatus;
  // The event a relationship with this person was made at, if any — pending or accepted.
  eventIdFor: (userId: string) => string | null;
  sendConnect: (userId: string, options?: { eventId?: string }) => Promise<void>;
  accept: (requestId: string) => Promise<void>;
  decline: (requestId: string) => Promise<void>;
  shareProfileBack: (revealId: string) => Promise<void>;
};

const RelationshipsContext = createContext<RelationshipsValue | null>(null);

const POLL_INTERVAL_MS = 20000;

export function RelationshipsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const myId = session?.user.id ?? null;
  const [isLoaded, setIsLoaded] = useState(false);
  const [incoming, setIncoming] = useState<ConnectionRequest[]>([]);
  const [outgoing, setOutgoing] = useState<ConnectionRequest[]>([]);
  const [accepted, setAccepted] = useState<ConnectionRequest[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [incomingReveals, setIncomingReveals] = useState<IncomingRevealRequest[]>([]);
  const inFlight = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!myId) {
      setIncoming([]);
      setOutgoing([]);
      setAccepted([]);
      setConnections([]);
      setIncomingReveals([]);
      setIsLoaded(false);
      return;
    }
    try {
      const [inc, out, acc, conns, reveals] = await Promise.all([
        getIncomingRequests(),
        getOutgoingRequests(),
        getAcceptedConnectRequests(),
        getMyConnections(),
        getIncomingRevealRequests(),
      ]);
      setIncoming(inc);
      setOutgoing(out.filter((r) => r.status === 'pending'));
      setAccepted(acc);
      setConnections(conns);
      setIncomingReveals(reveals);
      setIsLoaded(true);
    } catch {
      // Transient — the next poll retries. Existing state stays on screen rather than blanking.
    }
  }, [myId]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const connectionByUser = useMemo(() => {
    const map = new Map<string, Connection>();
    for (const c of connections) if (c.other) map.set(c.other.id, c);
    return map;
  }, [connections]);

  const incomingConnectBySender = useMemo(() => {
    const map = new Map<string, ConnectionRequest>();
    for (const r of incoming) if (r.type === 'connect') map.set(r.sender_id, r);
    return map;
  }, [incoming]);

  const outgoingConnectByReceiver = useMemo(() => {
    const map = new Map<string, ConnectionRequest>();
    for (const r of outgoing) if (r.type === 'connect') map.set(r.receiver_id, r);
    return map;
  }, [outgoing]);

  const eventByUser = useMemo(() => {
    const map = new Map<string, string>();
    const consider = (r: ConnectionRequest) => {
      if (!r.event_id) return;
      const other = r.sender_id === myId ? r.receiver_id : r.sender_id;
      if (!map.has(other)) map.set(other, r.event_id);
    };
    accepted.forEach(consider);
    outgoing.forEach(consider);
    incoming.forEach(consider);
    return map;
  }, [accepted, outgoing, incoming, myId]);

  const statusFor = useCallback(
    (userId: string): RelationshipStatus => {
      if (userId === myId) return { kind: 'self' };
      const connection = connectionByUser.get(userId);
      if (connection) return { kind: 'connected', connection };
      const inc = incomingConnectBySender.get(userId);
      if (inc) return { kind: 'incoming', request: inc };
      const out = outgoingConnectByReceiver.get(userId);
      if (out) return { kind: 'outgoing', request: out };
      return { kind: 'none' };
    },
    [myId, connectionByUser, incomingConnectBySender, outgoingConnectByReceiver]
  );

  const eventIdFor = useCallback((userId: string) => eventByUser.get(userId) ?? null, [eventByUser]);

  const accept = useCallback(
    async (requestId: string) => {
      if (inFlight.current.has(requestId)) return;
      const request = incoming.find((r) => r.id === requestId);
      if (!request || !myId) return;
      inFlight.current.add(requestId);

      // Optimistic: the request leaves the inbox and the person appears as connected. The
      // connections row's real id arrives with the refresh; until then Message resolves it.
      setIncoming((list) => list.filter((r) => r.id !== requestId));
      const optimistic: Connection = {
        id: '',
        user_a: myId < request.sender_id ? myId : request.sender_id,
        user_b: myId < request.sender_id ? request.sender_id : myId,
        connected_at: new Date().toISOString(),
        other: request.sender,
      };
      setConnections((list) => [optimistic, ...list]);
      try {
        await respondToRequest(requestId, 'accepted');
        await refresh();
      } catch (error) {
        setIncoming((list) => [request, ...list]);
        setConnections((list) => list.filter((c) => c !== optimistic));
        throw error;
      } finally {
        inFlight.current.delete(requestId);
      }
    },
    [incoming, myId, refresh]
  );

  const sendConnect = useCallback(
    async (userId: string, options?: { eventId?: string }) => {
      if (!myId || inFlight.current.has(userId)) return;
      const current = statusFor(userId);
      if (current.kind !== 'none') {
        // They already asked us — accepting is the right answer, not a second pending request.
        if (current.kind === 'incoming') await accept(current.request.id);
        return;
      }
      inFlight.current.add(userId);
      const optimistic: ConnectionRequest = {
        id: `optimistic-${userId}`,
        sender_id: myId,
        receiver_id: userId,
        type: 'connect',
        message: null,
        status: 'pending',
        meeting_location: null,
        meeting_at: null,
        context_type: options?.eventId ? 'event' : 'nearby',
        event_id: options?.eventId ?? null,
        created_at: new Date().toISOString(),
      };
      setOutgoing((list) => [optimistic, ...list]);
      try {
        await sendRequest(userId, 'connect', {
          contextType: options?.eventId ? 'event' : 'nearby',
          eventId: options?.eventId,
        });
        await refresh();
      } catch (error) {
        setOutgoing((list) => list.filter((r) => r.id !== optimistic.id));
        throw error;
      } finally {
        inFlight.current.delete(userId);
      }
    },
    [myId, statusFor, accept, refresh]
  );

  const decline = useCallback(
    async (requestId: string) => {
      const request = incoming.find((r) => r.id === requestId);
      if (!request) return;
      setIncoming((list) => list.filter((r) => r.id !== requestId));
      try {
        await respondToRequest(requestId, 'declined');
      } catch (error) {
        setIncoming((list) => [request, ...list]);
        throw error;
      }
    },
    [incoming]
  );

  const shareProfileBack = useCallback(
    async (revealId: string) => {
      const reveal = incomingReveals.find((r) => r.id === revealId);
      if (!reveal) return;
      setIncomingReveals((list) => list.filter((r) => r.id !== revealId));
      try {
        await revealRequest(revealId);
        await refresh();
      } catch (error) {
        setIncomingReveals((list) => [reveal, ...list]);
        throw error;
      }
    },
    [incomingReveals, refresh]
  );

  const value = useMemo<RelationshipsValue>(
    () => ({
      myId,
      isLoaded,
      incoming,
      outgoing,
      connections,
      incomingReveals,
      badgeCount: incoming.length + incomingReveals.length,
      refresh,
      statusFor,
      eventIdFor,
      sendConnect,
      accept,
      decline,
      shareProfileBack,
    }),
    [myId, isLoaded, incoming, outgoing, connections, incomingReveals, refresh, statusFor, eventIdFor, sendConnect, accept, decline, shareProfileBack]
  );

  return <RelationshipsContext.Provider value={value}>{children}</RelationshipsContext.Provider>;
}

export function useRelationships(): RelationshipsValue {
  const value = useContext(RelationshipsContext);
  if (!value) throw new Error('useRelationships must be used inside RelationshipsProvider');
  return value;
}

// For a connection accepted optimistically, the row id isn't known until the next refresh.
export async function resolveConnectionId(connection: Connection): Promise<string | null> {
  if (connection.id) return connection.id;
  const { data } = await supabase
    .from('connections')
    .select('id')
    .eq('user_a', connection.user_a)
    .eq('user_b', connection.user_b)
    .maybeSingle();
  return data?.id ?? null;
}

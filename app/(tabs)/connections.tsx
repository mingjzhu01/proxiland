// The global Connections screen, per the event-connections handoff §6: everything across
// Proxiland — Requests (incoming, unreviewed) then Connections — reading from the shared
// relationship store. Reveal requests from the anonymous Nearby feed live in the Requests group
// too (Ming's call), keeping their "share my profile back" action, so there's one inbox.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { LetteredAvatar } from '../../components/LetteredAvatar';
import { RelationshipPill } from '../../components/RelationshipPill';
import { useRelationships, resolveConnectionId } from '../../lib/relationships';
import { useToast } from '../../lib/toast';
import { getMyActiveEvents } from '../../lib/api/events';
import { getUnreadCountsByConnection } from '../../lib/api/messages';
import { colors, fonts } from '../../lib/theme';
import type { Connection, ConnectionRequest, Profile } from '../../lib/types';

function roleLine(p: Partial<Profile> | null | undefined): string | null {
  if (!p) return null;
  const parts = [p.title?.trim(), p.employer?.trim()].filter(Boolean);
  return parts.length ? parts.join(' · ') : p.headline ?? null;
}

function meetingLine(r: ConnectionRequest): string | null {
  if (r.type !== 'coffee') return null;
  const when = r.meeting_at
    ? new Date(r.meeting_at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : null;
  return ['Wants to grab coffee', when, r.meeting_location].filter(Boolean).join(' · ');
}

export default function Connections() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const toast = useToast();
  const rel = useRelationships();
  const [eventNames, setEventNames] = useState<Map<string, string>>(new Map());
  const [unreadByConnection, setUnreadByConnection] = useState<Map<string, number>>(new Map());
  const [ignoredRevealIds, setIgnoredRevealIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadContext = useCallback(async () => {
    const [events, unread] = await Promise.all([
      getMyActiveEvents().catch(() => []),
      getUnreadCountsByConnection().catch(() => new Map<string, number>()),
    ]);
    setEventNames(new Map(events.map((e) => [e.id, e.name ?? 'an event'])));
    setUnreadByConnection(unread);
  }, []);

  useFocusEffect(
    useCallback(() => {
      rel.refresh();
      loadContext();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadContext])
  );

  useEffect(() => {
    if (!isRefreshing) return;
    Promise.all([rel.refresh(), loadContext()]).finally(() => setIsRefreshing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRefreshing]);

  const reveals = rel.incomingReveals.filter((r) => r.requester && !ignoredRevealIds.has(r.id));
  const requestCount = reveals.length + rel.incoming.length;

  const metAt = useCallback(
    (userId: string) => {
      const eventId = rel.eventIdFor(userId);
      if (!eventId) return null;
      return `Met at ${eventNames.get(eventId) ?? 'an event'}`;
    },
    [rel, eventNames]
  );

  async function accept(r: ConnectionRequest) {
    setBusyId(r.id);
    try {
      await rel.accept(r.id);
      toast.show("You're now connected");
    } catch (error: any) {
      Alert.alert("Couldn't accept", error.message ?? String(error));
    } finally {
      setBusyId(null);
    }
  }

  async function decline(r: ConnectionRequest) {
    try {
      await rel.decline(r.id);
    } catch (error: any) {
      Alert.alert("Couldn't dismiss", error.message ?? String(error));
    }
  }

  async function share(revealId: string) {
    setBusyId(revealId);
    try {
      await rel.shareProfileBack(revealId);
      toast.show('Profile shared');
    } catch (error: any) {
      const message: string = error.message ?? String(error);
      const stale = message.includes('Not authorized') || message.includes('no longer pending');
      Alert.alert("Couldn't share your profile", stale ? 'This request is no longer available.' : message);
      if (stale) rel.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function message(c: Connection) {
    const id = await resolveConnectionId(c);
    if (id) router.push(`/chat/${id}`);
  }

  const connections = useMemo(() => rel.connections.filter((c) => c.other), [rel.connections]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 26 }]}>
        <Text style={styles.title}>Connections</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: tabBarHeight + 16 }]}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => setIsRefreshing(true)} />}
      >
        {requestCount > 0 ? (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.eyebrow}>Requests</Text>
              <Text style={styles.eyebrow}>{requestCount}</Text>
            </View>

            {reveals.map((r) => (
              <View key={r.id} style={styles.row}>
                <LetteredAvatar name={r.requester!.full_name} photoUrl={r.requester!.photo_url} size={46} />
                <View style={styles.rowText}>
                  <Text style={styles.name} numberOfLines={1}>{r.requester!.full_name}</Text>
                  {roleLine(r.requester) ? <Text style={styles.sub} numberOfLines={1}>{roleLine(r.requester)}</Text> : null}
                  <Text style={styles.metaItalic} numberOfLines={2}>Asked to connect · {r.connection_line}</Text>
                </View>
                <View style={styles.actions}>
                  <Pressable style={styles.sharePill} onPress={() => share(r.id)} disabled={busyId === r.id}>
                    <Text style={styles.sharePillText}>{busyId === r.id ? 'Sharing…' : 'Share profile'}</Text>
                  </Pressable>
                  <Pressable onPress={() => setIgnoredRevealIds((s) => new Set(s).add(r.id))} hitSlop={6} style={styles.dismiss}>
                    <Text style={styles.dismissText}>Dismiss</Text>
                  </Pressable>
                </View>
              </View>
            ))}

            {rel.incoming.map((r) => (
              <View key={r.id} style={styles.row}>
                <LetteredAvatar name={r.sender?.full_name ?? null} photoUrl={r.sender?.photo_url} size={46} />
                <View style={styles.rowText}>
                  <Text style={styles.name} numberOfLines={1}>{r.sender?.full_name ?? 'Someone'}</Text>
                  {roleLine(r.sender) ? <Text style={styles.sub} numberOfLines={1}>{roleLine(r.sender)}</Text> : null}
                  {meetingLine(r) ? <Text style={styles.metaItalic}>{meetingLine(r)}</Text> : null}
                  {r.type === 'connect' && metAt(r.sender_id) ? <Text style={styles.metaItalic}>{metAt(r.sender_id)}</Text> : null}
                  {r.message ? <Text style={styles.metaItalic} numberOfLines={2}>“{r.message}”</Text> : null}
                </View>
                <View style={styles.actions}>
                  <RelationshipPill
                    status={{ kind: 'incoming', request: r }}
                    busy={busyId === r.id}
                    onAccept={() => accept(r)}
                    onConnect={() => {}}
                    onMessage={() => {}}
                  />
                  <Pressable onPress={() => decline(r)} hitSlop={6} style={styles.dismiss}>
                    <Text style={styles.dismissText}>Dismiss</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        ) : null}

        {connections.length > 0 ? (
          <>
            <View style={[styles.sectionRow, requestCount > 0 && styles.sectionRowLater]}>
              <Text style={styles.eyebrow}>Connections</Text>
              <Text style={styles.eyebrow}>{connections.length}</Text>
            </View>
            {connections.map((c) => {
              const other = c.other!;
              const unread = unreadByConnection.get(c.id) ?? 0;
              return (
                <View key={c.id || other.id} style={styles.row}>
                  <Pressable onPress={() => router.push(`/profile/${other.id}`)}>
                    <View>
                      <LetteredAvatar name={other.full_name} photoUrl={other.photo_url} size={46} />
                      {unread > 0 ? <View style={styles.unreadDot} /> : null}
                    </View>
                  </Pressable>
                  <Pressable style={styles.rowText} onPress={() => message(c)}>
                    <Text style={styles.name} numberOfLines={1}>{other.full_name}</Text>
                    {roleLine(other) ? <Text style={styles.sub} numberOfLines={1}>{roleLine(other)}</Text> : null}
                    {metAt(other.id) ? <Text style={styles.metaItalic}>{metAt(other.id)}</Text> : null}
                  </Pressable>
                  <RelationshipPill status={{ kind: 'connected', connection: c }} onMessage={() => message(c)} onAccept={() => {}} onConnect={() => {}} />
                </View>
              );
            })}
          </>
        ) : null}

        {requestCount === 0 && connections.length === 0 && rel.isLoaded ? (
          <Text style={styles.empty}>No requests or connections yet. People you connect with will appear here.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.brandMarkCream },
  header: { paddingHorizontal: 18 },
  title: { fontFamily: fonts.wordmark, fontSize: 33, lineHeight: 35, color: colors.brandMarkDark },
  body: { paddingHorizontal: 18, paddingTop: 16, gap: 10 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  sectionRowLater: { marginTop: 10 },
  eyebrow: {
    fontFamily: fonts.sansSemibold,
    fontSize: 11,
    letterSpacing: 11 * 0.14,
    textTransform: 'uppercase',
    color: colors.brandInk,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 18,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  rowText: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.sansSemibold, fontSize: 16, lineHeight: 19, color: colors.brandMarkDark },
  sub: { fontFamily: fonts.sans, fontSize: 13, color: colors.brandInk, marginTop: 3 },
  metaItalic: { fontFamily: fonts.sans, fontStyle: 'italic', fontSize: 12.5, lineHeight: 17, color: colors.brandInk, marginTop: 2 },
  actions: { alignItems: 'center' },
  dismiss: { paddingVertical: 7, paddingHorizontal: 10 },
  dismissText: { fontFamily: fonts.sans, fontSize: 13, color: colors.brandInk },
  sharePill: { backgroundColor: colors.brandMarkDark, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 15, minHeight: 44, justifyContent: 'center' },
  sharePillText: { fontFamily: fonts.sansSemibold, fontSize: 13.5, color: colors.brandMarkCream },
  unreadDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: colors.brandMarkDark,
    borderWidth: 2,
    borderColor: colors.card,
  },
  empty: { fontFamily: fonts.sans, fontSize: 14.5, lineHeight: 21, color: colors.brandInk, textAlign: 'center', paddingVertical: 34 },
});

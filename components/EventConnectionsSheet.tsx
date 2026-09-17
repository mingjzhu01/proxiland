// Raised over the event by the Connections tab while the user is inside an event, per the
// event-connections handoff §4. The event stays mounted behind the scrim; closing returns to
// the same tab and scroll offset because nothing navigated. Reads and mutates the shared
// relationship store, so a change here is visible in the event tabs the moment it closes.
import { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LetteredAvatar } from './LetteredAvatar';
import { RelationshipPill } from './RelationshipPill';
import { useRelationships, resolveConnectionId } from '../lib/relationships';
import { useToast } from '../lib/toast';
import type { ActiveEvent } from '../lib/eventContext';
import { colors, fonts } from '../lib/theme';
import type { Profile } from '../lib/types';

type SegmentKey = 'received' | 'sent' | 'connected';

function requestedAgo(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `Requested ${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Requested ${hours}h ago`;
  return `Requested ${new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

function roleLine(p: Partial<Profile> | null | undefined): string | null {
  if (!p) return null;
  const parts = [p.title?.trim(), p.employer?.trim()].filter(Boolean);
  return parts.length ? parts.join(' · ') : p.headline ?? null;
}

export function EventConnectionsSheet({
  visible,
  event,
  onClose,
}: {
  visible: boolean;
  event: ActiveEvent | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const rel = useRelationships();
  const [segment, setSegment] = useState<SegmentKey>('received');
  const [busyId, setBusyId] = useState<string | null>(null);

  const received = useMemo(
    () => rel.incoming.filter((r) => r.type === 'connect' && r.event_id === event?.id),
    [rel.incoming, event?.id]
  );
  const sent = useMemo(
    () => rel.outgoing.filter((r) => r.type === 'connect' && r.event_id === event?.id),
    [rel.outgoing, event?.id]
  );
  const connected = useMemo(
    () => rel.connections.filter((c) => c.other && rel.eventIdFor(c.other.id) === event?.id),
    [rel.connections, rel.eventIdFor, event?.id]
  );

  // Default segment on open: Received if anything's waiting, else Sent if anything's pending,
  // else Connected.
  useEffect(() => {
    if (!visible) return;
    setSegment(received.length > 0 ? 'received' : sent.length > 0 ? 'sent' : 'connected');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function accept(requestId: string) {
    setBusyId(requestId);
    try {
      await rel.accept(requestId);
      toast.show("You're now connected");
    } catch (error: any) {
      Alert.alert("Couldn't accept", error.message ?? String(error));
    } finally {
      setBusyId(null);
    }
  }

  async function dismiss(requestId: string) {
    try {
      await rel.decline(requestId);
    } catch (error: any) {
      Alert.alert("Couldn't dismiss", error.message ?? String(error));
    }
  }

  async function message(connection: (typeof connected)[number]) {
    const id = await resolveConnectionId(connection);
    if (!id) return;
    onClose();
    router.push(`/chat/${id}`);
  }

  const segments: { key: SegmentKey; label: string; count: number }[] = [
    { key: 'received', label: 'Received', count: received.length },
    { key: 'sent', label: 'Sent', count: sent.length },
    { key: 'connected', label: 'Connected', count: connected.length },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.panel, { paddingBottom: insets.bottom }]}>
        <View style={styles.grabber} />
        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            <Text style={styles.title}>Event connections</Text>
            <Text style={styles.subtitle}>{event?.name ?? 'This event'}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} style={styles.closeButton} accessibilityLabel="Close">
            <Ionicons name="close" size={20} color={colors.brandMarkDark} />
          </Pressable>
        </View>

        <View style={styles.track}>
          {segments.map((s) => {
            const active = s.key === segment;
            return (
              <Pressable key={s.key} style={[styles.segment, active && styles.segmentActive]} onPress={() => setSegment(s.key)}>
                <Text style={[styles.segmentLabel, active ? styles.segmentLabelActive : styles.segmentLabelInactive]}>
                  {s.label}
                  {s.count > 0 ? ` · ${s.count}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {segment === 'received' ? (
            received.length === 0 ? (
              <Text style={styles.empty}>No new requests from this event.</Text>
            ) : (
              received.map((r) => (
                <View key={r.id} style={styles.row}>
                  <LetteredAvatar name={r.sender?.full_name ?? null} photoUrl={r.sender?.photo_url} size={46} />
                  <View style={styles.rowText}>
                    <Text style={styles.name} numberOfLines={1}>{r.sender?.full_name ?? 'Someone'}</Text>
                    {roleLine(r.sender) ? <Text style={styles.sub} numberOfLines={1}>{roleLine(r.sender)}</Text> : null}
                  </View>
                  <View style={styles.actions}>
                    <RelationshipPill
                      status={{ kind: 'incoming', request: r }}
                      busy={busyId === r.id}
                      onAccept={() => accept(r.id)}
                      onConnect={() => {}}
                      onMessage={() => {}}
                    />
                    <Pressable onPress={() => dismiss(r.id)} hitSlop={6} style={styles.dismiss}>
                      <Text style={styles.dismissText}>Dismiss</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )
          ) : null}

          {segment === 'sent' ? (
            sent.length === 0 ? (
              <Text style={styles.empty}>You haven't sent any requests at this event yet.</Text>
            ) : (
              sent.map((r) => (
                <View key={r.id} style={styles.row}>
                  <LetteredAvatar name={r.receiver?.full_name ?? null} photoUrl={r.receiver?.photo_url} size={46} />
                  <View style={styles.rowText}>
                    <Text style={styles.name} numberOfLines={1}>{r.receiver?.full_name ?? 'Someone'}</Text>
                    {roleLine(r.receiver) ? <Text style={styles.sub} numberOfLines={1}>{roleLine(r.receiver)}</Text> : null}
                    <Text style={styles.meta}>{requestedAgo(r.created_at)}</Text>
                  </View>
                  <RelationshipPill status={{ kind: 'outgoing', request: r }} onAccept={() => {}} onConnect={() => {}} onMessage={() => {}} />
                </View>
              ))
            )
          ) : null}

          {segment === 'connected' ? (
            connected.length === 0 ? (
              <Text style={styles.empty}>Your event connections will appear here.</Text>
            ) : (
              connected.map((c) => (
                <View key={c.other!.id} style={styles.row}>
                  <LetteredAvatar name={c.other!.full_name} photoUrl={c.other!.photo_url} size={46} />
                  <View style={styles.rowText}>
                    <Text style={styles.name} numberOfLines={1}>{c.other!.full_name}</Text>
                    {roleLine(c.other) ? <Text style={styles.sub} numberOfLines={1}>{roleLine(c.other)}</Text> : null}
                  </View>
                  <RelationshipPill status={{ kind: 'connected', connection: c }} onMessage={() => message(c)} onAccept={() => {}} onConnect={() => {}} />
                </View>
              ))
            )
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(84,66,54,.42)' },
  panel: {
    height: '78%',
    backgroundColor: colors.brandMarkCream,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    shadowColor: 'rgba(84,66,54,1)',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: -10 },
    shadowRadius: 30,
    elevation: 12,
  },
  grabber: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: colors.brandSand },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 18, paddingTop: 14 },
  titleText: { flex: 1 },
  title: { fontFamily: fonts.wordmark, fontSize: 23, lineHeight: 27, color: colors.brandMarkDark },
  subtitle: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.brandInk, marginTop: 3 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -12, marginTop: -10 },
  track: {
    flexDirection: 'row',
    backgroundColor: colors.insetPill,
    borderRadius: 999,
    padding: 3,
    gap: 2,
    marginHorizontal: 18,
    marginTop: 14,
  },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 999, minHeight: 44, justifyContent: 'center' },
  segmentActive: { backgroundColor: colors.card },
  segmentLabel: { fontFamily: fonts.sansSemibold, fontSize: 13.5 },
  segmentLabelActive: { color: colors.brandMarkDark },
  segmentLabelInactive: { color: colors.brandInk },
  list: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 26, gap: 10 },
  empty: { fontFamily: fonts.sans, fontSize: 14.5, color: colors.brandInk, textAlign: 'center', paddingVertical: 34 },
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
  meta: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.brandInk, marginTop: 2 },
  actions: { alignItems: 'center' },
  dismiss: { paddingVertical: 7, paddingHorizontal: 10 },
  dismissText: { fontFamily: fonts.sans, fontSize: 13, color: colors.brandInk },
});

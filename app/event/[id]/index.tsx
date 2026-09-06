import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventAttendeeCard } from '../../../components/EventAttendeeCard';
import { SegmentedControl, type Segment } from '../../../components/SegmentedControl';
import { LetteredAvatar } from '../../../components/LetteredAvatar';
import { SectionLabel } from '../../../components/SectionLabel';
import { getMyConnections } from '../../../lib/api/connections';
import { EVENT_INTENT_DEFAULTS } from '../../../lib/eventIntentConfig';
import { logSessionEvent } from '../../../lib/api/instrumentation';
import { ROLE_CATEGORY_LABELS } from '../../../lib/allowedValues';
import { colors, avatarSizes, typeStyles, spacing, radii, fonts } from '../../../lib/theme';
import {
  getMyActiveEvents,
  getEventAttendees,
  getMyEventIntent,
  isIntentComplete,
  getMyEventMatches,
  generateEventMatches,
  sendEventConnectRequest,
  getOutgoingEventConnectTargetIds,
  leaveEvent,
  type EventSummary,
  type EventAttendee,
  type EventMatch,
} from '../../../lib/api/events';

function pluralRoleLabel(role: string | null): string {
  if (!role) return 'Other';
  const label = ROLE_CATEGORY_LABELS[role as keyof typeof ROLE_CATEGORY_LABELS] ?? role;
  return label.endsWith('s') ? label.toUpperCase() : `${label.toUpperCase()}S`;
}

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [attendees, setAttendees] = useState<EventAttendee[]>([]);
  const [attendeeById, setAttendeeById] = useState<Map<string, EventAttendee>>(new Map());
  const [topMatches, setTopMatches] = useState<EventMatch[]>([]);
  const [sharedOverlap, setSharedOverlap] = useState<EventMatch[]>([]);
  const [connectedUserIds, setConnectedUserIds] = useState<Set<string>>(new Set());
  const [requestedUserIds, setRequestedUserIds] = useState<Set<string>>(new Set());
  const [segment, setSegment] = useState<'top' | 'overlap' | 'everyone'>('top');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const load = useCallback(
    async (regenerate: boolean) => {
      try {
        const intent = await getMyEventIntent(id);
        if (!isIntentComplete(intent)) {
          router.replace(`/event/${id}/intent`);
          return;
        }

        const [myEvents, attendeeList, myConnections, requestedIds] = await Promise.all([
          getMyActiveEvents(),
          getEventAttendees(id),
          getMyConnections(),
          getOutgoingEventConnectTargetIds(id),
        ]);
        setEvent(myEvents.find((e) => e.id === id) ?? null);
        setAttendees(attendeeList);
        setAttendeeById(new Map(attendeeList.map((a) => [a.user_id, a])));
        setConnectedUserIds(new Set(myConnections.map((c) => c.other!.id)));
        setRequestedUserIds(requestedIds);

        let matches = await getMyEventMatches(id);
        if (regenerate || matches.length === 0) {
          await generateEventMatches(id);
          if (regenerate) logSessionEvent('event_matches_regenerated', { scopeId: id });
          matches = await getMyEventMatches(id);
        }

        // Sort (and gate) by the blended `score`, not raw `intent_complement` — that
        // deterministic number alone can be misleadingly perfect for a generic catch-all
        // pairing (e.g. both people picking "open to relevant new connections"), even when
        // the AI's own qualitative read of the match is weak. `score` already folds the AI's
        // judgment in (60/40 against the deterministic signal), so it's the number that
        // should actually decide who counts as a top match.
        const top = matches
          .filter((m) => m.score >= EVENT_INTENT_DEFAULTS.strongIntentComplementThreshold)
          .sort((a, b) => b.score - a.score)
          .slice(0, EVENT_INTENT_DEFAULTS.topMatchesLimit);
        const topIds = new Set(top.map((m) => m.candidate_user_id));
        const overlap = matches
          .filter((m) => !topIds.has(m.candidate_user_id) && m.professional_overlap >= EVENT_INTENT_DEFAULTS.meaningfulOverlapThreshold)
          .sort((a, b) => b.professional_overlap - a.professional_overlap)
          .slice(0, EVENT_INTENT_DEFAULTS.sharedOverlapLimit);
        setTopMatches(top);
        setSharedOverlap(overlap);
      } catch (error: any) {
        Alert.alert('Could not load event', error.message ?? String(error));
      }
    },
    [id, router]
  );

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      load(false).finally(() => setIsLoading(false));
    }, [load])
  );

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      await load(true);
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleConnect(targetUserId: string) {
    setRequestedUserIds((prev) => new Set(prev).add(targetUserId));
    try {
      await sendEventConnectRequest(id, targetUserId);
    } catch (error: any) {
      setRequestedUserIds((prev) => {
        const next = new Set(prev);
        next.delete(targetUserId);
        return next;
      });
      Alert.alert('Could not send request', error.message ?? String(error));
    }
  }

  function handleLeave() {
    Alert.alert('Leave this event?', "You'll stop seeing attendees and they'll stop seeing you.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          setIsLeaving(true);
          try {
            await leaveEvent(id);
            router.back();
          } catch (error: any) {
            Alert.alert('Could not leave event', error.message ?? String(error));
          } finally {
            setIsLeaving(false);
          }
        },
      },
    ]);
  }

  function handleMenu() {
    Alert.alert('Event options', undefined, [
      { text: 'Leave event', style: 'destructive', onPress: handleLeave },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function statusFor(userId: string): 'none' | 'requested' | 'connected' {
    if (connectedUserIds.has(userId)) return 'connected';
    if (requestedUserIds.has(userId)) return 'requested';
    return 'none';
  }

  const topMatchUserIds = useMemo(() => new Set(topMatches.map((m) => m.candidate_user_id)), [topMatches]);

  const filteredGroupedAttendees = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? attendees.filter((a) =>
          [a.full_name, a.employer, a.undergrad_school, a.grad_school].some((f) => f?.toLowerCase().includes(q))
        )
      : attendees;

    const groups = new Map<string, EventAttendee[]>();
    for (const a of filtered) {
      const key = a.role_category ?? 'other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(a);
    }
    return Array.from(groups.entries()).map(([role, list]) => ({ role, list }));
  }, [attendees, search]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notMemberText}>You're not currently part of this event.</Text>
      </View>
    );
  }

  const segments: Segment[] = [
    { key: 'top', label: 'Top matches', count: topMatches.length },
    { key: 'overlap', label: 'Overlap', count: sharedOverlap.length },
    { key: 'everyone', label: 'Everyone', count: attendees.length },
  ];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerTopRow}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color="rgba(245,239,230,.78)" />
          </Pressable>
          <View style={styles.spacer} />
          <Pressable onPress={handleMenu} hitSlop={10} disabled={isLeaving}>
            <Ionicons name="ellipsis-horizontal" size={20} color="rgba(245,239,230,.78)" />
          </Pressable>
        </View>

        <Text style={styles.eventName}>{event.name}</Text>
        <Text style={styles.eventMeta}>
          {[event.organizer_name, `${attendees.length} here now`].filter(Boolean).join(' · ')}
        </Text>

        <Pressable style={styles.editButton} onPress={() => router.push(`/event/${id}/intent`)}>
          <Text style={styles.editButtonText}>Edit your ask & offer</Text>
        </Pressable>
      </View>

      <View style={styles.segmentBand}>
        <SegmentedControl segments={segments} activeKey={segment} onChange={(k) => setSegment(k as typeof segment)} />
      </View>

      <ScrollView
        style={styles.body}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.brand} />}
      >
        {segment === 'top' ? (
          <>
            <Text style={styles.explainer}>Ranked on how your ask meets their offer.</Text>
            {topMatches.length > 0 ? (
              topMatches.map((m, i) => {
                const attendee = attendeeById.get(m.candidate_user_id);
                if (!attendee) return null;
                return (
                  <EventAttendeeCard
                    key={m.candidate_user_id}
                    attendee={attendee}
                    status={statusFor(attendee.user_id)}
                    reason={m.match_reason}
                    rank={i + 1}
                    onPress={() => router.push(`/profile/${attendee.user_id}`)}
                    onConnect={() => handleConnect(attendee.user_id)}
                  />
                );
              })
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyCardText}>No strong matches yet — check back as more people join.</Text>
              </View>
            )}
          </>
        ) : null}

        {segment === 'overlap' ? (
          <>
            {sharedOverlap.length > 0 ? (
              sharedOverlap.map((m) => {
                const attendee = attendeeById.get(m.candidate_user_id);
                if (!attendee) return null;
                return (
                  <EventAttendeeCard
                    key={m.candidate_user_id}
                    attendee={attendee}
                    status={statusFor(attendee.user_id)}
                    reason={m.match_reason}
                    onPress={() => router.push(`/profile/${attendee.user_id}`)}
                    onConnect={() => handleConnect(attendee.user_id)}
                  />
                );
              })
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyCardText}>No shared-background matches yet.</Text>
              </View>
            )}
          </>
        ) : null}

        {segment === 'everyone' ? (
          <>
            <View style={styles.searchField}>
              <Ionicons name="search" size={15} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search name, company or school"
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
              />
            </View>
            {filteredGroupedAttendees.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyCardText}>No one else has joined yet — check back soon.</Text>
              </View>
            ) : (
              filteredGroupedAttendees.map(({ role, list }) => (
                <View key={role}>
                  <SectionLabel style={styles.groupLabel}>
                    {pluralRoleLabel(role === 'other' ? null : role)} · {list.length}
                  </SectionLabel>
                  <View style={styles.rowGroup}>
                    {list.map((a) => {
                      const status = statusFor(a.user_id);
                      const subtitle = [a.title, a.employer].map((s) => s?.trim()).filter(Boolean).join(' at ');
                      return (
                        <Pressable key={a.user_id} style={styles.attendeeRow} onPress={() => router.push(`/profile/${a.user_id}`)}>
                          <LetteredAvatar name={a.full_name} photoUrl={a.photo_url} size={avatarSizes.attendeeRow} />
                          <View style={styles.attendeeInfo}>
                            <Text style={styles.attendeeName}>{a.full_name}</Text>
                            {subtitle ? <Text style={styles.attendeeSubtitle}>{subtitle}</Text> : null}
                            {topMatchUserIds.has(a.user_id) ? (
                              <Text style={styles.topMatchBadge}>Top match</Text>
                            ) : null}
                          </View>
                          <Pressable
                            style={[
                              styles.statusPill,
                              status === 'connected' && styles.statusPillConnected,
                              status === 'requested' && styles.statusPillRequested,
                            ]}
                            onPress={() => status === 'none' && handleConnect(a.user_id)}
                            disabled={status !== 'none'}
                          >
                            <Text
                              style={[
                                styles.statusPillText,
                                status === 'connected' && styles.statusPillTextConnected,
                                status === 'requested' && styles.statusPillTextRequested,
                              ]}
                            >
                              {status === 'connected' ? 'Connected' : status === 'requested' ? 'Requested' : 'Connect'}
                            </Text>
                          </Pressable>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paperEvent },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.paperEvent },
  body: { flex: 1 },
  notMemberText: { fontFamily: fonts.wordmark, fontSize: 14, color: colors.textTertiary, textAlign: 'center' },
  header: { backgroundColor: colors.brand, paddingHorizontal: spacing.gutter, paddingTop: 8, paddingBottom: 18 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center' },
  spacer: { flex: 1 },
  eventName: { ...typeStyles.eventTitle, marginTop: 10 },
  eventMeta: { fontFamily: fonts.wordmark, fontSize: 12.5, color: 'rgba(245,239,230,.66)', marginTop: 4 },
  editButton: {
    backgroundColor: colors.paper,
    borderRadius: radii.button,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  editButtonText: { fontFamily: fonts.wordmark, color: colors.ink, fontSize: 14, fontWeight: '600' },
  segmentBand: {
    paddingHorizontal: spacing.gutter,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#EADFCD',
    backgroundColor: colors.paperEvent,
  },
  explainer: { fontFamily: fonts.wordmark, fontSize: 12.5, color: colors.textTertiary, paddingHorizontal: spacing.gutter, paddingTop: 14, paddingBottom: 4 },
  emptyCard: {
    marginHorizontal: spacing.gutter,
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radii.card,
    padding: 16,
  },
  emptyCardText: { fontFamily: fonts.wordmark, fontSize: 13, color: colors.textTertiary },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radii.card,
    marginHorizontal: spacing.gutter,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  searchInput: { fontFamily: fonts.wordmark, flex: 1, fontSize: 14, color: colors.ink },
  groupLabel: { marginHorizontal: spacing.gutter, marginTop: 20, marginBottom: 8 },
  rowGroup: { marginHorizontal: spacing.gutter, borderTopWidth: 1, borderColor: colors.ruleInner },
  attendeeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.ruleInner },
  attendeeInfo: { flex: 1, gap: 1 },
  attendeeName: { fontFamily: fonts.wordmark, fontSize: 15.5, fontWeight: '600', color: colors.ink },
  attendeeSubtitle: { fontFamily: fonts.wordmark, fontSize: 12.5, color: colors.textSecondary },
  topMatchBadge: { fontFamily: fonts.wordmark, fontSize: 10.5, color: colors.brass, fontWeight: '600', marginTop: 1 },
  statusPill: { borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.ink },
  statusPillConnected: { backgroundColor: colors.liveChipBg },
  statusPillRequested: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.rule },
  statusPillText: { fontFamily: fonts.wordmark, fontSize: 12, fontWeight: '600', color: colors.inkOn },
  statusPillTextConnected: { color: colors.liveChipText },
  statusPillTextRequested: { color: colors.textMuted },
});

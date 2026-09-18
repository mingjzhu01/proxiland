// Event detail, per the event-connections handoff: title-only header, Top Matches / Overlap /
// Everyone in one scroll, and every attendee's action driven by the shared relationship store
// so Connect/Accept flip here, in the sheet, and on the global Connections screen at once.
// Lives inside the Discover tab stack so the tab bar stays up — the Connections tab raises this
// event's sheet while this screen is focused (see lib/eventContext).
import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator, RefreshControl, Modal } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { EventAttendeeCard } from '../../../../../components/EventAttendeeCard';
import { EventFeedbackSheet } from '../../../../../components/EventFeedbackSheet';
import { EVENT_INTENT_DEFAULTS } from '../../../../../lib/eventIntentConfig';
import { logSessionEvent } from '../../../../../lib/api/instrumentation';
import { ROLE_CATEGORY_LABELS } from '../../../../../lib/allowedValues';
import { useRelationships, resolveConnectionId } from '../../../../../lib/relationships';
import { useActiveEvent } from '../../../../../lib/eventContext';
import { useToast } from '../../../../../lib/toast';
import { colors, fonts } from '../../../../../lib/theme';
import {
  getMyActiveEvents,
  getEventAttendees,
  getMyEventIntent,
  isIntentComplete,
  getMyEventMatches,
  generateEventMatches,
  getMyEventMembership,
  checkInToEvent,
  checkOutOfEvent,
  leaveEvent,
  type EventSummary,
  type EventAttendee,
  type EventMatch,
} from '../../../../../lib/api/events';

type SegmentKey = 'top' | 'overlap' | 'everyone';

// "Above 999 show (999+) rather than shrinking the type."
function countLabel(n: number): string {
  return n > 999 ? '999+' : String(n);
}

function pluralRoleLabel(role: string | null): string {
  if (!role) return 'Other';
  const label = ROLE_CATEGORY_LABELS[role as keyof typeof ROLE_CATEGORY_LABELS] ?? role;
  return label.endsWith('s') ? label : `${label}s`;
}

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const toast = useToast();
  const rel = useRelationships();
  const { setActiveEvent } = useActiveEvent();

  const [event, setEvent] = useState<(EventSummary & { status: string }) | null>(null);
  const [attendees, setAttendees] = useState<EventAttendee[]>([]);
  const [attendeeById, setAttendeeById] = useState<Map<string, EventAttendee>>(new Map());
  const [topMatches, setTopMatches] = useState<EventMatch[]>([]);
  const [sharedOverlap, setSharedOverlap] = useState<EventMatch[]>([]);
  const [segment, setSegment] = useState<SegmentKey>('top');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [checkedInAt, setCheckedInAt] = useState<string | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [leaveSheetOpen, setLeaveSheetOpen] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const load = useCallback(
    async (regenerate: boolean) => {
      try {
        const intent = await getMyEventIntent(id);
        if (!isIntentComplete(intent)) {
          router.replace(`/discover/event/${id}/intent`);
          return;
        }

        const [myEvents, membership] = await Promise.all([getMyActiveEvents(), getMyEventMembership(id)]);
        const found = myEvents.find((e) => e.id === id) ?? null;
        setEvent(found);
        setCheckedInAt(membership?.checked_in_at ?? null);

        // Discovery/matching require presence, not just membership — see migration 0060.
        if (!membership?.checked_in_at) {
          setAttendees([]);
          setAttendeeById(new Map());
          setTopMatches([]);
          setSharedOverlap([]);
          return;
        }

        const attendeeList = await getEventAttendees(id);
        setAttendees(attendeeList);
        setAttendeeById(new Map(attendeeList.map((a) => [a.user_id, a])));

        let matches = await getMyEventMatches(id);
        if (regenerate || matches.length === 0) {
          await generateEventMatches(id);
          if (regenerate) logSessionEvent('event_matches_regenerated', { scopeId: id });
          matches = await getMyEventMatches(id);
        }

        // Sort/gate by the blended `score`, which already folds the AI's judgment in — the raw
        // intent_complement alone can look perfect for a generic catch-all pairing.
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
      rel.refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load])
  );

  // While focused, the Connections tab opens this event's sheet instead of navigating.
  useFocusEffect(
    useCallback(() => {
      if (event) setActiveEvent({ id: event.id, name: event.name });
      return () => setActiveEvent(null);
    }, [event, setActiveEvent])
  );

  async function handleCheckIn() {
    setIsCheckingIn(true);
    try {
      await checkInToEvent(id);
      logSessionEvent('event_checked_in', { scopeId: id });
      await load(false);
    } catch (error: any) {
      Alert.alert('Could not check in', error.message ?? String(error));
    } finally {
      setIsCheckingIn(false);
    }
  }

  async function handleCheckOut() {
    try {
      await checkOutOfEvent(id);
      logSessionEvent('event_checked_out', { scopeId: id });
      setShowFeedback(true);
      await load(false);
    } catch (error: any) {
      Alert.alert('Could not check out', error.message ?? String(error));
    }
  }

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      await Promise.all([load(true), rel.refresh()]);
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleConnect(userId: string) {
    setBusyUserId(userId);
    try {
      await rel.sendConnect(userId, { eventId: id });
      toast.show('Request sent');
    } catch {
      toast.show("Couldn't send request. Try again.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleAccept(requestId: string, userId: string) {
    setBusyUserId(userId);
    try {
      await rel.accept(requestId);
      toast.show("You're now connected");
    } catch (error: any) {
      Alert.alert("Couldn't accept", error.message ?? String(error));
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleMessage(userId: string) {
    const status = rel.statusFor(userId);
    if (status.kind !== 'connected') return;
    const connectionId = await resolveConnectionId(status.connection);
    if (connectionId) router.push(`/chat/${connectionId}`);
  }

  async function confirmLeave() {
    setIsLeaving(true);
    try {
      await leaveEvent(id);
      setLeaveSheetOpen(false);
      router.back();
    } catch (error: any) {
      setLeaveSheetOpen(false);
      Alert.alert('Could not leave event', error.message ?? String(error));
    } finally {
      setIsLeaving(false);
    }
  }

  const filteredGroupedAttendees = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? attendees.filter((a) => [a.full_name, a.employer, a.undergrad_school, a.grad_school].some((f) => f?.toLowerCase().includes(q)))
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
        <ActivityIndicator size="large" color={colors.brandMarkDark} />
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

  const renderCard = (attendee: EventAttendee, reason?: string | null) => {
    const status = rel.statusFor(attendee.user_id);
    return (
      <EventAttendeeCard
        key={attendee.user_id}
        attendee={attendee}
        status={status}
        busy={busyUserId === attendee.user_id}
        reason={reason}
        onPress={() => router.push(`/profile/${attendee.user_id}`)}
        onConnect={() => handleConnect(attendee.user_id)}
        onAccept={() => status.kind === 'incoming' && handleAccept(status.request.id, attendee.user_id)}
        onMessage={() => handleMessage(attendee.user_id)}
      />
    );
  };

  const meta = [event.status === 'active' ? 'Live now' : 'Ended', checkedInAt ? `${attendees.length} ${attendees.length === 1 ? 'person' : 'people'} here` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
          <Pressable onPress={() => router.back()} style={styles.back} hitSlop={6} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={22} color={colors.brandMarkCream} />
          </Pressable>
          <Text style={styles.eventName}>{event.name}</Text>
          <Text style={styles.eventMeta}>{meta}</Text>
          <Pressable style={styles.editButton} onPress={() => router.push(`/discover/event/${id}/intent`)}>
            <Text style={styles.editButtonText}>Edit your ask & offer</Text>
          </Pressable>
        </View>

        {!checkedInAt ? (
          <View style={styles.checkInWrap}>
            <View style={styles.checkInCard}>
              <Text style={styles.checkInTitle}>You're not checked in yet</Text>
              <Text style={styles.checkInBody}>
                Confirm you're actually at {event.name ?? 'the event'} to see who else is here and get matched.
              </Text>
              <Pressable style={styles.checkInButton} onPress={handleCheckIn} disabled={isCheckingIn}>
                <Text style={styles.checkInButtonText}>{isCheckingIn ? 'Checking in…' : "I'm here — check in"}</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => setLeaveSheetOpen(true)} disabled={isLeaving} style={styles.footerLink}>
              <Text style={styles.footerLinkText}>Leave event</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.segmentWrap}>
              <View style={styles.track}>
                {(
                  [
                    ['top', 'Top Matches', topMatches.length],
                    ['overlap', 'Overlap', sharedOverlap.length],
                    ['everyone', 'Everyone', attendees.length],
                  ] as [SegmentKey, string, number][]
                ).map(([key, label, count]) => {
                  const active = segment === key;
                  return (
                    <Pressable key={key} style={[styles.segment, active && styles.segmentActive]} onPress={() => setSegment(key)}>
                      <Text
                        style={[styles.segmentLabel, active ? styles.segmentLabelActive : styles.segmentLabelInactive]}
                        numberOfLines={1}
                      >
                        {label} ({countLabel(count)})
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={[styles.list, { paddingBottom: 18 }]}
              refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.brandMarkDark} />}
            >
              {segment === 'top' ? (
                <>
                  {/* The count lives in the tab label now (Top Matches (n)) — this header
                      doesn't repeat it. */}
                  <Text style={[styles.eyebrow, styles.singleSectionLabel]}>Best matches</Text>
                  {topMatches.length > 0 && !topMatches[0].isAiGenerated ? (
                    <Text style={styles.explainer}>AI matching is unavailable right now, so this is a simpler ranking.</Text>
                  ) : null}
                  {topMatches.length > 0 ? (
                    topMatches.map((m) => {
                      const attendee = attendeeById.get(m.candidate_user_id);
                      return attendee ? renderCard(attendee, m.match_reason) : null;
                    })
                  ) : (
                    <NoMatchesCard />
                  )}
                </>
              ) : null}

              {segment === 'overlap' ? (
                <>
                  <Text style={[styles.eyebrow, styles.singleSectionLabel]}>Shared background</Text>
                  {sharedOverlap.length > 0 ? (
                    sharedOverlap.map((m) => {
                      const attendee = attendeeById.get(m.candidate_user_id);
                      return attendee ? renderCard(attendee, m.match_reason) : null;
                    })
                  ) : (
                    <NoMatchesCard />
                  )}
                </>
              ) : null}

              {segment === 'everyone' ? (
                <>
                  <View style={styles.searchField}>
                    <Ionicons name="search" size={15} color={colors.brandInk} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search name, company or school"
                      placeholderTextColor={colors.mutedInk}
                      value={search}
                      onChangeText={setSearch}
                    />
                  </View>
                  {filteredGroupedAttendees.length === 0 ? (
                    <Text style={styles.empty}>No one else has joined yet — check back soon.</Text>
                  ) : (
                    filteredGroupedAttendees.map(({ role, list }) => (
                      <View key={role} style={styles.group}>
                        <View style={styles.sectionRow}>
                          <Text style={styles.eyebrow}>{pluralRoleLabel(role === 'other' ? null : role)}</Text>
                          <Text style={styles.eyebrow}>{list.length}</Text>
                        </View>
                        {list.map((a) => renderCard(a))}
                      </View>
                    ))
                  )}
                </>
              ) : null}
            </ScrollView>

            {/* Pinned above the tab bar at every list length and on every tab — previously these
                trailed the scroll content, landing mid-screen when the list was short and out of
                reach when it was long. */}
            <View style={[styles.actionFooter, { paddingBottom: 12 + tabBarHeight }]}>
              <Pressable style={styles.checkOutButton} onPress={handleCheckOut}>
                <Text style={styles.checkOutButtonText}>Check out</Text>
              </Pressable>
              <Pressable onPress={() => setLeaveSheetOpen(true)} disabled={isLeaving} style={styles.leaveLink} hitSlop={4}>
                <Text style={styles.leaveLinkText}>Leave event</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      <Modal visible={leaveSheetOpen} transparent animationType="slide" onRequestClose={() => setLeaveSheetOpen(false)}>
        <Pressable style={styles.sheetScrim} onPress={() => setLeaveSheetOpen(false)} accessibilityLabel="Close" />
        <View style={[styles.sheetPanel, { paddingBottom: insets.bottom + 18 }]}>
          <Text style={styles.sheetTitle}>Leave {event.name ?? 'this event'}?</Text>
          <Text style={styles.sheetBody}>
            You'll stop appearing here and lose access to the attendee list. Connections you've made stay.
          </Text>
          <Pressable style={styles.sheetPrimary} onPress={confirmLeave} disabled={isLeaving}>
            <Text style={styles.sheetPrimaryText}>{isLeaving ? 'Leaving…' : 'Leave event'}</Text>
          </Pressable>
          <Pressable style={styles.sheetSecondary} onPress={() => setLeaveSheetOpen(false)} disabled={isLeaving}>
            <Text style={styles.sheetSecondaryText}>Stay</Text>
          </Pressable>
        </View>
      </Modal>

      <EventFeedbackSheet visible={showFeedback} eventId={id} onClose={() => setShowFeedback(false)} />
    </>
  );
}

// Copy is deliberately condition-neutral — true in an empty room and in a full one where
// nothing overlaps. Never "You're the first one here."
function NoMatchesCard() {
  return (
    <View style={styles.noMatchesCard}>
      <View style={styles.noMatchesIcon}>
        <Ionicons name="people" size={25} color={colors.mutedInk} />
      </View>
      <Text style={styles.noMatchesTitle}>No matches yet</Text>
      <Text style={styles.noMatchesCopy}>Matches appear as people join and share what they're looking for.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.brandMarkCream },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.brandMarkCream },
  notMemberText: { fontFamily: fonts.sans, fontSize: 14, color: colors.brandInk, textAlign: 'center' },

  header: { backgroundColor: colors.brandMarkDark, paddingHorizontal: 16, paddingBottom: 17 },
  // 44pt target, glyph pulled 8pt left so it optically sits on the 18pt gutter.
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  eventName: { fontFamily: fonts.wordmark, fontSize: 28, lineHeight: 30, color: colors.brandMarkCream, marginTop: 8, paddingHorizontal: 2 },
  eventMeta: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.headerMeta, marginTop: 6, paddingHorizontal: 2 },
  editButton: { backgroundColor: colors.brandMarkCream, borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  editButtonText: { fontFamily: fonts.sansSemibold, color: colors.brandMarkDark, fontSize: 14 },

  segmentWrap: { paddingHorizontal: 18, paddingTop: 14 },
  track: { flexDirection: 'row', backgroundColor: colors.insetPill, borderRadius: 999, padding: 3, gap: 2 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 999, minHeight: 44, justifyContent: 'center' },
  segmentActive: { backgroundColor: colors.card },
  segmentLabel: { fontFamily: fonts.sansSemibold, fontSize: 14 },
  segmentLabelActive: { color: colors.brandMarkDark },
  segmentLabelInactive: { color: colors.brandInk },

  scrollArea: { flex: 1 },
  list: { paddingHorizontal: 18, paddingTop: 14, gap: 10 },
  // Still used by the Everyone tab's per-role-group headers (label + that group's own count —
  // not a duplicate of the tab total). The single-label headers below (Best matches, Shared
  // background) don't reuse this — they're one Text, not a row of two.
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 2, paddingTop: 2 },
  singleSectionLabel: { paddingHorizontal: 2, paddingTop: 2 },
  eyebrow: { fontFamily: fonts.sansSemibold, fontSize: 11, letterSpacing: 11 * 0.14, textTransform: 'uppercase', color: colors.brandInk },
  explainer: { fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18, color: colors.brandInk, paddingHorizontal: 2 },
  empty: { fontFamily: fonts.sans, fontSize: 14.5, lineHeight: 21, color: colors.brandInk, textAlign: 'center', paddingVertical: 34 },
  noMatchesCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 20,
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
    gap: 11,
  },
  noMatchesIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.insetPill, alignItems: 'center', justifyContent: 'center' },
  noMatchesTitle: { fontFamily: fonts.wordmark, fontSize: 20, lineHeight: 24, color: colors.brandMarkDark },
  noMatchesCopy: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, color: colors.brandInk, textAlign: 'center', maxWidth: 260 },
  group: { gap: 10 },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { fontFamily: fonts.sans, flex: 1, fontSize: 14, color: colors.brandMarkDark },

  checkInWrap: { flex: 1, padding: 18, justifyContent: 'center' },
  checkInCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, borderRadius: 18, padding: 20, alignItems: 'center' },
  checkInTitle: { fontFamily: fonts.sansSemibold, fontSize: 18, color: colors.brandMarkDark, marginBottom: 8, textAlign: 'center' },
  checkInBody: { fontFamily: fonts.sans, fontSize: 14, color: colors.brandInk, lineHeight: 20, textAlign: 'center', marginBottom: 18 },
  checkInButton: { backgroundColor: colors.brandMarkDark, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 24, width: '100%', alignItems: 'center' },
  checkInButtonText: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.brandMarkCream },

  // Used only by the not-checked-in state's Leave link — the checked-in footer below has its
  // own pair of styles (Check out is outlined, Leave event stays bare text, deliberately
  // unequal per the brief: Check out is routine, Leave is rarer and heavier so it stays quiet).
  footerLink: { paddingVertical: 12, paddingHorizontal: 8, alignSelf: 'center' },
  footerLinkText: { fontFamily: fonts.sansSemibold, fontSize: 13.5, color: colors.brandInk },

  actionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.brandMarkCream,
    borderTopWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  checkOutButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.brandMarkDark,
    borderRadius: 999,
    paddingVertical: 13,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOutButtonText: { fontFamily: fonts.sansSemibold, fontSize: 14.5, color: colors.brandMarkDark },
  leaveLink: { paddingVertical: 13, paddingHorizontal: 4, minHeight: 44, justifyContent: 'center' },
  leaveLinkText: { fontFamily: fonts.sansSemibold, fontSize: 14.5, color: colors.brandInk },

  sheetScrim: { flex: 1, backgroundColor: 'rgba(84,66,54,.42)' },
  sheetPanel: {
    backgroundColor: colors.brandMarkCream,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    gap: 14,
    shadowColor: 'rgba(84,66,54,1)',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: -10 },
    shadowRadius: 30,
    elevation: 12,
  },
  sheetTitle: { fontFamily: fonts.wordmark, fontSize: 22, lineHeight: 26, color: colors.brandMarkDark },
  sheetBody: { fontFamily: fonts.sans, fontSize: 14.5, lineHeight: 21, color: colors.brandInk },
  sheetPrimary: { backgroundColor: colors.brandMarkDark, borderRadius: 999, paddingVertical: 15, alignItems: 'center', minHeight: 44 },
  sheetPrimaryText: { fontFamily: fonts.sansSemibold, fontSize: 15.5, color: colors.brandMarkCream },
  sheetSecondary: {
    borderWidth: 1.5,
    borderColor: colors.brandMarkDark,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  sheetSecondaryText: { fontFamily: fonts.sansSemibold, fontSize: 15.5, color: colors.brandMarkDark },
});

// "Warm Ledger" redesign — see design_handoff_visual_system/README.md screen 2.
// People you're already connected to show as their real profile instead of an anon card —
// there's no anonymity left to protect once you're actually connected, and re-anonymizing
// someone you already know would just be confusing.
import { useCallback, useEffect, useState } from 'react';
import { View, FlatList, Text, Pressable, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { EventStrip } from '../../components/EventStrip';
import { AnonCard } from '../../components/AnonCard';
import { NearbyIdentityCard } from '../../components/NearbyIdentityCard';
import { Card } from '../../components/Card';
import { LetteredAvatar } from '../../components/LetteredAvatar';
import { PrimaryButton } from '../../components/Buttons';
import { SectionLabel } from '../../components/SectionLabel';
import { VisibilityToggle } from '../../components/VisibilityToggle';
import { EventEntryCard, type EventEntryMode } from '../../components/EventEntryCard';
import { getMyActiveVisibility } from '../../lib/api/visibility';
import { getMyConnections } from '../../lib/api/connections';
import { getCurrentCoords } from '../../lib/location';
import { getDismissedEventArrivalIds, dismissEventArrival } from '../../lib/eventArrivalDismiss';
import { colors, avatarSizes, typeStyles, radii, fonts } from '../../lib/theme';
import {
  getOrCreateGeoScope,
  getAggregateView,
  getFeedCardsV2,
  type AggregateView,
  type FeedCardV2,
} from '../../lib/api/feed';
import {
  detectNearbyEvents,
  getMyActiveEvents,
  joinEvent,
  type EventSummary,
} from '../../lib/api/events';
import {
  fetchOverlap,
  createRevealRequest,
  getOutgoingPendingTargetIds,
  getIncomingRevealRequests,
  revealRequest,
  type IncomingRevealRequest,
  type Overlap,
} from '../../lib/api/reveal';
import { sendRequest, getOutgoingPendingConnectTargetIds } from '../../lib/api/requests';
import { useAuth } from '../../lib/auth';
import type { Connection } from '../../lib/types';

type ListItem =
  | { kind: 'peopleHeader'; key: string; count: number }
  | { kind: 'header'; key: string; label: string; count: number }
  | { kind: 'connected'; key: string; connection: Connection }
  | { kind: 'incomingReveal'; key: string; reveal: IncomingRevealRequest }
  | { kind: 'identity'; key: string; card: FeedCardV2 }
  | { kind: 'anon'; key: string; card: FeedCardV2 };

export default function Nearby() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { hasProfile, isDemo } = useAuth();
  const [visibilityExpiresAt, setVisibilityExpiresAt] = useState<string | null>(null);
  const [visibilitySheetOpen, setVisibilitySheetOpen] = useState(false);
  const [entryMode, setEntryMode] = useState<EventEntryMode>('prompt');
  const [aggregate, setAggregate] = useState<AggregateView | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [incomingReveals, setIncomingReveals] = useState<IncomingRevealRequest[]>([]);
  const [anonCards, setAnonCards] = useState<FeedCardV2[]>([]);
  const [identityCards, setIdentityCards] = useState<FeedCardV2[]>([]);
  // Which of `connections` are actually in the current geo scope right now — a connection
  // only earns a spot in the "Showing full identity" section (instead of just living in the
  // People tab) if they're physically nearby, not simply because you're connected at all.
  const [nearbyUserIds, setNearbyUserIds] = useState<Set<string>>(new Set());
  const [askedTargetIds, setAskedTargetIds] = useState<Set<string>>(new Set());
  const [connectRequestedIds, setConnectRequestedIds] = useState<Set<string>>(new Set());
  const [overlapByUserId, setOverlapByUserId] = useState<Map<string, Overlap>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [isRevealingBack, setIsRevealingBack] = useState<string | null>(null);
  const [nearbyEvents, setNearbyEvents] = useState<EventSummary[]>([]);
  const [myActiveEvents, setMyActiveEvents] = useState<EventSummary[]>([]);
  const [isJoiningEventId, setIsJoiningEventId] = useState<string | null>(null);
  const [dismissedEventIds, setDismissedEventIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    getDismissedEventArrivalIds().then(setDismissedEventIds);
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const activeVisibility = await getMyActiveVisibility();
      setVisibilityExpiresAt(activeVisibility?.expiresAt ?? null);

      const [connectionsList, incomingRevealsList] = await Promise.all([
        getMyConnections(),
        getIncomingRevealRequests(),
      ]);
      const connectionMap = new Map(connectionsList.map((c) => [c.other!.id, c]));
      const incomingRevealMap = new Map(
        incomingRevealsList.filter((r) => r.requester).map((r) => [r.requester!.id, r])
      );
      setConnections(connectionsList);
      setIncomingReveals(incomingRevealsList);

      // Doesn't need location, so this loads regardless of visibility — someone who joined an
      // event by QR should still see it here even with visibility off.
      getMyActiveEvents()
        .then(setMyActiveEvents)
        .catch(() => {});

      if (!activeVisibility) {
        setAggregate(null);
        setAnonCards([]);
        setIdentityCards([]);
        setNearbyUserIds(new Set());
        setNearbyEvents([]);
        return;
      }

      const id = await getOrCreateGeoScope();

      // Best-effort — a failed event lookup shouldn't block the regular Nearby feed.
      getCurrentCoords()
        .then(({ lat, lng }) => detectNearbyEvents(lat, lng))
        .then(setNearbyEvents)
        .catch(() => setNearbyEvents([]));

      const [aggregateView, feedCards, askedIds, connectRequestedIdSet] = await Promise.all([
        getAggregateView(id),
        getFeedCardsV2(id),
        getOutgoingPendingTargetIds(),
        getOutgoingPendingConnectTargetIds(),
      ]);

      setAggregate(aggregateView);
      setAskedTargetIds(askedIds);
      setConnectRequestedIds(connectRequestedIdSet);
      setNearbyUserIds(new Set(feedCards.map((c) => c.user_id)));

      // Only rank/show "why you two" for people who'll actually render as a stranger card —
      // someone already connected or already mid-reveal shows their real profile instead and
      // keeps its own priority position, so there's no reason to spend an AI call ranking
      // them against strangers.
      const strangerCards = feedCards.filter(
        (c) => !connectionMap.has(c.user_id) && !incomingRevealMap.has(c.user_id)
      );

      const overlaps = await Promise.all(
        strangerCards.map((c) => fetchOverlap(c.user_id).catch(() => null))
      );
      const overlapMap = new Map(strangerCards.map((c, i) => [c.user_id, overlaps[i]]));
      setOverlapByUserId(overlapMap);

      const rankByOverlap = (a: FeedCardV2, b: FeedCardV2) =>
        (overlapMap.get(b.user_id)?.strength ?? 0) - (overlapMap.get(a.user_id)?.strength ?? 0);

      setAnonCards(strangerCards.filter((c) => c.identity_visibility === 'anonymous').sort(rankByOverlap));
      setIdentityCards(strangerCards.filter((c) => c.identity_visibility === 'full').sort(rankByOverlap));
    } catch {
      // Location permission not granted yet, or scope creation failed — leave feed empty.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleAskToConnect(targetUserId: string, connectionLine: string) {
    try {
      await createRevealRequest(targetUserId, connectionLine);
      setAskedTargetIds((prev) => new Set(prev).add(targetUserId));
      Alert.alert('Sent', "They'll see your profile. You'll see theirs if they ask back.");
    } catch (error: any) {
      Alert.alert('Could not send', error.message ?? String(error));
    }
  }

  async function handleRevealBack(requestId: string, requesterUserId: string) {
    setIsRevealingBack(requestId);
    try {
      await revealRequest(requestId);
      setIncomingReveals((prev) => prev.filter((r) => r.id !== requestId));
      await load();
    } catch (error: any) {
      Alert.alert('Could not share your profile', error.message ?? String(error));
    } finally {
      setIsRevealingBack(null);
      void requesterUserId;
    }
  }

  async function handleConnect(targetUserId: string) {
    setConnectRequestedIds((prev) => new Set(prev).add(targetUserId));
    try {
      await sendRequest(targetUserId, 'connect', { contextType: 'nearby' });
    } catch (error: any) {
      setConnectRequestedIds((prev) => {
        const next = new Set(prev);
        next.delete(targetUserId);
        return next;
      });
      Alert.alert('Could not send request', error.message ?? String(error));
    }
  }

  function handleJoinEvent(event: EventSummary) {
    // Explicit confirmation before joining, same disclosure as the QR/link join flow
    // (app/event-join/[token].tsx) — ambient proximity detection shouldn't join on a single
    // tap with no "here's what this does" step.
    Alert.alert(
      event.name ?? 'Join this event?',
      "Attendees see your real name and photo for the length of the event — no anonymous cards in here.",
      [
        {
          text: 'Not now',
          style: 'cancel',
          onPress: () => {
            setDismissedEventIds((prev) => new Set(prev).add(event.id));
            dismissEventArrival(event.id);
          },
        },
        {
          text: 'Join',
          onPress: async () => {
            setIsJoiningEventId(event.id);
            try {
              await joinEvent(event.id, 'geofence_prompt');
              router.push(`/event/${event.id}`);
              await load();
            } catch (error: any) {
              Alert.alert('Could not join event', error.message ?? String(error));
            } finally {
              setIsJoiningEventId(null);
            }
          },
        },
      ]
    );
  }

  function handleLockedTap() {
    Alert.alert(
      'Finish your profile first',
      "You can browse freely, but expanding a card or asking to connect needs your own profile set up first — that's what gets shown back to people who ask about you.",
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Complete profile', onPress: () => router.push('/edit-profile') },
      ]
    );
  }

  const isVisible = !!visibilityExpiresAt;
  const peopleNearby = aggregate?.total_count ?? 0;
  // Treat "still checking" the same as "not done" — avoids a flash of enabled buttons
  // before the app knows for sure.
  const profileIncomplete = hasProfile !== true;
  const joinedEventIds = new Set(myActiveEvents.map((e) => e.id));
  const joinableNearbyEvents = nearbyEvents.filter((e) => !joinedEventIds.has(e.id) && !dismissedEventIds.has(e.id));

  const identityGroup: ListItem[] = [
    ...connections
      .filter((c) => c.other && nearbyUserIds.has(c.other.id))
      .map((c) => ({ kind: 'connected' as const, key: `c-${c.id}`, connection: c })),
    ...incomingReveals
      .filter((r) => r.requester)
      .map((r) => ({ kind: 'incomingReveal' as const, key: `r-${r.id}`, reveal: r })),
    ...identityCards.map((c) => ({ kind: 'identity' as const, key: `i-${c.user_id}`, card: c })),
  ];
  const people: ListItem[] = [
    ...(anonCards.length > 0
      ? [{ kind: 'header' as const, key: 'h-anon', label: 'Anonymous', count: anonCards.length }]
      : []),
    ...anonCards.map((c) => ({ kind: 'anon' as const, key: `a-${c.user_id}`, card: c })),
    ...(identityGroup.length > 0
      ? [{ kind: 'header' as const, key: 'h-identity', label: 'Showing full identity', count: identityGroup.length }]
      : []),
    ...identityGroup,
  ];
  const peopleCount = anonCards.length + identityGroup.length;
  // The "PEOPLE NEARBY" row is a list item (not ListHeaderComponent) so it can be the sticky
  // index while the event strip above it scrolls away. Omitted when there's no one, so the
  // empty state can render instead.
  const listData: ListItem[] =
    peopleCount > 0 ? [{ kind: 'peopleHeader', key: 'people-header', count: peopleCount }, ...people] : [];
  const inAnyEvent = myActiveEvents.length > 0;

  return (
    <View style={styles.container}>
      {/* Only the title row stays fixed; everything else — event strip, join card, banners,
          people — lives in the one FlatList below so the whole screen scrolls as one gesture.
          Previously the events sat in a non-scrolling block above a scrolling list, which is
          what made the screen feel stuck once a few events were joined. */}
      <View style={[styles.header, { paddingTop: insets.top + 26 }]}>
        <View style={styles.topRow}>
          <Text style={styles.headline} numberOfLines={1}>
            Who's nearby
          </Text>
          {isDemo ? (
            <View style={styles.demoPill}>
              <Text style={styles.demoPillText}>Demo mode</Text>
            </View>
          ) : null}
          <Pressable
            style={[styles.visibilityPill, isVisible && styles.visibilityPillOn]}
            onPress={() => setVisibilitySheetOpen(true)}
          >
            <Text style={[styles.visibilityPillText, isVisible && styles.visibilityPillTextOn]}>
              {isVisible ? 'Visible' : 'Go visible'}
            </Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={listData}
        keyExtractor={(item) => item.key}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + 16 }]}
        // Index 0 is ListHeaderComponent; 1 is the first data item, the "PEOPLE NEARBY" row.
        stickyHeaderIndices={[1]}
        ItemSeparatorComponent={ListGap}
        ListHeaderComponent={
          <View>
            {inAnyEvent ? (
              <View style={styles.stripWrap}>
                <EventStrip events={myActiveEvents} onPressEvent={(id) => router.push(`/event/${id}`)} />
              </View>
            ) : (
              // Zero events: the join card is the primary affordance, exactly as before. Once
              // the user is in any event it's gone — joining another is under the + menu.
              <>
                <View style={styles.entryCardWrap}>
                  <EventEntryCard mode={entryMode} onModeChange={setEntryMode} onJoined={load} />
                </View>
                <View style={styles.entryDivider} />
              </>
            )}

            {joinableNearbyEvents.map((e) => (
              <Pressable
                key={e.id}
                style={styles.arrivalPrompt}
                onPress={() => handleJoinEvent(e)}
                disabled={isJoiningEventId === e.id}
              >
                <Ionicons name="people" size={17} color={colors.brandMarkCream} />
                <View style={styles.arrivalPromptText}>
                  <Text style={styles.arrivalPromptTitle}>You're at {e.name}</Text>
                  <Text style={styles.arrivalPromptSubtitle}>
                    {isJoiningEventId === e.id ? 'Joining…' : 'Tap to join and see who else is here'}
                  </Text>
                </View>
              </Pressable>
            ))}

            {profileIncomplete ? (
              <Pressable style={styles.incompleteBanner} onPress={() => router.push('/edit-profile')}>
                <Text style={styles.incompleteBannerText}>
                  You're browsing without a profile — finish yours to expand cards and connect.
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          // Hidden while the card above is scanning or taking a code — the camera pane is tall,
          // and a second block of copy under it just pushes the whole thing off screen.
          isLoading || (!inAnyEvent && entryMode !== 'prompt') ? null : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>
                {isVisible ? 'No one nearby right now' : "Go visible to see who's around you"}
              </Text>
              <Text style={styles.emptyStateBody}>
                {isVisible
                  ? 'Check back in a bit — this updates as people arrive.'
                  : 'You stay hidden until you switch it on.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          if (item.kind === 'peopleHeader') {
            return (
              <View style={styles.peopleHeader}>
                <Text style={styles.eyebrow}>People nearby</Text>
                <Text style={styles.eyebrow}>{item.count}</Text>
              </View>
            );
          }

          if (item.kind === 'header') {
            return (
              <Text style={[styles.eyebrow, styles.subHeader]}>
                {item.label} · {item.count}
              </Text>
            );
          }

          if (item.kind === 'connected') {
            const other = item.connection.other!;
            return (
              <NearbyIdentityCard
                name={other.full_name}
                headline={other.headline}
                employer={other.employer}
                title={other.title}
                undergradSchool={other.undergrad_school}
                undergradYear={other.undergrad_year}
                gradSchool={other.grad_school}
                gradYear={other.grad_year}
                photoUrl={other.photo_url}
                status="connected"
                onPress={() => router.push(`/chat/${item.connection.id}`)}
                onPhotoPress={() => router.push(`/profile/${other.id}`)}
                onConnect={() => {}}
              />
            );
          }

          if (item.kind === 'incomingReveal') {
            const requester = item.reveal.requester!;
            const revealing = isRevealingBack === item.reveal.id;
            return (
              <Card style={styles.wantsCard}>
                <View style={styles.wantsRow}>
                  <LetteredAvatar name={requester.full_name} photoUrl={requester.photo_url} size={avatarSizes.matchCard} />
                  <View style={styles.wantsInfo}>
                    <Text style={typeStyles.cardName}>{requester.full_name}</Text>
                    {requester.headline ? <Text style={typeStyles.cardSubtitle}>{requester.headline}</Text> : null}
                  </View>
                </View>
                <SectionLabel tone="brass" style={styles.wantsLabel}>Wants to connect</SectionLabel>
                <PrimaryButton
                  label={revealing ? 'Sharing…' : 'Share my profile back'}
                  loading={revealing}
                  onPress={() => handleRevealBack(item.reveal.id, requester.id)}
                />
              </Card>
            );
          }

          if (item.kind === 'identity') {
            const c = item.card;
            const requested = connectRequestedIds.has(c.user_id);
            return (
              <NearbyIdentityCard
                name={c.full_name ?? 'Someone nearby'}
                headline={c.headline}
                employer={c.employer}
                title={c.title}
                undergradSchool={c.undergrad_school}
                undergradYear={c.undergrad_year}
                gradSchool={c.grad_school}
                gradYear={c.grad_year}
                photoUrl={c.photo_url}
                status={requested ? 'requested' : 'none'}
                onPress={() => router.push(`/profile/${c.user_id}`)}
                onConnect={() => handleConnect(c.user_id)}
              />
            );
          }

          return (
            <AnonCard
              card={{ ...item.card, line: item.card.line ?? '', used_generic: item.card.used_generic ?? false }}
              overlap={overlapByUserId.get(item.card.user_id) ?? null}
              alreadyAsked={askedTargetIds.has(item.card.user_id)}
              locked={profileIncomplete}
              onAskToConnect={(connectionLine) => handleAskToConnect(item.card.user_id, connectionLine)}
              onLockedTap={handleLockedTap}
            />
          );
        }}
      />

      <VisibilityToggle visible={visibilitySheetOpen} onClose={() => setVisibilitySheetOpen(false)} onChange={load} />
    </View>
  );
}

function ListGap() {
  return <View style={styles.listGap} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.brandMarkCream },
  header: {
    paddingHorizontal: 18,
    paddingTop: 26,
    paddingBottom: 0,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  demoPill: { backgroundColor: colors.brass, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  demoPillText: { fontFamily: fonts.sansSemibold, color: colors.inkOn, fontSize: 11 },
  visibilityPill: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.brandSand,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  visibilityPillOn: { backgroundColor: colors.brandMarkDark, borderColor: colors.brandMarkDark },
  visibilityPillText: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.brandMarkDark },
  visibilityPillTextOn: { color: colors.brandMarkCream },
  headline: {
    flexShrink: 1,
    fontFamily: fonts.wordmark,
    fontSize: 33,
    lineHeight: 35,
    color: colors.brandMarkDark,
  },
  listContent: { paddingHorizontal: 18 },
  listGap: { height: 10 },
  // The strip scrolls edge to edge, so it breaks out of the list's gutter; its own content row
  // re-applies the gutter so the first chip lines up and the last can scroll to the edge.
  stripWrap: { marginHorizontal: -18, paddingTop: 14 },
  // The card is wider than the text gutter by 7px each side so its edges bracket the title and
  // pill above it; the divider below spans that same widened width.
  entryCardWrap: { marginTop: 16 },
  entryDivider: {
    height: 1,
    backgroundColor: colors.hairline,
    marginTop: 4,
    marginHorizontal: -7,
  },
  // Sticky, so it needs an opaque ground for the cards to scroll under.
  peopleHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    backgroundColor: colors.brandMarkCream,
    paddingTop: 14,
    paddingHorizontal: 2,
    paddingBottom: 2,
  },
  eyebrow: {
    fontFamily: fonts.sansSemibold,
    fontSize: 11,
    letterSpacing: 11 * 0.14,
    textTransform: 'uppercase',
    color: colors.brandInk,
  },
  subHeader: { paddingHorizontal: 2, paddingTop: 12 },
  emptyState: { maxWidth: 330, alignSelf: 'center', paddingTop: 26, paddingHorizontal: 10 },
  emptyStateTitle: {
    fontFamily: fonts.sansSemibold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.brandMarkDark,
    textAlign: 'center',
  },
  emptyStateBody: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    color: colors.brandInk,
    textAlign: 'center',
    marginTop: 7,
  },
  // The geofence "you're at X" prompt (a nearby event the user hasn't joined). Not part of the
  // strip — that's joined events only — so it keeps a banner shape, on the brand palette.
  arrivalPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.brandMarkDark,
    borderRadius: 16,
    padding: 13,
    marginTop: 14,
  },
  arrivalPromptText: { flex: 1 },
  arrivalPromptTitle: { fontFamily: fonts.sansSemibold, fontSize: 14.5, color: colors.brandMarkCream },
  arrivalPromptSubtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.brandSand, marginTop: 2 },
  incompleteBanner: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 13,
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  incompleteBannerText: { fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18, color: colors.brandInk },
  wantsCard: {
    gap: 12,
    backgroundColor: colors.card,
    borderColor: colors.hairline,
    borderRadius: 18,
  },
  wantsRow: { flexDirection: 'row', gap: 12 },
  wantsInfo: { flex: 1, gap: 2, justifyContent: 'center' },
  wantsLabel: {},
});

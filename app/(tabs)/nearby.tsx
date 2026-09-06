// "Warm Ledger" redesign — see design_handoff_visual_system/README.md screen 2.
// People you're already connected to show as their real profile instead of an anon card —
// there's no anonymity left to protect once you're actually connected, and re-anonymizing
// someone you already know would just be confusing.
import { useCallback, useState } from 'react';
import { View, FlatList, Text, Pressable, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnonCard } from '../../components/AnonCard';
import { NearbyIdentityCard } from '../../components/NearbyIdentityCard';
import { Card } from '../../components/Card';
import { LetteredAvatar } from '../../components/LetteredAvatar';
import { PrimaryButton } from '../../components/Buttons';
import { SectionLabel } from '../../components/SectionLabel';
import { VisibilityToggle } from '../../components/VisibilityToggle';
import { getMyActiveVisibility } from '../../lib/api/visibility';
import { getMyConnections } from '../../lib/api/connections';
import { getCurrentCoords } from '../../lib/location';
import { colors, avatarSizes, typeStyles, spacing, radii, fonts } from '../../lib/theme';
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

function timeRemainingShort(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return '0m';
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

type ListItem =
  | { kind: 'header'; key: string; label: string; count: number }
  | { kind: 'connected'; key: string; connection: Connection }
  | { kind: 'incomingReveal'; key: string; reveal: IncomingRevealRequest }
  | { kind: 'identity'; key: string; card: FeedCardV2 }
  | { kind: 'anon'; key: string; card: FeedCardV2 };

export default function Nearby() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hasProfile, isDemo } = useAuth();
  const [visibilityExpiresAt, setVisibilityExpiresAt] = useState<string | null>(null);
  const [visibilitySheetOpen, setVisibilitySheetOpen] = useState(false);
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

  async function handleJoinEvent(event: EventSummary) {
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
  const joinableNearbyEvents = nearbyEvents.filter((e) => !joinedEventIds.has(e.id));

  const identityGroup: ListItem[] = [
    ...connections
      .filter((c) => c.other && nearbyUserIds.has(c.other.id))
      .map((c) => ({ kind: 'connected' as const, key: `c-${c.id}`, connection: c })),
    ...incomingReveals
      .filter((r) => r.requester)
      .map((r) => ({ kind: 'incomingReveal' as const, key: `r-${r.id}`, reveal: r })),
    ...identityCards.map((c) => ({ kind: 'identity' as const, key: `i-${c.user_id}`, card: c })),
  ];
  const listData: ListItem[] = [
    ...(anonCards.length > 0
      ? [{ kind: 'header' as const, key: 'h-anon', label: 'Anonymous', count: anonCards.length }]
      : []),
    ...anonCards.map((c) => ({ kind: 'anon' as const, key: `a-${c.user_id}`, card: c })),
    ...(identityGroup.length > 0
      ? [{ kind: 'header' as const, key: 'h-identity', label: 'Showing full identity', count: identityGroup.length }]
      : []),
    ...identityGroup,
  ];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <View style={styles.topRow}>
          <View style={styles.spacer} />
          {isDemo ? (
            <View style={styles.demoPill}>
              <Text style={styles.demoPillText}>Demo mode</Text>
            </View>
          ) : null}
          <Pressable style={styles.visibilityPill} onPress={() => setVisibilitySheetOpen(true)}>
            {isVisible ? <View style={styles.liveDot} /> : null}
            <Text style={styles.visibilityPillText}>
              {isVisible ? `Visible · ${timeRemainingShort(visibilityExpiresAt!)}` : 'Not visible'}
            </Text>
          </Pressable>
          <Pressable style={styles.scanButton} onPress={() => router.push('/scan-event')}>
            <Ionicons name="qr-code-outline" size={18} color={colors.inkOn} />
          </Pressable>
        </View>

        <Text style={styles.headline}>
          {peopleNearby > 0
            ? `${peopleNearby} ${peopleNearby === 1 ? 'person is' : 'people are'} working near you`
            : "Who's working nearby"}
        </Text>

        {myActiveEvents.map((e) => (
          <Pressable key={e.id} style={styles.eventBanner} onPress={() => router.push(`/event/${e.id}`)}>
            <Ionicons name="people" size={17} color={colors.brassOnDark} />
            <View style={styles.eventBannerText}>
              <Text style={styles.eventBannerTitle}>{e.name}</Text>
              <Text style={styles.eventBannerSubtitle}>You're in</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="rgba(245,239,230,.6)" />
          </Pressable>
        ))}

        {joinableNearbyEvents.map((e) => (
          <Pressable
            key={e.id}
            style={styles.eventBanner}
            onPress={() => handleJoinEvent(e)}
            disabled={isJoiningEventId === e.id}
          >
            <Ionicons name="people" size={17} color={colors.brassOnDark} />
            <View style={styles.eventBannerText}>
              <Text style={styles.eventBannerTitle}>You're at {e.name}</Text>
              <Text style={styles.eventBannerSubtitle}>
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

      <FlatList
        data={listData}
        keyExtractor={(item) => item.key}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} />}
        ListEmptyComponent={
          !isLoading ? (
            <Text style={styles.empty}>
              {isVisible
                ? 'No one nearby right now.'
                : "Turn on your visibility above to browse who's nearby."}
            </Text>
          ) : null
        }
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            return (
              <SectionLabel tone={item.label === 'Anonymous' ? 'muted' : 'brass'} style={styles.sectionHeader}>
                {item.label} · {item.count}
              </SectionLabel>
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
                reason={c.overlap_phrase}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  header: {
    paddingHorizontal: spacing.gutter,
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: colors.rule,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  spacer: { flex: 1 },
  demoPill: { backgroundColor: colors.brass, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  demoPillText: { fontFamily: fonts.wordmark, color: colors.inkOn, fontSize: 11, fontWeight: '700' },
  visibilityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radii.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.live },
  visibilityPillText: { fontFamily: fonts.wordmark, fontSize: 12, fontWeight: '600', color: colors.ink },
  scanButton: {
    width: 34,
    height: 34,
    borderRadius: radii.iconButton,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: { ...typeStyles.screenHeadline, marginTop: 14 },
  eventBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.brand,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  eventBannerText: { flex: 1 },
  eventBannerTitle: { fontFamily: fonts.wordmark, fontSize: 13.5, fontWeight: '600', color: colors.inkOn },
  eventBannerSubtitle: { fontFamily: fonts.wordmark, fontSize: 11.5, color: 'rgba(245,239,230,.6)', marginTop: 1 },
  incompleteBanner: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.rule,
  },
  incompleteBannerText: { fontFamily: fonts.wordmark, fontSize: 12, color: colors.brass },
  empty: { fontFamily: fonts.wordmark, padding: 24, textAlign: 'center', color: colors.textMuted, fontSize: 14 },
  sectionHeader: { marginHorizontal: spacing.gutter, marginTop: 22, marginBottom: 10 },
  wantsCard: { marginHorizontal: spacing.gutter, marginVertical: 6, gap: 12 },
  wantsRow: { flexDirection: 'row', gap: 12 },
  wantsInfo: { flex: 1, gap: 2, justifyContent: 'center' },
  wantsLabel: {},
});

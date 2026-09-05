// Spec v4: anonymized-card feed. Section 7's wording is applied at the source
// (individual_cards_for_scope already returns distance bands as text, not meters).
// People you're already connected to show as their real profile instead of an anon card —
// there's no anonymity left to protect once you're actually connected, and re-anonymizing
// someone you already know would just be confusing.
import { useCallback, useState } from 'react';
import { View, FlatList, Text, Pressable, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AnonCard } from '../../components/AnonCard';
import { ProfileCard } from '../../components/ProfileCard';
import { VisibilityToggle } from '../../components/VisibilityToggle';
import { getMyActiveVisibility } from '../../lib/api/visibility';
import { getMyConnections } from '../../lib/api/connections';
import { getCurrentCoords } from '../../lib/location';
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

export default function Nearby() {
  const router = useRouter();
  const { hasProfile, isDemo } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [aggregate, setAggregate] = useState<AggregateView | null>(null);
  const [cards, setCards] = useState<FeedCardV2[]>([]);
  const [connectionByUserId, setConnectionByUserId] = useState<Map<string, Connection>>(new Map());
  const [askedTargetIds, setAskedTargetIds] = useState<Set<string>>(new Set());
  const [connectRequestedIds, setConnectRequestedIds] = useState<Set<string>>(new Set());
  const [incomingRevealByRequesterId, setIncomingRevealByRequesterId] = useState<
    Map<string, IncomingRevealRequest>
  >(new Map());
  const [overlapByUserId, setOverlapByUserId] = useState<Map<string, Overlap>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [isRevealingBack, setIsRevealingBack] = useState<string | null>(null);
  const [nearbyEvents, setNearbyEvents] = useState<EventSummary[]>([]);
  const [myActiveEvents, setMyActiveEvents] = useState<EventSummary[]>([]);
  const [isJoiningEventId, setIsJoiningEventId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const activeVisibility = await getMyActiveVisibility();
      setIsVisible(!!activeVisibility);

      const [connections, incomingReveals] = await Promise.all([
        getMyConnections(),
        getIncomingRevealRequests(),
      ]);
      const connectionMap = new Map(connections.map((c) => [c.other!.id, c]));
      const incomingRevealMap = new Map(
        incomingReveals.filter((r) => r.requester).map((r) => [r.requester!.id, r])
      );
      setConnectionByUserId(connectionMap);
      setIncomingRevealByRequesterId(incomingRevealMap);

      // Doesn't need location, so this loads regardless of visibility — someone who joined an
      // event by QR should still see it here even with visibility off.
      getMyActiveEvents()
        .then(setMyActiveEvents)
        .catch(() => {});

      if (!activeVisibility) {
        setAggregate(null);
        setCards([]);
        setScopeId(null);
        setNearbyEvents([]);
        return;
      }

      const id = await getOrCreateGeoScope();
      setScopeId(id);

      // Best-effort — a failed event lookup shouldn't block the regular Nearby feed.
      getCurrentCoords()
        .then(({ lat, lng }) => detectNearbyEvents(lat, lng))
        .then(setNearbyEvents)
        .catch(() => setNearbyEvents([]));

      const [aggregateView, feedCards, askedIds, connectRequestedIds] = await Promise.all([
        getAggregateView(id),
        getFeedCardsV2(id),
        getOutgoingPendingTargetIds(),
        getOutgoingPendingConnectTargetIds(),
      ]);

      setAggregate(aggregateView);
      setAskedTargetIds(askedIds);
      setConnectRequestedIds(connectRequestedIds);

      // Only rank/show "why you two" for people who'll actually render as an anonymous
      // stranger card — someone already connected or already mid-reveal shows their real
      // profile instead and belongs at the top regardless, so there's no reason to spend an
      // AI call ranking them against strangers.
      const strangerCards = feedCards.filter(
        (c) => !connectionMap.has(c.user_id) && !incomingRevealMap.has(c.user_id)
      );
      const priorityCards = feedCards.filter(
        (c) => connectionMap.has(c.user_id) || incomingRevealMap.has(c.user_id)
      );

      const overlaps = await Promise.all(
        strangerCards.map((c) => fetchOverlap(c.user_id).catch(() => null))
      );
      const rankedStrangers = strangerCards
        .map((c, i) => ({ card: c, overlap: overlaps[i] }))
        .sort((a, b) => (b.overlap?.strength ?? 0) - (a.overlap?.strength ?? 0));

      setOverlapByUserId(new Map(rankedStrangers.map(({ card, overlap }) => [card.user_id, overlap])));
      setCards([...priorityCards, ...rankedStrangers.map((r) => r.card)]);
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
      setIncomingRevealByRequesterId((prev) => {
        const next = new Map(prev);
        next.delete(requesterUserId);
        return next;
      });
      await load();
    } catch (error: any) {
      Alert.alert('Could not share your profile', error.message ?? String(error));
    } finally {
      setIsRevealingBack(null);
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

  const peopleNearby = aggregate?.total_count ?? 0;
  // Treat "still checking" the same as "not done" — avoids a flash of enabled buttons
  // before the app knows for sure.
  const profileIncomplete = hasProfile !== true;
  const joinedEventIds = new Set(myActiveEvents.map((e) => e.id));
  const joinableNearbyEvents = nearbyEvents.filter((e) => !joinedEventIds.has(e.id));

  return (
    <View style={styles.container}>
      <VisibilityToggle onChange={load} />

      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Who's working nearby</Text>
          {isDemo ? (
            <View style={styles.demoPill}>
              <Text style={styles.demoPillText}>Demo mode</Text>
            </View>
          ) : null}
          <Pressable style={styles.scanButton} onPress={() => router.push('/scan-event')}>
            <Ionicons name="qr-code-outline" size={20} color="#4A3B31" />
          </Pressable>
        </View>
        {myActiveEvents.length > 0 ? (
          <View style={styles.eventPillRow}>
            {myActiveEvents.map((e) => (
              <Pressable key={e.id} style={styles.eventPill} onPress={() => router.push(`/event/${e.id}`)}>
                <Ionicons name="people" size={13} color="#3b5bdb" />
                <Text style={styles.eventPillText}>{e.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {joinableNearbyEvents.map((e) => (
          <Pressable
            key={e.id}
            style={styles.eventJoinBanner}
            onPress={() => handleJoinEvent(e)}
            disabled={isJoiningEventId === e.id}
          >
            <Text style={styles.eventJoinBannerTitle}>You're at {e.name}</Text>
            <Text style={styles.eventJoinBannerAction}>
              {isJoiningEventId === e.id ? 'Joining…' : 'Tap to join and see who else is here'}
            </Text>
          </Pressable>
        ))}
        {isVisible ? (
          <View style={styles.statusRow}>
            <View style={styles.dot} />
            <Text style={styles.statusText}>
              {peopleNearby} {peopleNearby === 1 ? 'person' : 'people'} nearby
            </Text>
          </View>
        ) : null}
        {profileIncomplete ? (
          <Pressable style={styles.incompleteBanner} onPress={() => router.push('/edit-profile')}>
            <Text style={styles.incompleteBannerText}>
              You're browsing without a profile — finish yours to expand cards and connect.
            </Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={cards}
        keyExtractor={(item) => item.user_id}
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
          const connection = connectionByUserId.get(item.user_id);
          if (connection?.other) {
            return (
              <View style={styles.connectedWrap}>
                <ProfileCard
                  name={connection.other.full_name}
                  headline={connection.other.headline}
                  employer={connection.other.employer}
                  title={connection.other.title}
                  undergradSchool={connection.other.undergrad_school}
                  undergradYear={connection.other.undergrad_year}
                  gradSchool={connection.other.grad_school}
                  gradYear={connection.other.grad_year}
                  photoUrl={connection.other.photo_url}
                  onPress={() => router.push(`/chat/${connection.id}`)}
                  onPhotoPress={() => router.push(`/profile/${connection.other!.id}`)}
                />
                <Text style={styles.connectedHint}>You're connected — tap to message</Text>
              </View>
            );
          }

          // They've already asked to connect with me — per the reveal design, the moment
          // someone asks, their real identity is shown to the person being asked (see
          // migration 0027's note on why this is safe before any mutual connection exists).
          // Showing that here too, not just buried in the Requests tab, so it's obvious who's
          // asked without having to go find out.
          const incomingReveal = incomingRevealByRequesterId.get(item.user_id);
          if (incomingReveal?.requester) {
            const requester = incomingReveal.requester;
            return (
              <View style={styles.connectedWrap}>
                <ProfileCard
                  name={requester.full_name}
                  headline={requester.headline}
                  employer={requester.employer}
                  title={requester.title}
                  undergradSchool={requester.undergrad_school}
                  undergradYear={requester.undergrad_year}
                  gradSchool={requester.grad_school}
                  gradYear={requester.grad_year}
                  photoUrl={requester.photo_url}
                />
                <Text style={styles.wantsToConnectHint}>Wants to connect</Text>
                <Pressable
                  style={[styles.shareBackButton, isRevealingBack === incomingReveal.id && styles.buttonDisabled]}
                  onPress={() => handleRevealBack(incomingReveal.id, item.user_id)}
                  disabled={isRevealingBack === incomingReveal.id}
                >
                  <Text style={styles.shareBackButtonText}>
                    {isRevealingBack === incomingReveal.id ? 'Sharing…' : 'Share my profile back'}
                  </Text>
                </Pressable>
              </View>
            );
          }

          // Full-identity opt-in (migration 0056) — this person has chosen to be shown fully
          // rather than anonymized, so there's no card to expand and no reveal step; a plain
          // profile card with a normal connect request is the right shape, same as an event
          // attendee.
          if (item.identity_visibility === 'full') {
            const requested = connectRequestedIds.has(item.user_id);
            return (
              <View style={styles.connectedWrap}>
                <ProfileCard
                  name={item.full_name ?? 'Someone nearby'}
                  headline={item.headline}
                  employer={item.employer}
                  title={item.title}
                  undergradSchool={item.undergrad_school}
                  undergradYear={item.undergrad_year}
                  gradSchool={item.grad_school}
                  gradYear={item.grad_year}
                  photoUrl={item.photo_url}
                  onPress={() => router.push(`/profile/${item.user_id}`)}
                />
                {item.overlap_phrase ? <Text style={styles.wantsToConnectHint}>{item.overlap_phrase}</Text> : null}
                <Pressable
                  style={[styles.connectPill, requested && styles.buttonDisabled]}
                  onPress={() => handleConnect(item.user_id)}
                  disabled={requested}
                >
                  <Text style={styles.connectPillText}>{requested ? 'Requested' : 'Connect'}</Text>
                </Pressable>
              </View>
            );
          }

          return (
            <AnonCard
              card={{ ...item, line: item.line ?? '', used_generic: item.used_generic ?? false }}
              overlap={overlapByUserId.get(item.user_id) ?? null}
              alreadyAsked={askedTargetIds.has(item.user_id)}
              locked={profileIncomplete}
              onAskToConnect={(connectionLine) => handleAskToConnect(item.user_id, connectionLine)}
              onLockedTap={handleLockedTap}
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  demoPill: {
    backgroundColor: '#3b5bdb',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  demoPillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  scanButton: { marginLeft: 'auto', padding: 6 },
  eventPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  eventPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#eef0fb',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  eventPillText: { color: '#3b5bdb', fontSize: 12, fontWeight: '600' },
  eventJoinBanner: {
    backgroundColor: '#eef0fb',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#c9cff0',
  },
  eventJoinBannerTitle: { fontSize: 14, fontWeight: '700', color: '#2a3a9c' },
  eventJoinBannerAction: { fontSize: 12, color: '#3b5bdb', marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2ecc71' },
  statusText: { fontSize: 13, color: '#666' },
  incompleteBanner: {
    backgroundColor: '#fdf6ee',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#f0dfc4',
  },
  incompleteBannerText: { fontSize: 12, color: '#a05a2c' },
  empty: { padding: 24, textAlign: 'center', color: '#888', fontSize: 14 },
  connectedWrap: { paddingBottom: 4 },
  connectedHint: { fontSize: 11, color: '#999', paddingHorizontal: 16, paddingBottom: 8 },
  wantsToConnectHint: {
    fontSize: 12,
    color: '#3b5bdb',
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  shareBackButton: {
    backgroundColor: '#111',
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  shareBackButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  connectPill: {
    backgroundColor: '#4A3B31',
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  connectPillText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
});

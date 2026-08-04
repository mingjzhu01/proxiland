// Spec v4: anonymized-card feed. Section 7's wording is applied at the source
// (individual_cards_for_scope already returns distance bands as text, not meters).
// People you're already connected to show as their real profile instead of an anon card —
// there's no anonymity left to protect once you're actually connected, and re-anonymizing
// someone you already know would just be confusing.
import { useCallback, useState } from 'react';
import { View, FlatList, Text, Pressable, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AnonCard } from '../../components/AnonCard';
import { ProfileCard } from '../../components/ProfileCard';
import { VisibilityToggle } from '../../components/VisibilityToggle';
import { getMyActiveVisibility } from '../../lib/api/visibility';
import { getMyConnections } from '../../lib/api/connections';
import {
  getOrCreateGeoScope,
  getAggregateView,
  getFeedCards,
  expandBio,
  type AggregateView,
  type FeedCard,
} from '../../lib/api/feed';
import { fetchOverlap, createRevealRequest, getOutgoingPendingTargetIds } from '../../lib/api/reveal';
import { logSessionEvent } from '../../lib/api/instrumentation';
import type { Connection } from '../../lib/types';

export default function Nearby() {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(false);
  const [aggregate, setAggregate] = useState<AggregateView | null>(null);
  const [cards, setCards] = useState<FeedCard[]>([]);
  const [connectionByUserId, setConnectionByUserId] = useState<Map<string, Connection>>(new Map());
  const [askedTargetIds, setAskedTargetIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [scopeId, setScopeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const activeVisibility = await getMyActiveVisibility();
      setIsVisible(!!activeVisibility);

      const connections = await getMyConnections();
      setConnectionByUserId(new Map(connections.map((c) => [c.other!.id, c])));

      if (!activeVisibility) {
        setAggregate(null);
        setCards([]);
        setScopeId(null);
        return;
      }

      const id = await getOrCreateGeoScope();
      setScopeId(id);

      const [aggregateView, feedCards, askedIds] = await Promise.all([
        getAggregateView(id),
        getFeedCards(id),
        getOutgoingPendingTargetIds(),
      ]);

      setAggregate(aggregateView);
      setCards(feedCards);
      setAskedTargetIds(askedIds);
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

  async function handleExpand(targetUserId: string): Promise<string | null> {
    logSessionEvent('card_expand', { scopeId: scopeId ?? undefined, metadata: { target: targetUserId } });
    try {
      const overlap = await fetchOverlap(targetUserId);
      return overlap?.phrase ?? null;
    } catch {
      return null;
    }
  }

  async function handleLoadBio(targetUserId: string): Promise<string> {
    if (!scopeId) return '';
    try {
      return await expandBio(targetUserId, scopeId);
    } catch {
      return '';
    }
  }

  async function handleAskToConnect(targetUserId: string, connectionLine: string) {
    try {
      await createRevealRequest(targetUserId, connectionLine);
      setAskedTargetIds((prev) => new Set(prev).add(targetUserId));
      Alert.alert('Sent', "They'll see your profile. You'll see theirs if they ask back.");
    } catch (error: any) {
      Alert.alert('Could not send', error.message ?? String(error));
    }
  }

  const peopleNearby = aggregate?.total_count ?? 0;

  return (
    <View style={styles.container}>
      <VisibilityToggle onChange={load} />

      <View style={styles.header}>
        <Text style={styles.title}>Who's working nearby</Text>
        {isVisible ? (
          <View style={styles.statusRow}>
            <View style={styles.dot} />
            <Text style={styles.statusText}>
              {peopleNearby} {peopleNearby === 1 ? 'person' : 'people'} nearby
            </Text>
          </View>
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
                />
                <Text style={styles.connectedHint}>You're connected — tap to message</Text>
              </View>
            );
          }

          return (
            <AnonCard
              card={item}
              alreadyAsked={askedTargetIds.has(item.user_id)}
              onExpand={() => handleExpand(item.user_id)}
              onLoadBio={() => handleLoadBio(item.user_id)}
              onAskToConnect={(connectionLine) => handleAskToConnect(item.user_id, connectionLine)}
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
  title: { fontSize: 22, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2ecc71' },
  statusText: { fontSize: 13, color: '#666' },
  empty: { padding: 24, textAlign: 'center', color: '#888', fontSize: 14 },
  connectedWrap: { paddingBottom: 4 },
  connectedHint: { fontSize: 11, color: '#999', paddingHorizontal: 16, paddingBottom: 8 },
});

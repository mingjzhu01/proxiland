import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { EventAttendeeCard } from '../../../components/EventAttendeeCard';
import { getMyConnections } from '../../../lib/api/connections';
import { EVENT_INTENT_DEFAULTS } from '../../../lib/eventIntentConfig';
import { logSessionEvent } from '../../../lib/api/instrumentation';
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

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [attendeeById, setAttendeeById] = useState<Map<string, EventAttendee>>(new Map());
  const [topMatches, setTopMatches] = useState<EventMatch[]>([]);
  const [sharedOverlap, setSharedOverlap] = useState<EventMatch[]>([]);
  const [connectedUserIds, setConnectedUserIds] = useState<Set<string>>(new Set());
  const [requestedUserIds, setRequestedUserIds] = useState<Set<string>>(new Set());
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

        const [myEvents, attendees, myConnections, requestedIds] = await Promise.all([
          getMyActiveEvents(),
          getEventAttendees(id),
          getMyConnections(),
          getOutgoingEventConnectTargetIds(id),
        ]);
        setEvent(myEvents.find((e) => e.id === id) ?? null);
        setAttendeeById(new Map(attendees.map((a) => [a.user_id, a])));
        setConnectedUserIds(new Set(myConnections.map((c) => c.other!.id)));
        setRequestedUserIds(requestedIds);

        let matches = await getMyEventMatches(id);
        if (regenerate || matches.length === 0) {
          await generateEventMatches(id);
          if (regenerate) logSessionEvent('event_matches_regenerated', { scopeId: id });
          matches = await getMyEventMatches(id);
        }

        const top = matches
          .filter((m) => m.intent_complement >= EVENT_INTENT_DEFAULTS.strongIntentComplementThreshold)
          .sort((a, b) => b.intent_complement - a.intent_complement)
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

  async function handleLeave() {
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

  function statusFor(userId: string): 'none' | 'requested' | 'connected' {
    if (connectedUserIds.has(userId)) return 'connected';
    if (requestedUserIds.has(userId)) return 'requested';
    return 'none';
  }

  function renderMatch(m: EventMatch) {
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
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.centered}>
        <Text style={styles.body}>You're not currently part of this event.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{event.name}</Text>
        {event.organizer_name ? <Text style={styles.organizer}>Hosted by {event.organizer_name}</Text> : null}
        <Text style={styles.count}>{attendeeById.size} {attendeeById.size === 1 ? 'other attendee' : 'other attendees'}</Text>

        <Pressable style={styles.intentButton} onPress={() => router.push(`/event/${id}/intent`)}>
          <Text style={styles.intentButtonText}>Edit what you're looking for</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Top matches</Text>
      {topMatches.length > 0 ? (
        topMatches.map(renderMatch)
      ) : (
        <Text style={styles.emptySection}>No strong matches yet — check back as more people join.</Text>
      )}

      {sharedOverlap.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Shared overlap</Text>
          {sharedOverlap.map(renderMatch)}
        </>
      ) : null}

      <Pressable style={styles.attendeesButton} onPress={() => router.push(`/event/${id}/attendees`)}>
        <Text style={styles.attendeesButtonText}>See all attendees</Text>
      </Pressable>

      <Pressable style={[styles.leaveButton, isLeaving && styles.buttonDisabled]} onPress={handleLeave} disabled={isLeaving}>
        <Text style={styles.leaveButtonText}>{isLeaving ? 'Leaving…' : 'Leave event'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { padding: 16, borderBottomWidth: 1, borderColor: '#eee' },
  title: { fontSize: 20, fontWeight: '700' },
  organizer: { fontSize: 13, color: '#888', marginTop: 2 },
  count: { fontSize: 13, color: '#666', marginTop: 8 },
  body: { padding: 24, textAlign: 'center', color: '#888', fontSize: 14 },
  intentButton: {
    backgroundColor: '#4A3B31',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  intentButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '700', padding: 16, paddingBottom: 4 },
  emptySection: { paddingHorizontal: 16, paddingBottom: 16, color: '#888', fontSize: 13 },
  attendeesButton: {
    borderWidth: 1,
    borderColor: '#4A3B31',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 20,
  },
  attendeesButtonText: { color: '#4A3B31', fontSize: 14, fontWeight: '700' },
  leaveButton: { margin: 16, paddingVertical: 14, alignItems: 'center' },
  leaveButtonText: { color: '#cc3333', fontSize: 15, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
});

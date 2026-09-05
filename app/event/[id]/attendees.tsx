import { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { EventAttendeeCard } from '../../../components/EventAttendeeCard';
import { getMyConnections } from '../../../lib/api/connections';
import {
  getEventAttendees,
  sendEventConnectRequest,
  getOutgoingEventConnectTargetIds,
  type EventAttendee,
} from '../../../lib/api/events';

export default function EventAttendees() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [attendees, setAttendees] = useState<EventAttendee[]>([]);
  const [connectedUserIds, setConnectedUserIds] = useState<Set<string>>(new Set());
  const [requestedUserIds, setRequestedUserIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [myAttendees, myConnections, requestedIds] = await Promise.all([
        getEventAttendees(id),
        getMyConnections(),
        getOutgoingEventConnectTargetIds(id),
      ]);
      setAttendees(myAttendees);
      setConnectedUserIds(new Set(myConnections.map((c) => c.other!.id)));
      setRequestedUserIds(requestedIds);
    } catch (error: any) {
      Alert.alert('Could not load attendees', error.message ?? String(error));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

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

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={attendees}
      keyExtractor={(item) => item.user_id}
      ListEmptyComponent={<Text style={styles.body}>No one else has joined yet — check back soon.</Text>}
      renderItem={({ item }) => (
        <EventAttendeeCard
          attendee={item}
          status={
            connectedUserIds.has(item.user_id) ? 'connected' : requestedUserIds.has(item.user_id) ? 'requested' : 'none'
          }
          onPress={() => router.push(`/profile/${item.user_id}`)}
          onConnect={() => handleConnect(item.user_id)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 24, textAlign: 'center', color: '#888', fontSize: 14 },
});

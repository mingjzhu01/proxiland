import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getIncomingRequests, getOutgoingRequests, respondToRequest } from '../../lib/api/requests';
import { useRequestsBadge } from '../../lib/requestsBadge';
import type { ConnectionRequest } from '../../lib/types';

function formatMeetingTime(meetingAt: string | null): string | null {
  if (!meetingAt) return null;
  return new Date(meetingAt).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function Requests() {
  const [incoming, setIncoming] = useState<ConnectionRequest[]>([]);
  const [outgoing, setOutgoing] = useState<ConnectionRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { refresh: refreshBadge } = useRequestsBadge();

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [inc, out] = await Promise.all([getIncomingRequests(), getOutgoingRequests()]);
      setIncoming(inc);
      setOutgoing(out);
    } catch (error: any) {
      Alert.alert('Could not load requests', error.message);
    } finally {
      setIsLoading(false);
    }
    refreshBadge();
  }, [refreshBadge]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleRespond(id: string, status: 'accepted' | 'declined') {
    await respondToRequest(id, status);
    load();
  }

  return (
    <FlatList
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} />}
      data={[]}
      renderItem={null}
      ListHeaderComponent={
        <>
          <Text style={styles.sectionTitle}>Incoming</Text>
          {incoming.length === 0 ? (
            <Text style={styles.empty}>No incoming requests.</Text>
          ) : (
            incoming.map((req) => (
              <View key={req.id} style={styles.requestRow}>
                <View style={styles.requestInfo}>
                  <Text style={styles.requestName}>{req.sender?.full_name ?? 'Someone'}</Text>
                  <Text style={styles.requestType}>
                    {req.type === 'coffee' ? '☕ wants to grab coffee' : 'wants to connect'}
                  </Text>
                  {req.type === 'coffee' && (formatMeetingTime(req.meeting_at) || req.meeting_location) ? (
                    <Text style={styles.requestMeeting}>
                      {[formatMeetingTime(req.meeting_at), req.meeting_location]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  ) : null}
                  {req.message ? <Text style={styles.requestMessage}>{req.message}</Text> : null}
                </View>
                <View style={styles.actions}>
                  <Pressable
                    style={[styles.actionButton, styles.acceptButton]}
                    onPress={() => handleRespond(req.id, 'accepted')}
                  >
                    <Text style={styles.acceptText}>Accept</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionButton, styles.declineButton]}
                    onPress={() => handleRespond(req.id, 'declined')}
                  >
                    <Text style={styles.declineText}>Decline</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}

          <Text style={styles.sectionTitle}>Sent</Text>
          {outgoing.length === 0 ? (
            <Text style={styles.empty}>No sent requests.</Text>
          ) : (
            outgoing.map((req) => (
              <View key={req.id} style={styles.requestRow}>
                <View style={styles.requestInfo}>
                  <Text style={styles.requestName}>{req.receiver?.full_name ?? 'Someone'}</Text>
                  <Text style={styles.requestType}>
                    {req.type === 'coffee' ? '☕ coffee request' : 'connection request'} ·{' '}
                    {req.status}
                  </Text>
                  {req.type === 'coffee' && (formatMeetingTime(req.meeting_at) || req.meeting_location) ? (
                    <Text style={styles.requestMeeting}>
                      {[formatMeetingTime(req.meeting_at), req.meeting_location]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  sectionTitle: { fontSize: 18, fontWeight: '700', padding: 16, paddingBottom: 8 },
  empty: { paddingHorizontal: 16, paddingBottom: 16, color: '#888', fontSize: 14 },
  requestRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  requestInfo: { marginBottom: 8 },
  requestName: { fontSize: 16, fontWeight: '600' },
  requestType: { fontSize: 13, color: '#666', marginTop: 2 },
  requestMeeting: { fontSize: 13, color: '#a05a2c', marginTop: 2, fontWeight: '600' },
  requestMessage: { fontSize: 13, color: '#333', marginTop: 4, fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: 8 },
  actionButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20 },
  acceptButton: { backgroundColor: '#111' },
  acceptText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  declineButton: { backgroundColor: '#eee' },
  declineText: { color: '#555', fontSize: 13, fontWeight: '600' },
});

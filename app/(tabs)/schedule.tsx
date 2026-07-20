import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getScheduledCoffees } from '../../lib/api/requests';
import { supabase } from '../../lib/supabase';
import type { ConnectionRequest } from '../../lib/types';

function formatMeetingTime(meetingAt: string | null): string {
  if (!meetingAt) return '';
  return new Date(meetingAt).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function Schedule() {
  const router = useRouter();
  const [coffees, setCoffees] = useState<ConnectionRequest[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      setMyId(userData.user?.id ?? null);
      setCoffees(await getScheduledCoffees());
    } catch (error: any) {
      Alert.alert('Could not load schedule', error.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <FlatList
      style={styles.container}
      data={coffees}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} />}
      ListEmptyComponent={
        !isLoading ? (
          <Text style={styles.empty}>No coffee chats scheduled yet.</Text>
        ) : null
      }
      renderItem={({ item }) => {
        const other = item.sender_id === myId ? item.receiver : item.sender;
        return (
          <Pressable
            style={styles.row}
            onPress={() => other && router.push(`/profile/${other.id}`)}
          >
            <Text style={styles.name}>☕ {other?.full_name ?? 'Someone'}</Text>
            <Text style={styles.time}>{formatMeetingTime(item.meeting_at)}</Text>
            {item.meeting_location ? (
              <Text style={styles.location}>{item.meeting_location}</Text>
            ) : null}
            {item.message ? <Text style={styles.note}>{item.message}</Text> : null}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  empty: { padding: 24, textAlign: 'center', color: '#888', fontSize: 14 },
  row: {
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  name: { fontSize: 16, fontWeight: '600' },
  time: { fontSize: 14, color: '#a05a2c', fontWeight: '600', marginTop: 4 },
  location: { fontSize: 13, color: '#666', marginTop: 2 },
  note: { fontSize: 13, color: '#333', marginTop: 4, fontStyle: 'italic' },
});

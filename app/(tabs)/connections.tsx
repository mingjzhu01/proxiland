import { useCallback, useState } from 'react';
import { View, FlatList, Text, Pressable, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ProfileCard } from '../../components/ProfileCard';
import { getMyConnections } from '../../lib/api/connections';
import { getUnreadCountsByConnection } from '../../lib/api/messages';
import type { Connection } from '../../lib/types';

export default function Connections() {
  const router = useRouter();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [unreadByConnection, setUnreadByConnection] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [conns, unread] = await Promise.all([getMyConnections(), getUnreadCountsByConnection()]);
      setConnections(conns);
      setUnreadByConnection(unread);
    } catch (error: any) {
      Alert.alert('Could not load connections', error.message);
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
    <View style={styles.container}>
      <FlatList
        data={connections}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} />}
        ListEmptyComponent={
          !isLoading ? <Text style={styles.empty}>No connections yet.</Text> : null
        }
        renderItem={({ item }) => {
          if (!item.other) return null;
          const unreadCount = unreadByConnection.get(item.id) ?? 0;
          return (
            <View style={styles.row}>
              <View style={styles.cardWrap}>
                <ProfileCard
                  name={item.other.full_name}
                  headline={item.other.headline}
                  employer={item.other.employer}
                  title={item.other.title}
                  undergradSchool={item.other.undergrad_school}
                  undergradYear={item.other.undergrad_year}
                  gradSchool={item.other.grad_school}
                  gradYear={item.other.grad_year}
                  photoUrl={item.other.photo_url}
                  onPress={() => router.push(`/profile/${item.other!.id}`)}
                />
              </View>
              <Pressable style={styles.chatButton} onPress={() => router.push(`/chat/${item.id}`)}>
                <Ionicons name="chatbubble-outline" size={20} color="#111" />
                {unreadCount > 0 ? (
                  <View style={styles.unreadDot}>
                    <Text style={styles.unreadDotText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  empty: { padding: 24, textAlign: 'center', color: '#888', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: '#eee' },
  cardWrap: { flex: 1 },
  chatButton: { paddingHorizontal: 16 },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: 10,
    backgroundColor: '#cc3333',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDotText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});

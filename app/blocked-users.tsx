import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getBlockedUsers, unblockUser } from '../lib/api/connections';
import type { Profile } from '../lib/types';
import { fonts } from '../lib/theme';

export default function BlockedUsers() {
  const [blocked, setBlocked] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setBlocked(await getBlockedUsers());
    } catch (error: any) {
      Alert.alert('Could not load blocked users', error.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleUnblock(id: string) {
    try {
      await unblockUser(id);
      setBlocked((list) => list.filter((p) => p.id !== id));
    } catch (error: any) {
      Alert.alert('Could not unblock', error.message);
    }
  }

  return (
    <FlatList
      style={styles.container}
      data={blocked}
      keyExtractor={(item) => item.id}
      refreshing={isLoading}
      onRefresh={load}
      ListEmptyComponent={
        !isLoading ? <Text style={styles.empty}>No blocked users.</Text> : null
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.name}>{item.full_name}</Text>
          <Pressable style={styles.unblockButton} onPress={() => handleUnblock(item.id)}>
            <Text style={styles.unblockText}>Unblock</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  empty: { fontFamily: fonts.wordmark, padding: 24, textAlign: 'center', color: '#888', fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  name: { fontFamily: fonts.wordmark, fontSize: 16, fontWeight: '600' },
  unblockButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#eee' },
  unblockText: { fontFamily: fonts.wordmark, color: '#555', fontSize: 13, fontWeight: '600' },
});

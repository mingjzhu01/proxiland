import { useCallback, useState } from 'react';
import { View, FlatList, Text, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ProfileCard } from '../../components/ProfileCard';
import { VisibilityToggle } from '../../components/VisibilityToggle';
import { getNearbyUsers } from '../../lib/api/visibility';
import type { NearbyUser } from '../../lib/types';

export default function Nearby() {
  const router = useRouter();
  const [users, setUsers] = useState<NearbyUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadNearby = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getNearbyUsers();
      setUsers(data);
    } catch {
      // Location permission not granted yet, or user not visible — leave list empty.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadNearby();
    }, [loadNearby])
  );

  return (
    <View style={styles.container}>
      <VisibilityToggle onChange={loadNearby} />
      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadNearby} />}
        ListEmptyComponent={
          !isLoading ? (
            <Text style={styles.empty}>
              No one visible nearby right now. Turn on visibility above to see (and be seen by)
              professionals near you.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <ProfileCard
            name={item.full_name}
            headline={item.headline}
            employer={item.employer}
            title={item.title}
            undergradSchool={item.undergrad_school}
            undergradYear={item.undergrad_year}
            gradSchool={item.grad_school}
            gradYear={item.grad_year}
            photoUrl={item.photo_url}
            distanceMeters={item.distance_meters}
            onPress={() => router.push(`/profile/${item.id}`)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  empty: { padding: 24, textAlign: 'center', color: '#888', fontSize: 14 },
});

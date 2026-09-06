import { View, Text, Pressable, StyleSheet } from 'react-native';
import { fonts } from '../lib/theme';

type Props = {
  headline?: string | null;
  distanceMeters: number;
  onPress?: () => void;
};

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m away`;
  return `${(meters / 1000).toFixed(1)} km away`;
}

export function LimitedNearbyRow({ headline, distanceMeters, onPress }: Props) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={[styles.avatar, styles.avatarPlaceholder]}>
        <Text style={styles.lockIcon}>🔒</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.headline}>{headline?.trim() || 'Someone nearby'}</Text>
        <Text style={styles.distance}>{formatDistance(distanceMeters)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderColor: '#eee',
    gap: 12,
  },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarPlaceholder: { backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
  lockIcon: { fontFamily: fonts.wordmark, fontSize: 18 },
  info: { flex: 1 },
  headline: { fontFamily: fonts.wordmark, fontSize: 15, color: '#333', fontWeight: '600' },
  distance: { fontFamily: fonts.wordmark, fontSize: 12, color: '#999', marginTop: 2 },
});

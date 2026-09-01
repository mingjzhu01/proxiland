import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { formatEducation } from '../lib/formatEducation';

type Props = {
  name: string;
  headline?: string | null;
  employer?: string | null;
  title?: string | null;
  undergradSchool?: string | null;
  undergradYear?: string | null;
  gradSchool?: string | null;
  gradYear?: string | null;
  photoUrl?: string | null;
  distanceMeters?: number;
  onPress?: () => void;
  // Tapping the photo specifically goes to their profile instead of whatever onPress does
  // (e.g. opening chat) — falls back to onPress when not provided, so existing callers that
  // don't pass this keep their previous single-tap-target behavior unchanged.
  onPhotoPress?: () => void;
};

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m away`;
  return `${(meters / 1000).toFixed(1)} km away`;
}

export function ProfileCard({
  name,
  headline,
  employer,
  title,
  undergradSchool,
  undergradYear,
  gradSchool,
  gradYear,
  photoUrl,
  distanceMeters,
  onPress,
  onPhotoPress,
}: Props) {
  const subtitle = [title, employer]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(' at ');

  const education = formatEducation({
    undergrad_school: undergradSchool ?? null,
    undergrad_year: undergradYear ?? null,
    grad_school: gradSchool ?? null,
    grad_year: gradYear ?? null,
  });

  return (
    <View style={styles.card}>
      <Pressable onPress={onPhotoPress ?? onPress}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitial}>{name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </Pressable>
      <Pressable style={styles.info} onPress={onPress}>
        <Text style={styles.name}>{name}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {headline ? <Text style={styles.headline}>{'• '}{headline}</Text> : null}
        {education ? <Text style={styles.education}>{'• '}{education}</Text> : null}
        {distanceMeters !== undefined ? (
          <Text style={styles.distance}>{formatDistance(distanceMeters)}</Text>
        ) : null}
      </Pressable>
    </View>
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
  avatarPlaceholder: { backgroundColor: '#ddd', justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { fontSize: 20, fontWeight: '700', color: '#555' },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  subtitle: { fontSize: 14, color: '#333' },
  education: { fontSize: 13, color: '#777' },
  headline: { fontSize: 13, color: '#777' },
  distance: { fontSize: 12, color: '#0066cc', marginTop: 2 },
});

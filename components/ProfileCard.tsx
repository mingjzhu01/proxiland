import { View, Text, Pressable, StyleSheet } from 'react-native';
import { formatEducation } from '../lib/formatEducation';
import { LetteredAvatar } from './LetteredAvatar';
import { colors, avatarSizes, fonts } from '../lib/theme';

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

// Compact row treatment — People/Connections list, attendee rows, match rows. The Nearby
// feed's own rich full-identity card (avatar + why-you-two + Connect button) is a separate
// component, NearbyIdentityCard, since that layout doesn't fit a reusable row shape.
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
        <LetteredAvatar name={name} photoUrl={photoUrl} size={avatarSizes.messageRow} />
      </Pressable>
      <Pressable style={styles.info} onPress={onPress}>
        <Text style={styles.name}>{name}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {headline ? <Text style={styles.tertiary}>{'· '}{headline}</Text> : null}
        {education ? <Text style={styles.tertiary}>{'· '}{education}</Text> : null}
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
    borderColor: colors.ruleInner,
    gap: 12,
  },
  info: { flex: 1 },
  name: { fontFamily: fonts.wordmark, fontSize: 16, fontWeight: '600', color: colors.ink, letterSpacing: -0.16 },
  subtitle: { fontFamily: fonts.wordmark, fontSize: 13.5, color: colors.textSecondary, marginTop: 1 },
  tertiary: { fontFamily: fonts.wordmark, fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
  distance: { fontFamily: fonts.wordmark, fontSize: 12, color: colors.brass, marginTop: 2, fontWeight: '600' },
});

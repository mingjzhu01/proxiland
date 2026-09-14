import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LetteredAvatar } from './LetteredAvatar';
import { formatEducation } from '../lib/formatEducation';
import { colors, fonts } from '../lib/theme';

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
  status: 'none' | 'requested' | 'connected';
  onPress: () => void;
  onPhotoPress?: () => void;
  onConnect: () => void;
};

// The Nearby feed's full-identity card, per the nearby_3a handoff: a single compact row —
// avatar, name / role / school, one outline action — so the people list reads as a calm list
// rather than a stack of panels. Action labels keep the screen's existing logic; only the
// treatment changed.
export function NearbyIdentityCard({
  name,
  headline,
  employer,
  title,
  undergradSchool,
  undergradYear,
  gradSchool,
  gradYear,
  photoUrl,
  status,
  onPress,
  onPhotoPress,
  onConnect,
}: Props) {
  const role = [title, employer].map((s) => s?.trim()).filter(Boolean).join(' at ') || headline;
  const education = formatEducation({
    undergrad_school: undergradSchool ?? null,
    undergrad_year: undergradYear ?? null,
    grad_school: gradSchool ?? null,
    grad_year: gradYear ?? null,
  });

  return (
    <View style={styles.card}>
      <Pressable onPress={onPhotoPress ?? onPress}>
        <LetteredAvatar name={name} photoUrl={photoUrl} size={48} />
      </Pressable>
      <Pressable style={styles.info} onPress={onPress}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {role ? (
          <Text style={styles.role} numberOfLines={1}>
            {role}
          </Text>
        ) : null}
        {education ? <Text style={styles.school}>{education}</Text> : null}
      </Pressable>
      {status === 'connected' ? (
        <ActionPill label="Message" onPress={onPress} />
      ) : status === 'requested' ? (
        <ActionPill label="Requested" disabled />
      ) : (
        <ActionPill label="Connect" onPress={onConnect} />
      )}
    </View>
  );
}

function ActionPill({ label, onPress, disabled }: { label: string; onPress?: () => void; disabled?: boolean }) {
  return (
    <Pressable
      style={[styles.pill, disabled && styles.pillDisabled]}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
    >
      <Text style={[styles.pillText, disabled && styles.pillTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 18,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  info: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.sansSemibold, fontSize: 16.5, lineHeight: 20, color: colors.brandMarkDark },
  role: { fontFamily: fonts.sans, fontSize: 13.5, lineHeight: 18, color: colors.brandInk, marginTop: 3 },
  school: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 17.5, color: colors.brandInk },
  pill: {
    borderWidth: 1.5,
    borderColor: colors.brandMarkDark,
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 15,
    minHeight: 44,
    justifyContent: 'center',
  },
  pillDisabled: { borderColor: colors.brandSand },
  pillText: { fontFamily: fonts.sansSemibold, fontSize: 13.5, color: colors.brandMarkDark },
  pillTextDisabled: { color: colors.brandInk },
});

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Card } from './Card';
import { LetteredAvatar } from './LetteredAvatar';
import { WhyYouTwo } from './WhyYouTwo';
import { PrimaryButton, ResolvedButton } from './Buttons';
import { formatEducation } from '../lib/formatEducation';
import { colors, avatarSizes, typeStyles, fonts } from '../lib/theme';

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
  reason?: string | null;
  status: 'none' | 'requested' | 'connected';
  onPress: () => void;
  onPhotoPress?: () => void;
  onConnect: () => void;
};

// The Nearby feed's full-identity card (identity_visibility === 'full') — a richer treatment
// than the compact ProfileCard row, since it carries the "why you two" rationale and its own
// primary action, same shape as an event match card.
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
  reason,
  status,
  onPress,
  onPhotoPress,
  onConnect,
}: Props) {
  const subtitle = [title, employer].map((s) => s?.trim()).filter(Boolean).join(' at ');
  const education = formatEducation({
    undergrad_school: undergradSchool ?? null,
    undergrad_year: undergradYear ?? null,
    grad_school: gradSchool ?? null,
    grad_year: gradYear ?? null,
  });

  return (
    <Card style={styles.card}>
      <View style={styles.headRow}>
        <Pressable onPress={onPhotoPress ?? onPress}>
          <LetteredAvatar name={name} photoUrl={photoUrl} size={avatarSizes.matchCard} />
        </Pressable>
        <Pressable style={styles.info} onPress={onPress}>
          <Text style={typeStyles.cardName}>{name}</Text>
          {subtitle ? <Text style={typeStyles.cardSubtitle}>{subtitle}</Text> : null}
          {headline ? <Text style={typeStyles.cardTertiary}>{headline}</Text> : null}
          {education ? <Text style={typeStyles.cardTertiary}>{education}</Text> : null}
        </Pressable>
      </View>

      {reason ? <WhyYouTwo reason={reason} /> : null}

      <View style={styles.actionRow}>
        {status === 'connected' ? (
          <>
            <Text style={styles.connectedHint}>You're connected — tap to message</Text>
            <PrimaryButton label="Message" onPress={onPress} />
          </>
        ) : status === 'requested' ? (
          <ResolvedButton label="Requested" />
        ) : (
          <PrimaryButton label="Connect" onPress={onConnect} />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 20, marginVertical: 6 },
  headRow: { flexDirection: 'row', gap: 12 },
  info: { flex: 1, gap: 2 },
  actionRow: { marginTop: 14 },
  connectedHint: { fontFamily: fonts.sans, fontSize: 11, color: colors.textMuted, marginBottom: 8 },
});

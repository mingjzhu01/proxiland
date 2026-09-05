import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Card } from './Card';
import { LetteredAvatar } from './LetteredAvatar';
import { WhyYouTwo } from './WhyYouTwo';
import { PrimaryButton, ResolvedButton } from './Buttons';
import { colors, avatarSizes, typeStyles } from '../lib/theme';
import type { EventAttendee } from '../lib/api/events';

type ConnectStatus = 'none' | 'requested' | 'connected';

type Props = {
  attendee: EventAttendee;
  status: ConnectStatus;
  onPress: () => void;
  onConnect: () => void;
  reason?: string | null;
  // 1-based rank, shown as a "01"/"02" badge — Top matches tab only.
  rank?: number;
};

export function EventAttendeeCard({ attendee, status, onPress, onConnect, reason, rank }: Props) {
  const subtitle = [attendee.title, attendee.employer].map((s) => s?.trim()).filter(Boolean).join(' at ');

  return (
    <Card style={styles.card}>
      <Pressable style={styles.headRow} onPress={onPress}>
        <LetteredAvatar name={attendee.full_name} photoUrl={attendee.photo_url} size={avatarSizes.matchCard} />
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={typeStyles.cardName}>{attendee.full_name}</Text>
            {rank !== undefined ? (
              <View style={styles.rankBadge}>
                <Text style={styles.rankBadgeText}>{String(rank).padStart(2, '0')}</Text>
              </View>
            ) : null}
          </View>
          {subtitle ? <Text style={typeStyles.cardSubtitle}>{subtitle}</Text> : null}
        </View>
      </Pressable>

      {reason ? <WhyYouTwo reason={reason} /> : null}

      <View style={styles.actionRow}>
        {status === 'connected' ? (
          <ResolvedButton label="Connected" />
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankBadge: { backgroundColor: colors.brassChipBg, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  rankBadgeText: { fontFamily: 'monospace', fontSize: 10, color: colors.brassChipText },
  actionRow: { marginTop: 14 },
});

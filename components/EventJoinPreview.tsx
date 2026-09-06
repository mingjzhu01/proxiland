// The "here's the event, want to join?" body shared by app/event-join/[token].tsx (QR/deep
// link) and app/join-event-code.tsx (manual short-code recovery) — same preview, same
// disclosure copy, same join button, regardless of how the event was found.
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Card } from './Card';
import { PrimaryButton } from './Buttons';
import { colors, typeStyles, spacing, radii, fonts } from '../lib/theme';
import type { EventSummary } from '../lib/api/events';

export type JoinStatus = 'loading' | 'found' | 'not-found' | 'joining' | 'joined';

function endsAtLabel(endsAt: string | null): string {
  if (!endsAt) return 'Happening now';
  const time = new Date(endsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `Happening now · ends ${time}`;
}

type Props = {
  status: JoinStatus;
  event: EventSummary | null;
  onJoin: () => void;
  onNotNow: () => void;
  onBackToNearby: () => void;
  onSeeWhosHere: () => void;
};

export function EventJoinPreview({ status, event, onJoin, onNotNow, onBackToNearby, onSeeWhosHere }: Props) {
  if (status === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (status === 'not-found') {
    return (
      <View style={styles.content}>
        <Text style={styles.title}>This event link isn't valid</Text>
        <Text style={styles.body}>
          It may have expired, or the event may have ended. Check with the organiser for an updated
          QR code or event code.
        </Text>
        <Pressable style={styles.notNowButton} onPress={onBackToNearby}>
          <Text style={styles.notNowText}>Back to Nearby</Text>
        </Pressable>
      </View>
    );
  }

  if (status === 'joined') {
    return (
      <View style={styles.content}>
        <Text style={styles.title}>You're in</Text>
        <Text style={styles.body}>You've joined {event?.name ?? 'the event'}.</Text>
        <PrimaryButton label="See who's here" onPress={onSeeWhosHere} />
      </View>
    );
  }

  return (
    <View style={styles.content}>
      <View style={styles.livePill}>
        <View style={styles.liveDot} />
        <Text style={styles.livePillText}>{endsAtLabel(event?.ends_at ?? null)}</Text>
      </View>

      <Text style={styles.eventName}>{event?.name ?? 'Event'}</Text>
      {event?.organizer_name ? <Text style={styles.organizer}>{event.organizer_name}</Text> : null}

      {event?.description ? (
        <Card style={styles.descriptionCard}>
          <Text style={styles.description}>{event.description}</Text>
        </Card>
      ) : null}

      <View style={styles.disclosureBlock}>
        <Text style={styles.disclosureLabel}>What joining does</Text>
        <Text style={styles.disclosureBody}>
          Attendees see your real name and photo for the length of the event — no anonymous cards
          in here. It ends when the event does.
        </Text>
      </View>

      <PrimaryButton
        label={status === 'joining' ? 'Joining…' : 'Join event'}
        loading={status === 'joining'}
        onPress={onJoin}
      />
      <Pressable style={styles.notNowButton} onPress={onNotNow} disabled={status === 'joining'}>
        <Text style={styles.notNowText}>Not now</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: spacing.gutter, justifyContent: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: colors.liveChipBg,
    borderRadius: radii.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
    marginBottom: 16,
  },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.live },
  livePillText: { fontFamily: fonts.wordmark, fontSize: 11.5, fontWeight: '600', color: colors.liveChipText },
  eventName: { fontFamily: fonts.wordmark, fontSize: 33, lineHeight: 38, color: colors.ink },
  organizer: { fontFamily: fonts.wordmark, fontSize: 14, color: colors.textTertiary, marginTop: 6 },
  descriptionCard: { marginTop: 20 },
  description: { fontFamily: fonts.wordmark, fontSize: 14.5, lineHeight: 22, color: colors.ink },
  disclosureBlock: {
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
    marginBottom: 28,
  },
  disclosureLabel: {
    fontFamily: fonts.wordmark,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    color: colors.brass,
    marginBottom: 8,
  },
  disclosureBody: { fontFamily: fonts.wordmark, fontSize: 13.5, lineHeight: 20, color: colors.ink },
  title: { ...typeStyles.screenHeadline, marginBottom: 8, textAlign: 'center' },
  body: { fontFamily: fonts.wordmark, fontSize: 15, color: colors.textSecondary, lineHeight: 22, marginBottom: 28, textAlign: 'center' },
  notNowButton: { paddingVertical: 16, alignItems: 'center' },
  notNowText: { fontFamily: fonts.wordmark, color: colors.textTertiary, fontSize: 14, fontWeight: '600' },
});

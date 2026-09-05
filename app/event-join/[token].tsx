import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getEventByQrToken, joinEvent, type EventSummary } from '../../lib/api/events';
import { PrimaryButton } from '../../components/Buttons';
import { Card } from '../../components/Card';
import { colors, typeStyles, spacing, radii } from '../../lib/theme';

type Status = 'loading' | 'found' | 'not-found' | 'joining' | 'joined';

function endsAtLabel(endsAt: string | null): string {
  if (!endsAt) return 'Happening now';
  const time = new Date(endsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `Happening now · ends ${time}`;
}

export default function EventJoin() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<Status>('loading');
  const [event, setEvent] = useState<EventSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await getEventByQrToken(token);
        if (cancelled) return;
        if (found) {
          setEvent(found);
          setStatus('found');
        } else {
          setStatus('not-found');
        }
      } catch {
        if (!cancelled) setStatus('not-found');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleJoin() {
    if (!event) return;
    setStatus('joining');
    try {
      await joinEvent(event.id, 'qr');
      setStatus('joined');
    } catch (error: any) {
      Alert.alert('Could not join event', error.message ?? 'Something went wrong. Please try again.');
      setStatus('found');
    }
  }

  const closeButton = (
    <Pressable style={[styles.closeButton, { top: insets.top + 8 }]} onPress={() => router.back()} hitSlop={10}>
      <Ionicons name="close" size={20} color={colors.ink} />
    </Pressable>
  );

  if (status === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (status === 'not-found') {
    return (
      <View style={styles.container}>
        {closeButton}
        <View style={styles.content}>
          <Text style={styles.title}>This event link isn't valid</Text>
          <Text style={styles.body}>
            It may have expired, or the event may have ended. Check with the organiser for an updated
            QR code.
          </Text>
          <Pressable style={styles.notNowButton} onPress={() => router.replace('/(tabs)/nearby')}>
            <Text style={styles.notNowText}>Back to Nearby</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (status === 'joined') {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>You're in</Text>
          <Text style={styles.body}>You've joined {event?.name ?? 'the event'}.</Text>
          <PrimaryButton
            label="See who's here"
            onPress={() => (event ? router.replace(`/event/${event.id}`) : router.replace('/(tabs)/nearby'))}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {closeButton}
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
          onPress={handleJoin}
        />
        <Pressable style={styles.notNowButton} onPress={() => router.back()} disabled={status === 'joining'}>
          <Text style={styles.notNowText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  content: { flex: 1, padding: spacing.gutter, justifyContent: 'center' },
  closeButton: { position: 'absolute', left: 20, zIndex: 1, padding: 4 },
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
  livePillText: { fontSize: 11.5, fontWeight: '600', color: colors.liveChipText },
  eventName: { fontFamily: 'Newsreader_400Regular', fontSize: 33, lineHeight: 38, color: colors.ink },
  organizer: { fontSize: 14, color: colors.textTertiary, marginTop: 6 },
  descriptionCard: { marginTop: 20 },
  description: { fontSize: 14.5, lineHeight: 22, color: colors.ink },
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
    fontFamily: 'monospace',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    color: colors.brass,
    marginBottom: 8,
  },
  disclosureBody: { fontSize: 13.5, lineHeight: 20, color: colors.ink },
  title: { ...typeStyles.screenHeadline, marginBottom: 8, textAlign: 'center' },
  body: { fontSize: 15, color: colors.textSecondary, lineHeight: 22, marginBottom: 28, textAlign: 'center' },
  notNowButton: { paddingVertical: 16, alignItems: 'center' },
  notNowText: { color: colors.textTertiary, fontSize: 14, fontWeight: '600' },
});

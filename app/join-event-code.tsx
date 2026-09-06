// Recovery path per the real-event-readiness plan: for when a QR scan or deep link never
// resolved (most commonly a cold install — the app wasn't there yet when the link was tapped,
// so there was nothing to hand the token to). Signed-in only, by design — get_event_by_short_code
// requires auth.uid() for its rate limit, and this screen is only reachable once already signed
// in anyway (from Scan QR).
import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getEventByShortCode, joinEvent, type EventSummary } from '../lib/api/events';
import { EventJoinPreview, type JoinStatus } from '../components/EventJoinPreview';
import { PrimaryButton } from '../components/Buttons';
import { colors, typeStyles, spacing, fonts } from '../lib/theme';

export default function JoinEventCode() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [isLooking, setIsLooking] = useState(false);
  const [status, setStatus] = useState<JoinStatus | 'entry'>('entry');
  const [event, setEvent] = useState<EventSummary | null>(null);

  async function handleLookUp() {
    if (!code.trim()) return;
    setIsLooking(true);
    try {
      const found = await getEventByShortCode(code.trim());
      if (found) {
        setEvent(found);
        setStatus('found');
      } else {
        Alert.alert('Code not found', "Double-check the code with the organiser — it's 6 characters.");
      }
    } catch (error: any) {
      Alert.alert('Could not look up code', error.message ?? 'Something went wrong. Please try again.');
    } finally {
      setIsLooking(false);
    }
  }

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

  if (status !== 'entry') {
    return (
      <View style={styles.container}>
        {status === 'not-found' || status === 'found' || status === 'joining' ? (
          <Pressable style={[styles.closeButton, { top: insets.top + 8 }]} onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="close" size={20} color={colors.ink} />
          </Pressable>
        ) : null}
        <EventJoinPreview
          status={status}
          event={event}
          onJoin={handleJoin}
          onNotNow={() => setStatus('entry')}
          onBackToNearby={() => router.replace('/(tabs)/nearby')}
          onSeeWhosHere={() => (event ? router.replace(`/event/${event.id}`) : router.replace('/(tabs)/nearby'))}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable style={[styles.closeButton, { top: insets.top + 8 }]} onPress={() => router.back()} hitSlop={10}>
        <Ionicons name="close" size={20} color={colors.ink} />
      </Pressable>
      <View style={styles.content}>
        <Text style={styles.title}>Enter your event code</Text>
        <Text style={styles.body}>Ask the organiser for the 6-character code if scanning didn't work.</Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase().slice(0, 6))}
          placeholder="ABCD23"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
        />
        <PrimaryButton
          label={isLooking ? 'Looking…' : 'Find event'}
          loading={isLooking}
          disabled={code.trim().length < 6}
          onPress={handleLookUp}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  closeButton: { position: 'absolute', left: 20, zIndex: 1, padding: 4 },
  content: { flex: 1, padding: spacing.gutter, justifyContent: 'center' },
  title: { ...typeStyles.screenHeadline, marginBottom: 8, textAlign: 'center' },
  body: { fontFamily: fonts.wordmark, fontSize: 15, color: colors.textSecondary, lineHeight: 22, marginBottom: 28, textAlign: 'center' },
  input: {
    fontFamily: fonts.wordmark,
    fontSize: 28,
    letterSpacing: 6,
    textAlign: 'center',
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 20,
    backgroundColor: colors.surface,
  },
});

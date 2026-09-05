import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getEventByQrToken, joinEvent, type EventSummary } from '../../lib/api/events';

type Status = 'loading' | 'found' | 'not-found' | 'joining' | 'joined';

export default function EventJoin() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
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

  if (status === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (status === 'not-found') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>This event link isn't valid</Text>
        <Text style={styles.body}>
          It may have expired, or the event may have ended. Check with the organizer for an updated
          QR code.
        </Text>
        <Pressable style={styles.secondaryButton} onPress={() => router.replace('/(tabs)/nearby')}>
          <Text style={styles.secondaryButtonText}>Back to Nearby</Text>
        </Pressable>
      </View>
    );
  }

  if (status === 'joined') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>You're in</Text>
        <Text style={styles.body}>You've joined {event?.name ?? 'the event'}.</Text>
        <Pressable
          style={styles.primaryButton}
          onPress={() => (event ? router.replace(`/event/${event.id}`) : router.replace('/(tabs)/nearby'))}
        >
          <Text style={styles.primaryButtonText}>See who's here</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{event?.name ?? 'Event'}</Text>
      {event?.organizer_name ? <Text style={styles.organizer}>Hosted by {event.organizer_name}</Text> : null}
      {event?.description ? <Text style={styles.body}>{event.description}</Text> : null}

      <Pressable
        style={[styles.primaryButton, status === 'joining' && styles.buttonDisabled]}
        onPress={handleJoin}
        disabled={status === 'joining'}
      >
        {status === 'joining' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Join event</Text>
        )}
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={() => router.back()} disabled={status === 'joining'}>
        <Text style={styles.secondaryButtonText}>Not now</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  organizer: { fontSize: 14, color: '#888', marginBottom: 16, textAlign: 'center' },
  body: { fontSize: 15, color: '#333', lineHeight: 22, marginBottom: 28, textAlign: 'center' },
  primaryButton: {
    backgroundColor: '#4A3B31',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.4 },
  secondaryButton: { paddingVertical: 16, alignItems: 'center' },
  secondaryButtonText: { color: '#666', fontSize: 15, fontWeight: '600' },
});

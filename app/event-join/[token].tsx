import { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getEventByQrToken, joinEvent, type EventSummary } from '../../lib/api/events';
import { EventJoinPreview, type JoinStatus } from '../../components/EventJoinPreview';
import { colors } from '../../lib/theme';

export default function EventJoin() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<JoinStatus>('loading');
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
        onNotNow={() => router.back()}
        onBackToNearby={() => router.replace('/(tabs)/nearby')}
        onSeeWhosHere={() => (event ? router.replace(`/event/${event.id}`) : router.replace('/(tabs)/nearby'))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  closeButton: { position: 'absolute', left: 20, zIndex: 1, padding: 4 },
});

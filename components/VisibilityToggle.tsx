import { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { goVisible, goInvisible, getMyActiveVisibility } from '../lib/api/visibility';

const DURATION_OPTIONS_HOURS = [2, 4];

function timeRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m left`;
  return `${Math.round(minutes / 60)}h left`;
}

export function VisibilityToggle({ onChange }: { onChange?: () => void }) {
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const refresh = useCallback(async () => {
    const active = await getMyActiveVisibility();
    setExpiresAt(active?.expiresAt ?? null);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleGoVisible(hours: number) {
    setIsBusy(true);
    try {
      await goVisible(hours);
      await refresh();
      onChange?.();
    } catch (error: any) {
      Alert.alert('Could not go visible', error.message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleGoInvisible() {
    setIsBusy(true);
    try {
      await goInvisible();
      setExpiresAt(null);
      onChange?.();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsBusy(false);
    }
  }

  if (expiresAt) {
    return (
      <View style={styles.container}>
        <View style={styles.statusRow}>
          <View style={styles.dot} />
          <Text style={styles.statusText}>Visible nearby · {timeRemaining(expiresAt)}</Text>
        </View>
        <Pressable style={styles.stopButton} onPress={handleGoInvisible} disabled={isBusy}>
          <Text style={styles.stopButtonText}>Stop</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.prompt}>You're not visible to anyone right now.</Text>
      <View style={styles.optionsRow}>
        {DURATION_OPTIONS_HOURS.map((hours) => (
          <Pressable
            key={hours}
            style={styles.optionButton}
            onPress={() => handleGoVisible(hours)}
            disabled={isBusy}
          >
            <Text style={styles.optionButtonText}>Go visible for {hours}h</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#fafafa', borderBottomWidth: 1, borderColor: '#eee' },
  prompt: { fontSize: 14, color: '#555', marginBottom: 10 },
  optionsRow: { flexDirection: 'row', gap: 8 },
  optionButton: {
    backgroundColor: '#111',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  optionButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2ecc71' },
  statusText: { fontSize: 14, fontWeight: '600', flex: 1 },
  stopButton: { alignSelf: 'flex-start', marginTop: 8 },
  stopButtonText: { color: '#cc3333', fontSize: 13, fontWeight: '600' },
});

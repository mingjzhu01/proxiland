import { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { goVisible, goInvisible, getMyActiveVisibility } from '../lib/api/visibility';
import { DurationPicker } from './DurationPicker';
import { colors, radii } from '../lib/theme';

const DEFAULT_DURATION_HOURS = 4;

function timeRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m left`;
  return `${Math.round(minutes / 60)}h left`;
}

// Now a bottom sheet (triggered by the compact "Visible · Xh" pill in the Nearby header)
// rather than a block permanently pinned to the top of the feed — same goVisible/goInvisible
// logic as before, just relocated per the visual redesign.
export function VisibilityToggle({
  visible,
  onClose,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  onChange?: () => void;
}) {
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [selectedHours, setSelectedHours] = useState(DEFAULT_DURATION_HOURS);
  const [isBusy, setIsBusy] = useState(false);

  const refresh = useCallback(async () => {
    const active = await getMyActiveVisibility();
    setExpiresAt(active?.expiresAt ?? null);
  }, []);

  useEffect(() => {
    if (visible) refresh();
  }, [visible, refresh]);

  async function handleGoVisible() {
    setIsBusy(true);
    try {
      await goVisible(selectedHours);
      await refresh();
      onChange?.();
      onClose();
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
      onClose();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.grabHandle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>Your visibility</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          {expiresAt ? (
            <>
              <View style={styles.statusRow}>
                <View style={styles.dot} />
                <Text style={styles.statusText}>Visible nearby · {timeRemaining(expiresAt)}</Text>
              </View>
              <Pressable style={styles.stopButton} onPress={handleGoInvisible} disabled={isBusy}>
                <Text style={styles.stopButtonText}>Stop being visible</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.prompt}>You're not visible to anyone right now.</Text>
              <DurationPicker value={selectedHours} onChange={setSelectedHours} />
              <Pressable style={styles.goButton} onPress={handleGoVisible} disabled={isBusy}>
                <Text style={styles.goButtonText}>
                  {isBusy ? 'Going visible…' : `Go visible for ${selectedHours}h`}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(36,28,22,.42)' },
  sheet: { backgroundColor: colors.paper, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, padding: 20, paddingBottom: 36 },
  grabHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.dashedBorder, alignSelf: 'center', marginBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', color: colors.ink },
  prompt: { fontSize: 14, color: colors.textSecondary, marginBottom: 14, textAlign: 'center' },
  goButton: { backgroundColor: colors.ink, borderRadius: radii.button, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  goButtonText: { color: colors.inkOn, fontSize: 15, fontWeight: '600' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live },
  statusText: { fontSize: 15, fontWeight: '600', color: colors.ink, flex: 1 },
  stopButton: { alignSelf: 'flex-start', marginTop: 14 },
  stopButtonText: { color: colors.error, fontSize: 14, fontWeight: '600' },
});

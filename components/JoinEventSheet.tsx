// The short join sheet over the Events view, per the discover-events handoff §4–5: Scan QR
// (opens the existing scanner) or Enter code (second step in the same panel). Deep links and
// scanned QRs never come through here — they route straight to the event confirmation.
import { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getEventByShortCode, joinEvent } from '../lib/api/events';
import { useToast } from '../lib/toast';
import { colors, fonts } from '../lib/theme';

const CODE_LENGTH = 6;

export function JoinEventSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [step, setStep] = useState<'choose' | 'code'>('choose');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  function close() {
    onClose();
    // Reset after the slide-out so the content doesn't flip mid-animation.
    setTimeout(() => {
      setStep('choose');
      setCode('');
      setError(null);
    }, 300);
  }

  function scan() {
    close();
    router.push('/scan-event');
  }

  async function join() {
    if (code.length !== CODE_LENGTH || isJoining) return;
    setIsJoining(true);
    setError(null);
    try {
      const found = await getEventByShortCode(code);
      if (!found) {
        setError("That code doesn't match an event. Check it with the host.");
        return;
      }
      await joinEvent(found.id, 'qr');
      toast.show(`You're in — opening ${found.name ?? 'the event'}`);
      close();
      router.push(`/discover/event/${found.id}`);
    } catch (err: any) {
      const message: string = err?.message ?? '';
      setError(
        /network|fetch|offline/i.test(message)
          ? "You're offline. Reconnect and try again."
          : message || 'Something went wrong. Please try again.'
      );
    } finally {
      setIsJoining(false);
    }
  }

  const canJoin = code.length === CODE_LENGTH && !isJoining;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.scrim} onPress={close} accessibilityLabel="Close" />
      <View style={[styles.panel, { paddingBottom: insets.bottom + 26 }]}>
        <View style={styles.grabber} />

        {step === 'choose' ? (
          <>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Join an event</Text>
              <Pressable onPress={close} hitSlop={10} style={styles.closeButton} accessibilityLabel="Close">
                <Ionicons name="close" size={20} color={colors.brandMarkDark} />
              </Pressable>
            </View>
            <Text style={styles.copy}>Scan the host's QR code, or type the code they gave you.</Text>

            <Pressable style={styles.primary} onPress={scan}>
              <Ionicons name="qr-code-outline" size={19} color={colors.brandMarkCream} />
              <Text style={styles.primaryText}>Scan QR</Text>
            </Pressable>
            <Pressable style={styles.outline} onPress={() => setStep('code')}>
              <Text style={styles.outlineText}>Enter code</Text>
            </Pressable>
            <Text style={styles.footnote}>
              Invite links and scanned codes open the event straight away — you won't come back here.
            </Text>
          </>
        ) : (
          <>
            <View style={styles.titleRow}>
              <Pressable onPress={() => setStep('choose')} hitSlop={10} style={styles.backButton} accessibilityLabel="Back">
                <Ionicons name="chevron-back" size={22} color={colors.brandMarkDark} />
              </Pressable>
              <Pressable onPress={close} hitSlop={10} style={styles.closeButton} accessibilityLabel="Close">
                <Ionicons name="close" size={20} color={colors.brandMarkDark} />
              </Pressable>
            </View>
            <Text style={styles.title}>Enter event code</Text>
            <Text style={styles.copy}>Six characters, from the host or the invite.</Text>

            <TextInput
              style={[styles.field, (code.length > 0 || !isJoining) && code.length > 0 && styles.fieldActive, error && styles.fieldActive]}
              value={code}
              onChangeText={(t) => {
                setError(null);
                setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH));
              }}
              placeholder="••••••"
              placeholderTextColor={colors.mutedInk}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              editable={!isJoining}
              maxLength={CODE_LENGTH}
              keyboardType="ascii-capable"
              returnKeyType="go"
              onSubmitEditing={join}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable style={[styles.primary, !canJoin && !isJoining && styles.primaryDisabled]} onPress={join} disabled={!canJoin}>
              <Text style={[styles.primaryText, !canJoin && !isJoining && styles.primaryTextDisabled]}>
                {isJoining ? 'Joining…' : 'Join event'}
              </Text>
            </Pressable>
            <Text style={styles.footnote}>Codes are case-insensitive.</Text>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(84,66,54,.42)' },
  panel: {
    backgroundColor: colors.brandMarkCream,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 18,
    gap: 14,
    shadowColor: 'rgba(84,66,54,1)',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: -10 },
    shadowRadius: 30,
    elevation: 12,
  },
  grabber: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: colors.brandSand, marginBottom: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.wordmark, fontSize: 24, lineHeight: 28, color: colors.brandMarkDark },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -12 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -12 },
  copy: { fontFamily: fonts.sans, fontSize: 13.5, lineHeight: 19, color: colors.brandInk, marginTop: -8 },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.brandMarkDark,
    borderRadius: 999,
    paddingVertical: 15,
    minHeight: 44,
  },
  primaryDisabled: { backgroundColor: colors.insetPill },
  primaryText: { fontFamily: fonts.sansSemibold, fontSize: 15.5, color: colors.brandMarkCream },
  primaryTextDisabled: { color: colors.mutedInk },
  outline: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.brandMarkDark,
    borderRadius: 999,
    paddingVertical: 14,
    minHeight: 44,
    justifyContent: 'center',
  },
  outlineText: { fontFamily: fonts.sansSemibold, fontSize: 15.5, color: colors.brandMarkDark },
  footnote: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, color: colors.brandInk, textAlign: 'center' },
  field: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.brandSand,
    borderRadius: 16,
    paddingVertical: 17,
    textAlign: 'center',
    fontFamily: fonts.sansSemibold,
    fontSize: 24,
    letterSpacing: 24 * 0.34,
    color: colors.brandMarkDark,
  },
  fieldActive: { borderWidth: 1.5, borderColor: colors.brandMarkDark },
  // No red in the palette: errors are carried by weight and the dark field border.
  error: { fontFamily: fonts.sansSemibold, fontSize: 13.5, lineHeight: 19, color: colors.brandMarkDark, marginTop: -6 },
});

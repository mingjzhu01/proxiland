// The "At an event?" card on Nearby, per the events-entry handoff (states 1, 3 and 4). All three
// modes render in place inside this one card — no modal, no navigation — which is the point of
// the design: joining used to be a bare QR glyph in the header that nobody found.
//
// The standalone /scan-event and /join-event-code screens still exist and are still reachable
// from deep links and cold-install recovery; this is an additional, more discoverable entry
// point, not a replacement for them.
import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Animated, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { getEventByShortCode, joinEvent } from '../lib/api/events';
import { colors, fonts } from '../lib/theme';

const CODE_LENGTH = 6;
const CAMERA_HEIGHT = 236;

export type EventEntryMode = 'prompt' | 'scan' | 'code';

// Matches /scan-event: the QR may encode the full proxiland://event-join/<token> deep link or a
// bare token.
function extractToken(scanned: string): string | null {
  const match = scanned.match(/event-join\/([^/?#]+)/);
  if (match) return match[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(scanned)) return scanned;
  return null;
}

export function EventEntryCard({
  mode,
  onModeChange,
  onJoined,
}: {
  mode: EventEntryMode;
  onModeChange: (mode: EventEntryMode) => void;
  onJoined: () => void;
}) {
  if (mode === 'scan') return <ScanState onModeChange={onModeChange} />;
  if (mode === 'code') return <CodeState onModeChange={onModeChange} onJoined={onJoined} />;
  return <PromptState onModeChange={onModeChange} />;
}

function CardShell({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function EyebrowRow({ label, onCancel }: { label: string; onCancel?: () => void }) {
  return (
    <View style={styles.eyebrowRow}>
      <Text style={styles.eyebrow}>{label}</Text>
      {onCancel ? (
        <Pressable onPress={onCancel} hitSlop={10}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PromptState({ onModeChange }: { onModeChange: (mode: EventEntryMode) => void }) {
  return (
    <CardShell>
      <EyebrowRow label="At an event?" />
      <Text style={styles.title}>Join to see who else is here</Text>
      <Text style={styles.body}>Scan the host's QR or type the event code.</Text>
      <View style={styles.buttonRow}>
        <Pressable style={styles.primaryButton} onPress={() => onModeChange('scan')}>
          <Text style={styles.primaryButtonText}>Scan QR</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => onModeChange('code')}>
          <Text style={styles.secondaryButtonText}>Enter code</Text>
        </Pressable>
      </View>
    </CardShell>
  );
}

function ScanState({ onModeChange }: { onModeChange: (mode: EventEntryMode) => void }) {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [handled, setHandled] = useState(false);
  const scanLine = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLine, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(scanLine, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scanLine]);

  // Ask once on mount. If it's refused, the design's fallback is the code-entry state rather
  // than a dead camera pane.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const denied = permission && !permission.granted && !permission.canAskAgain;

  useEffect(() => {
    if (denied) onModeChange('code');
  }, [denied, onModeChange]);

  function handleScanned({ data }: { data: string }) {
    if (handled) return;
    const token = extractToken(data.trim());
    if (!token) return;
    setHandled(true);
    router.push(`/event-join/${token}`);
  }

  return (
    <CardShell>
      <EyebrowRow label="Joining an event" onCancel={() => onModeChange('prompt')} />
      <Text style={[styles.title, styles.titleScan]}>Scan the host's QR</Text>

      <View style={styles.camera}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleScanned}
          />
        ) : null}
        <View style={[styles.bracket, styles.bracketTopLeft]} />
        <View style={[styles.bracket, styles.bracketTopRight]} />
        <View style={[styles.bracket, styles.bracketBottomLeft]} />
        <View style={[styles.bracket, styles.bracketBottomRight]} />
        <Animated.View
          style={[
            styles.scanLine,
            {
              transform: [
                {
                  translateY: scanLine.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-CAMERA_HEIGHT / 2 + 26, CAMERA_HEIGHT / 2 - 26],
                  }),
                },
              ],
            },
          ]}
        />
      </View>

      <Text style={styles.helper}>Hold steady — you'll join the moment it reads.</Text>

      <View style={styles.footerRule} />
      <Pressable onPress={() => onModeChange('code')}>
        <Text style={styles.footerAction}>Enter code instead</Text>
      </Pressable>
    </CardShell>
  );
}

function CodeState({
  onModeChange,
  onJoined,
}: {
  onModeChange: (mode: EventEntryMode) => void;
  onJoined: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const characters = Array.from({ length: CODE_LENGTH }, (_, i) => code[i] ?? '');
  const isComplete = code.length === CODE_LENGTH;

  async function handleJoin() {
    if (!isComplete || isJoining) return;
    setIsJoining(true);
    setError(null);
    try {
      const found = await getEventByShortCode(code);
      if (!found) {
        setError("We couldn't find that code. Check it with the host — it's 6 characters.");
        return;
      }
      await joinEvent(found.id, 'qr');
      onJoined();
      router.push(`/event/${found.id}`);
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setIsJoining(false);
    }
  }

  return (
    <CardShell>
      <EyebrowRow label="Joining an event" onCancel={() => onModeChange('prompt')} />
      <Text style={[styles.title, styles.titleCode]}>Enter the event code</Text>
      <Text style={styles.body}>Six characters, from the host or the invite.</Text>

      {/* One real input behind six painted cells — the OTP behaviour the design asks for
          (auto-advance, backspace, paste-fills-all) is what a single text field already does;
          six separate inputs would have to reimplement all of it. */}
      <Pressable style={styles.codeRow} onPress={() => inputRef.current?.focus()}>
        {characters.map((char, index) => {
          const isNext = index === code.length;
          return (
            <View
              key={index}
              style={[styles.codeCell, (char !== '' || isNext) && styles.codeCellActive]}
            >
              <Text style={styles.codeChar}>{char}</Text>
            </View>
          );
        })}
        <TextInput
          ref={inputRef}
          style={styles.hiddenInput}
          value={code}
          onChangeText={(text) => {
            setError(null);
            setCode(text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH));
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={CODE_LENGTH}
          keyboardType="ascii-capable"
        />
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.primaryButton, styles.joinButton, !isComplete && styles.joinButtonDisabled]}
        onPress={handleJoin}
        disabled={!isComplete || isJoining}
      >
        <Text style={styles.primaryButtonText}>{isJoining ? 'Joining…' : 'Join event'}</Text>
      </Pressable>

      <View style={styles.footerRule} />
      <Pressable onPress={() => onModeChange('scan')}>
        <Text style={styles.footerAction}>Scan QR instead</Text>
      </Pressable>
    </CardShell>
  );
}

const styles = StyleSheet.create({
  // The −7 margin is deliberate: the card sits wider than the text gutter so its edges bracket
  // the title and Go visible pill above it.
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 20,
    padding: 18,
    marginHorizontal: -7,
  },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: {
    fontFamily: fonts.sansSemibold,
    fontSize: 11,
    letterSpacing: 11 * 0.14,
    textTransform: 'uppercase',
    color: colors.brandInk,
  },
  cancel: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.brandInk },
  title: {
    fontFamily: fonts.wordmark,
    fontSize: 23,
    lineHeight: 27,
    color: colors.brandMarkDark,
    marginVertical: 6,
  },
  titleScan: { marginBottom: 14 },
  titleCode: { marginBottom: 4 },
  body: { fontFamily: fonts.sans, fontSize: 14.5, lineHeight: 22, color: colors.brandInk },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.brandMarkDark,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: fonts.sansSemibold,
    fontSize: 15.5,
    color: colors.brandMarkCream,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.brandMarkDark,
    borderRadius: 14,
    // 1px less than the primary so both render the same height despite the border.
    paddingVertical: 13,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.sansSemibold,
    fontSize: 15.5,
    color: colors.brandMarkDark,
  },
  camera: {
    height: CAMERA_HEIGHT,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: colors.brandMarkDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bracket: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: colors.brandMarkCream,
  },
  bracketTopLeft: {
    top: 22,
    left: 22,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 8,
  },
  bracketTopRight: {
    top: 22,
    right: 22,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 8,
  },
  bracketBottomLeft: {
    bottom: 22,
    left: 22,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  bracketBottomRight: {
    bottom: 22,
    right: 22,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },
  scanLine: {
    position: 'absolute',
    left: 26,
    right: 26,
    height: 2,
    backgroundColor: colors.brandMarkCream,
  },
  helper: {
    fontFamily: fonts.sans,
    fontSize: 14.5,
    lineHeight: 22,
    color: colors.brandInk,
    textAlign: 'center',
    marginTop: 14,
  },
  footerRule: {
    height: 1,
    backgroundColor: colors.hairline,
    marginTop: 16,
    marginBottom: 14,
  },
  footerAction: {
    fontFamily: fonts.sansSemibold,
    fontSize: 15,
    color: colors.brandMarkDark,
    textAlign: 'center',
  },
  codeRow: { flexDirection: 'row', gap: 7, marginTop: 16 },
  codeCell: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.brandSand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeCellActive: { borderColor: colors.brandMarkDark, backgroundColor: colors.brandMarkCream },
  codeChar: { fontFamily: fonts.sansSemibold, fontSize: 22, color: colors.brandMarkDark },
  hiddenInput: { position: 'absolute', opacity: 0, width: '100%', height: '100%' },
  // No red anywhere in this palette, and the handoff is explicit that one shouldn't be invented.
  error: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.brandMarkDark,
    marginTop: 10,
  },
  joinButton: { marginTop: 16, flex: 0, paddingVertical: 15 },
  joinButtonDisabled: { backgroundColor: colors.brandSand },
});

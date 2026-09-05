import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typeStyles, radii } from '../lib/theme';
import { PrimaryButton } from '../components/Buttons';

// Extracts the raw join token whether the QR encodes the full proxiland://event-join/<token>
// deep link or (in case someone hand-generated a code) just the bare token.
function extractToken(scanned: string): string | null {
  const match = scanned.match(/event-join\/([^/?#]+)/);
  if (match) return match[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(scanned)) return scanned;
  return null;
}

function CornerBracket({ style }: { style: object }) {
  return <View style={[styles.bracket, style]} />;
}

export default function ScanEvent() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [handled, setHandled] = useState(false);

  function handleScanned({ data }: { data: string }) {
    if (handled) return;
    const token = extractToken(data.trim());
    if (!token) return;
    setHandled(true);
    router.replace(`/event-join/${token}`);
  }

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Camera access needed</Text>
        <Text style={styles.body}>To scan an event's QR code, Proxiland needs camera access.</Text>
        <PrimaryButton label="Allow camera access" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={styles.cameraContainer}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handled ? undefined : handleScanned}
      />
      <View style={styles.scrim} />
      <Pressable style={styles.closeButton} onPress={() => router.back()} hitSlop={10}>
        <Ionicons name="close" size={20} color={colors.inkOn} />
      </Pressable>
      <View style={styles.overlay}>
        <View style={styles.frame}>
          <CornerBracket style={styles.bracketTopLeft} />
          <CornerBracket style={styles.bracketTopRight} />
          <CornerBracket style={styles.bracketBottomLeft} />
          <CornerBracket style={styles.bracketBottomRight} />
        </View>
        <Text style={styles.hint}>Point at the organiser's code</Text>
        <Text style={styles.support}>You'll see the event before you join anything.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: 24, justifyContent: 'center' },
  title: { ...typeStyles.screenHeadline, marginBottom: 8, textAlign: 'center' },
  body: { fontSize: 15, color: colors.textSecondary, lineHeight: 22, marginBottom: 28, textAlign: 'center' },
  cameraContainer: { flex: 1, backgroundColor: '#1A130F' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(26,19,15,0.35)' },
  closeButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    width: 34,
    height: 34,
    borderRadius: radii.iconButton,
    backgroundColor: 'rgba(247,243,236,.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 250, height: 250, borderRadius: 26 },
  bracket: { position: 'absolute', width: 46, height: 46, borderColor: colors.brassOnDark },
  bracketTopLeft: { top: -3, left: -3, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 26 },
  bracketTopRight: { top: -3, right: -3, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 26 },
  bracketBottomLeft: { bottom: -3, left: -3, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 26 },
  bracketBottomRight: { bottom: -3, right: -3, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 26 },
  hint: { ...typeStyles.eventTitle, fontSize: 22, marginTop: 24, textAlign: 'center' },
  support: { fontSize: 13, color: 'rgba(245,239,230,.75)', marginTop: 8, textAlign: 'center' },
});

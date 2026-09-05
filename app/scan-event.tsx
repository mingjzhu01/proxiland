import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';

// Extracts the raw join token whether the QR encodes the full proxiland://event-join/<token>
// deep link or (in case someone hand-generated a code) just the bare token.
function extractToken(scanned: string): string | null {
  const match = scanned.match(/event-join\/([^/?#]+)/);
  if (match) return match[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(scanned)) return scanned;
  return null;
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
        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Allow camera access</Text>
        </Pressable>
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
      <View style={styles.overlay}>
        <View style={styles.frame} />
        <Text style={styles.hint}>Point your camera at the event's QR code</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  body: { fontSize: 15, color: '#333', lineHeight: 22, marginBottom: 28, textAlign: 'center' },
  primaryButton: { backgroundColor: '#4A3B31', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: 16,
  },
  hint: { color: '#fff', fontSize: 14, marginTop: 20, fontWeight: '600' },
});

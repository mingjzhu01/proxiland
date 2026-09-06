import { Pressable, Text, StyleSheet, Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { verifyLinkedInCode } from '../lib/api/linkedin';
import { fonts } from '../lib/theme';

// LinkedIn only accepts http/https redirect URLs, not custom app schemes.
// So the OAuth redirect_uri sent to LinkedIn is a small HTTPS bridge page
// (hosted on GitHub Pages) that immediately bounces the browser to
// proxiland://linkedin-auth — which is what the in-app browser session
// below actually watches for to know the flow is complete.
const HTTPS_BRIDGE_URL = 'https://mingjzhu01.github.io/proxiland-privacy/linkedin-callback.html';
const APP_REDIRECT_URI = 'proxiland://linkedin-auth';
const CLIENT_ID = process.env.EXPO_PUBLIC_LINKEDIN_CLIENT_ID ?? '';

function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: HTTPS_BRIDGE_URL,
    scope: 'openid profile email',
    state,
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

export function LinkedInVerifyButton({ onVerified }: { onVerified: () => void }) {
  async function handlePress() {
    const state = Math.random().toString(36).slice(2);
    const authUrl = buildAuthUrl(state);

    const result = await WebBrowser.openAuthSessionAsync(authUrl, APP_REDIRECT_URI);

    if (result.type !== 'success' || !result.url) {
      return;
    }

    const { queryParams } = Linking.parse(result.url);
    const code = queryParams?.code;
    const returnedState = queryParams?.state;

    if (returnedState !== state) {
      Alert.alert('LinkedIn sign-in failed', 'State mismatch — please try again.');
      return;
    }
    if (!code || typeof code !== 'string') {
      Alert.alert('LinkedIn sign-in failed', 'No authorization code returned.');
      return;
    }

    try {
      await verifyLinkedInCode(code);
      Alert.alert('Verified', 'Your LinkedIn account is now verified.');
      onVerified();
    } catch (error: any) {
      Alert.alert('Verification failed', error.message);
    }
  }

  return (
    <Pressable style={styles.button} onPress={handlePress}>
      <Text style={styles.buttonText}>Verify with LinkedIn</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { backgroundColor: '#0A66C2', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  buttonText: { fontFamily: fonts.wordmark, color: '#fff', fontWeight: '600', fontSize: 14 },
});

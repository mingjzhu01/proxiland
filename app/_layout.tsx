import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Newsreader_400Regular } from '@expo-google-fonts/newsreader';
import { YesevaOne_400Regular } from '@expo-google-fonts/yeseva-one';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../lib/auth';
import { RequestsBadgeProvider } from '../lib/requestsBadge';
import { MessagesBadgeProvider } from '../lib/messagesBadge';
import { colors, typeStyles, fonts } from '../lib/theme';

// The native launch screen (see app.json's expo-splash-screen config) is just a static image —
// it can't show the "Proxiland" wordmark without baking a new image into a native rebuild. So
// instead: hide the native splash the instant JS takes over (same brown background, so the
// swap is invisible), and show this JS-rendered screen — logo + wordmark — in its place for a
// deliberate hold. Ships instantly via OTA update, no native rebuild needed to change it.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.hideAsync().catch(() => {});

// Founder call: Yeseva One everywhere in the app, not just headlines/wordmark. Rather than
// hand-adding fontFamily to every Text style in every screen, this sets it as the default for
// every <Text> that doesn't already specify its own fontFamily — anything that DOES set one
// explicitly (there are none left as of this change; see lib/theme.ts's `fonts` token) still
// wins, since a component's own style always overrides defaultProps.style for matching keys.
(Text as any).defaultProps = (Text as any).defaultProps || {};
(Text as any).defaultProps.style = [{ fontFamily: fonts.wordmark }, (Text as any).defaultProps.style];
// Also every typed field (search boxes, the message composer, form inputs) — flagged as the
// one place this is a real usability risk, not just an aesthetic one: Yeseva One is a heavy
// display serif, and reading back what you just typed in it may be genuinely harder than in
// the system font. Worth a special-case revert here specifically if it doesn't feel right.
(TextInput as any).defaultProps = (TextInput as any).defaultProps || {};
(TextInput as any).defaultProps.style = [{ fontFamily: fonts.wordmark }, (TextInput as any).defaultProps.style];

// The auth check itself (reading a locally cached session) usually resolves in well under
// 1200ms, so gating purely on isLoading isn't enough to make the screen actually register —
// a deliberate minimum hold time is the normal way apps handle this.
const APP_START_TIME = Date.now();
const MIN_SPLASH_MS = 1200;

function BrandedSplash() {
  return (
    <View style={styles.splash}>
      {/* Built from code (rings + a real Yeseva One "P"), not assets/icon.png — that PNG has
          its own baked-in font for the P that doesn't match the wordmark. This only affects
          the in-app splash; the home-screen app icon is still that separate image file. */}
      <View style={styles.logoOuterRing}>
        <View style={styles.logoInnerRing}>
          <Text style={styles.logoLetter}>P</Text>
        </View>
        <View style={styles.logoDot} />
      </View>
      <Text style={styles.splashWordmark}>Proxiland</Text>
      <Text style={styles.splashTagline}>Bringing people around you closer</Text>
    </View>
  );
}

function RootNavigation() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [showBrandedSplash, setShowBrandedSplash] = useState(true);
  const [fontsLoaded] = useFonts({ Newsreader_400Regular, YesevaOne_400Regular });

  useEffect(() => {
    if (isLoading || !fontsLoaded) return;

    const remaining = Math.max(0, MIN_SPLASH_MS - (Date.now() - APP_START_TIME));
    const timer = setTimeout(() => {
      const inAuthGroup = segments[0] === '(auth)';

      if (!session && !inAuthGroup) {
        router.replace('/(auth)/sign-in');
      } else if (session && inAuthGroup) {
        // Founder call: browsing (seeing anonymized cards, the other tabs) doesn't require a
        // completed profile — only asking to connect and expanding a card do, gated
        // individually where those actions happen (app/(tabs)/nearby.tsx,
        // components/AnonCard.tsx), not by blocking navigation entirely. No hasProfile check
        // here means new users land straight on the tabs after signing in.
        router.replace('/(tabs)/nearby');
      }
      setShowBrandedSplash(false);
    }, remaining);

    return () => clearTimeout(timer);
  }, [session, isLoading, fontsLoaded, segments, router]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        {/* No title here is exactly what leaves the back button on screens pushed from a tab
            (profile, chat, etc.) reading the raw route name "(tabs)" — the back button label
            comes from the PREVIOUS screen's title, and this group never displayed its own
            header, so nothing had set one until now. */}
        <Stack.Screen name="(tabs)" options={{ title: '', headerBackTitle: '' }} />
        <Stack.Screen name="edit-profile" />
        {/* headerShown: false — the screen renders its own back/menu header, per the visual
            redesign. */}
        <Stack.Screen name="profile/[id]" options={{ headerShown: false }} />
        <Stack.Screen
          name="blocked-users"
          options={{ headerShown: true, title: 'Blocked Users' }}
        />
        {/* headerShown: false — the screen renders its own custom header (avatar + name +
            role + block/report menu), per the visual redesign. */}
        <Stack.Screen name="chat/[connectionId]" options={{ headerShown: false }} />
        <Stack.Screen name="delete-account" options={{ headerShown: true, title: 'Delete Account' }} />
        <Stack.Screen name="settings" options={{ headerShown: true, title: 'Settings' }} />
        <Stack.Screen name="event-join/[token]" options={{ headerShown: false }} />
        {/* headerShown: false — the screen renders its own close button over the camera
            view, per the visual redesign. */}
        <Stack.Screen name="scan-event" options={{ headerShown: false }} />
        {/* headerShown: false — the screen renders its own full-bleed brand-colored header
            with a custom back chevron and menu, per the visual redesign. */}
        <Stack.Screen name="event/[id]/index" options={{ headerShown: false }} />
        <Stack.Screen name="event/[id]/intent" options={{ headerShown: true, title: 'Your Intent' }} />
      </Stack>
      {showBrandedSplash ? <BrandedSplash /> : null}
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <RequestsBadgeProvider>
            <MessagesBadgeProvider>
              <RootNavigation />
            </MessagesBadgeProvider>
          </RequestsBadgeProvider>
        </AuthProvider>
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoOuterRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    borderColor: 'rgba(245,239,230,.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  logoInnerRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: colors.inkOn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: { fontFamily: fonts.wordmark, fontSize: 26, color: colors.inkOn },
  logoDot: {
    position: 'absolute',
    bottom: 4,
    right: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brassOnDark,
  },
  splashWordmark: { ...typeStyles.wordmark, color: colors.inkOn },
  splashTagline: { ...typeStyles.tagline, fontFamily: fonts.wordmark, fontSize: 16, marginTop: 6, textTransform: 'none' },
});

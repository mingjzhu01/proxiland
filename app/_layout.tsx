import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, TextInput, Image, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Newsreader_400Regular } from '@expo-google-fonts/newsreader';
import { YesevaOne_400Regular } from '@expo-google-fonts/yeseva-one';
import { SourceSans3_400Regular, SourceSans3_600SemiBold } from '@expo-google-fonts/source-sans-3';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../lib/auth';
import { RequestsBadgeProvider } from '../lib/requestsBadge';
import { MessagesBadgeProvider } from '../lib/messagesBadge';
import { colors, typeStyles, fonts } from '../lib/theme';

// The native launch screen (see app.json's expo-splash-screen config) is just a static image —
// it can't show the "Proxiland" wordmark without baking a new image into a native rebuild. So
// instead: hide the native splash the instant JS takes over (same cream background + same mark
// image, so the swap is invisible), and show this JS-rendered screen — logo + wordmark + the
// ripple-field texture behind it — in its place for a deliberate hold. Ships instantly via OTA
// update, no native rebuild needed to change the wordmark/tagline/hold time. The mark image
// itself (assets/splash-mark.png) is shared with the native splash so the handoff doesn't jump;
// the ripple field (assets/splash-ripple-field.png) is JS-splash-only — it's a large enough
// surface for rings to render cleanly, which the native launch image is not (see splashField
// below).
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.hideAsync().catch(() => {});

// Typography pairing (Yeseva One + Source Sans 3): Source Sans 3 Regular is the app-wide
// default for every <Text>/<TextInput> that doesn't specify its own fontFamily — Yeseva One is
// reserved for the wordmark and main screen titles now (lib/theme.ts's typeStyles sets it
// explicitly on those specific styles, which wins over this default since a component's own
// style always overrides defaultProps.style for matching keys). This replaces the earlier
// "Yeseva One everywhere" call, which made small text (names, body copy, button labels) hard
// to read — Yeseva One has no true semibold/bold face, so anything needing that weight for
// hierarchy (names, section headings, buttons, chips, tabs) needed a real second family.
(Text as any).defaultProps = (Text as any).defaultProps || {};
(Text as any).defaultProps.style = [{ fontFamily: fonts.sans }, (Text as any).defaultProps.style];
(TextInput as any).defaultProps = (TextInput as any).defaultProps || {};
(TextInput as any).defaultProps.style = [{ fontFamily: fonts.sans }, (TextInput as any).defaultProps.style];

// The auth check itself (reading a locally cached session) usually resolves in well under
// 1200ms, so gating purely on isLoading isn't enough to make the screen actually register —
// a deliberate minimum hold time is the normal way apps handle this.
const APP_START_TIME = Date.now();
const MIN_SPLASH_MS = 1200;

function BrandedSplash() {
  return (
    <View style={styles.splash}>
      <Image
        source={require('../assets/splash-ripple-field.png')}
        style={styles.splashField}
        resizeMode="cover"
      />
      <Image source={require('../assets/splash-mark.png')} style={styles.splashMark} resizeMode="contain" />
      <Text style={styles.splashWordmark}>Proxiland</Text>
      <Text style={styles.splashTagline}>Bringing people around you closer</Text>
    </View>
  );
}

function RootNavigation() {
  const { session, isLoading, hasProfile } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const [showBrandedSplash, setShowBrandedSplash] = useState(true);
  const [fontsLoaded] = useFonts({
    Newsreader_400Regular,
    YesevaOne_400Regular,
    SourceSans3_400Regular,
    SourceSans3_600SemiBold,
  });
  // Where a deep link (an event invite, most commonly) was trying to take a signed-out user,
  // captured right before the sign-in detour below so it can be resumed afterward instead of
  // always dropping them on Nearby. A ref, not state — it shouldn't itself trigger a re-render.
  const pendingPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading || !fontsLoaded) return;

    const remaining = Math.max(0, MIN_SPLASH_MS - (Date.now() - APP_START_TIME));
    const timer = setTimeout(() => {
      const inAuthGroup = segments[0] === '(auth)';

      if (!session && !inAuthGroup) {
        if (pathname && pathname !== '/') {
          pendingPathRef.current = pathname;
        }
        router.replace('/(auth)/sign-in');
        setShowBrandedSplash(false);
      } else if (session && inAuthGroup) {
        // Wait for hasProfile to actually resolve (starts null, set async right after
        // sign-in) before deciding where to send a freshly-signed-in user — deciding on a
        // stale null would wrongly treat "not checked yet" as "has a profile". The effect
        // re-runs once it resolves since hasProfile is in the dependency list below.
        if (hasProfile === null) return;

        const resumePath = pendingPathRef.current;
        pendingPathRef.current = null;
        // New sign-ups (no profile yet) go straight to completing their profile — matching
        // recommendations and event intent are both meaningfully worse without one, so this
        // is worth the friction of a forced stop rather than the previous soft/no nudge.
        router.replace(!hasProfile ? '/edit-profile' : (resumePath as any) ?? '/(tabs)/nearby');
        setShowBrandedSplash(false);
      } else {
        setShowBrandedSplash(false);
      }
    }, remaining);

    return () => clearTimeout(timer);
  }, [session, isLoading, fontsLoaded, segments, pathname, router, hasProfile]);

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
        {/* headerShown: false — same close-button-over-content pattern as event-join. */}
        <Stack.Screen name="join-event-code" options={{ headerShown: false }} />
        {/* headerShown: false — the screen renders its own full-bleed brand-colored header
            with a custom back chevron and menu, per the visual redesign. */}
        <Stack.Screen name="event/[id]/index" options={{ headerShown: false }} />
        <Stack.Screen
          name="event/[id]/intent"
          options={{ headerShown: true, title: 'Your Intent', headerBackTitle: 'Event' }}
        />
        {/* Organiser tools — reachable only from Settings, itself only shown to is_admin
            accounts. Each screen renders its own header/back control, same pattern as the
            other full-bleed-header screens above — headerShown: false throughout. */}
        <Stack.Screen name="organizer/index" options={{ headerShown: false }} />
        <Stack.Screen name="organizer/new" options={{ headerShown: false }} />
        <Stack.Screen name="organizer/[id]/manage" options={{ headerShown: false }} />
        <Stack.Screen name="organizer/[id]/edit" options={{ headerShown: false }} />
      </Stack>
      {/* Only mount the splash's actual text/logo once fonts are ready — mounting it earlier
          and letting the font "swap in" later doesn't work: once iOS paints a Text with the
          fallback font, it doesn't get redrawn just because the custom font becomes available
          a moment afterward. Until then, show the same brand-colored ground with nothing on
          it — visually seamless against the native launch screen underneath. */}
      {showBrandedSplash ? (fontsLoaded ? <BrandedSplash /> : <View style={styles.splash} />) : null}
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
    backgroundColor: colors.brandMarkCream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Full-bleed ripple texture behind the mark — no mark baked into this image (that's a
  // separate layer below) so the wordmark stays real, positioned text rather than part of a
  // raster. Ripple rings are only used on surfaces this large; see splashMark below.
  splashField: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  // Same plain-mark asset as the native launch screen (app.json's expo-splash-screen `image`),
  // same size/position, so the handoff from native to this JS splash doesn't jump — only the
  // ripple field behind it fades in as new. Native launch screens never carry ripple rings
  // themselves (the OS crops/rescales them unpredictably across devices, which aliases the
  // rings into moiré) — that's also why the app icon uses the plain mark only, no rings.
  splashMark: { width: 160, height: 160, marginBottom: 16 },
  // Both were tuned for the old dark-brown splash background (inkOn = the light/cream text
  // color meant to sit on a dark ground) — now that the background itself is cream, the text
  // needs the dark-on-light pairing instead, or it'd be nearly invisible.
  splashWordmark: { ...typeStyles.wordmark, color: colors.ink },
  splashTagline: { ...typeStyles.tagline, fontSize: 16, marginTop: 6, textTransform: 'none', color: colors.textSecondary },
});

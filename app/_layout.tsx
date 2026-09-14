import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Animated,
  Easing,
  AccessibilityInfo,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Newsreader_400Regular } from '@expo-google-fonts/newsreader';
import { YesevaOne_400Regular } from '@expo-google-fonts/yeseva-one';
import { SourceSans3_400Regular, SourceSans3_600SemiBold } from '@expo-google-fonts/source-sans-3';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../lib/auth';
import { RequestsBadgeProvider } from '../lib/requestsBadge';
import { MessagesBadgeProvider } from '../lib/messagesBadge';
import { colors, fonts } from '../lib/theme';

// The native launch screen (see app.json's expo-splash-screen config) is just a static image —
// it can't show the "Proxiland" wordmark without baking a new image into a native rebuild. So
// instead: hide the native splash the instant JS takes over (same #F8F4ED ground + same
// default-tone mark, so the swap is invisible), and show this JS-rendered screen — ripple texture,
// live-vector mark, wordmark, tagline, each animating in — in its place for a fixed 3.5s hold.
// The native launch image carries no ripple on purpose: the OS crops/rescales it
// unpredictably across devices, which aliases the rings.
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

// Fixed hold from first paint, then a hard cut to the first screen (no fade out). If auth
// bootstrap finishes early the full hold is still honoured; if it runs long the splash stays
// up rather than showing a half-built screen.
const APP_START_TIME = Date.now();
const MIN_SPLASH_MS = 3500;

// Splash geometry, from the brief's 390x844 reference frame. The texture is a fixed square
// positioned from the mark's centre — never cover-fitted — so the mark sits in the void baked
// into the texture. The two are locked together: the texture PNG's void is cut for a 144px
// mark inside a 1200px square, so any scale applied to one must be applied to the other.
const MARK_ASPECT = 396 / 391;
const REF_MARK_WIDTH = 144;
const REF_TEXTURE_SIZE = 1200;
const LARGE_MARK_WIDTH = 192;
const LARGE_TEXTURE_SIZE = 1600;
const MARK_CENTRE_Y = 0.38;
const WORDMARK_TOP_Y = 0.53;
const SPLASH_EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

const MARK_PATH_BOWL =
  'M124.6 0H245.2a137 137 0 0 1 0 273.6H124.6A18 18 0 0 1 106.6 255.6V18A18 18 0 0 1 124.6 0Z';
const MARK_PATH_STEM =
  'M18 108H173.3V378a18 18 0 0 1-18 18H107A107 107 0 0 1 0 289V126A18 18 0 0 1 18 108Z';
const MARK_PATH_COUNTER =
  'M106.6 108H243.9a36 36 0 0 1 0 72H175.9V288H142.6a36 36 0 0 1-36-36Z';

// Default tone: dark paths, cream counter — the tone for cream grounds.
function ProxilandMark({ width }: { width: number }) {
  return (
    <Svg viewBox="0 0 391 396" width={width} height={width * MARK_ASPECT}>
      <Path d={MARK_PATH_BOWL} fill={colors.brandMarkDark} />
      <Path d={MARK_PATH_STEM} fill={colors.brandMarkDark} />
      <Path d={MARK_PATH_COUNTER} fill={colors.brandMarkCream} />
    </Svg>
  );
}

function BrandedSplash({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { width, height } = useWindowDimensions();

  const large = width >= 600;
  let markWidth = large ? LARGE_MARK_WIDTH : REF_MARK_WIDTH;
  let textureSize = large ? LARGE_TEXTURE_SIZE : REF_TEXTURE_SIZE;
  // The square must overhang every edge of the viewport while centred on the mark, so its
  // border never enters the frame. If a viewport needs a bigger square, the mark scales by the
  // same factor to keep the void alignment.
  const overhangSize = 2 * Math.max(width / 2, height * (1 - MARK_CENTRE_Y));
  if (overhangSize > textureSize) {
    const factor = overhangSize / textureSize;
    textureSize *= factor;
    markWidth *= factor;
  }
  const markHeight = markWidth * MARK_ASPECT;
  const centreX = width / 2;
  const centreY = height * MARK_CENTRE_Y;

  const mountedAt = useRef(Date.now()).current;
  const field = useRef(new Animated.Value(0)).current;
  const mark = useRef(new Animated.Value(0)).current;
  const wordmark = useRef(new Animated.Value(0)).current;
  const tagline = useRef(new Animated.Value(0)).current;
  const reduceMotionRef = useRef(false);

  const settle = () => {
    for (const v of [field, mark, wordmark, tagline]) {
      v.stopAnimation();
      v.setValue(1);
    }
  };

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (cancelled || !reduced) return;
        reduceMotionRef.current = true;
        settle();
      })
      .catch(() => {});

    Animated.parallel([
      Animated.timing(field, { toValue: 1, duration: 800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(mark, { toValue: 1, duration: 420, easing: SPLASH_EASE, useNativeDriver: true }),
    ]).start();

    return () => {
      cancelled = true;
    };
    // Mount-only: the entry animation runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The wordmark and tagline only start once the fonts they need have resolved — a fallback
  // flash on a 3.5s screen is the whole screen. In the normal case fonts are ready at mount,
  // so the delays below run from t0; if they land late, the text comes in then, without the
  // delay being re-applied on top of the wait.
  useEffect(() => {
    if (!fontsLoaded) return;
    if (reduceMotionRef.current) {
      settle();
      return;
    }
    const elapsed = Date.now() - mountedAt;
    Animated.parallel([
      Animated.timing(wordmark, {
        toValue: 1,
        duration: 460,
        delay: Math.max(0, 190 - elapsed),
        easing: SPLASH_EASE,
        useNativeDriver: true,
      }),
      Animated.timing(tagline, {
        toValue: 1,
        duration: 520,
        delay: Math.max(0, 430 - elapsed),
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontsLoaded]);

  return (
    <View style={styles.splash}>
      <StatusBar style="dark" />
      <Animated.Image
        source={require('../assets/proxiland-splash-texture.png')}
        style={{
          position: 'absolute',
          width: textureSize,
          height: textureSize,
          left: centreX - textureSize / 2,
          top: centreY - textureSize / 2,
          opacity: field,
        }}
        resizeMode="stretch"
      />
      <Animated.View
        style={{
          position: 'absolute',
          left: centreX - markWidth / 2,
          top: centreY - markHeight / 2,
          opacity: mark,
          transform: [{ scale: mark.interpolate({ inputRange: [0, 1], outputRange: [0.955, 1] }) }],
        }}
      >
        <ProxilandMark width={markWidth} />
      </Animated.View>
      {fontsLoaded ? (
        <View style={[styles.splashType, { top: height * WORDMARK_TOP_Y }]}>
          <Animated.Text
            style={[
              styles.splashWordmark,
              {
                opacity: wordmark,
                transform: [{ translateY: wordmark.interpolate({ inputRange: [0, 1], outputRange: [7, 0] }) }],
              },
            ]}
          >
            Proxiland
          </Animated.Text>
          <Animated.Text style={[styles.splashTagline, { opacity: tagline }]}>
            Bringing people around you closer
          </Animated.Text>
        </View>
      ) : null}
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
        {/* Both render their own header/back control, same as the other pushed screens. */}
        <Stack.Screen name="new-event" options={{ headerShown: false }} />
        <Stack.Screen name="schedule" options={{ headerShown: false }} />
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
        <Stack.Screen name="organizer/[id]/manage" options={{ headerShown: false }} />
        <Stack.Screen name="organizer/[id]/edit" options={{ headerShown: false }} />
      </Stack>
      {/* The splash mounts immediately (ground + texture + vector mark need no fonts) and only
          adds the wordmark/tagline once fonts are ready — mounting Text earlier and letting the
          font "swap in" doesn't work: once iOS paints a Text with the fallback font, it doesn't
          get redrawn when the custom font arrives a moment later. */}
      {showBrandedSplash ? <BrandedSplash fontsLoaded={fontsLoaded} /> : null}
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Rendered before the tree so it mounts first: the splash's own StatusBar
            mounts after it and wins while the splash is up, and this default takes back over
            when the splash unmounts. */}
        <StatusBar style="auto" />
        <AuthProvider>
          <RequestsBadgeProvider>
            <MessagesBadgeProvider>
              <RootNavigation />
            </MessagesBadgeProvider>
          </RequestsBadgeProvider>
        </AuthProvider>
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
    overflow: 'hidden',
  },
  // Type block: top edge at 53% of the viewport, centred; sits clear of the innermost rings.
  splashType: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  // Yeseva One has exactly one weight — never set fontWeight here.
  splashWordmark: {
    fontFamily: fonts.wordmark,
    fontSize: 42,
    lineHeight: 45,
    letterSpacing: 42 * 0.005,
    color: colors.brandMarkDark,
  },
  splashTagline: {
    fontFamily: fonts.sans,
    fontSize: 20,
    lineHeight: 20 * 1.4,
    letterSpacing: 20 * 0.03,
    color: colors.brandInk,
    marginTop: 18,
  },
});

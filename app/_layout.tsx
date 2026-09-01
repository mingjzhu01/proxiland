import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Image, Text, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../lib/auth';
import { RequestsBadgeProvider } from '../lib/requestsBadge';
import { MessagesBadgeProvider } from '../lib/messagesBadge';

// The native launch screen (see app.json's expo-splash-screen config) is just a static image —
// it can't show the "Proxiland" wordmark without baking a new image into a native rebuild. So
// instead: hide the native splash the instant JS takes over (same brown background, so the
// swap is invisible), and show this JS-rendered screen — logo + wordmark — in its place for a
// deliberate hold. Ships instantly via OTA update, no native rebuild needed to change it.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.hideAsync().catch(() => {});

// The auth check itself (reading a locally cached session) usually resolves in well under
// 1200ms, so gating purely on isLoading isn't enough to make the screen actually register —
// a deliberate minimum hold time is the normal way apps handle this.
const APP_START_TIME = Date.now();
const MIN_SPLASH_MS = 1200;

function BrandedSplash() {
  return (
    <View style={styles.splash}>
      <Image source={require('../assets/icon.png')} style={styles.splashLogo} />
      <Text style={styles.splashWordmark}>PROXILAND</Text>
    </View>
  );
}

function RootNavigation() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [showBrandedSplash, setShowBrandedSplash] = useState(true);

  useEffect(() => {
    if (isLoading) return;

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
  }, [session, isLoading, segments, router]);

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
        <Stack.Screen name="profile/[id]" options={{ headerShown: true, title: 'Profile' }} />
        <Stack.Screen
          name="blocked-users"
          options={{ headerShown: true, title: 'Blocked Users' }}
        />
        <Stack.Screen name="chat/[connectionId]" options={{ headerShown: true, title: 'Chat' }} />
        <Stack.Screen name="delete-account" options={{ headerShown: true, title: 'Delete Account' }} />
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
    backgroundColor: '#4A3B31',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: { width: 120, height: 120, borderRadius: 24, marginBottom: 20 },
  splashWordmark: { color: '#F5EFE6', fontSize: 22, fontWeight: '700', letterSpacing: 4 },
});

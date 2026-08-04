import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../lib/auth';
import { RequestsBadgeProvider } from '../lib/requestsBadge';
import { MessagesBadgeProvider } from '../lib/messagesBadge';

function RootNavigation() {
  const { session, isLoading, hasProfile } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    // hasProfile is still being checked for this session — wait rather than bounce
    // through sign-in/tabs before we know where the user actually belongs.
    if (session && hasProfile === null) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inEditProfile = segments[0] === 'edit-profile';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (session && !hasProfile && !inEditProfile) {
      // First-time setup — forced. Once hasProfile flips true, edit-profile's own confirm
      // step navigates away explicitly (see app/edit-profile.tsx), so this effect doesn't
      // need to (and must not — that would also fire on later voluntary edits, when
      // hasProfile is already true the moment the screen opens).
      router.replace('/edit-profile');
    } else if (session && hasProfile && inAuthGroup) {
      router.replace('/(tabs)/nearby');
    }
  }, [session, isLoading, hasProfile, segments, router]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="edit-profile" />
      <Stack.Screen name="profile/[id]" options={{ headerShown: true, title: 'Profile' }} />
      <Stack.Screen
        name="blocked-users"
        options={{ headerShown: true, title: 'Blocked Users' }}
      />
      <Stack.Screen name="chat/[connectionId]" options={{ headerShown: true, title: 'Chat' }} />
    </Stack>
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

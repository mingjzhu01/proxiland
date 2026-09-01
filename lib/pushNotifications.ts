import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Called once per session after sign-in (see AuthProvider). Best-effort throughout — a person
// denying the permission prompt, or running in the iOS Simulator (no push capability at all),
// should never block anything else in the app from working.
export async function registerForPushNotifications(): Promise<void> {
  try {
    if (!Device.isDevice) return; // simulators/emulators can't receive push at all

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: '#3b5bdb',
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let finalStatus = existing.status;
    if (finalStatus !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      finalStatus = requested.status;
    }
    if (finalStatus !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    await supabase.from('device_push_tokens').upsert(
      {
        user_id: userData.user.id,
        push_token: token,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,push_token' }
    );
  } catch {
    // Best-effort — push notifications are a nice-to-have, never block sign-in or app use.
  }
}

// Local-only memory of which ambient "you're at this event" arrival prompts (Nearby tab) the
// user has already said "not now" to, so the banner doesn't keep reappearing on every reload
// for an event they've already declined. Per-device, not synced — declining on one device
// doesn't affect another, which is fine for this use case.
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'proxiland.dismissedEventArrivalIds';

export async function getDismissedEventArrivalIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export async function dismissEventArrival(eventId: string): Promise<void> {
  try {
    const existing = await getDismissedEventArrivalIds();
    existing.add(eventId);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(existing)));
  } catch {
    // Best-effort — worst case the banner reappears next time, not worth surfacing an error.
  }
}

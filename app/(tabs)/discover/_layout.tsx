import { Stack } from 'expo-router';

// Discover is a stack inside the tab so the event screens push over it with the tab bar still
// showing — the event-connections handoff relies on the bar being persistent inside an event
// (its badge and its door to the connections sheet live there).
export default function DiscoverLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

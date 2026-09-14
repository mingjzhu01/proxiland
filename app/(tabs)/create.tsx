import { View } from 'react-native';

// Placeholder for the tab bar's center slot. Its button is intercepted in (tabs)/_layout.tsx to
// raise the create overlay, so this screen is never actually shown — but the route has to exist
// for the bar to lay out five even columns.
export default function CreateSlot() {
  return <View />;
}

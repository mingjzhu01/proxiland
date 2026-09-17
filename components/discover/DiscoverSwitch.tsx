import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts } from '../../lib/theme';

export type DiscoverMode = 'nearby' | 'events';

// The Nearby | Events control under Discover's title, per the discover-events handoff. Sits
// with the title, never scrolls.
export function DiscoverSwitch({ value, onChange }: { value: DiscoverMode; onChange: (mode: DiscoverMode) => void }) {
  return (
    <View style={styles.track}>
      {(['nearby', 'events'] as const).map((mode) => {
        const active = mode === value;
        return (
          <Pressable
            key={mode}
            style={[styles.segment, active && styles.segmentActive]}
            onPress={() => onChange(mode)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.label, active ? styles.labelActive : styles.labelInactive]}>
              {mode === 'nearby' ? 'Nearby' : 'Events'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.insetPill,
    borderRadius: 999,
    padding: 3,
    gap: 2,
    marginTop: 15,
  },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 999, minHeight: 44, justifyContent: 'center' },
  segmentActive: { backgroundColor: colors.card },
  label: { fontFamily: fonts.sansSemibold, fontSize: 14.5 },
  labelActive: { color: colors.brandMarkDark },
  labelInactive: { color: colors.brandInk },
});

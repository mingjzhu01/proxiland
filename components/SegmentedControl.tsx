import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radii, shadows, fonts } from '../lib/theme';

export type Segment = { key: string; label: string; count?: number };

type Props = {
  segments: Segment[];
  activeKey: string;
  onChange: (key: string) => void;
};

// #EFE7DA container, radius 11, padding 3. Active segment surface, radius 9, ink 12.5/600,
// the one shadow in the whole system. Each label carries its count as a trailing span —
// brass on the active segment, textMuted on inactive.
export function SegmentedControl({ segments, activeKey, onChange }: Props) {
  return (
    <View style={styles.container}>
      {segments.map((segment) => {
        const active = segment.key === activeKey;
        return (
          <Pressable
            key={segment.key}
            style={[styles.segment, active && styles.segmentActive]}
            onPress={() => onChange(segment.key)}
          >
            <Text style={[styles.label, active ? styles.labelActive : styles.labelInactive]}>
              {segment.label}
              {segment.count !== undefined ? (
                <Text style={active ? styles.countActive : styles.countInactive}> {segment.count}</Text>
              ) : null}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#EFE7DA',
    borderRadius: radii.segmentedOuter,
    padding: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: radii.segmentedInner,
  },
  segmentActive: { backgroundColor: colors.surface, ...shadows.segmentActive },
  label: { fontFamily: fonts.wordmark, fontSize: 12.5, fontWeight: '600' },
  labelActive: { color: colors.ink },
  labelInactive: { color: colors.textTertiary },
  countActive: { color: colors.brass },
  countInactive: { color: colors.textMuted },
});

import { View, Text, StyleSheet } from 'react-native';
import { colors, typeStyles } from '../lib/theme';

import { SectionLabel } from './SectionLabel';

type Props = {
  reason: string;
  // 'panel': sits inside a Card, full-bleed, surfaceSunken ground with a ruleInner top
  // border — the feed/match-card treatment. 'plain': a plain block above a ruleInner
  // divider — the chat-banner / profile treatment. The rationale text itself is never a
  // colored box with small type in either case.
  variant?: 'panel' | 'plain';
  compact?: boolean;
  // Event match cards (Top Matches / Shared Overlap) darken + bold the label so it reads
  // clearly at a glance next to the rank badge — the default brass is too light there.
  dense?: boolean;
};

// The system's signature block. Mono 10 brass "WHY YOU TWO" label, 8px gap, then the
// rationale in Newsreader — 19-20px in a feed/match card, 17px in the chat banner.
export function WhyYouTwo({ reason, variant = 'panel', compact = false, dense = false }: Props) {
  return (
    <View style={variant === 'panel' ? styles.panel : styles.plain}>
      <SectionLabel tone="brass" style={dense ? styles.denseLabel : undefined}>Why you two</SectionLabel>
      <Text style={[compact ? typeStyles.matchRationaleChat : typeStyles.matchRationale, styles.text]}>{reason}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surfaceSunken,
    borderTopWidth: 1,
    borderTopColor: colors.ruleInner,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  plain: {
    borderTopWidth: 1,
    borderTopColor: colors.ruleInner,
    paddingTop: 14,
  },
  text: { marginTop: 8 },
  denseLabel: { color: colors.brassDense, fontWeight: '700' },
});

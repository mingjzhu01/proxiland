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
};

// The system's signature block. Mono 10 brass "WHY YOU TWO" label, 8px gap, then the
// rationale in Newsreader — 19-20px in a feed/match card, 17px in the chat banner.
export function WhyYouTwo({ reason, variant = 'panel', compact = false }: Props) {
  return (
    <View style={variant === 'panel' ? styles.panel : styles.plain}>
      <SectionLabel tone="brass">Why you two</SectionLabel>
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
});

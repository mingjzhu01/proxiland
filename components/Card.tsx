import { View, ViewProps, StyleSheet } from 'react-native';
import { colors, radii, spacing } from '../lib/theme';

type Props = ViewProps & {
  children: React.ReactNode;
  noPadding?: boolean;
};

// surface, 1px rule, radius 16, padding 16-17, gutter 20 (gutter applied by the caller's
// FlatList/ScrollView contentContainerStyle or an explicit marginHorizontal — Card itself
// only owns the card's own border/fill/padding since it's reused inside full-bleed contexts
// (the "why you two" sunken panel) too.
export function Card({ children, noPadding, style, ...rest }: Props) {
  return (
    <View style={[styles.card, noPadding ? undefined : styles.padded, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radii.card,
    overflow: 'hidden',
  },
  padded: { padding: spacing.cardPadding },
});

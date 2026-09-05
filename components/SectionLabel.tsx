import { Text, TextProps } from 'react-native';
import { colors, typeStyles } from '../lib/theme';

type Props = TextProps & {
  children: React.ReactNode;
  tone?: 'brass' | 'muted';
};

// Mono 10, uppercase, letter-spacing 0.16em. `brass` labels AI output or the current/primary
// group; `muted` labels a neutral group. e.g. "ANONYMOUS · 5", "WHY YOU TWO".
export function SectionLabel({ children, tone = 'muted', style, ...rest }: Props) {
  return (
    <Text style={[typeStyles.sectionLabel, { color: tone === 'brass' ? colors.brass : colors.textMuted }, style]} {...rest}>
      {children}
    </Text>
  );
}

import { Pressable, Text, StyleSheet, PressableProps, ActivityIndicator } from 'react-native';
import { colors, radii, typeStyles } from '../lib/theme';

type ButtonProps = PressableProps & {
  label: string;
  loading?: boolean;
  fullWidth?: boolean;
};

// ink ground, inkOn text, radius 11-13, full width by default.
export function PrimaryButton({ label, loading, fullWidth = true, disabled, style, ...rest }: ButtonProps) {
  return (
    <Pressable
      style={[styles.primary, fullWidth && styles.fullWidth, (disabled || loading) && styles.disabled, style as any]}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <ActivityIndicator color={colors.inkOn} /> : <Text style={styles.primaryText}>{label}</Text>}
    </Pressable>
  );
}

// transparent, 1px rule, ink or textTertiary text.
export function SecondaryButton({ label, loading, fullWidth = true, disabled, style, ...rest }: ButtonProps) {
  return (
    <Pressable
      style={[styles.secondary, fullWidth && styles.fullWidth, (disabled || loading) && styles.disabled, style as any]}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.secondaryText}>{label}</Text>}
    </Pressable>
  );
}

// 1px rule border, textMuted text, no fill — "Asked · waiting to hear back", "Requested".
export function ResolvedButton({ label, fullWidth = true }: { label: string; fullWidth?: boolean }) {
  return (
    <Pressable style={[styles.secondary, fullWidth && styles.fullWidth]} disabled>
      <Text style={styles.resolvedText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fullWidth: { width: '100%' },
  primary: {
    backgroundColor: colors.ink,
    borderRadius: radii.button,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { ...typeStyles.primaryButton, color: colors.inkOn },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radii.button,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { ...typeStyles.primaryButton, color: colors.ink },
  resolvedText: { ...typeStyles.primaryButton, color: colors.textMuted },
  disabled: { opacity: 0.5 },
});

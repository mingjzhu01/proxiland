import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, typeStyles } from '../lib/theme';

type Tone = 'brass' | 'neutral' | 'selected' | 'dashed';

type Props = {
  label: string;
  tone?: Tone;
  onRemove?: () => void;
  onPress?: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
};

// Metadata chip (brass/neutral grounds), interactive selected chip (ink ground + close
// glyph), or the dashed "Add" chip. Same corner radius as the primary buttons (radii.button)
// so a screen's chips and its main action read as one shape language, not a pill next to a
// rectangle.
export function Chip({ label, tone = 'neutral', onRemove, onPress, icon }: Props) {
  const content = (
    <View style={[styles.base, toneStyles[tone], onRemove ? styles.interactivePad : styles.metaPad]}>
      {icon ? <Ionicons name={icon} size={13} color={tone === 'selected' ? colors.inkOn : colors.textTertiary} style={styles.icon} /> : null}
      <Text style={[styles.label, toneTextStyles[tone]]}>{label}</Text>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={8}>
          <Ionicons name="close" size={13} color="rgba(247,243,236,.7)" />
        </Pressable>
      ) : null}
    </View>
  );

  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.button,
    alignSelf: 'flex-start',
  },
  metaPad: { paddingVertical: 4, paddingHorizontal: 8 },
  interactivePad: { paddingVertical: 8, paddingHorizontal: 13 },
  icon: { marginRight: -2 },
  label: typeStyles.chip,
});

const toneStyles = StyleSheet.create({
  brass: { backgroundColor: colors.brassChipBg },
  neutral: { backgroundColor: colors.neutralChipBg },
  selected: { backgroundColor: colors.ink },
  dashed: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.dashedBorder, borderStyle: 'dashed' },
});

const toneTextStyles = StyleSheet.create({
  brass: { color: colors.brassChipText },
  neutral: { color: colors.textSecondary },
  selected: { color: colors.inkOn },
  dashed: { color: colors.textTertiary },
});

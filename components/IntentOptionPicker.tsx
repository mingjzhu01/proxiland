import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { groupedOptions, type IntentOptionType } from '../lib/eventIntentOptions';
import { EVENT_INTENT_DEFAULTS } from '../lib/eventIntentConfig';
import { colors, radii, typeStyles } from '../lib/theme';
import { PrimaryButton } from './Buttons';
import { SectionLabel } from './SectionLabel';

type Props = {
  visible: boolean;
  type: IntentOptionType;
  title: string;
  selectedIds: string[];
  onClose: () => void;
  onDone: (ids: string[]) => void;
};

export function IntentOptionPicker({ visible, type, title, selectedIds, onClose, onDone }: Props) {
  const [pending, setPending] = useState<string[]>(selectedIds);
  const [limitMessage, setLimitMessage] = useState(false);
  const maxSelections =
    type === 'ask' ? EVENT_INTENT_DEFAULTS.maximumAskSelections : EVENT_INTENT_DEFAULTS.maximumOfferSelections;

  useEffect(() => {
    if (visible) {
      setPending(selectedIds);
      setLimitMessage(false);
    }
  }, [visible, selectedIds]);

  function toggle(id: string) {
    setPending((prev) => {
      if (prev.includes(id)) {
        setLimitMessage(false);
        return prev.filter((i) => i !== id);
      }
      if (prev.length >= maxSelections) {
        setLimitMessage(true);
        return prev;
      }
      setLimitMessage(false);
      return [...prev, id];
    });
  }

  function handleDone() {
    onDone(pending);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.grabHandle} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>
                Pick up to {maxSelections} · {pending.length} chosen
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          {limitMessage ? (
            <Text style={styles.limitMessage}>
              You can pick up to {maxSelections} — remove one to add another.
            </Text>
          ) : null}

          <ScrollView style={styles.scroll}>
            {groupedOptions(type).map(({ group, options }) => (
              <View key={group} style={styles.group}>
                <SectionLabel tone="brass" style={styles.groupLabel}>{group}</SectionLabel>
                {options.map((option) => {
                  const selected = pending.includes(option.id);
                  return (
                    <Pressable
                      key={option.id}
                      style={[styles.optionRow, selected && styles.optionRowSelected]}
                      onPress={() => toggle(option.id)}
                    >
                      <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{option.label}</Text>
                      <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                        {selected ? <Ionicons name="checkmark" size={13} color={colors.ink} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <PrimaryButton
              label={`Done · ${pending.length} selected`}
              onPress={handleDone}
              disabled={pending.length === 0}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(36,28,22,.42)' },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingTop: 12,
    maxHeight: '88%',
  },
  grabHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.dashedBorder, alignSelf: 'center', marginBottom: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: colors.rule,
  },
  headerText: { flex: 1 },
  title: { ...typeStyles.screenHeadline, fontSize: 24, lineHeight: 28 },
  subtitle: { fontSize: 12.5, color: colors.textTertiary, marginTop: 4 },
  limitMessage: { fontSize: 12, color: colors.brass, paddingHorizontal: 20, paddingTop: 10 },
  scroll: { paddingHorizontal: 20 },
  group: { marginTop: 18 },
  groupLabel: { marginBottom: 8 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.rule,
  },
  optionRowSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  optionLabel: { fontSize: 15, fontWeight: '500', color: colors.ink, flexShrink: 1 },
  optionLabelSelected: { color: colors.inkOn },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.dashedBorder,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkboxSelected: { backgroundColor: colors.paper, borderStyle: 'solid', borderColor: colors.paper },
  footer: { padding: 20, paddingBottom: 32, borderTopWidth: 1, borderColor: colors.rule, marginTop: 12 },
});

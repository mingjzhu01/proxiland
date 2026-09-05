import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { groupedOptions, type IntentOptionType } from '../lib/eventIntentOptions';
import { EVENT_INTENT_DEFAULTS } from '../lib/eventIntentConfig';

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
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color="#666" />
            </Pressable>
          </View>
          <Text style={styles.subtitle}>
            Pick 1 to {maxSelections} — {pending.length} of {maxSelections} selected
          </Text>
          {limitMessage ? (
            <Text style={styles.limitMessage}>You can pick up to {maxSelections} — remove one to add another.</Text>
          ) : null}

          <ScrollView style={styles.scroll}>
            {groupedOptions(type).map(({ group, options }) => (
              <View key={group} style={styles.group}>
                <Text style={styles.groupLabel}>{group}</Text>
                {options.map((option) => {
                  const selected = pending.includes(option.id);
                  return (
                    <Pressable
                      key={option.id}
                      style={[styles.optionRow, selected && styles.optionRowSelected]}
                      onPress={() => toggle(option.id)}
                    >
                      <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                        {selected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                      </View>
                      <Text style={styles.optionLabel}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          <Pressable
            style={[styles.doneButton, pending.length === 0 && styles.buttonDisabled]}
            onPress={handleDone}
            disabled={pending.length === 0}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    maxHeight: '85%',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 13, color: '#666', marginTop: 4, marginBottom: 4 },
  limitMessage: { fontSize: 12, color: '#a05a2c', marginBottom: 4 },
  scroll: { marginTop: 8, marginBottom: 16 },
  group: { marginBottom: 16 },
  groupLabel: { fontSize: 12, fontWeight: '700', color: '#888', marginBottom: 6, textTransform: 'uppercase' },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  optionRowSelected: { backgroundColor: '#f4efe9' },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { borderColor: '#4A3B31', backgroundColor: '#4A3B31' },
  optionLabel: { fontSize: 15, color: '#111', flexShrink: 1 },
  doneButton: { backgroundColor: '#4A3B31', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  doneButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 },
});

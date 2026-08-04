// Spec v4 section 10: one skippable, one-tap question, shown on first launch and roughly
// every fourteen days after. This is the instrumentation the whole build exists to answer
// ("is idle curiosity real"), so unlike most prompts it should not be nice-to-have — it
// should actually show up.
import { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { INTENT_STATES, INTENT_STATE_LABELS, setIntentState, shouldPromptIntentState } from '../lib/api/instrumentation';

export function IntentStatePrompt() {
  const [visible, setVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    shouldPromptIntentState().then(setVisible);
  }, []);

  async function handleSelect(state: (typeof INTENT_STATES)[number]) {
    setIsSaving(true);
    try {
      await setIntentState(state);
    } finally {
      setIsSaving(false);
      setVisible(false);
    }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Pressable style={styles.skip} onPress={() => setVisible(false)}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>

          <Text style={styles.title}>What best describes you right now?</Text>

          {INTENT_STATES.map((state) => (
            <Pressable
              key={state}
              style={styles.option}
              onPress={() => handleSelect(state)}
              disabled={isSaving}
            >
              <Text style={styles.optionText}>{INTENT_STATE_LABELS[state]}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  skip: { alignSelf: 'flex-end', padding: 4, marginBottom: 4 },
  skipText: { color: '#999', fontSize: 14 },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 16 },
  option: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  optionText: { fontSize: 15, color: '#111' },
});

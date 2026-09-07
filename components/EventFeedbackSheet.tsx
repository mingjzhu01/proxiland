// Brief optional post-event feedback (real-event-readiness plan, section 11) — shown right
// after checking out. Two taps to dismiss entirely; the comment field is genuinely optional.
import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { submitEventFeedback } from '../lib/api/eventFeedback';
import { logSessionEvent } from '../lib/api/instrumentation';
import { PrimaryButton } from './Buttons';
import { colors, radii, fonts } from '../lib/theme';

export function EventFeedbackSheet({
  visible,
  eventId,
  onClose,
}: {
  visible: boolean;
  eventId: string | null;
  onClose: () => void;
}) {
  const [foundUseful, setFoundUseful] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function reset() {
    setFoundUseful(null);
    setComment('');
  }

  function handleSkip() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    if (!eventId || foundUseful === null) return;
    setIsSubmitting(true);
    try {
      await submitEventFeedback(eventId, foundUseful, comment);
      logSessionEvent('event_feedback_submitted', { scopeId: eventId, metadata: { foundUseful } });
      reset();
      onClose();
    } catch (error: any) {
      Alert.alert('Could not send feedback', error.message ?? String(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleSkip}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Quick question</Text>
          <Text style={styles.subtitle}>Did Proxiland help you have a useful conversation here?</Text>

          <View style={styles.choiceRow}>
            <Pressable
              style={[styles.choice, foundUseful === true && styles.choiceSelected]}
              onPress={() => setFoundUseful(true)}
            >
              <Text style={[styles.choiceText, foundUseful === true && styles.choiceTextSelected]}>Yes</Text>
            </Pressable>
            <Pressable
              style={[styles.choice, foundUseful === false && styles.choiceSelected]}
              onPress={() => setFoundUseful(false)}
            >
              <Text style={[styles.choiceText, foundUseful === false && styles.choiceTextSelected]}>Not really</Text>
            </Pressable>
          </View>

          <TextInput
            style={styles.input}
            value={comment}
            onChangeText={setComment}
            placeholder="Anything that would make this better? (optional)"
            placeholderTextColor={colors.textMuted}
            multiline
          />

          <PrimaryButton label="Send feedback" loading={isSubmitting} disabled={foundUseful === null} onPress={handleSubmit} />
          <Pressable style={styles.skipButton} onPress={handleSkip} disabled={isSubmitting}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(36,28,22,.42)' },
  sheet: { backgroundColor: colors.paper, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, padding: 20, paddingBottom: 32 },
  title: { fontFamily: fonts.wordmark, fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  subtitle: { fontFamily: fonts.wordmark, fontSize: 14, color: colors.textSecondary, marginBottom: 16 },
  choiceRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  choice: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.surface,
  },
  choiceSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  choiceText: { fontFamily: fonts.wordmark, fontSize: 14, fontWeight: '600', color: colors.ink },
  choiceTextSelected: { color: colors.inkOn },
  input: {
    fontFamily: fonts.wordmark,
    fontSize: 14,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 12,
    padding: 12,
    minHeight: 70,
    textAlignVertical: 'top',
    backgroundColor: colors.surface,
    marginBottom: 16,
  },
  skipButton: { alignItems: 'center', paddingVertical: 14 },
  skipText: { fontFamily: fonts.wordmark, fontSize: 14, fontWeight: '600', color: colors.textTertiary },
});

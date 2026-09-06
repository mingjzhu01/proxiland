import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { reportUser, blockUser, type ReportContext, type ReportReason } from '../lib/api/connections';
import { colors, radii, fonts } from '../lib/theme';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'inappropriate_content', label: 'Inappropriate content' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Other' },
];

export function ReportSheet({
  visible,
  targetUserId,
  context,
  onClose,
}: {
  visible: boolean;
  targetUserId: string | null;
  context: ReportContext;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function reset() {
    setReason(null);
    setDetails('');
    setSubmitted(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    if (!targetUserId || !reason) return;
    setIsSubmitting(true);
    try {
      await reportUser(targetUserId, context, reason, details);
      setSubmitted(true);
    } catch (error: any) {
      Alert.alert('Could not submit report', error.message ?? String(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAlsoBlock() {
    if (!targetUserId) return;
    setIsBlocking(true);
    try {
      await blockUser(targetUserId);
      handleClose();
    } catch (error: any) {
      Alert.alert('Could not block', error.message ?? String(error));
    } finally {
      setIsBlocking(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          {submitted ? (
            <>
              <Text style={styles.title}>Thanks, we'll review this</Text>
              <Text style={styles.subtitle}>Your report has been sent to our team.</Text>
              <Pressable
                style={[styles.blockButton, isBlocking && styles.buttonDisabled]}
                onPress={handleAlsoBlock}
                disabled={isBlocking}
              >
                <Text style={styles.blockButtonText}>
                  {isBlocking ? 'Blocking…' : 'Also block this person?'}
                </Text>
              </Pressable>
              <Pressable style={styles.doneButton} onPress={handleClose}>
                <Text style={styles.doneButtonText}>Done</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>Report this person</Text>
              <Text style={styles.subtitle}>Why are you reporting them?</Text>

              <View style={styles.reasonList}>
                {REASONS.map((r) => (
                  <Pressable
                    key={r.value}
                    style={[styles.reasonRow, reason === r.value && styles.reasonRowSelected]}
                    onPress={() => setReason(r.value)}
                  >
                    <View style={[styles.radio, reason === r.value && styles.radioSelected]} />
                    <Text style={styles.reasonLabel}>{r.label}</Text>
                  </Pressable>
                ))}
              </View>

              <TextInput
                style={styles.detailsInput}
                placeholder="Additional details (optional)"
                placeholderTextColor={colors.textMuted}
                value={details}
                onChangeText={setDetails}
                multiline
              />

              <View style={styles.buttonRow}>
                <Pressable style={styles.cancelButton} onPress={handleClose}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.submitButton, (!reason || isSubmitting) && styles.buttonDisabled]}
                  onPress={handleSubmit}
                  disabled={!reason || isSubmitting}
                >
                  <Text style={styles.submitButtonText}>{isSubmitting ? 'Submitting…' : 'Submit'}</Text>
                </Pressable>
              </View>
            </>
          )}
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
  reasonList: { gap: 4, marginBottom: 12 },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  reasonRowSelected: { backgroundColor: colors.surfaceSunken },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.dashedBorder },
  radioSelected: { borderColor: colors.brand, backgroundColor: colors.brand },
  reasonLabel: { fontFamily: fonts.wordmark, fontSize: 15, color: colors.ink },
  detailsInput: { fontFamily: fonts.wordmark,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.surface,
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  buttonRow: { flexDirection: 'row', gap: 10 },
  cancelButton: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 20, backgroundColor: colors.neutralChipBg },
  cancelButtonText: { fontFamily: fonts.wordmark, color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  submitButton: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 20, backgroundColor: colors.ink },
  submitButtonText: { fontFamily: fonts.wordmark, color: colors.inkOn, fontSize: 15, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
  blockButton: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.rule,
    marginBottom: 10,
  },
  blockButtonText: { fontFamily: fonts.wordmark, color: colors.ink, fontSize: 15, fontWeight: '600' },
  doneButton: { paddingVertical: 12, alignItems: 'center', borderRadius: 20, backgroundColor: colors.ink },
  doneButtonText: { fontFamily: fonts.wordmark, color: colors.inkOn, fontSize: 15, fontWeight: '600' },
});

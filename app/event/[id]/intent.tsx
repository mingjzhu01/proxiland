import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getMyEventIntent, upsertEventIntent, isIntentComplete, type EventIntent } from '../../../lib/api/events';
import { IntentOptionPicker } from '../../../components/IntentOptionPicker';
import { ASK_OPTION_BY_ID, OFFER_OPTION_BY_ID } from '../../../lib/eventIntentOptions';
import { logSessionEvent } from '../../../lib/api/instrumentation';

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
      <Pressable onPress={onRemove} hitSlop={8}>
        <Ionicons name="close" size={14} color="#4A3B31" />
      </Pressable>
    </View>
  );
}

export default function EventIntent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [askIds, setAskIds] = useState<string[]>([]);
  const [offerIds, setOfferIds] = useState<string[]>([]);
  const [askDetail, setAskDetail] = useState('');
  const [offerDetail, setOfferDetail] = useState('');
  const [wasCompleteOnLoad, setWasCompleteOnLoad] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [askPickerOpen, setAskPickerOpen] = useState(false);
  const [offerPickerOpen, setOfferPickerOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setIsLoading(true);
        try {
          const intent = await getMyEventIntent(id);
          if (cancelled) return;
          setAskIds(intent.askOptionIds);
          setOfferIds(intent.offerOptionIds);
          setAskDetail(intent.askDetailText ?? '');
          setOfferDetail(intent.offerDetailText ?? '');
          setWasCompleteOnLoad(isIntentComplete(intent));
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [id])
  );

  useEffect(() => {
    if (!isLoading) {
      logSessionEvent('event_intent_prompt_viewed', { scopeId: id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  function logOptionDiff(type: 'ask' | 'offer', before: string[], after: string[]) {
    for (const optionId of after) {
      if (!before.includes(optionId)) {
        logSessionEvent('event_intent_option_selected', { scopeId: id, metadata: { type, optionId } });
      }
    }
    for (const optionId of before) {
      if (!after.includes(optionId)) {
        logSessionEvent('event_intent_option_removed', { scopeId: id, metadata: { type, optionId } });
      }
    }
  }

  function handleAskDone(next: string[]) {
    logOptionDiff('ask', askIds, next);
    setAskIds(next);
  }

  function handleOfferDone(next: string[]) {
    logOptionDiff('offer', offerIds, next);
    setOfferIds(next);
  }

  function removeAsk(optionId: string) {
    logOptionDiff('ask', askIds, askIds.filter((i) => i !== optionId));
    setAskIds((prev) => prev.filter((i) => i !== optionId));
  }

  function removeOffer(optionId: string) {
    logOptionDiff('offer', offerIds, offerIds.filter((i) => i !== optionId));
    setOfferIds((prev) => prev.filter((i) => i !== optionId));
  }

  function handleCancel() {
    // Gate flow (intent was incomplete, so this screen was force-shown): leaving without
    // completing must NOT bounce back into the Event screen, which would just redirect here
    // again. Edit flow (intent was already complete): a normal back navigation is fine.
    if (wasCompleteOnLoad) {
      router.back();
    } else {
      router.replace('/(tabs)/nearby');
    }
  }

  const askNeedsDetail = askIds.includes('ask_other') && askDetail.trim().length === 0;
  const offerNeedsDetail = offerIds.includes('offer_other') && offerDetail.trim().length === 0;
  const canSave = askIds.length > 0 && offerIds.length > 0 && !askNeedsDetail && !offerNeedsDetail;

  async function handleSave() {
    if (!canSave) return;
    setIsSaving(true);
    try {
      await upsertEventIntent(id, {
        askOptionIds: askIds,
        askDetailText: askDetail.trim() || null,
        offerOptionIds: offerIds,
        offerDetailText: offerDetail.trim() || null,
      });

      const metadata = {
        isFirstCompletion: !wasCompleteOnLoad,
        askCount: askIds.length,
        offerCount: offerIds.length,
        hasDetailText: !!(askDetail.trim() || offerDetail.trim()),
      };
      logSessionEvent(wasCompleteOnLoad ? 'event_intent_edited' : 'event_intent_completed', {
        scopeId: id,
        metadata,
      });
      logSessionEvent('event_intent_update_saved', { scopeId: id, metadata });
      if (metadata.hasDetailText) {
        logSessionEvent('event_intent_custom_text_added', { scopeId: id });
      }

      router.replace(`/event/${id}`);
    } catch (error: any) {
      Alert.alert('Could not save', error.message ?? String(error));
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        This is just for this event — it won't touch your regular profile, and resets once the
        event ends. Both questions are required so we can find you real matches.
      </Text>

      <Text style={styles.label}>What are you looking for here?</Text>
      <View style={styles.chipRow}>
        {askIds.map((optionId) => (
          <Chip key={optionId} label={ASK_OPTION_BY_ID[optionId]?.label ?? optionId} onRemove={() => removeAsk(optionId)} />
        ))}
      </View>
      <Pressable style={styles.chooseButton} onPress={() => setAskPickerOpen(true)}>
        <Text style={styles.chooseButtonText}>{askIds.length > 0 ? 'Edit selections' : 'Choose up to 3'}</Text>
      </Pressable>
      {askNeedsDetail ? <Text style={styles.errorText}>Add a few words for "Other".</Text> : null}
      <Text style={styles.helper}>Add optional details to improve your matches</Text>
      <TextInput
        style={styles.input}
        value={askDetail}
        onChangeText={setAskDetail}
        placeholder="e.g. Intros to seed investors in climate tech"
        multiline
      />

      <Text style={[styles.label, styles.secondLabel]}>What can you offer?</Text>
      <View style={styles.chipRow}>
        {offerIds.map((optionId) => (
          <Chip key={optionId} label={OFFER_OPTION_BY_ID[optionId]?.label ?? optionId} onRemove={() => removeOffer(optionId)} />
        ))}
      </View>
      <Pressable style={styles.chooseButton} onPress={() => setOfferPickerOpen(true)}>
        <Text style={styles.chooseButtonText}>{offerIds.length > 0 ? 'Edit selections' : 'Choose up to 3'}</Text>
      </Pressable>
      {offerNeedsDetail ? <Text style={styles.errorText}>Add a few words for "Other".</Text> : null}
      <Text style={styles.helper}>Add optional details to improve your matches</Text>
      <TextInput
        style={styles.input}
        value={offerDetail}
        onChangeText={setOfferDetail}
        placeholder="e.g. Hands-on experience scaling a marketplace to Series A"
        multiline
      />

      <Pressable style={[styles.saveButton, (!canSave || isSaving) && styles.buttonDisabled]} onPress={handleSave} disabled={!canSave || isSaving}>
        {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save</Text>}
      </Pressable>
      <Pressable style={styles.cancelButton} onPress={handleCancel} disabled={isSaving}>
        <Text style={styles.cancelButtonText}>{wasCompleteOnLoad ? 'Cancel' : 'Not now'}</Text>
      </Pressable>

      <IntentOptionPicker
        visible={askPickerOpen}
        type="ask"
        title="What are you looking for?"
        selectedIds={askIds}
        onClose={() => setAskPickerOpen(false)}
        onDone={handleAskDone}
      />
      <IntentOptionPicker
        visible={offerPickerOpen}
        type="offer"
        title="What can you offer?"
        selectedIds={offerIds}
        onClose={() => setOfferPickerOpen(false)}
        onDone={handleOfferDone}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20 },
  intro: { fontSize: 13, color: '#888', marginBottom: 20, lineHeight: 19 },
  label: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  secondLabel: { marginTop: 28 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f4efe9',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: { fontSize: 13, color: '#4A3B31', fontWeight: '600' },
  chooseButton: {
    borderWidth: 1,
    borderColor: '#4A3B31',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  chooseButtonText: { color: '#4A3B31', fontSize: 14, fontWeight: '700' },
  errorText: { fontSize: 12, color: '#cc3333', marginTop: 6 },
  helper: { fontSize: 12, color: '#888', marginTop: 14, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: '#4A3B31',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 28,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelButton: { paddingVertical: 16, alignItems: 'center' },
  cancelButtonText: { color: '#666', fontSize: 14, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
});

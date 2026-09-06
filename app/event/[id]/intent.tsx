import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getMyEventIntent, upsertEventIntent, isIntentComplete } from '../../../lib/api/events';
import { IntentOptionPicker } from '../../../components/IntentOptionPicker';
import { Card } from '../../../components/Card';
import { Chip } from '../../../components/Chip';
import { PrimaryButton } from '../../../components/Buttons';
import { ASK_OPTION_BY_ID, OFFER_OPTION_BY_ID } from '../../../lib/eventIntentOptions';
import { EVENT_INTENT_DEFAULTS } from '../../../lib/eventIntentConfig';
import { logSessionEvent } from '../../../lib/api/instrumentation';
import { colors, spacing, fonts } from '../../../lib/theme';

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
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <Pressable onPress={handleCancel} hitSlop={10}>
          <Ionicons name="close" size={22} color={colors.textTertiary} />
        </Pressable>
      </View>

      <IntentCard
        label="I'm asking for"
        style={styles.firstCard}
        selectedIds={askIds}
        optionMap={ASK_OPTION_BY_ID}
        max={EVENT_INTENT_DEFAULTS.maximumAskSelections}
        onRemove={removeAsk}
        onOpenPicker={() => setAskPickerOpen(true)}
        needsDetail={askNeedsDetail}
        detailValue={askDetail}
        onDetailChange={setAskDetail}
        detailPlaceholder="e.g. Intros to seed investors in climate tech"
      />

      <IntentCard
        label="I can offer"
        selectedIds={offerIds}
        optionMap={OFFER_OPTION_BY_ID}
        max={EVENT_INTENT_DEFAULTS.maximumOfferSelections}
        onRemove={removeOffer}
        onOpenPicker={() => setOfferPickerOpen(true)}
        needsDetail={offerNeedsDetail}
        detailValue={offerDetail}
        onDetailChange={setOfferDetail}
        detailPlaceholder="e.g. Hands-on experience scaling a marketplace to Series A"
      />

      <View style={styles.footer}>
        <PrimaryButton label="Find my matches" loading={isSaving} disabled={!canSave} onPress={handleSave} />
        <Pressable style={styles.notNowButton} onPress={handleCancel} disabled={isSaving}>
          <Text style={styles.notNowText}>{wasCompleteOnLoad ? 'Cancel' : 'Not now'}</Text>
        </Pressable>
      </View>

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

function IntentCard({
  label,
  style,
  selectedIds,
  optionMap,
  max,
  onRemove,
  onOpenPicker,
  needsDetail,
  detailValue,
  onDetailChange,
  detailPlaceholder,
}: {
  label: string;
  style?: object;
  selectedIds: string[];
  optionMap: Record<string, { label: string }>;
  max: number;
  onRemove: (id: string) => void;
  onOpenPicker: () => void;
  needsDetail: boolean;
  detailValue: string;
  onDetailChange: (v: string) => void;
  detailPlaceholder: string;
}) {
  return (
    <Card style={[styles.card, style]}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardLabel}>{label}</Text>
        <View style={styles.spacer} />
        <Text style={styles.count}>
          {selectedIds.length} / {max}
        </Text>
      </View>

      <View style={styles.chipRow}>
        {selectedIds.map((optionId) => (
          <Chip key={optionId} label={optionMap[optionId]?.label ?? optionId} tone="selected" onRemove={() => onRemove(optionId)} />
        ))}
        {selectedIds.length < max ? (
          <Chip label={selectedIds.length === 0 ? 'Add' : 'One more'} tone="dashed" icon="add" onPress={onOpenPicker} />
        ) : null}
      </View>
      {needsDetail ? <Text style={styles.errorText}>Add a few words for "Other".</Text> : null}

      <View style={styles.divider} />
      <Text style={styles.helper}>Add a detail and the matching gets sharper</Text>
      <TextInput
        style={styles.input}
        value={detailValue}
        onChangeText={onDetailChange}
        placeholder={detailPlaceholder}
        placeholderTextColor={colors.textMuted}
        multiline
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  content: { padding: spacing.gutter },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  spacer: { flex: 1 },
  card: { marginBottom: 16 },
  firstCard: { marginTop: 16 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  cardLabel: { fontFamily: fonts.wordmark, fontSize: 17, fontWeight: '700', color: colors.brass },
  count: { fontFamily: fonts.wordmark, fontSize: 11, fontWeight: '600', color: colors.textMuted },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  errorText: { fontFamily: fonts.wordmark, fontSize: 12, color: colors.error, marginTop: 8 },
  divider: { height: 1, backgroundColor: colors.ruleInner, marginTop: 14, marginBottom: 12 },
  helper: { fontFamily: fonts.wordmark, fontSize: 15, color: colors.textTertiary, marginBottom: 8 },
  input: { fontFamily: fonts.wordmark, fontSize: 13, color: colors.ink, minHeight: 40, textAlignVertical: 'top', padding: 0 },
  footer: { marginTop: 12 },
  notNowButton: { paddingVertical: 16, alignItems: 'center' },
  notNowText: { fontFamily: fonts.wordmark, color: colors.textTertiary, fontSize: 14, fontWeight: '600' },
});

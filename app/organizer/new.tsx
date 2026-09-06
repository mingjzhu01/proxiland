import { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventForm, EMPTY_EVENT_FORM, formValuesToDraft, type EventFormValues } from '../../components/organizer/EventForm';
import { createEvent } from '../../lib/api/organizer';
import { colors, spacing, typeStyles } from '../../lib/theme';

export default function NewEvent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [values, setValues] = useState<EventFormValues>(EMPTY_EVENT_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      const id = await createEvent(formValuesToDraft(values));
      router.replace(`/organizer/${id}/manage`);
    } catch (error: any) {
      Alert.alert('Could not create event', error.message ?? String(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + 14 }]}>
      <View style={styles.topRow}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={22} color={colors.textTertiary} />
        </Pressable>
      </View>
      <Text style={styles.headline}>New event</Text>
      <EventForm values={values} onChange={setValues} onSubmit={handleSubmit} submitLabel="Create draft" isSubmitting={isSubmitting} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.gutter, paddingBottom: 60 },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  headline: { ...typeStyles.screenHeadline, marginTop: 12 },
});

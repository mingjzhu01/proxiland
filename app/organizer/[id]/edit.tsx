import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventForm, EMPTY_EVENT_FORM, formValuesToDraft, type EventFormValues } from '../../../components/organizer/EventForm';
import { getEventForEdit, updateEvent } from '../../../lib/api/organizer';
import { colors, spacing, typeStyles } from '../../../lib/theme';

export default function EditEvent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [values, setValues] = useState<EventFormValues>(EMPTY_EVENT_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const event = await getEventForEdit(id);
      if (event) {
        setValues({
          name: event.name ?? '',
          organizerName: event.organizer_name ?? '',
          description: event.description ?? '',
          venueName: event.venue_name ?? '',
          venueAddress: event.venue_address ?? '',
          lat: event.lat !== null ? String(event.lat) : '',
          lng: event.lng !== null ? String(event.lng) : '',
          radiusM: event.radius_m !== null ? String(event.radius_m) : '',
          startsAt: event.starts_at ? new Date(event.starts_at) : null,
          endsAt: event.ends_at ? new Date(event.ends_at) : null,
        });
      }
    } catch (error: any) {
      Alert.alert('Could not load event', error.message ?? String(error));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      await updateEvent(id, formValuesToDraft(values));
      router.back();
    } catch (error: any) {
      Alert.alert('Could not save changes', error.message ?? String(error));
    } finally {
      setIsSubmitting(false);
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
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + 14 }]}>
      <View style={styles.topRow}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={22} color={colors.textTertiary} />
        </Pressable>
      </View>
      <Text style={styles.headline}>Edit event</Text>
      <EventForm values={values} onChange={setValues} onSubmit={handleSubmit} submitLabel="Save changes" isSubmitting={isSubmitting} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  content: { padding: spacing.gutter, paddingBottom: 60 },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  headline: { ...typeStyles.screenHeadline, marginTop: 12 },
});

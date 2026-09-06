// Shared create/edit form for organizer events — app/organizer/new.tsx and
// app/organizer/[id]/edit.tsx both render this with different initial values and a different
// submit handler. Coordinates are plain numeric fields (not a map picker) and timezone
// defaults to the organizer's own device zone, read-only — both deliberate scope cuts for the
// pilot, not oversights.
import { View, Text, TextInput, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Card } from '../Card';
import { PrimaryButton } from '../Buttons';
import { colors, spacing, fonts } from '../../lib/theme';
import type { EventDraft } from '../../lib/api/organizer';

export type EventFormValues = {
  name: string;
  organizerName: string;
  description: string;
  venueName: string;
  venueAddress: string;
  lat: string;
  lng: string;
  radiusM: string;
  startsAt: Date | null;
  endsAt: Date | null;
};

export const EMPTY_EVENT_FORM: EventFormValues = {
  name: '',
  organizerName: '',
  description: '',
  venueName: '',
  venueAddress: '',
  lat: '',
  lng: '',
  radiusM: '150',
  startsAt: null,
  endsAt: null,
};

export function formValuesToDraft(values: EventFormValues): EventDraft {
  const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const lat = values.lat.trim() ? Number(values.lat.trim()) : null;
  const lng = values.lng.trim() ? Number(values.lng.trim()) : null;
  const radiusM = values.radiusM.trim() ? Number(values.radiusM.trim()) : null;
  return {
    name: values.name.trim(),
    organizerName: values.organizerName.trim() || null,
    description: values.description.trim() || null,
    venueName: values.venueName.trim() || null,
    venueAddress: values.venueAddress.trim() || null,
    lat: lat !== null && !Number.isNaN(lat) ? lat : null,
    lng: lng !== null && !Number.isNaN(lng) ? lng : null,
    radiusM: radiusM !== null && !Number.isNaN(radiusM) ? radiusM : null,
    startsAt: values.startsAt ? values.startsAt.toISOString() : null,
    endsAt: values.endsAt ? values.endsAt.toISOString() : null,
    timezone: deviceTimezone,
  };
}

function combineDateAndTime(existing: Date | null, patch: Date, part: 'date' | 'time'): Date {
  const base = existing ? new Date(existing) : new Date();
  if (part === 'date') {
    base.setFullYear(patch.getFullYear(), patch.getMonth(), patch.getDate());
  } else {
    base.setHours(patch.getHours(), patch.getMinutes(), 0, 0);
  }
  return base;
}

type Props = {
  values: EventFormValues;
  onChange: (values: EventFormValues) => void;
  onSubmit: () => void;
  submitLabel: string;
  isSubmitting: boolean;
};

export function EventForm({ values, onChange, onSubmit, submitLabel, isSubmitting }: Props) {
  const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const canSubmit = values.name.trim().length > 0;

  function set<K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  return (
    <View>
      <FieldLabel>Event name</FieldLabel>
      <TextInput style={styles.input} value={values.name} onChangeText={(t) => set('name', t)} placeholder="e.g. Founders Coffee — September" placeholderTextColor={colors.textMuted} />

      <FieldLabel>Host / organiser name</FieldLabel>
      <TextInput style={styles.input} value={values.organizerName} onChangeText={(t) => set('organizerName', t)} placeholder="Shown to attendees" placeholderTextColor={colors.textMuted} />

      <FieldLabel>Description</FieldLabel>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={values.description}
        onChangeText={(t) => set('description', t)}
        placeholder="One or two sentences attendees see before joining"
        placeholderTextColor={colors.textMuted}
        multiline
      />

      <FieldLabel>Venue name</FieldLabel>
      <TextInput style={styles.input} value={values.venueName} onChangeText={(t) => set('venueName', t)} placeholder="e.g. The Great Room, One George Street" placeholderTextColor={colors.textMuted} />

      <FieldLabel>Venue address</FieldLabel>
      <TextInput style={styles.input} value={values.venueAddress} onChangeText={(t) => set('venueAddress', t)} placeholder="Street address" placeholderTextColor={colors.textMuted} />

      <FieldLabel>Start</FieldLabel>
      <View style={styles.dateRow}>
        <DateTimePicker
          value={values.startsAt ?? new Date()}
          mode="date"
          display="compact"
          onChange={(_, d) => d && set('startsAt', combineDateAndTime(values.startsAt, d, 'date'))}
          style={styles.picker}
        />
        <DateTimePicker
          value={values.startsAt ?? new Date()}
          mode="time"
          display="compact"
          onChange={(_, d) => d && set('startsAt', combineDateAndTime(values.startsAt, d, 'time'))}
          style={styles.picker}
        />
      </View>

      <FieldLabel>End</FieldLabel>
      <View style={styles.dateRow}>
        <DateTimePicker
          value={values.endsAt ?? new Date()}
          mode="date"
          display="compact"
          onChange={(_, d) => d && set('endsAt', combineDateAndTime(values.endsAt, d, 'date'))}
          style={styles.picker}
        />
        <DateTimePicker
          value={values.endsAt ?? new Date()}
          mode="time"
          display="compact"
          onChange={(_, d) => d && set('endsAt', combineDateAndTime(values.endsAt, d, 'time'))}
          style={styles.picker}
        />
      </View>
      <Text style={styles.helper}>Times use your current timezone ({deviceTimezone}).</Text>

      <Card style={styles.geoCard}>
        <Text style={styles.geoTitle}>Optional: precise location</Text>
        <Text style={styles.geoHelper}>
          Only needed if you want Proxiland to prompt nearby attendees to join automatically. The
          event is fully joinable by QR code or event code either way.
        </Text>
        <View style={styles.dateRow}>
          <TextInput
            style={[styles.input, styles.coordInput]}
            value={values.lat}
            onChangeText={(t) => set('lat', t)}
            placeholder="Latitude"
            placeholderTextColor={colors.textMuted}
            keyboardType="numbers-and-punctuation"
          />
          <TextInput
            style={[styles.input, styles.coordInput]}
            value={values.lng}
            onChangeText={(t) => set('lng', t)}
            placeholder="Longitude"
            placeholderTextColor={colors.textMuted}
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <FieldLabel>Detection radius (metres)</FieldLabel>
        <TextInput
          style={styles.input}
          value={values.radiusM}
          onChangeText={(t) => set('radiusM', t)}
          placeholder="150"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
        />
      </Card>

      <PrimaryButton label={submitLabel} loading={isSubmitting} disabled={!canSubmit} onPress={onSubmit} style={styles.submit} />
    </View>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  fieldLabel: { fontFamily: fonts.wordmark, fontSize: 12.5, color: colors.textTertiary, marginBottom: 6, marginTop: 16 },
  input: {
    fontFamily: fonts.wordmark,
    fontSize: 15,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  dateRow: { flexDirection: 'row', gap: 10 },
  picker: { flex: 1 },
  coordInput: { flex: 1 },
  helper: { fontFamily: fonts.wordmark, fontSize: 12, color: colors.textMuted, marginTop: 6 },
  geoCard: { marginTop: 20, backgroundColor: colors.surfaceSunken },
  geoTitle: { fontFamily: fonts.wordmark, fontSize: 14, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  geoHelper: { fontFamily: fonts.wordmark, fontSize: 12.5, color: colors.textTertiary, lineHeight: 18, marginBottom: 12 },
  submit: { marginTop: 28, marginBottom: 12 },
});

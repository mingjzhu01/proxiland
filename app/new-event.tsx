// Hosting entry point, open to any user with a completed profile (the server re-checks that in
// create_event — see migration 0063). Built to the events-entry handoff's state 5. The older
// admin form (components/organizer/EventForm) still backs the *edit* screen; this one is the
// only place events are created.
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { createEvent } from '../lib/api/organizer';
import { getMyProfile } from '../lib/api/profile';
import { requestForegroundLocationPermission, getCurrentCoords } from '../lib/location';
import { colors, fonts } from '../lib/theme';

const GUTTER = 18;
const DEFAULT_RADIUS_M = '150';

function combineDateAndTime(existing: Date, patch: Date, part: 'date' | 'time'): Date {
  const base = new Date(existing);
  if (part === 'date') {
    base.setFullYear(patch.getFullYear(), patch.getMonth(), patch.getDate());
  } else {
    base.setHours(patch.getHours(), patch.getMinutes(), 0, 0);
  }
  return base;
}

function formatDateChip(d: Date) {
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function formatTimeChip(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Start defaults to the next whole hour, end to an hour after that — a host filling this in is
// almost always scheduling something imminent, and two taps of a picker is worse than a sane
// default they can adjust.
function defaultStart() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

export default function NewEvent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [hostName, setHostName] = useState('');
  const [description, setDescription] = useState('');
  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [startsAt, setStartsAt] = useState<Date>(defaultStart);
  const [endsAt, setEndsAt] = useState<Date>(() => {
    const d = defaultStart();
    d.setHours(d.getHours() + 1);
    return d;
  });
  const [radiusM, setRadiusM] = useState(DEFAULT_RADIUS_M);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [picker, setPicker] = useState<
    { field: 'start' | 'end'; part: 'date' | 'time' } | null
  >(null);

  // The host's own name is the overwhelmingly common answer here, so prefill it; they can
  // still type over it if they're hosting on behalf of a company or group.
  useEffect(() => {
    getMyProfile()
      .then((p) => {
        if (p?.full_name) setHostName((current) => (current === '' ? p.full_name! : current));
      })
      .catch(() => {});
  }, []);

  const isDirty =
    name !== '' ||
    description !== '' ||
    venueName !== '' ||
    venueAddress !== '' ||
    coords !== null;

  const canSubmit = name.trim() !== '' && hostName.trim() !== '' && !isSubmitting;

  function handleClose() {
    if (!isDirty) {
      router.back();
      return;
    }
    Alert.alert('Discard this event?', "You'll lose what you've filled in.", [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  }

  async function handleUseCurrentLocation() {
    setIsLocating(true);
    try {
      const granted = await requestForegroundLocationPermission();
      if (!granted) {
        Alert.alert(
          'Location permission needed',
          'Proxiland needs location access to pin the event where you are. You can still create the event without it.'
        );
        return;
      }
      setCoords(await getCurrentCoords());
    } catch (error: any) {
      Alert.alert('Could not get your location', error.message ?? String(error));
    } finally {
      setIsLocating(false);
    }
  }

  async function handleCreate() {
    if (endsAt <= startsAt) {
      Alert.alert('Check the times', 'The end time needs to be after the start time.');
      return;
    }
    setIsSubmitting(true);
    try {
      const parsedRadius = parseInt(radiusM, 10);
      const { eventId, rawToken, rawShortCode } = await createEvent({
        name: name.trim(),
        organizerName: hostName.trim() || null,
        description: description.trim() || null,
        venueName: venueName.trim() || null,
        venueAddress: venueAddress.trim() || null,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        radiusM: coords && Number.isFinite(parsedRadius) ? parsedRadius : null,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      // The event is already live and joinable at this point. The share view (QR + code) isn't
      // designed yet — flagged as a follow-up in the handoff — so this lands on the existing
      // manage screen. The credentials go along as params: they're only ever returned once, and
      // without them the manage screen would have to rotate (invalidating this code) to show one.
      router.replace({
        pathname: '/organizer/[id]/manage',
        params: { id: eventId, token: rawToken, code: rawShortCode },
      });
    } catch (error: any) {
      Alert.alert('Could not create event', error.message ?? String(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  const pickerValue = picker?.field === 'end' ? endsAt : startsAt;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 22 }]}>
        <Pressable onPress={handleClose} hitSlop={12}>
          <Ionicons name="close" size={22} color={colors.brandMarkDark} />
        </Pressable>
        <Text style={styles.title}>New event</Text>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.form}
        keyboardShouldPersistTaps="handled"
      >
        <Field label="Event name">
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Founders Coffee — September"
            placeholderTextColor={colors.brandInk}
          />
        </Field>

        <Field label="Host / organiser name">
          <TextInput
            style={styles.input}
            value={hostName}
            onChangeText={setHostName}
            placeholder="Shown to attendees"
            placeholderTextColor={colors.brandInk}
          />
        </Field>

        <Field label="Description">
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="One or two sentences attendees see before joining"
            placeholderTextColor={colors.brandInk}
            multiline
          />
        </Field>

        <Field label="Venue name">
          <TextInput
            style={styles.input}
            value={venueName}
            onChangeText={setVenueName}
            placeholder="e.g. The Great Room, One George Street"
            placeholderTextColor={colors.brandInk}
          />
        </Field>

        <Field label="Venue address">
          <TextInput
            style={styles.input}
            value={venueAddress}
            onChangeText={setVenueAddress}
            placeholder="Street address"
            placeholderTextColor={colors.brandInk}
          />
        </Field>

        <View style={styles.timeRow}>
          <View style={styles.flex}>
            <Text style={styles.label}>Start</Text>
            <View style={styles.chipRow}>
              <Pressable
                style={[styles.chip, styles.chipGrow]}
                onPress={() => setPicker({ field: 'start', part: 'date' })}
              >
                <Text style={styles.chipText}>{formatDateChip(startsAt)}</Text>
              </Pressable>
              <Pressable style={styles.chip} onPress={() => setPicker({ field: 'start', part: 'time' })}>
                <Text style={styles.chipText}>{formatTimeChip(startsAt)}</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.flex}>
            <Text style={styles.label}>End</Text>
            <View style={styles.chipRow}>
              <Pressable
                style={[styles.chip, styles.chipGrow]}
                onPress={() => setPicker({ field: 'end', part: 'date' })}
              >
                <Text style={styles.chipText}>{formatDateChip(endsAt)}</Text>
              </Pressable>
              <Pressable style={styles.chip} onPress={() => setPicker({ field: 'end', part: 'time' })}>
                <Text style={styles.chipText}>{formatTimeChip(endsAt)}</Text>
              </Pressable>
            </View>
          </View>
        </View>
        <Text style={styles.helper}>Times use your timezone.</Text>

        {picker ? (
          <DateTimePicker
            value={pickerValue}
            mode={picker.part}
            display="spinner"
            onChange={(event, d) => {
              if (Platform.OS !== 'ios') setPicker(null);
              if (event.type === 'dismissed' || !d) return;
              const next = combineDateAndTime(pickerValue, d, picker.part);
              if (picker.field === 'start') setStartsAt(next);
              else setEndsAt(next);
            }}
          />
        ) : null}
        {picker && Platform.OS === 'ios' ? (
          <Pressable style={styles.pickerDone} onPress={() => setPicker(null)}>
            <Text style={styles.pickerDoneText}>Done</Text>
          </Pressable>
        ) : null}

        <View style={styles.locationCard}>
          <Text style={styles.locationTitle}>Optional: precise location</Text>
          <Text style={styles.locationBody}>
            Only needed if you want Proxiland to prompt nearby attendees to join automatically.
          </Text>

          <Pressable
            style={styles.locationButton}
            onPress={handleUseCurrentLocation}
            disabled={isLocating}
          >
            {isLocating ? (
              <ActivityIndicator size="small" color={colors.brandMarkDark} />
            ) : (
              <Ionicons
                name={coords ? 'checkmark-circle' : 'location-outline'}
                size={17}
                color={colors.brandMarkDark}
              />
            )}
            <Text style={styles.locationButtonText}>
              {coords ? 'Location set — tap to update' : 'Use my current location'}
            </Text>
          </Pressable>

          <Text style={styles.label2}>Detection radius (metres)</Text>
          <TextInput
            style={[styles.input, styles.radiusInput, !coords && styles.inputDisabled]}
            value={radiusM}
            onChangeText={setRadiusM}
            keyboardType="number-pad"
            editable={!!coords}
            placeholderTextColor={colors.brandInk}
          />
          {!coords ? (
            <Text style={styles.locationBody}>
              Set the location first — without it there's nothing to measure the radius from.
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={[styles.createButton, !canSubmit && styles.createButtonDisabled]}
          onPress={handleCreate}
          disabled={!canSubmit}
        >
          <Text style={styles.createButtonText}>{isSubmitting ? 'Creating…' : 'Create'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.brandMarkCream },
  flex: { flex: 1 },
  header: { paddingHorizontal: GUTTER },
  title: {
    fontFamily: fonts.wordmark,
    fontSize: 29,
    lineHeight: 31,
    color: colors.brandMarkDark,
    marginTop: 8,
  },
  form: { paddingHorizontal: GUTTER, paddingTop: 12, paddingBottom: 16, gap: 9 },
  label: {
    fontFamily: fonts.sansSemibold,
    fontSize: 13,
    color: colors.brandInk,
    marginBottom: 4,
  },
  label2: {
    fontFamily: fonts.sansSemibold,
    fontSize: 13,
    color: colors.brandInk,
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.brandSand,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 15,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.brandMarkDark,
  },
  inputDisabled: { opacity: 0.5 },
  multiline: { minHeight: 46, textAlignVertical: 'top' },
  timeRow: { flexDirection: 'row', gap: 12 },
  chipRow: { flexDirection: 'row', gap: 6 },
  chip: {
    backgroundColor: colors.insetPill,
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 13,
    alignItems: 'center',
  },
  chipGrow: { flex: 1, paddingHorizontal: 0 },
  chipText: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.brandMarkDark },
  helper: { fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18, color: colors.brandInk },
  pickerDone: { alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 4 },
  pickerDoneText: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.brandMarkDark },
  locationCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 16,
    padding: 13,
    marginTop: 4,
  },
  locationTitle: { fontFamily: fonts.sansSemibold, fontSize: 14.5, color: colors.brandMarkDark },
  locationBody: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.brandInk,
    marginTop: 5,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 13,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.brandSand,
  },
  locationButtonText: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.brandMarkDark },
  radiusInput: { borderRadius: 13 },
  footer: { paddingHorizontal: GUTTER, paddingTop: 8, backgroundColor: colors.brandMarkCream },
  createButton: {
    backgroundColor: colors.brandMarkDark,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  createButtonDisabled: { backgroundColor: colors.brandSand },
  createButtonText: {
    fontFamily: fonts.sansSemibold,
    fontSize: 16.5,
    color: colors.brandMarkCream,
  },
});

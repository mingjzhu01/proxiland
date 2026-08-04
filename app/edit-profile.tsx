// Shared edit screen: used both for first-time setup (routed here automatically when a
// signed-in user has no profile_attributes row yet, per lib/auth.tsx's hasProfile check)
// and for later edits (Profile tab's Edit button). Ends with a confirmation step showing
// the AI-assembled line, editable, before landing back on the locked Profile tab view.
import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { getMyProfile, upsertMyProfile, uploadProfilePhoto } from '../lib/api/profile';
import {
  getMyProfileAttributes,
  parseProfile,
  polishLine,
  updateQuickFields,
  saveEditedLine,
} from '../lib/api/onboarding';
import { useAuth } from '../lib/auth';
import { LinkedInVerifyButton } from '../components/LinkedInVerifyButton';
import type { GradDegreeType, Profile } from '../lib/types';
import {
  ROLE_CATEGORIES,
  SENIORITY_BANDS,
  INDUSTRIES,
  ROLE_CATEGORY_LABELS,
  SENIORITY_BAND_LABELS,
  INDUSTRY_LABELS,
  type RoleCategory,
  type SeniorityBand,
  type Industry,
} from '../lib/allowedValues';

const GRAD_DEGREE_OPTIONS: GradDegreeType[] = ['Masters', 'MBA', 'PhD'];

type Stage = 'form' | 'confirm';

const emptyProfile: Omit<Profile, 'id' | 'created_at'> = {
  full_name: '',
  headline: '',
  employer: '',
  title: '',
  undergrad_school: '',
  undergrad_year: '',
  grad_degree_type: null,
  grad_school: '',
  grad_year: '',
  photo_url: '',
  bio: '',
  linkedin_verified: false,
  linkedin_url: '',
};

export default function EditProfile() {
  const router = useRouter();
  const { refreshHasProfile } = useAuth();
  const [stage, setStage] = useState<Stage>('form');

  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Omit<Profile, 'id' | 'created_at'>>(emptyProfile);

  const [roleCategory, setRoleCategory] = useState<RoleCategory | null>(null);
  const [roleOther, setRoleOther] = useState(false);
  const [industry, setIndustry] = useState<Industry | null>(null);
  const [industryOther, setIndustryOther] = useState(false);
  const [seniorityBand, setSeniorityBand] = useState<SeniorityBand | null>(null);
  const [lookingFor, setLookingFor] = useState('');
  const [canOffer, setCanOffer] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [originalLine, setOriginalLine] = useState('');
  const [editedLine, setEditedLine] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [existingUserEdited, setExistingUserEdited] = useState(false);

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    setUserId(userData.user?.id ?? null);

    const p = await getMyProfile();
    if (p) setProfile(p);

    const attrs = await getMyProfileAttributes();
    if (attrs) {
      setRoleCategory(attrs.role_category);
      setIndustry(attrs.industry);
      setSeniorityBand(attrs.seniority_band);
      setLookingFor(attrs.looking_for ?? '');
      setCanOffer(attrs.can_offer ?? '');
      setExistingUserEdited(attrs.user_edited);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handlePickPhoto() {
    if (!userId) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;

    try {
      const url = await uploadProfilePhoto(userId, result.assets[0].uri);
      setProfile((p) => ({ ...p, photo_url: url }));
    } catch (error: any) {
      Alert.alert('Upload failed', error.message);
    }
  }

  function toggleGradDegreeType(type: GradDegreeType) {
    setProfile((p) => ({
      ...p,
      grad_degree_type: p.grad_degree_type === type ? null : type,
    }));
  }

  async function handleSave() {
    if (!profile.full_name.trim()) {
      Alert.alert('Name required', 'Please enter your name.');
      return;
    }
    if (!seniorityBand || (!roleCategory && !roleOther) || (!industry && !industryOther)) {
      Alert.alert('A few more taps', 'Pick a role, industry, and seniority (or "Other" and describe it below).');
      return;
    }
    if ((roleOther || industryOther) && !(profile.bio ?? '').trim()) {
      Alert.alert(
        'Tell us more',
        'You picked "Other" for role or industry — describe yourself in the box below so we know what to show.'
      );
      return;
    }
    if (existingUserEdited && (roleOther || industryOther)) {
      Alert.alert(
        'Not available here',
        'You\'ve hand-edited your line, so it\'s never auto-regenerated — which means "Other" (which relies on the AI reading your bio) isn\'t available. Pick an actual role/industry chip, or edit your line directly on the next screen.'
      );
      return;
    }

    const derivedSchool = (profile.grad_school ?? '').trim() || (profile.undergrad_school ?? '').trim() || undefined;

    setIsSubmitting(true);
    try {
      await upsertMyProfile(profile);

      let line: string;

      if (existingUserEdited) {
        // parse-profile refuses to touch anything on a row with user_edited=true (by
        // design — see saveEditedLine) — so field changes have to go straight to the
        // table instead, and the hand-edited line stays exactly as it was.
        await updateQuickFields({
          role_category: roleCategory!,
          industry: industry!,
          seniority_band: seniorityBand,
          school: derivedSchool ?? null,
          looking_for: lookingFor.trim() || null,
          can_offer: canOffer.trim() || null,
        });
        const attrs = await getMyProfileAttributes();
        line = attrs?.line_polished ?? attrs?.line_assembled ?? '';
      } else {
        await parseProfile({
          rawText: (profile.bio ?? '').trim(),
          quickFields: {
            role_category: roleOther ? undefined : roleCategory ?? undefined,
            industry: industryOther ? undefined : industry ?? undefined,
            seniority_band: seniorityBand,
            school: derivedSchool,
            looking_for: lookingFor.trim() || undefined,
            can_offer: canOffer.trim() || undefined,
          },
        });
        const { line_assembled, line_polished } = await polishLine();
        line = line_polished ?? line_assembled;
      }

      setOriginalLine(line);
      setEditedLine(line);
      setStage('confirm');
    } catch (error: any) {
      Alert.alert('Something went wrong', error.message ?? String(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirm() {
    setIsSaving(true);
    try {
      if (editedLine.trim() !== originalLine.trim()) {
        await saveEditedLine(editedLine);
      }
      await refreshHasProfile();
      router.replace('/(tabs)/profile');
    } catch (error: any) {
      Alert.alert('Could not save', error.message ?? String(error));
    } finally {
      setIsSaving(false);
    }
  }

  if (stage === 'confirm') {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>This is how you'll appear</Text>
          <Text style={styles.subtitle}>Edit it if it's not quite right — it's yours.</Text>

          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={editedLine}
            onChangeText={setEditedLine}
            multiline
          />

          <Pressable
            style={[styles.button, isSaving && styles.buttonDisabled]}
            onPress={handleConfirm}
            disabled={isSaving}
          >
            <Text style={styles.buttonText}>{isSaving ? 'Saving…' : 'Looks good'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Your profile</Text>

        <Pressable style={styles.avatarWrap} onPress={handlePickPhoto}>
          {profile.photo_url ? (
            <Image source={{ uri: profile.photo_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarPlaceholderText}>Add photo</Text>
            </View>
          )}
        </Pressable>

        <Field label="Name" value={profile.full_name} onChangeText={(v) => setProfile((p) => ({ ...p, full_name: v }))} />

        <Text style={styles.sectionLabel}>Role</Text>
        <View style={styles.chipRow}>
          {ROLE_CATEGORIES.map((option) => (
            <Chip
              key={option}
              label={ROLE_CATEGORY_LABELS[option]}
              selected={roleCategory === option && !roleOther}
              onPress={() => {
                setRoleCategory(option);
                setRoleOther(false);
              }}
            />
          ))}
          <Chip
            label="Other"
            selected={roleOther}
            onPress={() => {
              setRoleOther(true);
              setRoleCategory(null);
            }}
          />
        </View>
        {roleOther ? <Text style={styles.hint}>Describe your role in the box below.</Text> : null}

        <Text style={styles.sectionLabel}>Industry</Text>
        <View style={styles.chipRow}>
          {INDUSTRIES.map((option) => (
            <Chip
              key={option}
              label={INDUSTRY_LABELS[option]}
              selected={industry === option && !industryOther}
              onPress={() => {
                setIndustry(option);
                setIndustryOther(false);
              }}
            />
          ))}
          <Chip
            label="Other"
            selected={industryOther}
            onPress={() => {
              setIndustryOther(true);
              setIndustry(null);
            }}
          />
        </View>
        {industryOther ? <Text style={styles.hint}>Describe your industry in the box below.</Text> : null}

        <Text style={styles.sectionLabel}>Seniority</Text>
        <View style={styles.chipRow}>
          {SENIORITY_BANDS.map((option) => (
            <Chip
              key={option}
              label={SENIORITY_BAND_LABELS[option]}
              selected={seniorityBand === option}
              onPress={() => setSeniorityBand(option)}
            />
          ))}
        </View>

        <Text style={styles.sectionLabel}>Undergrad</Text>
        <View style={styles.row}>
          <Field
            label="School"
            value={profile.undergrad_school ?? ''}
            onChangeText={(v) => setProfile((p) => ({ ...p, undergrad_school: v }))}
            containerStyle={styles.rowFieldWide}
          />
          <Field
            label="Year"
            value={profile.undergrad_year ?? ''}
            onChangeText={(v) => setProfile((p) => ({ ...p, undergrad_year: v }))}
            keyboardType="number-pad"
            containerStyle={styles.rowFieldNarrow}
          />
        </View>

        <Text style={styles.sectionLabel}>Advanced degree</Text>
        <View style={styles.chipRow}>
          {GRAD_DEGREE_OPTIONS.map((type) => (
            <Chip
              key={type}
              label={type}
              selected={profile.grad_degree_type === type}
              onPress={() => toggleGradDegreeType(type)}
            />
          ))}
        </View>
        {profile.grad_degree_type ? (
          <View style={styles.row}>
            <Field
              label="School"
              value={profile.grad_school ?? ''}
              onChangeText={(v) => setProfile((p) => ({ ...p, grad_school: v }))}
              containerStyle={styles.rowFieldWide}
            />
            <Field
              label="Year"
              value={profile.grad_year ?? ''}
              onChangeText={(v) => setProfile((p) => ({ ...p, grad_year: v }))}
              keyboardType="number-pad"
              containerStyle={styles.rowFieldNarrow}
            />
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Employer &amp; title</Text>
        <Field label="Employer" value={profile.employer ?? ''} onChangeText={(v) => setProfile((p) => ({ ...p, employer: v }))} />
        <Field label="Title" value={profile.title ?? ''} onChangeText={(v) => setProfile((p) => ({ ...p, title: v }))} />
        <Field label="Headline" value={profile.headline ?? ''} onChangeText={(v) => setProfile((p) => ({ ...p, headline: v }))} />

        <Text style={styles.sectionLabel}>About you</Text>
        <Text style={styles.hint}>
          Type, paste your resume, or tap the mic on your keyboard to dictate. This is also what
          the AI reads to figure out your details if you picked "Other" above.
        </Text>
        <Field
          label="Bio"
          value={profile.bio ?? ''}
          onChangeText={(v) => setProfile((p) => ({ ...p, bio: v }))}
          multiline
        />

        <Field
          label="What are you looking for? (optional)"
          value={lookingFor}
          onChangeText={(v) => setLookingFor(v.slice(0, 60))}
        />
        <Field
          label="What can you offer? (optional)"
          value={canOffer}
          onChangeText={(v) => setCanOffer(v.slice(0, 60))}
        />

        <Text style={styles.sectionLabel}>LinkedIn</Text>
        <Field
          label="Profile URL (shown to others)"
          value={profile.linkedin_url ?? ''}
          onChangeText={(v) => setProfile((p) => ({ ...p, linkedin_url: v }))}
        />
        {profile.linkedin_verified ? (
          <Text style={styles.verifiedBadge}>✓ LinkedIn Verified</Text>
        ) : (
          <>
            <Text style={styles.linkedinNudge}>
              Verifying adds a trust signal to your profile, shown to everyone who views it.
            </Text>
            <LinkedInVerifyButton onVerified={load} />
          </>
        )}

        <Pressable
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={isSubmitting}
        >
          <Text style={styles.buttonText}>{isSubmitting ? 'One sec…' : 'Save profile'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  multiline,
  keyboardType,
  containerStyle,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad';
  containerStyle?: object;
}) {
  return (
    <View style={[styles.field, containerStyle]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
      />
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, selected && styles.chipSelected]} onPress={onPress}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 60, gap: 4 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
  avatarWrap: { alignSelf: 'center', marginBottom: 20 },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: { backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' },
  avatarPlaceholderText: { color: '#888', fontSize: 12 },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 13, color: '#666', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 15 },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#333', marginTop: 14, marginBottom: 8 },
  hint: { fontSize: 12, color: '#888', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 10 },
  rowFieldWide: { flex: 2 },
  rowFieldNarrow: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  chipSelected: { backgroundColor: '#111', borderColor: '#111' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#555' },
  chipTextSelected: { color: '#fff' },
  button: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 24 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  linkedinNudge: { fontSize: 12, color: '#888', marginBottom: 8, textAlign: 'center' },
  verifiedBadge: { color: '#0A66C2', fontWeight: '700', fontSize: 14, textAlign: 'center', marginBottom: 14 },
});

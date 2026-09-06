// Shared edit screen: used both for first-time setup (routed here automatically when a
// signed-in user has no profile_attributes row yet, per lib/auth.tsx's hasProfile check)
// and for later edits (Profile tab's Edit button). Ends with a confirmation step showing
// the AI-assembled line, editable, before landing back on the locked Profile tab view.
import { useCallback, useMemo, useState } from 'react';
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
  Modal,
  FlatList,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { getMyProfile, upsertMyProfile, uploadProfilePhoto } from '../lib/api/profile';
import { draftBio, type DraftBioFields, type DraftBioResult } from '../lib/api/draftBio';
import {
  getMyProfileAttributes,
  parseProfile,
  polishLine,
  updateQuickFields,
  saveEditedLine,
  clearUserEdited,
} from '../lib/api/onboarding';
import { useAuth } from '../lib/auth';
import { LinkedInVerifyButton } from '../components/LinkedInVerifyButton';
import type { GradDegreeType, Profile } from '../lib/types';
import SCHOOL_NAMES from '../lib/schoolNames.json';
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
import { fonts } from '../lib/theme';

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
  const [roleOtherText, setRoleOtherText] = useState('');
  const [industry, setIndustry] = useState<Industry | null>(null);
  const [industryOther, setIndustryOther] = useState(false);
  const [industryPickerVisible, setIndustryPickerVisible] = useState(false);
  const [industrySearch, setIndustrySearch] = useState('');
  const [seniorityBand, setSeniorityBand] = useState<SeniorityBand | null>(null);
  const [lookingFor, setLookingFor] = useState('');
  const [canOffer, setCanOffer] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [originalLine, setOriginalLine] = useState('');
  const [editedLine, setEditedLine] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [existingUserEdited, setExistingUserEdited] = useState(false);

  const [draftStatus, setDraftStatus] = useState<'idle' | 'loading' | 'found' | 'fallback' | 'error'>('idle');
  const [draftResult, setDraftResult] = useState<DraftBioResult | null>(null);
  const [bioCaption, setBioCaption] = useState<string | null>(null);

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

  const canDraftBio = !!profile.full_name.trim() && !!((profile.undergrad_school ?? '').trim() || (profile.employer ?? '').trim());

  function currentDraftFields(): DraftBioFields {
    return {
      name: profile.full_name.trim(),
      school: (profile.undergrad_school ?? '').trim() || undefined,
      gradYear: (profile.undergrad_year ?? '').trim() || undefined,
      advancedDegree: profile.grad_degree_type ?? undefined,
      employer: (profile.employer ?? '').trim() || undefined,
      title: (profile.title ?? '').trim() || undefined,
      role: roleOther ? roleOtherText.trim() || undefined : roleCategory ? ROLE_CATEGORY_LABELS[roleCategory] : undefined,
      industry: industryOther ? undefined : industry ? INDUSTRY_LABELS[industry] : undefined,
      seniority: seniorityBand ? SENIORITY_BAND_LABELS[seniorityBand] : undefined,
    };
  }

  async function handleDraftBio(skipSearch = false) {
    setDraftStatus('loading');
    setDraftResult(null);
    try {
      const result = await draftBio(currentDraftFields(), skipSearch);
      setDraftResult(result);
      setDraftStatus(result.status);
    } catch {
      setDraftResult(null);
      setDraftStatus('error');
    }
  }

  function applyDraftBio(bio: string) {
    function doApply() {
      const backfilled: string[] = [];
      setProfile((p) => {
        const next = { ...p, bio };
        // Backfill only fields the person left blank — never overwrite anything they
        // already typed, even if the AI found something different.
        if (draftResult?.status === 'found') {
          if (!p.title?.trim() && draftResult.title) {
            next.title = draftResult.title;
            backfilled.push('Title');
          }
          if (!p.employer?.trim() && draftResult.employer) {
            next.employer = draftResult.employer;
            backfilled.push('Employer');
          }
          if (!p.undergrad_school?.trim() && draftResult.undergrad_school) {
            next.undergrad_school = draftResult.undergrad_school;
            backfilled.push('School');
          }
          if (!p.grad_school?.trim() && draftResult.advanced_degree_school) {
            next.grad_school = draftResult.advanced_degree_school;
            backfilled.push('Advanced degree school');
            if (!p.grad_degree_type && draftResult.advanced_degree_type) {
              next.grad_degree_type = draftResult.advanced_degree_type as GradDegreeType;
            }
          }
          if (!p.linkedin_url?.trim() && draftResult.linkedin_url) {
            next.linkedin_url = draftResult.linkedin_url;
            backfilled.push('LinkedIn URL');
          }
        }
        return next;
      });
      const backfillNote = backfilled.length > 0 ? ` Also filled in: ${backfilled.join(', ')}.` : '';
      setBioCaption(
        draftResult?.status === 'found'
          ? `AI drafted from public info.${backfillNote} Review and edit before saving.`
          : 'AI drafted from your entries. Review and edit before saving.'
      );
      setDraftStatus('idle');
      setDraftResult(null);
    }

    if ((profile.bio ?? '').trim()) {
      Alert.alert('Replace your bio?', 'This will replace what you already wrote.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', style: 'destructive', onPress: doApply },
      ]);
    } else {
      doApply();
    }
  }

  function discardDraft() {
    const wasFound = draftResult?.status === 'found';
    setDraftStatus('idle');
    setDraftResult(null);
    if (wasFound) {
      // "Not me" — automatically fall back to a draft built only from entered fields.
      handleDraftBio(true);
    }
  }

  async function handleSave() {
    if (!profile.full_name.trim()) {
      Alert.alert('Name required', 'Please enter your name.');
      return;
    }
    if (!seniorityBand || (!roleCategory && !roleOther) || (!industry && !industryOther)) {
      Alert.alert('A few more taps', 'Pick a role, industry, and seniority (or "Other" and describe it).');
      return;
    }
    if (roleOther && !roleOtherText.trim()) {
      Alert.alert('Tell us more', 'You picked "Other" for role — type what you do in the box next to it.');
      return;
    }
    if (industryOther && !(profile.bio ?? '').trim()) {
      Alert.alert(
        'Tell us more',
        'You picked "Other" for industry — describe yourself in the box below so we know what to show.'
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
        const rawText = [
          roleOther && roleOtherText.trim() ? `My role: ${roleOtherText.trim()}.` : null,
          (profile.bio ?? '').trim() || null,
        ]
          .filter(Boolean)
          .join(' ');

        await parseProfile({
          rawText,
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

  async function handleRegenerate() {
    setIsRegenerating(true);
    try {
      await clearUserEdited();
      const { line_assembled, line_polished } = await polishLine();
      const line = line_polished ?? line_assembled;
      setOriginalLine(line);
      setEditedLine(line);
      setExistingUserEdited(false);
    } catch (error: any) {
      Alert.alert('Could not regenerate', error.message ?? String(error));
    } finally {
      setIsRegenerating(false);
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
            style={[styles.regenerateButton, isRegenerating && styles.buttonDisabled]}
            onPress={handleRegenerate}
            disabled={isRegenerating || isSaving}
          >
            <Ionicons name="sparkles" size={15} color="#3b5bdb" />
            <Text style={styles.regenerateButtonText}>
              {isRegenerating ? 'Regenerating…' : 'Not quite right — regenerate'}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.button, isSaving && styles.buttonDisabled]}
            onPress={handleConfirm}
            disabled={isSaving || isRegenerating}
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
        {roleOther ? (
          <TextInput
            style={[styles.input, styles.otherInput]}
            value={roleOtherText}
            onChangeText={setRoleOtherText}
            placeholder="What's your role?"
            autoFocus
          />
        ) : null}

        <Text style={styles.sectionLabel}>Industry</Text>
        <Pressable
          style={styles.dropdown}
          onPress={() => {
            setIndustrySearch('');
            setIndustryPickerVisible(true);
          }}
        >
          <Text style={industry || industryOther ? styles.dropdownText : styles.dropdownPlaceholder}>
            {industryOther ? 'Other' : industry ? INDUSTRY_LABELS[industry] : 'Select industry'}
          </Text>
        </Pressable>
        {industryOther ? <Text style={styles.hint}>Describe your industry in the box below.</Text> : null}

        <Modal visible={industryPickerVisible} animationType="slide" transparent>
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Select industry</Text>
              <TextInput
                style={[styles.input, styles.modalSearch]}
                value={industrySearch}
                onChangeText={setIndustrySearch}
                placeholder="Search industries…"
                autoFocus
              />
              <FlatList
                data={INDUSTRIES.filter((item) =>
                  INDUSTRY_LABELS[item].toLowerCase().includes(industrySearch.trim().toLowerCase())
                )}
                keyExtractor={(item) => item}
                style={styles.modalList}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.modalRow}
                    onPress={() => {
                      setIndustry(item);
                      setIndustryOther(false);
                      setIndustryPickerVisible(false);
                    }}
                  >
                    <Text style={[styles.modalRowText, industry === item && styles.modalRowTextSelected]}>
                      {INDUSTRY_LABELS[item]}
                    </Text>
                  </Pressable>
                )}
                ListEmptyComponent={<Text style={styles.modalEmpty}>No matches — try "Other" below.</Text>}
                ListFooterComponent={
                  <Pressable
                    style={styles.modalRow}
                    onPress={() => {
                      setIndustry(null);
                      setIndustryOther(true);
                      setIndustryPickerVisible(false);
                    }}
                  >
                    <Text style={[styles.modalRowText, industryOther && styles.modalRowTextSelected]}>Other</Text>
                  </Pressable>
                }
              />
              <Pressable style={styles.modalCancel} onPress={() => setIndustryPickerVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </Modal>

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
          <SchoolField
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
            <SchoolField
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

        <Text style={styles.sectionLabel}>Employer &amp; Title</Text>
        <Field label="Employer" value={profile.employer ?? ''} onChangeText={(v) => setProfile((p) => ({ ...p, employer: v }))} />
        <Field label="Title" value={profile.title ?? ''} onChangeText={(v) => setProfile((p) => ({ ...p, title: v }))} />

        <Text style={styles.sectionLabel}>About you</Text>
        <Text style={styles.hint}>
          Type, paste your resume, or tap the mic on your keyboard to dictate. This is also what
          the AI reads to figure out your details if you picked "Other" above.
        </Text>

        <Pressable
          style={[styles.draftButton, (!canDraftBio || draftStatus === 'loading') && styles.draftButtonDisabled]}
          onPress={() => handleDraftBio(false)}
          disabled={!canDraftBio || draftStatus === 'loading'}
        >
          <Ionicons name="sparkles" size={15} color={canDraftBio ? '#3b5bdb' : '#999'} />
          <Text style={[styles.draftButtonText, !canDraftBio && styles.draftButtonTextDisabled]}>
            {draftStatus === 'loading' ? 'Searching…' : 'Draft with AI'}
          </Text>
        </Pressable>
        {!canDraftBio ? (
          <Text style={styles.hint}>Add your name plus school or employer and AI can draft this for you.</Text>
        ) : null}

        {draftStatus === 'found' && draftResult?.status === 'found' ? (
          <View style={styles.draftCard}>
            <Text style={styles.draftCardLabel}>Found: {draftResult.matched_identity}</Text>
            <Text style={styles.draftCardBio}>{draftResult.bio}</Text>
            <View style={styles.draftCardActions}>
              <Pressable style={styles.draftCardButtonPrimary} onPress={() => applyDraftBio(draftResult.bio)}>
                <Text style={styles.draftCardButtonPrimaryText}>Use this draft</Text>
              </Pressable>
              <Pressable style={styles.draftCardButtonSecondary} onPress={discardDraft}>
                <Text style={styles.draftCardButtonSecondaryText}>Not me / discard</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {draftStatus === 'fallback' && draftResult?.status === 'fallback' ? (
          <View style={styles.draftCard}>
            <Text style={styles.draftCardLabel}>Drafted from your profile details</Text>
            <Text style={styles.draftCardBio}>{draftResult.bio}</Text>
            <View style={styles.draftCardActions}>
              <Pressable style={styles.draftCardButtonPrimary} onPress={() => applyDraftBio(draftResult.bio)}>
                <Text style={styles.draftCardButtonPrimaryText}>Use this draft</Text>
              </Pressable>
              <Pressable style={styles.draftCardButtonSecondary} onPress={discardDraft}>
                <Text style={styles.draftCardButtonSecondaryText}>Discard</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {draftStatus === 'error' ? (
          <Text style={styles.draftError}>Couldn't draft a bio right now. Type or dictate a few lines instead.</Text>
        ) : null}

        <Field
          label="Bio"
          value={profile.bio ?? ''}
          onChangeText={(v) => {
            setProfile((p) => ({ ...p, bio: v }));
            setBioCaption(null);
          }}
          multiline
        />
        {bioCaption ? <Text style={styles.bioCaption}>{bioCaption}</Text> : null}

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

// Type-ahead over a bundled ~10k-university dataset (lib/schoolNames.json). Never blocks
// free typing — tapping a suggestion just fills the field faster, but any text the user
// types (including schools not in the list) is kept as-is.
function SchoolField({
  label,
  value,
  onChangeText,
  containerStyle,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  containerStyle?: object;
}) {
  const [focused, setFocused] = useState(false);

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (q.length < 2) return [];
    const startsWith: string[] = [];
    const contains: string[] = [];
    for (const name of SCHOOL_NAMES as string[]) {
      const lower = name.toLowerCase();
      if (lower.startsWith(q)) {
        if (startsWith.length < 8) startsWith.push(name);
      } else if (lower.includes(q)) {
        if (contains.length < 8) contains.push(name);
      }
      if (startsWith.length >= 8 && contains.length >= 8) break;
    }
    return [...startsWith, ...contains].slice(0, 8);
  }, [value]);

  return (
    <View style={[styles.field, containerStyle]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
      />
      {focused && suggestions.length > 0 ? (
        <View style={styles.suggestionsBox}>
          {suggestions.map((name) => (
            <Pressable
              key={name}
              style={styles.suggestionRow}
              onPress={() => {
                onChangeText(name);
                setFocused(false);
              }}
            >
              <Text style={styles.suggestionText}>{name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
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
  title: { fontFamily: fonts.wordmark, fontSize: 26, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontFamily: fonts.wordmark, fontSize: 14, color: '#666', marginBottom: 20 },
  avatarWrap: { alignSelf: 'center', marginBottom: 20 },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: { backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' },
  avatarPlaceholderText: { fontFamily: fonts.wordmark, color: '#888', fontSize: 12 },
  field: { marginBottom: 14 },
  suggestionsBox: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginTop: 4,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  suggestionRow: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  suggestionText: { fontFamily: fonts.wordmark, fontSize: 14, color: '#111' },
  fieldLabel: { fontFamily: fonts.wordmark, fontSize: 13, color: '#666', marginBottom: 4 },
  input: { fontFamily: fonts.wordmark, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 15 },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  sectionLabel: { fontFamily: fonts.wordmark, fontSize: 13, fontWeight: '700', color: '#333', marginTop: 14, marginBottom: 8 },
  hint: { fontFamily: fonts.wordmark, fontSize: 12, color: '#888', marginBottom: 8 },
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
  chipText: { fontFamily: fonts.wordmark, fontSize: 13, fontWeight: '600', color: '#555' },
  chipTextSelected: { color: '#fff' },
  otherInput: { marginBottom: 8 },
  dropdown: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 4,
  },
  dropdownText: { fontFamily: fonts.wordmark, fontSize: 15, color: '#111' },
  dropdownPlaceholder: { fontFamily: fonts.wordmark, fontSize: 15, color: '#999' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 20,
    paddingHorizontal: 20,
    maxHeight: '70%',
  },
  modalTitle: { fontFamily: fonts.wordmark, fontSize: 18, fontWeight: '700', marginBottom: 12 },
  modalSearch: { marginBottom: 10 },
  modalEmpty: { textAlign: 'center', color: '#999', paddingVertical: 20 },
  modalList: { flexGrow: 0 },
  modalRow: { paddingVertical: 14, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  modalRowText: { fontFamily: fonts.wordmark, fontSize: 16, color: '#111' },
  modalRowTextSelected: { fontWeight: '700' },
  modalCancel: { alignItems: 'center', paddingVertical: 16 },
  modalCancelText: { fontFamily: fonts.wordmark, fontSize: 15, color: '#666' },
  draftButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderColor: '#3b5bdb',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  draftButtonDisabled: { borderColor: '#ddd' },
  draftButtonText: { fontFamily: fonts.wordmark, fontSize: 13, fontWeight: '600', color: '#3b5bdb' },
  draftButtonTextDisabled: { color: '#999' },
  regenerateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#3b5bdb',
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 16,
  },
  regenerateButtonText: { fontFamily: fonts.wordmark, fontSize: 14, fontWeight: '600', color: '#3b5bdb' },
  draftCard: {
    backgroundColor: '#eef1fd',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbe2fb',
    padding: 14,
    marginBottom: 12,
  },
  draftCardLabel: { fontFamily: fonts.wordmark, fontSize: 12, fontWeight: '700', color: '#3b5bdb', marginBottom: 6 },
  draftCardBio: { fontFamily: fonts.wordmark, fontSize: 14, color: '#222', lineHeight: 20, marginBottom: 12 },
  draftCardActions: { flexDirection: 'row', gap: 10 },
  draftCardButtonPrimary: { backgroundColor: '#111', borderRadius: 20, paddingVertical: 9, paddingHorizontal: 16 },
  draftCardButtonPrimaryText: { fontFamily: fonts.wordmark, color: '#fff', fontSize: 13, fontWeight: '600' },
  draftCardButtonSecondary: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  draftCardButtonSecondaryText: { fontFamily: fonts.wordmark, color: '#555', fontSize: 13, fontWeight: '600' },
  draftError: { fontFamily: fonts.wordmark, fontSize: 12, color: '#a05a2c', marginBottom: 8 },
  bioCaption: { fontFamily: fonts.wordmark, fontSize: 12, color: '#888', marginTop: -10, marginBottom: 14 },
  button: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 24 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontFamily: fonts.wordmark, color: '#fff', fontSize: 16, fontWeight: '600' },
  linkedinNudge: { fontFamily: fonts.wordmark, fontSize: 12, color: '#888', marginBottom: 8, textAlign: 'center' },
  verifiedBadge: { fontFamily: fonts.wordmark, color: '#0A66C2', fontWeight: '700', fontSize: 14, textAlign: 'center', marginBottom: 14 },
});

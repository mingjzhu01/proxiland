// Absorbs what used to sit at the bottom of the main Profile scroll (sign-out, blocked
// users, delete account) into its own screen, per the visual redesign — those don't need to
// compete with the profile content for attention on every visit.
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, spacing, fonts } from '../lib/theme';

function SettingsRow({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Ionicons name={icon} size={19} color={danger ? colors.error : colors.textSecondary} />
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

export default function Settings() {
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <SettingsRow icon="people-outline" label="Blocked users" onPress={() => router.push('/blocked-users')} />
      </View>
      <View style={styles.section}>
        <SettingsRow icon="log-out-outline" label="Sign out" onPress={handleSignOut} />
      </View>
      <View style={styles.section}>
        <SettingsRow icon="trash-outline" label="Delete account" danger onPress={() => router.push('/delete-account')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, paddingTop: 12 },
  section: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.rule,
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.gutter,
    paddingVertical: 14,
  },
  rowLabel: { fontFamily: fonts.wordmark, flex: 1, fontSize: 15, color: colors.ink, fontWeight: '500' },
  rowLabelDanger: { color: colors.error },
});

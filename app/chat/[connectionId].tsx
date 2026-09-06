import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getMessages, sendMessage, subscribeToMessages, markConnectionRead, type Message } from '../../lib/api/messages';
import { getMyConnections, blockUser } from '../../lib/api/connections';
import { fetchOverlap, type Overlap } from '../../lib/api/reveal';
import { supabase } from '../../lib/supabase';
import { useMessagesBadge } from '../../lib/messagesBadge';
import { ReportSheet } from '../../components/ReportSheet';
import { LetteredAvatar } from '../../components/LetteredAvatar';
import { WhyYouTwo } from '../../components/WhyYouTwo';
import { colors, avatarSizes, spacing, radii, fonts } from '../../lib/theme';

export default function Chat() {
  const { connectionId } = useLocalSearchParams<{ connectionId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [otherName, setOtherName] = useState<string | null>(null);
  const [otherPhotoUrl, setOtherPhotoUrl] = useState<string | null>(null);
  const [otherRole, setOtherRole] = useState<string | null>(null);
  const [overlap, setOverlap] = useState<Overlap>(null);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const listRef = useRef<FlatList>(null);
  const { refresh: refreshMessagesBadge } = useMessagesBadge();

  function handleBlockOrReport() {
    if (!otherUserId) return;
    Alert.alert('Block or Report', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          try {
            await blockUser(otherUserId);
            router.back();
          } catch (error: any) {
            Alert.alert('Could not block', error.message ?? String(error));
          }
        },
      },
      { text: 'Report', onPress: () => setReportVisible(true) },
    ]);
  }

  useFocusEffect(
    useCallback(() => {
      if (!connectionId) return;

      let unsubscribe: (() => void) | undefined;

      (async () => {
        const { data: userData } = await supabase.auth.getUser();
        setMyId(userData.user?.id ?? null);

        try {
          setMessages(await getMessages(connectionId));
        } catch (error: any) {
          Alert.alert('Could not load messages', error.message);
        }

        const connections = await getMyConnections();
        const conn = connections.find((c) => c.id === connectionId);
        if (conn?.other) {
          setOtherUserId(conn.other.id);
          setOtherName(conn.other.full_name);
          setOtherPhotoUrl(conn.other.photo_url);
          setOtherRole([conn.other.title, conn.other.employer].filter(Boolean).join(' at '));
          fetchOverlap(conn.other.id).then(setOverlap).catch(() => setOverlap(null));
        }

        await markConnectionRead(connectionId);
        refreshMessagesBadge();

        unsubscribe = subscribeToMessages(connectionId, (message) => {
          setMessages((prev) => [...prev, message]);
          markConnectionRead(connectionId).then(refreshMessagesBadge);
        });
      })();

      return () => unsubscribe?.();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connectionId, refreshMessagesBadge])
  );

  async function handleSend() {
    const body = draft.trim();
    if (!body || !connectionId) return;

    setIsSending(true);
    setDraft('');
    try {
      await sendMessage(connectionId, body, otherUserId ?? undefined);
    } catch (error: any) {
      Alert.alert('Could not send message', error.message);
      setDraft(body);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Pressable style={styles.headerCenter} onPress={() => otherUserId && router.push(`/profile/${otherUserId}`)}>
          <LetteredAvatar name={otherName} photoUrl={otherPhotoUrl} size={avatarSizes.chatHeader} />
          <View>
            <Text style={styles.headerName}>{otherName ?? 'Chat'}</Text>
            {otherRole ? <Text style={styles.headerRole}>{otherRole}</Text> : null}
          </View>
        </Pressable>
        <Pressable onPress={handleBlockOrReport} hitSlop={12}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        style={styles.messageList}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListHeaderComponent={
          overlap ? (
            <View style={styles.originCard}>
              <WhyYouTwo reason={overlap.phrase} variant="plain" compact />
            </View>
          ) : null
        }
        ListEmptyComponent={<Text style={styles.empty}>No messages yet — say hi!</Text>}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.sender_id === myId ? styles.bubbleMine : styles.bubbleTheirs,
            ]}
          >
            <Text style={item.sender_id === myId ? styles.bubbleTextMine : styles.bubbleTextTheirs}>
              {item.body}
            </Text>
          </View>
        )}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Message"
          placeholderTextColor={colors.textMuted}
          multiline
        />
        <Pressable
          style={[styles.sendButton, (isSending || !draft.trim()) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={isSending || !draft.trim()}
        >
          <Ionicons name="arrow-up" size={18} color={colors.inkOn} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
    <ReportSheet
      visible={reportVisible}
      targetUserId={otherUserId}
      context="chat"
      onClose={() => setReportVisible(false)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.gutter,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.paper,
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerName: { fontFamily: fonts.wordmark, fontSize: 15.5, fontWeight: '600', color: colors.ink },
  headerRole: { fontFamily: fonts.wordmark, fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
  messageList: { flex: 1 },
  list: { padding: spacing.gutter, gap: 9, flexGrow: 1 },
  originCard: {
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  empty: { fontFamily: fonts.wordmark, textAlign: 'center', color: colors.textMuted, fontSize: 14, marginTop: 40 },
  bubble: { maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: colors.ink, alignSelf: 'flex-end', borderRadius: 16, borderBottomRightRadius: 5 },
  bubbleTheirs: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.rule,
    alignSelf: 'flex-start',
    borderRadius: 16,
    borderBottomLeftRadius: 5,
  },
  bubbleTextMine: { fontFamily: fonts.wordmark, color: colors.inkOn, fontSize: 15, lineHeight: 21 },
  bubbleTextTheirs: { fontFamily: fonts.wordmark, color: colors.ink, fontSize: 15, lineHeight: 21 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
    borderColor: colors.rule,
  },
  input: { fontFamily: fonts.wordmark,
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.ink,
    maxHeight: 100,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.4 },
});

import { useEffect, useState } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRequestsBadge } from '../../lib/requestsBadge';
import { useMessagesBadge } from '../../lib/messagesBadge';
import { logSessionEvent } from '../../lib/api/instrumentation';
import { IntentStatePrompt } from '../../components/IntentStatePrompt';
import { colors, fonts } from '../../lib/theme';

// Tab bar geometry from the events-entry handoff: 16px equal top/bottom padding around a
// 23px icon + 5px gap + 12px label column. Declared rather than measured because the create
// overlay's scrim has to stop exactly at the bar's top edge, and a layout-measured height
// would make the scrim pop in a frame late.
const TAB_ICON_SIZE = 23;
const TAB_BAR_CONTENT_HEIGHT = 16 + TAB_ICON_SIZE + 5 + 15 + 16;

export default function TabsLayout() {
  const { pendingCount } = useRequestsBadge();
  const { unreadCount } = useMessagesBadge();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [createMenuOpen, setCreateMenuOpen] = useState(false);

  useEffect(() => {
    logSessionEvent('session_open');
  }, []);

  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  return (
    <View style={styles.root}>
      <IntentStatePrompt />
      <Tabs
        screenOptions={{
          // Each tab already carries its own name via the bottom bar — no need for a second,
          // native header repeating it at the top too.
          headerShown: false,
          tabBarActiveTintColor: colors.brandMarkDark,
          tabBarInactiveTintColor: colors.brandInk,
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            borderTopColor: colors.hairline,
            borderTopWidth: 1,
            height: tabBarHeight,
            paddingTop: 16,
            paddingBottom: insets.bottom + 16,
            paddingHorizontal: 14,
          },
          tabBarItemStyle: { gap: 5 },
          // Weight is per-state (600 active, 400 inactive), which a static tabBarLabelStyle
          // can't express — so the label is rendered rather than styled.
          tabBarLabel: ({ focused, color, children }) => (
            <Text
              style={{
                fontFamily: focused ? fonts.sansSemibold : fonts.sans,
                fontSize: 12,
                color,
              }}
            >
              {children}
            </Text>
          ),
          tabBarBadgeStyle: { backgroundColor: colors.brass, color: colors.inkOn },
        }}
      >
        <Tabs.Screen
          name="nearby"
          options={{
            title: 'Nearby',
            tabBarIcon: ({ color }) => <Ionicons name="navigate" color={color} size={TAB_ICON_SIZE} />,
          }}
        />
        <Tabs.Screen
          name="requests"
          options={{
            title: 'Requests',
            tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
            // Person-with-plus, not a paper plane: these are connection requests, and the
            // handoff calls the distinction out explicitly.
            tabBarIcon: ({ color }) => <Ionicons name="person-add" color={color} size={TAB_ICON_SIZE} />,
          }}
        />
        {/* Center slot. This screen is never navigated to — its button opens the create overlay
            instead — but it has to exist as a route for the tab bar to lay out five even
            columns. `href: null` would remove the column entirely, so the press is intercepted
            on the button itself. */}
        <Tabs.Screen
          name="create"
          options={{
            title: ' ',
            tabBarButton: (props) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create an event"
                style={styles.createSlot}
                onPress={() => setCreateMenuOpen((open) => !open)}
              >
                {({ pressed }) => (
                  <View style={[styles.createCircle, pressed && styles.createCirclePressed]}>
                    <Ionicons name="add" size={22} color={colors.brandMarkCream} />
                  </View>
                )}
              </Pressable>
            ),
          }}
        />
        <Tabs.Screen
          name="connections"
          options={{
            title: 'People',
            tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
            tabBarIcon: ({ color }) => <Ionicons name="people" color={color} size={TAB_ICON_SIZE} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'You',
            tabBarIcon: ({ color }) => <Ionicons name="person" color={color} size={TAB_ICON_SIZE} />,
          }}
        />
      </Tabs>

      {createMenuOpen ? (
        <>
          {/* Stops at the bar's top edge so the tab bar stays lit and interactive above it. */}
          <Pressable
            style={[styles.scrim, { bottom: tabBarHeight }]}
            onPress={() => setCreateMenuOpen(false)}
          />
          <View style={[styles.createTileWrap, { bottom: tabBarHeight + 10 }]}>
            {/* Join lives here too (nearby_3a): once the user is in an event, Nearby no longer
                shows the "At an event?" card, so this is the way to join another. Routes to
                the existing scanner, which links on to code entry. */}
            <Pressable
              style={styles.createTile}
              onPress={() => {
                setCreateMenuOpen(false);
                router.push('/scan-event');
              }}
            >
              <Ionicons name="qr-code-outline" size={20} color={colors.brandMarkCream} />
              <Text style={styles.createTileLabel}>Join an event</Text>
            </Pressable>
            <Pressable
              style={styles.createTile}
              onPress={() => {
                setCreateMenuOpen(false);
                router.push('/new-event');
              }}
            >
              <Ionicons name="add" size={20} color={colors.brandMarkCream} />
              <Text style={styles.createTileLabel}>Create an event</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  createSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  createCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.brandMarkDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createCirclePressed: { transform: [{ scale: 0.92 }] },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.scrim },
  createTileWrap: { position: 'absolute', left: 96, right: 96, gap: 8 },
  createTile: {
    backgroundColor: colors.brandMarkDark,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 7,
    shadowColor: 'rgba(84,66,54,1)',
    shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 8,
  },
  createTileLabel: {
    fontFamily: fonts.sansSemibold,
    fontSize: 14.5,
    color: colors.brandMarkCream,
  },
});

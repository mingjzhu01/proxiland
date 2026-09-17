import { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRelationships } from '../../lib/relationships';
import { useActiveEvent } from '../../lib/eventContext';
import { logSessionEvent } from '../../lib/api/instrumentation';
import { IntentStatePrompt } from '../../components/IntentStatePrompt';
import { EventConnectionsSheet } from '../../components/EventConnectionsSheet';
import { colors, fonts } from '../../lib/theme';

// Three tabs — Discover · Connections · You — per the discover-events handoff. The bar's
// geometry (14 top / 20 bottom around a 23px icon + 5px gap + 12px label) is declared so
// screens can reserve exactly this much at the bottom of their scroll content.
const TAB_ICON_SIZE = 23;
const TAB_BAR_CONTENT_HEIGHT = 14 + TAB_ICON_SIZE + 5 + 15 + 20;

export default function TabsLayout() {
  const { badgeCount } = useRelationships();
  const { activeEvent } = useActiveEvent();
  const insets = useSafeAreaInsets();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    logSessionEvent('session_open');
  }, []);

  return (
    <View style={styles.root}>
      <IntentStatePrompt />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.brandMarkDark,
          tabBarInactiveTintColor: colors.brandInk,
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            borderTopColor: colors.hairline,
            borderTopWidth: 1,
            height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
            paddingTop: 14,
            paddingBottom: insets.bottom + 20,
            paddingHorizontal: 14,
          },
          tabBarItemStyle: { gap: 5 },
          // Weight is per-state (600 active, 400 inactive), which a static label style can't
          // express — so the label is rendered rather than styled.
          tabBarLabel: ({ focused, color, children }) => (
            <Text style={{ fontFamily: focused ? fonts.sansSemibold : fonts.sans, fontSize: 12, color }}>
              {children}
            </Text>
          ),
          tabBarBadgeStyle: {
            backgroundColor: colors.brandMarkDark,
            color: colors.brandMarkCream,
            fontFamily: fonts.sansSemibold,
            fontSize: 11,
            borderWidth: 1.5,
            borderColor: colors.tabBar,
          },
        }}
      >
        <Tabs.Screen
          name="discover"
          options={{
            title: 'Discover',
            tabBarIcon: ({ color }) => <Ionicons name="paper-plane" color={color} size={TAB_ICON_SIZE} />,
          }}
        />
        <Tabs.Screen
          name="connections"
          options={{
            title: 'Connections',
            // Unreviewed incoming requests only — the one request badge in the app.
            tabBarBadge: badgeCount > 0 ? badgeCount : undefined,
            tabBarAccessibilityLabel:
              badgeCount > 0
                ? `Connections, ${badgeCount} ${badgeCount === 1 ? 'request' : 'requests'} received`
                : 'Connections',
            tabBarIcon: ({ color }) => <Ionicons name="people" color={color} size={TAB_ICON_SIZE} />,
          }}
          listeners={{
            // Inside an event, this tab raises the event's connections sheet over the event
            // instead of navigating away; anywhere else it's the global Connections screen.
            tabPress: (e) => {
              if (activeEvent) {
                e.preventDefault();
                setSheetOpen(true);
              }
            },
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

      <EventConnectionsSheet visible={sheetOpen} event={activeEvent} onClose={() => setSheetOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

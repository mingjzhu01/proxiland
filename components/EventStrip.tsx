// Nearby's joined-events strip, per the nearby_3a handoff: one compact chip per event in a
// horizontal scroller with a fixed vertical footprint — ten events are the same height as two.
// Exactly one chip is filled (the most recently joined, which get_my_active_events returns
// first); the rest are outlined. The dashes below track scroll position, not which chip is
// filled, and only appear once there's something to scroll between.
import { useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../lib/theme';

const GUTTER = 18;
const CHIP_GAP = 9;
const CHIP_MAX_WIDTH = 190;

export function EventStrip({
  events,
  onPressEvent,
}: {
  events: { id: string; name: string | null }[];
  onPressEvent: (eventId: string) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const chipOffsets = useRef<number[]>([]);

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        scrollEventThrottle={32}
        onScroll={(e) => {
          const x = e.nativeEvent.contentOffset.x;
          let nearest = 0;
          let best = Infinity;
          chipOffsets.current.forEach((offset, i) => {
            const d = Math.abs(offset - GUTTER - x);
            if (d < best) {
              best = d;
              nearest = i;
            }
          });
          if (nearest !== activeIndex) setActiveIndex(nearest);
        }}
      >
        {events.map((event, index) => {
          const filled = index === 0;
          return (
            <Pressable
              key={event.id}
              style={[styles.chip, filled ? styles.chipFilled : styles.chipOutlined]}
              onPress={() => onPressEvent(event.id)}
              onLayout={(e) => {
                chipOffsets.current[index] = e.nativeEvent.layout.x;
              }}
            >
              <Ionicons
                name="people"
                size={17}
                color={filled ? colors.brandMarkCream : colors.brandMarkDark}
              />
              <Text
                style={[styles.chipLabel, filled ? styles.chipLabelFilled : styles.chipLabelOutlined]}
                numberOfLines={1}
              >
                {event.name ?? 'Event'}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {events.length > 1 ? (
        <View style={styles.indicator}>
          {events.map((event, index) => (
            <View
              key={event.id}
              style={[styles.dash, index === activeIndex ? styles.dashActive : styles.dashInactive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: GUTTER, gap: CHIP_GAP },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 11,
    paddingHorizontal: 15,
    borderRadius: 16,
    maxWidth: CHIP_MAX_WIDTH,
    minHeight: 44,
  },
  chipFilled: { backgroundColor: colors.brandMarkDark },
  chipOutlined: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.brandSand,
    // Keeps the outlined chip the same height as the filled one despite its border.
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  chipLabel: { fontFamily: fonts.sansSemibold, fontSize: 14.5, flexShrink: 1 },
  chipLabelFilled: { color: colors.brandMarkCream },
  chipLabelOutlined: { color: colors.brandMarkDark },
  indicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    paddingTop: 11,
  },
  dash: { height: 3, borderRadius: 2 },
  dashActive: { width: 16, backgroundColor: colors.brandMarkDark },
  dashInactive: { width: 6, backgroundColor: colors.brandSand },
});

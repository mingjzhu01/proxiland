import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  LayoutChangeEvent,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { fonts } from '../lib/theme';

const ITEM_HEIGHT = 44;
const VISIBLE_HEIGHT = 3 * ITEM_HEIGHT;
const MIN_HOUR = 1;
const MAX_HOUR = 24;
const HOURS = Array.from({ length: MAX_HOUR - MIN_HOUR + 1 }, (_, i) => i + MIN_HOUR);

type Props = {
  value: number;
  onChange: (hours: number) => void;
};

export function DurationPicker({ value, onChange }: Props) {
  const [containerHeight, setContainerHeight] = useState(0);

  function handleLayout(e: LayoutChangeEvent) {
    setContainerHeight(e.nativeEvent.layout.height);
  }

  function handleScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const offsetY = e.nativeEvent.contentOffset.y;
    const index = Math.round(offsetY / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(HOURS.length - 1, index));
    onChange(HOURS[clamped]);
  }

  const verticalPadding = Math.max(0, (containerHeight - ITEM_HEIGHT) / 2);
  const selectedIndex = Math.max(0, HOURS.indexOf(value));

  return (
    <View style={styles.row}>
      <View style={styles.pickerWrap} onLayout={handleLayout}>
        <View pointerEvents="none" style={styles.centerIndicator} />
        {containerHeight > 0 ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            snapToInterval={ITEM_HEIGHT}
            decelerationRate="fast"
            contentContainerStyle={{ paddingVertical: verticalPadding }}
            onMomentumScrollEnd={handleScrollEnd}
            onScrollEndDrag={handleScrollEnd}
            contentOffset={{ x: 0, y: selectedIndex * ITEM_HEIGHT }}
          >
            {HOURS.map((h) => (
              <Pressable key={h} style={styles.item} onPress={() => onChange(h)}>
                <Text style={[styles.itemText, h === value && styles.itemTextSelected]}>{h}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>
      <Text style={styles.valueLabel}>
        hour{value === 1 ? '' : 's'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  pickerWrap: { height: VISIBLE_HEIGHT, width: 80, justifyContent: 'center' },
  centerIndicator: {
    position: 'absolute',
    top: '50%',
    marginTop: -ITEM_HEIGHT / 2,
    width: '100%',
    height: ITEM_HEIGHT,
    borderRadius: 10,
    backgroundColor: '#111',
  },
  item: { height: ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center' },
  itemText: { fontFamily: fonts.wordmark, fontSize: 17, color: '#999' },
  itemTextSelected: { color: '#fff', fontWeight: '700' },
  valueLabel: { fontFamily: fonts.wordmark, fontSize: 15, fontWeight: '700', color: '#111' },
});

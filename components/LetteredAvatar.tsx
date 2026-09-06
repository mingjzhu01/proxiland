import { View, Text, Image, StyleSheet } from 'react-native';
import { colors, fonts } from '../lib/theme';

type Props = {
  name: string | null;
  photoUrl?: string | null;
  size: number;
};

// avatarGround circle, Newsreader initial in avatarLetter. Real photo_url images replace
// this at the same size/radius when present — the lettered circle is the fallback, not
// the design.
export function LetteredAvatar({ name, photoUrl, size }: Props) {
  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 };

  if (photoUrl) {
    return <Image source={{ uri: photoUrl }} style={[styles.image, dimensionStyle]} />;
  }

  const initial = (name?.trim()?.[0] ?? '?').toUpperCase();
  return (
    <View style={[styles.circle, dimensionStyle]}>
      <Text style={[styles.letter, { fontFamily: fonts.wordmark, fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.avatarGround },
  circle: { backgroundColor: colors.avatarGround, alignItems: 'center', justifyContent: 'center' },
  letter: { fontFamily: fonts.serif, color: colors.avatarLetter },
});

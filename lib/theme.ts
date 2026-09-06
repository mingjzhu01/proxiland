// Design tokens for the "Warm Ledger" visual system — see
// design_handoff_visual_system/README.md for the full rationale and screen-by-screen spec.
// Every color/type/spacing value here is final per that handoff; don't hand-roll a one-off
// value in a screen when a token here already covers it.

export const colors = {
  paper: '#F7F3EC',
  paperEvent: '#FBF7F0',
  surface: '#FFFFFF',
  surfaceSunken: '#FCFAF6',
  brand: '#4A3B31',
  ink: '#241C16',
  inkOn: '#F7F3EC',
  textSecondary: '#6B5F52',
  textTertiary: '#5E5449',
  textMuted: '#6E6357',
  rule: '#E4DACB',
  ruleInner: '#EFE7DA',
  brass: '#8A6A2F',
  brassOnDark: '#E8C98A',
  brassChipBg: '#F1E7D4',
  brassChipText: '#7A5C26',
  neutralChipBg: '#F2EDE4',
  live: '#3F6B4F',
  liveChipBg: '#EDF2EE',
  liveChipText: '#31563E',
  avatarGround: '#E9DFCF',
  avatarLetter: '#4A3B31',
  redactBarSub: '#DED3C2',
  dashedBorder: '#CFC2AE',
  // Not part of the palette itself — the codebase's existing error red, kept separate per
  // the handoff ("take it from the codebase's existing error color, not from this palette").
  error: '#cc3333',
} as const;

export const fonts = {
  // Loaded via useFonts() in app/_layout.tsx before the splash hides — see that file.
  wordmark: 'YesevaOne_400Regular',
  // Founder call: use Yeseva One everywhere for now, including what was previously
  // Newsreader-only display text — an alias here (rather than rewriting every typeStyle
  // that references `fonts.serif`) so it's a one-line change to split them again later.
  // Newsreader_400Regular is still loaded in _layout.tsx in case that split comes back.
  serif: 'YesevaOne_400Regular',
} as const;

export const radii = {
  card: 16,
  button: 12,
  pill: 999,
  segmentedOuter: 11,
  segmentedInner: 9,
  iconButton: 10,
  sheet: 22,
} as const;

export const spacing = {
  gutter: 20,
  cardPadding: 16,
} as const;

export const typeStyles = {
  wordmark: { fontFamily: fonts.wordmark, fontSize: 42, lineHeight: 45 },
  tagline: {
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: 0.28,
    color: 'rgba(247,243,236,.78)',
  },
  screenHeadline: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 34, letterSpacing: -0.3, color: colors.ink },
  eventTitle: { fontFamily: fonts.serif, fontSize: 29, lineHeight: 33, color: colors.inkOn },
  matchRationale: { fontFamily: fonts.serif, fontSize: 19, lineHeight: 27, color: colors.ink },
  matchRationaleChat: { fontFamily: fonts.serif, fontSize: 17, lineHeight: 24, color: colors.ink },
  cardName: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.17, color: colors.ink },
  cardSubtitle: { fontSize: 13.5, color: colors.textSecondary },
  cardTertiary: { fontSize: 12.5, color: colors.textMuted },
  anonLine: { fontSize: 16.5, fontWeight: '500' as const, lineHeight: 23, color: colors.ink },
  sectionLabel: {
    fontFamily: fonts.wordmark,
    fontSize: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.6,
  },
  chip: { fontSize: 11, fontWeight: '600' as const },
  primaryButton: { fontSize: 15, fontWeight: '600' as const },
  body: { fontSize: 14, lineHeight: 21 },
  helper: { fontSize: 12.5, lineHeight: 18.5, color: colors.textTertiary },
  tabLabel: { fontSize: 9.5, fontWeight: '600' as const },
} as const;

export const avatarSizes = {
  ownProfile: 72,
  matchCard: 52,
  messageRow: 50,
  attendeeRow: 46,
  anon: 44,
  compactRow: 40,
  chatHeader: 36,
} as const;

export const shadows = {
  segmentActive: {
    shadowColor: 'rgba(36,28,22,.10)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 3,
    elevation: 1,
  },
} as const;

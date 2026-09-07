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
  // A denser/darker brass for small type that needs to read clearly at a glance (e.g. the
  // "WHY YOU TWO" label on match cards) — `brass` alone is too light for that at 10px.
  brassDense: '#5C4620',
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

// Typography pairing: Yeseva One (display) + Source Sans 3 (everything else). Yeseva One only
// has one true weight loaded (400) — never apply fontWeight to text using `wordmark`, it fakes
// a bold that reads as muddy rather than emphatic. Source Sans 3 has two real weights loaded
// (400/600), so hierarchy that needs weight (names, headings, buttons, chips, tabs) goes
// through `sansSemibold`, not a synthetic bold on `sans`.
export const fonts = {
  // Loaded via useFonts() in app/_layout.tsx before the splash hides — see that file.
  // Reserved for the wordmark/logo "P" and main screen titles only — see typeStyles below.
  wordmark: 'YesevaOne_400Regular',
  sans: 'SourceSans3_400Regular',
  sansSemibold: 'SourceSans3_600SemiBold',
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
  // --- Yeseva One: wordmark + main screen titles only ---
  wordmark: { fontFamily: fonts.wordmark, fontSize: 42, lineHeight: 45 },
  screenHeadline: { fontFamily: fonts.wordmark, fontSize: 30, lineHeight: 34, letterSpacing: -0.3, color: colors.ink },
  eventTitle: { fontFamily: fonts.wordmark, fontSize: 29, lineHeight: 33, color: colors.inkOn },

  // --- Source Sans 3 Regular: body, bios, match explanations, instructional copy ---
  tagline: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: 0.28,
    color: 'rgba(247,243,236,.78)',
  },
  matchRationale: { fontFamily: fonts.sans, fontSize: 17, lineHeight: 25, color: colors.ink },
  matchRationaleChat: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 23, color: colors.ink },
  cardSubtitle: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.textSecondary },
  cardTertiary: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textMuted },
  anonLine: { fontFamily: fonts.sans, fontSize: 16.5, lineHeight: 24, color: colors.ink },
  body: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 21 },
  helper: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, color: colors.textTertiary },

  // --- Source Sans 3 Semibold: section headings, card titles, person names, buttons, chips,
  // tabs, form labels — a real semibold face now, not a synthetic bold on a display serif. ---
  cardName: { fontFamily: fonts.sansSemibold, fontSize: 17, letterSpacing: -0.1, color: colors.ink },
  sectionLabel: {
    fontFamily: fonts.sansSemibold,
    fontSize: 10.5,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.4,
  },
  chip: { fontFamily: fonts.sansSemibold, fontSize: 12 },
  primaryButton: { fontFamily: fonts.sansSemibold, fontSize: 15 },
  tabLabel: { fontFamily: fonts.sansSemibold, fontSize: 9.5 },
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

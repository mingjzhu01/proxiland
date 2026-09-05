// Centralized so these numbers aren't hard-coded independently across the picker UI, the
// server-side validation in upsert_event_intent, and the Event screen's Top Matches / Shared
// Overlap bucketing. The server-side validation is authoritative — this is what the client
// mirrors so people see the limit before hitting a save error, not instead of it.
export const EVENT_INTENT_DEFAULTS = {
  intentRequiredForMatching: true,
  intentRequiredForDiscoverability: true,
  minimumAskSelections: 1,
  minimumOfferSelections: 1,
  maximumAskSelections: 3,
  maximumOfferSelections: 3,
  allowOptionalDetailText: true,
  showAllAttendees: true,
  allAttendeesPlacement: 'secondary' as const,
  // Bucketing thresholds for the Event screen's Top Matches / Shared Overlap sections.
  // Judgment calls, not spec-mandated numbers — worth revisiting once there's real usage data.
  topMatchesLimit: 5,
  sharedOverlapLimit: 3,
  strongIntentComplementThreshold: 0.3,
  meaningfulOverlapThreshold: 0.25,
};

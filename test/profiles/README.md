# Profile parsing test fixtures

Per spec v4, section 6, job 1: "Keep a folder `test/profiles/` with about twenty example
inputs and the fields you expect from each. Any model change or upgrade is then a
five-minute check rather than a guess."

Each `NNN.json` file has:
- `input` — raw text as a user might paste/type it into the sign-up open text box.
- `expected` — the `profile_attributes` fields a correct `parse-profile` call should produce.
- `note` — what this specific case is testing for (an edge case, a disambiguation, a known
  gap in the allowed-value lists, etc.) — read this before treating a mismatch as a bug.

**Status: 12 of the ~20 target.** Covers the worked example from the spec itself, the
identification-risk example from section 8, minimal/degenerate input, role/industry
disambiguation when multiple roles or industries are mentioned, tenure-band anchoring to
the *current* role, and a full realistic resume paste (the app's own demo/reviewer bio).
Worth adding: non-English or code-switched input, a case with an explicit `looking_for`/
`can_offer` pair, and a deliberately adversarial input (someone pasting another real
person's LinkedIn bio) once the reveal/anonymization steps are built.

There is no automated runner yet — comparing `parse-profile` output against these fixtures
is currently manual. A small script that POSTs each `input` to the deployed function and
diffs against `expected` would be a reasonable follow-up once `ANTHROPIC_API_KEY` is set
and the function has been exercised a few times by hand.

#!/usr/bin/env node
// Creates a v2 event (a scopes row with kind='venue') and generates its QR join code.
// Internal tool only — no organizer-facing UI is in scope for the MVP (per
// v2-implementation-plan.md, open item 4). Re-run safely produces a new event each time;
// there's no dedupe, so don't run it twice for the same event.
//
// Usage:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/create-event.mjs \
//     --name "Founders Coffee — Sept" \
//     --organizer "Proxiland" \
//     --description "Weekly founder meetup" \
//     --lat 1.2839 --lng 103.8607 --radius 150 \
//     --starts "2026-09-10T09:00:00+08:00" --ends "2026-09-10T12:00:00+08:00" \
//     --identity-mode full_required --join-mode geofence_prompt \
//     --matching-mode hybrid_ai --overlap-mode lower_ranked
//
// SUPABASE_URL falls back to EXPO_PUBLIC_SUPABASE_URL from .env if not set separately.
// Only --name is required; lat/lng are optional (an event with no coordinates just can't be
// geofence-detected — it's still joinable by QR). Outputs the raw join token, the
// proxiland://event-join/<token> deep link, and a scannable QR PNG next to this script.

import { createClient } from '@supabase/supabase-js';
import { randomBytes, createHash } from 'crypto';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import QRCode from 'qrcode';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing env vars. Required: SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[key] = value;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (!args.name) {
  console.error('Missing required --name "<event name>"');
  process.exit(1);
}

const VALID_IDENTITY_MODES = ['full_required', 'user_choice', 'hidden_until_connected'];
const VALID_JOIN_MODES = ['geofence_prompt', 'auto_join', 'qr_only'];
const VALID_MATCHING_MODES = ['hybrid_ai', 'ai_only', 'deterministic_only'];
const VALID_OVERLAP_MODES = ['lower_ranked', 'separate_section', 'hidden'];

const identityMode = args['identity-mode'] || 'full_required';
const joinMode = args['join-mode'] || 'geofence_prompt';
const matchingMode = args['matching-mode'] || 'hybrid_ai';
const overlapMode = args['overlap-mode'] || 'lower_ranked';

for (const [value, valid, flag] of [
  [identityMode, VALID_IDENTITY_MODES, '--identity-mode'],
  [joinMode, VALID_JOIN_MODES, '--join-mode'],
  [matchingMode, VALID_MATCHING_MODES, '--matching-mode'],
  [overlapMode, VALID_OVERLAP_MODES, '--overlap-mode'],
]) {
  if (!valid.includes(value)) {
    console.error(`Invalid ${flag} "${value}". Must be one of: ${valid.join(', ')}`);
    process.exit(1);
  }
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const rawToken = randomBytes(24).toString('base64url');
const tokenHash = createHash('sha256').update(rawToken).digest('hex');

// Matches the existing convention in lib/api/visibility.ts — geography(point,4326) accepts
// a plain WKT string with no SRID prefix (4326 is the column's default).
const center =
  args.lat && args.lng ? `POINT(${Number(args.lng)} ${Number(args.lat)})` : null;

async function main() {
  const { data, error } = await admin
    .from('scopes')
    .insert({
      kind: 'venue',
      name: args.name,
      organizer_name: args.organizer || null,
      description: args.description || null,
      center,
      radius_m: args.radius ? Number(args.radius) : null,
      starts_at: args.starts || null,
      ends_at: args.ends || null,
      identity_mode: identityMode,
      join_mode: joinMode,
      matching_mode: matchingMode,
      overlap_display_mode: overlapMode,
      qr_join_token_hash: tokenHash,
      status: 'active',
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create event:', error.message);
    process.exit(1);
  }

  const deepLink = `proxiland://event-join/${rawToken}`;

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const qrPath = path.join(__dirname, `event-qr-${data.id}.png`);
  await QRCode.toFile(qrPath, deepLink, { width: 600, margin: 2 });

  console.log('Event created.');
  console.log('  id:', data.id);
  console.log('  deep link:', deepLink);
  console.log('  QR code saved to:', qrPath);
  console.log(
    '\nThe raw token above is shown once — it is not stored anywhere (only its hash is). ' +
      'If you lose the QR image, there is no way to recover the same link; create a new event instead.'
  );
}

main();

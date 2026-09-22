/**
 * `POST /api/match/[id]/simulate` — pvp_match T5 (D7).
 *
 * Simulates one 1-based series game of a PvP match server-side, so neither client can
 * invent a result. Thin glue: auth + load + write live here, the actual rules and the
 * engine call live in `@/lib/matchSimulate` (unit-tested without Next or Supabase).
 *
 * Writes are service-role only (D2: "game results are written by the simulate route with
 * the service role, not by clients") with a version-CAS update, matching every other
 * `matches` mutation's optimistic-concurrency contract even though this one route bypasses
 * the security-definer RPCs. `match_expire` (D8) runs first through the CALLER's client —
 * it only ever touches the caller's own matches, so it is safe to call before the
 * privileged load, and it keeps a match that has gone quiet from being simulated into.
 */

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { validateSimulateRequest, simulateMatchGame } from '@/lib/matchSimulate';
import type { Match } from '@/storage/matchTypes';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const game = (body as { game?: unknown } | null)?.game;
  if (typeof game !== 'number' || !Number.isInteger(game)) {
    return NextResponse.json({ error: 'bad_argument: game must be an integer' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

  // D8: only touches matches the caller participates in — safe ahead of the service-role
  // load below, and keeps a stale invite/idle match from being simulated into.
  await supabase.rpc('match_expire', { p_id: id });

  const admin = createSupabaseAdminClient();
  const { data: match, error: loadError } = await admin
    .from('matches')
    .select('*')
    .eq('id', id)
    .maybeSingle<Match>();
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!match) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const validation = validateSimulateRequest(match, user.id, game);
  if (validation.kind === 'error') {
    return NextResponse.json({ error: validation.reason }, { status: validation.status });
  }
  if (validation.kind === 'existing') {
    return NextResponse.json(validation.game, { status: 200 });
  }

  const matchGame = simulateMatchGame(match, game);

  const { data: updated, error: updateError } = await admin
    .from('matches')
    .update({ games: [...match.games, matchGame], version: match.version + 1 })
    .eq('id', id)
    .eq('version', match.version)
    .select('id')
    .maybeSingle();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  if (!updated) {
    // Lost the CAS race — someone else advanced this match's version. Reload: if the same
    // game number is now recorded (another request simulated it first), hand that back
    // idempotently; otherwise this really is a conflict.
    const { data: reloaded, error: reloadError } = await admin
      .from('matches')
      .select('*')
      .eq('id', id)
      .maybeSingle<Match>();
    if (reloadError) return NextResponse.json({ error: reloadError.message }, { status: 500 });
    const nowExisting = reloaded?.games.find((g) => g.game === game);
    if (nowExisting) return NextResponse.json(nowExisting, { status: 200 });
    return NextResponse.json({ error: 'version_mismatch' }, { status: 409 });
  }

  return NextResponse.json(matchGame, { status: 200 });
}

/**
 * `POST /api/match/[id]/advance` — pvp_series T3 (D2).
 *
 * The only writer of a series' progress once `status` is `'series'`: it decides whether the
 * next game should be simulated, whether the sideboard should open, or whether the series is
 * over — a participant can no longer request a specific game directly (that was the old
 * `/simulate` route, which this replaces; it let a client skip the "both have watched"
 * rule). Thin glue: auth + load + the CAS write loop live here, the rules live in
 * `@/lib/matchAdvance` (`planAdvance`, `applyPlan`) and the engine call in
 * `@/lib/matchSimulate` (`simulateMatchGame`), both unit-tested without Next or Supabase.
 *
 * `match_expire` (D8) runs first through the CALLER's client — it only ever touches
 * matches the caller participates in, so it is safe ahead of the privileged load, and it
 * keeps a match that has gone quiet (7-day forfeit) from being advanced into.
 *
 * The loop applies `planAdvance` at most `MAX_ADVANCE_STEPS` times (a fresh series can go
 * from "both rosters just locked" straight through game 1, and a 4-0 sweep needs at most 4
 * simulates + 1 possible sideboard step; 8 is headroom). Each step is one version-CAS
 * write; on a lost CAS (another request — or another call of this same route — advanced
 * the row first) it reloads and re-plans from the fresh row, so two callers racing each
 * other never produce two copies of the same game: `planAdvance` only ever proposes the
 * next unplayed game number, taken from the row it was just handed.
 */

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { planAdvance, applyPlan } from '@/lib/matchAdvance';
import { simulateMatchGame } from '@/lib/matchSimulate';
import type { Match } from '@/storage/matchTypes';

export const runtime = 'nodejs';

const MAX_ADVANCE_STEPS = 8;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

  // D8: only touches matches the caller participates in — safe ahead of the service-role
  // load below, and keeps a stale invite/idle match from being simulated into.
  await supabase.rpc('match_expire', { p_id: id });

  const admin = createSupabaseAdminClient();
  const { data: loaded, error: loadError } = await admin
    .from('matches')
    .select('*')
    .eq('id', id)
    .maybeSingle<Match>();
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!loaded) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (loaded.host_id !== user.id && loaded.guest_id !== user.id) {
    return NextResponse.json({ error: 'not_participant' }, { status: 403 });
  }

  let match = loaded;
  const ids = { hostId: match.host_id, guestId: match.guest_id };

  for (let step = 0; step < MAX_ADVANCE_STEPS; step++) {
    const plan = planAdvance(match, Date.now());
    if (plan.kind === 'wait') break;

    const patch: Partial<Match> | null = plan.kind === 'simulate'
      ? { games: [...match.games, simulateMatchGame(match, plan.game)] }
      : applyPlan(plan, ids);
    if (!patch) break;

    const { data: updated, error: updateError } = await admin
      .from('matches')
      .update({ ...patch, version: match.version + 1 })
      .eq('id', id)
      .eq('version', match.version)
      .select('*')
      .maybeSingle<Match>();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    if (updated) {
      match = updated;
      continue;
    }

    // Lost the CAS race — someone (another request, or a concurrent call of this same
    // route) advanced this match's version first. Reload and re-plan from the fresh row:
    // if that step was already applied (e.g. the same game already recorded), the next
    // `planAdvance` call sees it and moves on, so two racing callers never double-write.
    const { data: reloaded, error: reloadError } = await admin
      .from('matches')
      .select('*')
      .eq('id', id)
      .maybeSingle<Match>();
    if (reloadError) return NextResponse.json({ error: reloadError.message }, { status: 500 });
    if (!reloaded) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    match = reloaded;
  }

  return NextResponse.json({ match }, { status: 200 });
}

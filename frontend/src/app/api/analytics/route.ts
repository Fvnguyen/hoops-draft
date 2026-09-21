import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { DraftSession } from '@/engine/deckbuilder';
import type { Season } from '@/engine/season';
import { collectGames, computeGameStats, computeOwnerSummary, computeWinRateStats } from '@/lib/analyzeStats';

/**
 * accounts_cloud_saves D6: `scope=self` (default) returns the signed-in user's own
 * numbers — the `draft_sessions`/`seasons` select runs under their own session, so RLS's
 * "owner full access" policy already limits it to their rows; no service-role key
 * needed. `scope=all` is admin-only and uses the service-role client (RLS's "admin read
 * all" policy would also allow it, but the service-role client skips RLS evaluation
 * entirely, which is fine here since the ADMIN check below already gates it).
 *
 * Only `/admin/analytics` (T8) calls `scope=all` today; `scope=self` has no UI yet — it
 * exists so a future per-user stats page can call this route without any backend change.
 */
export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get('scope') === 'all' ? 'all' : 'self';

  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (scope === 'all' && profile.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const client = scope === 'all' ? createSupabaseAdminClient() : await createSupabaseServerClient();

  const [{ data: sessionRows, error: sessionsError }, { data: seasonRows, error: seasonsError }] = await Promise.all([
    // sync_outbox D5: a deleted row is kept as a tombstone (`deleted_at` set, `data` still
    // there so older clients don't choke), so analytics has to filter it out explicitly.
    client.from('draft_sessions').select('data').is('deleted_at', null),
    client.from('seasons').select('data').is('deleted_at', null),
  ]);
  const error = sessionsError ?? seasonsError;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sessions = (sessionRows ?? []).map((r) => r.data as DraftSession);
  const seasons = (seasonRows ?? []).map((r) => r.data as Season);
  const ownedGames = collectGames(seasons, sessions);
  const theaters = ownedGames.map((g) => g.theater);

  const gameStats = computeGameStats(theaters);
  const winRateStats = computeWinRateStats(theaters);

  if (scope === 'self') {
    return NextResponse.json({
      scope,
      gameStats,
      winRateStats,
      ownerSummary: computeOwnerSummary(sessions, ownedGames),
    });
  }

  const ownerIds = new Set<string>(sessions.map((s) => s.ownerId).filter((id): id is string => !!id));
  const owners = Array.from(ownerIds).sort().map((ownerId) => ({
    ownerId,
    ...computeOwnerSummary(sessions.filter((s) => s.ownerId === ownerId), ownedGames.filter((g) => g.ownerId === ownerId)),
  }));

  return NextResponse.json({ scope, gameStats, winRateStats, owners });
}

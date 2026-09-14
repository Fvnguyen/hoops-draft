import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { DraftSession } from '@/engine/deckbuilder';
import type { Season } from '@/engine/season';
import { collectGames, computeGameStats, computeOwnerSummary, computeWinRateStats } from '@/lib/analyzeStats';

function fmtPct(v: number | null): string {
  return v === null ? 'n/a' : `${v.toFixed(1)}%`;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-stone-800 bg-stone-900 p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

/**
 * accounts_cloud_saves T8/D6: cross-user analytics, `scope=all` — same
 * `analyzeStats.ts` functions `/api/analytics?scope=all` uses (queried directly here via
 * the admin client rather than a self-fetch, same pattern as `/admin/users`), so both
 * paths share one implementation. Admin-only, gated the same way as account approvals.
 */
export default async function AdminAnalyticsPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'APPROVED') redirect('/login');
  if (profile.role !== 'ADMIN') redirect('/');

  const admin = createSupabaseAdminClient();
  const [{ data: sessionRows, error: sessionsError }, { data: seasonRows, error: seasonsError }] = await Promise.all([
    admin.from('draft_sessions').select('data'),
    admin.from('seasons').select('data'),
  ]);
  const error = sessionsError ?? seasonsError;

  const sessions = (sessionRows ?? []).map((r) => r.data as DraftSession);
  const seasons = (seasonRows ?? []).map((r) => r.data as Season);
  const ownedGames = collectGames(seasons, sessions);
  const theaters = ownedGames.map((g) => g.theater);
  const gameStats = computeGameStats(theaters);
  const winRateStats = computeWinRateStats(theaters);

  const ownerIds = Array.from(new Set(sessions.map((s) => s.ownerId).filter((id): id is string => !!id))).sort();
  const owners = ownerIds.map((ownerId) => ({
    ownerId,
    ...computeOwnerSummary(sessions.filter((s) => s.ownerId === ownerId), ownedGames.filter((g) => g.ownerId === ownerId)),
  }));

  return (
    <main className="min-h-screen bg-stone-950 px-6 py-12 text-white">
      <div className="mx-auto max-w-4xl">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-yellow-400">Commissioner tools</p>
        <h1 className="mb-2 font-display text-6xl italic">ANALYTICS</h1>
        <p className="mb-8 text-stone-400">Cloud-synced draft &amp; game data across every owner.</p>

        {error ? (
          <p role="alert" className="border border-red-400/40 bg-red-950/40 p-4 text-red-200">Unable to load analytics: {error.message}</p>
        ) : (
          <>
            <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Owners" value={String(owners.length)} />
              <StatCard label="Draft sessions" value={String(sessions.length)} />
              <StatCard label="Games" value={String(gameStats.games)} />
              <StatCard label="Home win %" value={fmtPct(gameStats.homeWinPct)} />
              <StatCard label="Score mean" value={gameStats.scoreMean.toFixed(1)} />
              <StatCard label="Margin mean" value={gameStats.marginMean.toFixed(1)} />
              <StatCard label="OT %" value={fmtPct(gameStats.otPct)} />
              <StatCard label="Possessions with a call" value={fmtPct(gameStats.possessionsWithCallsPct)} />
            </div>

            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-stone-500">Win rate by identity tier</h2>
            <div className="mb-8 overflow-x-auto border border-stone-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-stone-900 text-stone-400">
                  <tr><th className="px-3 py-2">Lane</th><th className="px-3 py-2">Tier</th><th className="px-3 py-2">Win %</th><th className="px-3 py-2">Team-games</th></tr>
                </thead>
                <tbody>
                  {(['offense', 'defense', 'gold'] as const).flatMap((lane) =>
                    (['none', 'online', 'dedicated'] as const).map((tier) => {
                      const rec = winRateStats.byLaneTier[`${lane}:${tier}`];
                      if (!rec) return null;
                      return (
                        <tr key={`${lane}:${tier}`} className="border-t border-stone-800">
                          <td className="px-3 py-2 capitalize">{lane}</td>
                          <td className="px-3 py-2 capitalize">{tier}</td>
                          <td className="px-3 py-2">{fmtPct(rec.games > 0 ? (100 * rec.wins) / rec.games : null)}</td>
                          <td className="px-3 py-2">{rec.games}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-stone-500">By owner</h2>
            <div className="overflow-x-auto border border-stone-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-stone-900 text-stone-400">
                  <tr><th className="px-3 py-2">Owner</th><th className="px-3 py-2">Sessions</th><th className="px-3 py-2">Games</th><th className="px-3 py-2">Draft OVR</th><th className="px-3 py-2">Win %</th></tr>
                </thead>
                <tbody>
                  {owners.length === 0 && <tr><td className="px-3 py-4 text-stone-500" colSpan={5}>No cloud-synced data yet.</td></tr>}
                  {owners.map((o) => (
                    <tr key={o.ownerId} className="border-t border-stone-800">
                      <td className="px-3 py-2 font-mono text-xs text-stone-400">{o.ownerId}</td>
                      <td className="px-3 py-2">{o.sessions}</td>
                      <td className="px-3 py-2">{o.games}</td>
                      <td className="px-3 py-2">{o.draftQualityAvgOvr !== null ? o.draftQualityAvgOvr.toFixed(1) : 'n/a'}</td>
                      <td className="px-3 py-2">{fmtPct(o.winRatePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

'use client';

/**
 * challenge_mode D9 — the trade deadline (board 5), mounted by `FrontOffice` (T7) when
 * "Make a trade" is pressed.
 *
 * Step 1 (who goes): the CURRENT roster draft (post any lineup edits already made this
 * break), season averages only — MIN/PTS/+/- off `run.halves[0]`, never a rating. Step 2
 * (the offers): `drawTradeOffers` seeded from `tradeSeed(run.seed)` — same dropped
 * RARITY always draws the same five cards, so re-opening this screen for the same pick
 * is reproducible. The reveal/pick UX is `PackOpener` itself (`variant="trade"`, D9's
 * "gold trim on the existing pack art") rather than a reimplementation — picking a card
 * uses its own confirm dock in place of the board's inline "Confirm trade" button (see
 * the T7 handover notes for why).
 *
 * The acquired card lands on the BENCH: it is added to `draftedCards` but never placed
 * into `depthChartOrder`, so `seatFromRoster`'s "anything drafted and not in the depth
 * chart is bench" rule puts it there for the user to slot before the second half.
 */

import { useMemo, useState } from 'react';
import type { ChallengeRun, ChallengeTrade, SavedRoster } from '@/storage/types';
import type { PlayerCardData, Rarity } from '@/engine/types';
import { getAllCards } from '@/engine/cards';
import { drawTradeOffers, tradeSeed } from '@/engine/challenge';
import { createRng } from '@/engine/rng';
import { shortName } from '@/engine/challengeAdvice';
import { PackOpener, type PackPick } from '@/components/PackOpener';
import { Button } from '@/components/ui';

const POSITION_COLUMNS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

interface RosterRow {
  id: string;
  column: string;
  isStarter: boolean;
  card: PlayerCardData;
  mpg: number;
  ppg: number;
  pm: number;
}

const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const signed = (n: number) => (n > 0 ? `+${one(n)}` : one(n));

function buildRows(roster: SavedRoster, run: ChallengeRun): RosterRow[] {
  const half = run.halves[0];
  const games = Math.max(1, half?.games.length ?? 1);
  const totalsById = new Map((half?.playerTotals ?? []).map((t) => [t.playerId, t]));
  const byId = new Map(
    roster.draftedCards.filter((c): c is PlayerCardData => c.type === 'Player').map((c) => [c.id, c]),
  );
  const rows: RosterRow[] = [];
  for (const col of POSITION_COLUMNS) {
    const ids = roster.depthChartOrder[col] ?? [];
    ids.forEach((id, index) => {
      const card = byId.get(id);
      if (!card) return;
      const t = totalsById.get(id);
      rows.push({
        id,
        column: col,
        isStarter: index === 0,
        card,
        mpg: t ? t.minutes / games : 0,
        ppg: t ? t.points / games : 0,
        pm: t ? t.plusMinus / games : 0,
      });
    });
  }
  return rows;
}

export interface TradeProps {
  run: ChallengeRun;
  roster: SavedRoster;
  onCancel: () => void;
  onConfirm: (updatedRoster: SavedRoster, trade: ChallengeTrade) => void;
}

export function Trade({ run, roster, onCancel, onConfirm }: TradeProps) {
  const rows = useMemo(() => buildRows(roster, run), [roster, run]);
  const [droppedId, setDroppedId] = useState<string | null>(null);
  const dropped = rows.find((r) => r.id === droppedId) ?? null;

  const allCards = useMemo(() => getAllCards(), []);
  const ownedIds = useMemo(() => new Set(roster.draftedCards.map((c) => c.id)), [roster]);

  const offers: PlayerCardData[] = useMemo(() => {
    if (!dropped) return [];
    const rng = createRng(tradeSeed(run.seed));
    return drawTradeOffers(allCards, ownedIds, dropped.card.rarity as Rarity, rng);
  }, [dropped, allCards, ownedIds, run.seed]);

  const handlePick = (pick: PackPick) => {
    if (!dropped || pick.card.type !== 'Player') return;
    const acquired = pick.card as PlayerCardData;

    const depthChartOrder: Record<string, string[]> = {};
    for (const [col, ids] of Object.entries(roster.depthChartOrder)) {
      depthChartOrder[col] = ids.filter((id) => id !== dropped.id);
    }

    const playAssignments = (roster.playAssignments ?? []).map((a) => ({
      ...a,
      roles: Object.fromEntries(Object.entries(a.roles).filter(([, pid]) => pid !== dropped.id)),
    }));

    const updatedRoster: SavedRoster = {
      ...roster,
      draftedCards: [...roster.draftedCards.filter((c) => c.id !== dropped.id), acquired],
      depthChartOrder,
      playAssignments,
      timestamp: new Date().toISOString(),
    };

    onConfirm(updatedRoster, {
      droppedCardId: dropped.id,
      offeredCardIds: offers.map((o) => o.id),
      acquiredCardId: acquired.id,
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-surface text-ink">
      <header className="flex h-nav shrink-0 items-center gap-4 border-b border-line pl-6 pr-nav-gear">
        <Button variant="ghost" size="md" onClick={onCancel} aria-label="Back to the front office">
          Back
        </Button>
        <span className="font-display text-3xl leading-none text-accent">Trade deadline</span>
        <span className="text-xs font-black uppercase tracking-widest text-ink-muted">One out, one in</span>
      </header>

      <div className="flex min-h-0 grow gap-6 overflow-hidden p-6">
        {/* step 1: who goes */}
        <div className="flex w-96 shrink-0 flex-col overflow-hidden rounded-panel border border-line-strong bg-surface-raised">
          <div className="flex items-baseline gap-2 px-4 pb-2 pt-4">
            <span className="text-xs font-black uppercase tracking-widest text-accent">1 &middot; Who goes</span>
            <div className="grow" />
            <span className="text-xs font-bold text-ink-subtle">MIN&nbsp;&nbsp;PTS&nbsp;&nbsp;+/-</span>
          </div>
          <div className="flex flex-col overflow-y-auto">
            {rows.map((row) => (
              <div
                key={row.id}
                role="button"
                tabIndex={0}
                onClick={() => setDroppedId(row.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDroppedId(row.id); } }}
                className={`flex h-11 cursor-pointer items-center gap-2.5 px-4 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus ${
                  droppedId === row.id
                    ? 'border-l-4 border-accent bg-accent-soft/40'
                    : 'border-l-4 border-transparent hover:bg-surface-sunken'
                }`}
              >
                <span className="w-6 shrink-0 text-xs font-black text-ink-subtle">{row.column}</span>
                <span className="grow truncate text-left font-bold">{shortName(row.card.player.name)}</span>
                <span
                  className={`w-28 shrink-0 text-right tabular-nums ${
                    droppedId === row.id ? 'text-accent' : 'text-ink-muted'
                  }`}
                >
                  {Math.round(row.mpg)}&nbsp;&nbsp;{one(row.ppg)}&nbsp;&nbsp;{signed(row.pm)}
                </span>
              </div>
            ))}
          </div>
          <div className="grow" />
          <div className="border-t border-line px-4 py-3 text-xs leading-relaxed text-ink-muted">
            {dropped ? (
              <>
                Outgoing: <span className="font-bold text-ink">{shortName(dropped.card.player.name)}</span>, a{' '}
                {dropped.card.rarity}. The pack leans toward the rarity you give up.
              </>
            ) : (
              'Pick a player to see the offers the pack draws for them.'
            )}
          </div>
        </div>

        {/* step 2: the trade pack */}
        <div className="min-w-0 grow overflow-hidden rounded-panel border-2 border-accent bg-surface-raised">
          {dropped ? (
            <PackOpener
              key={dropped.id}
              embedded
              variant="trade"
              titleOverride="Five offers on the table"
              eyebrowOverride="2 · The trade pack"
              pack={offers}
              onPick={handlePick}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-8 text-center text-sm text-ink-muted">
              Choose who goes on the left. The pack opens with five offers for exactly that spot.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

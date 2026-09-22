'use client';

/**
 * pvp_series T4 (D3): replays series game `n` through `GameView`, from the stored seed and
 * rosters via `theaterForMatchGame` — never re-derived, so it reproduces exactly what the
 * server simulated. `hideOpponentDetails` gates the opponent's bench/plays/identity; the
 * box score still shows who played. Once the viewer has watched it to the end
 * (`onCompletionChange`), sends `{type:'seen', game:n}` and nudges `/advance` so the series
 * can move on once both sides have watched (D2). A game not yet simulated redirects to the
 * series page — there is nothing to replay yet.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui';
import { useMatch } from '@/hooks/useMatch';
import { GameView } from '@/components/GameView';
import { theaterForMatchGame } from '@/lib/matchSimulate';
import { MATCH_SEAT_ID, type DirectoryUser } from '@/storage/matchTypes';
import type { GameTheater } from '@/engine/gameTypes';
import { SERIES_MAX_GAMES, type MatchSide } from '@/engine/playoffs';

export default function PlayoffsGamePage() {
  const params = useParams<{ id: string; n: string }>();
  const matchId = Array.isArray(params.id) ? params.id[0] : params.id;
  const gameNum = Number(Array.isArray(params.n) ? params.n[0] : params.n);
  const router = useRouter();
  const { match, me, send } = useMatch(matchId);

  const opponentId = match && me ? (me === 'host' ? match.guest_id : match.host_id) : null;
  const [opponentName, setOpponentName] = useState<string | null>(null);
  useEffect(() => {
    if (!opponentId) return;
    let cancelled = false;
    fetch('/api/users')
      .then((r) => r.json())
      .then((data: { users?: DirectoryUser[] }) => {
        if (cancelled) return;
        const u = data.users?.find((u) => u.id === opponentId);
        if (u) setOpponentName(u.display_name || u.username || 'your opponent');
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [opponentId]);

  const gameExists = useMemo(
    () => Boolean(match?.games.find((g) => g.game === gameNum)),
    [match, gameNum],
  );

  // Redirect away once we know there's nothing to replay: bad game number, or a match
  // this page doesn't apply to (drafting/building/invited/...).
  useEffect(() => {
    if (!match || !matchId) return;
    if (!me) return;
    const validStatus = match.status === 'series' || match.status === 'sideboard' || match.status === 'done';
    if (!validStatus || !Number.isInteger(gameNum) || gameNum < 1 || gameNum > 7 || !gameExists) {
      router.replace(`/playoffs/${matchId}`);
    }
  }, [match, me, matchId, gameNum, gameExists, router]);

  const built = useMemo((): { theater: GameTheater; home: MatchSide } | null => {
    if (!match || !me || !gameExists) return null;
    const opponentSide: MatchSide = me === 'host' ? 'guest' : 'host';
    return theaterForMatchGame(match, gameNum, {
      names: { [me]: 'You', [opponentSide]: opponentName ?? 'Opponent' },
    });
  }, [match, me, gameExists, gameNum, opponentName]);

  const seenSentRef = useRef(false);
  const advanceRequestedRef = useRef(false);
  const handleCompletionChange = useCallback((isComplete: boolean) => {
    if (!isComplete || !matchId || seenSentRef.current) return;
    seenSentRef.current = true;
    void send({ type: 'seen', game: gameNum }).catch(() => {});
    if (!advanceRequestedRef.current) {
      advanceRequestedRef.current = true;
      fetch(`/api/match/${matchId}/advance`, { method: 'POST' }).catch(() => {});
    }
  }, [matchId, gameNum, send]);

  if (!match || !me || !built) {
    return (
      <div className="min-h-dvh-z flex items-center justify-center">
        <p className="text-sm text-ink-muted">Loading...</p>
      </div>
    );
  }

  const opponentSide: MatchSide = me === 'host' ? 'guest' : 'host';
  const hideOpponentDetails = built.home === opponentSide ? 'home' : 'away';

  // Same shell as the tournament's game view (`SeasonView`): a full-height column with the
  // exit control above it, not a page-width `main` — inside `max-w-5xl` with the nav bar's
  // padding the play-by-play was squeezed into a narrow box (owner, 2026-09-22).
  return (
    <div className="min-h-dvh-z p-4 flex flex-col">
      <div className="mb-3 flex items-center gap-3">
        <Button onClick={() => router.push(`/playoffs/${matchId}`)} variant="secondary" icon={<ChevronLeft className="w-4 h-4" />}>
          Series
        </Button>
        <span className="text-sm font-bold uppercase tracking-wider text-ink-subtle">
          Game {gameNum} of {SERIES_MAX_GAMES}
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <GameView
          game={built.theater}
          context={{ userSeatId: MATCH_SEAT_ID[me] }}
          onCompletionChange={handleCompletionChange}
          hideOpponentDetails={hideOpponentDetails}
        />
      </div>
    </div>
  );
}

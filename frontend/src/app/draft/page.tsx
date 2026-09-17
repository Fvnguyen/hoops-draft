import { DraftRoom } from "@/components/DraftRoom";

/** D1: mode is read server-side from `?mode=`; missing/unknown defaults to
 *  Premier. `?game=` (plan_challenge_mode D1) picks which game this draft is
 *  for; missing/unknown defaults to the tournament. `?clock=fast` (D4) is
 *  dev-only and scales the pick clock. */
export default async function DraftPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; game?: string; clock?: string }>;
}) {
  const params = await searchParams;
  const mode = params.mode === 'quick' ? 'quick' : 'premier';
  const gameMode = params.game === 'challenge' ? 'challenge' : 'tournament';
  const clockFast = params.clock === 'fast';

  return (
    <main>
      <DraftRoom mode={mode} gameMode={gameMode} clockFast={clockFast} />
    </main>
  );
}

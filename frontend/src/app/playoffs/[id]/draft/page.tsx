'use client';

/** pvp_draft T3: the Playoffs draft room, driven entirely by the match row (D1/D9) — no
 *  `?mode=`/`?game=`, no resume sheet, Quick visuals under `gameMode: 'playoffs'`. */
import { useParams } from 'next/navigation';
import { DraftRoom } from '@/components/DraftRoom';

export default function PlayoffsDraftPage() {
  const params = useParams<{ id: string }>();
  const matchId = Array.isArray(params.id) ? params.id[0] : params.id;

  return (
    <main>
      <DraftRoom pvpMatchId={matchId} />
    </main>
  );
}

import { DraftRoom } from "@/components/DraftRoom";

/** D1: mode is read server-side from `?mode=`; missing/unknown defaults to
 *  Premier. `?clock=fast` (D4) is dev-only and scales the pick clock. */
export default async function DraftPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; clock?: string }>;
}) {
  const params = await searchParams;
  const mode = params.mode === 'quick' ? 'quick' : 'premier';
  const clockFast = params.clock === 'fast';

  return (
    <main>
      <DraftRoom mode={mode} clockFast={clockFast} />
    </main>
  );
}

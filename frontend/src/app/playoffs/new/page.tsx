'use client';

/**
 * pvp_match T4: the `/playoffs` invite screen. `pvp_draft` builds the actual draft room
 * this leads into once a guest accepts — this plan ships only the invite step.
 */
import { InviteList } from '@/components/playoffs/InviteList';

export default function PlayoffsNewPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-nav">
      <p className="mb-1 text-xs font-bold uppercase tracking-[0.3em] text-ink-subtle">Playoffs</p>
      <h1 className="mb-2 font-display text-4xl uppercase tracking-tight text-ink">Invite an opponent</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Pick someone to draft against. They&apos;ll see your invite in their notification bell.
      </p>
      <InviteList />
    </main>
  );
}

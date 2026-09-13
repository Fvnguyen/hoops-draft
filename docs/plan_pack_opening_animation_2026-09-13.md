# Implementation Plan: Premium First-Pack Opening

## Goal

Show a short, satisfying pack-opening sequence before the first selectable pack of a new draft. The animation makes a new run feel special without delaying or changing the draft itself.

The opener is presentation only: it reveals the exact cards already generated for the human player's first pack, then hands off to the normal Draft Room with that same pack still available to pick from.

## Decisions

1. **Scope:** Open only the first pack of a draft. Later packs use the existing draft flow.
2. **Graphics:** Use the verified local static asset:

   - Repository file: `frontend/public/pack_2025_2026.png`
   - Browser path: `/pack_2025_2026.png`

3. **Sound and external VFX:** Deferred. Use Framer Motion and local CSS only.
4. **Card concealment:** Use one neutral CSS card back for every unrevealed card. Do not reuse the current `PlayerCard` back, because it contains game information.
5. **No extra confirmation:** Automatically enter the draft after a brief read period. Include a visible **Skip** control and keyboard support.
6. **Dedicated reveal cards:** Do not mount the interactive production `PlayerCard` or `PlayCard` inside the animation.

---

## Why a dedicated reveal-card component is required

The first pack is `DraftCard[]`, not `PlayerCard[]`; it includes a Play card as well as player cards. The normal `PlayerCard` and `PlayCard` components are interactive, have their own hover/touch flip state, and are designed for the draft and deck-building interfaces. Mounting either inside another 3D flip risks conflicting transforms, accidental interaction, and unnecessary rendering work.

Create `PackRevealCard` as a small, static presentation component:

- **Concealed side:** generic dark card back with a basketball or Magic Ball mark.
- **Player reveal:** headshot/art, player name, position, and rarity gem; no detailed ratings or badges.
- **Play reveal:** play-board graphic, Play name, category, and rarity gem.
- **No interaction:** no hover, drag, click, tooltip, or internal flip state.
- **Rarity:** apply Rare/Mythic glow only after the card is visibly revealed. Never use order or timing to telegraph rarity.

The ordinary Draft Room remains the source of full card information immediately after the animation.

---

## 1. Draft state and data flow

### [MODIFY] `frontend/src/hooks/useDraftEngine.ts`

Extend the draft state union:

```ts
type DraftState = 'loading' | 'pack-intro' | 'drafting' | 'deckbuilding';
```

In `startNewDraft`:

1. Generate the complete cube pool and initialize all seats exactly as today.
2. Set the human seat's initial pack from the generated data.
3. Set `draftState` to `'pack-intro'` instead of `'drafting'`.

The human player's pack must exist before entering `pack-intro`. `processPickAndPass` remains guarded to run only in `'drafting'`, so no pick can occur during the animation.

`setDraftState` is already returned by the hook; `DraftRoom` must destructure it before using it.

### First-pack snapshot

`PackOpener` receives the current human pack, but freezes a shallow snapshot on mount. Key each reveal by `card.id` and never mutate cards.

The component only runs before the first pick, so the live pack should not change. The snapshot makes that contract explicit and prevents accidental timing problems if the parent re-renders. In development, assert the normal Draft Room's initial card-ID set equals the reveal snapshot's card-ID set.

---

## 2. Pack opener component

### [NEW] `frontend/src/components/PackOpener.tsx`

`PackOpener` is a client component:

```ts
type PackOpenerProps = {
  pack: DraftCard[];
  onComplete: () => void;
};
```

It owns a guarded, one-way phase machine:

```ts
type PackPhase = 'sealed' | 'opening' | 'dealing' | 'revealing' | 'handoff';
```

| Phase | Behaviour |
|---|---|
| `sealed` | Center the pack image with a subtle float/shimmer and a click/tap prompt. |
| `opening` | Lock input; slightly scale and shake the pack, then fade/burst it out. |
| `dealing` | Deal the actual pack cards from center to responsive final positions, all showing generic backs. |
| `revealing` | Flip reveal cards in a short stagger; apply rarity glow after each reveal. |
| `handoff` | Keep the completed pack visible briefly, fade the overlay, then call `onComplete()` once. |

### Completion safety

Do not use `onAnimationComplete` on the final individual card as the completion trigger; it can run more than once as motion values or descendants change.

- Advance with one phase-level controller or timer.
- Use a `completedRef` guard around `onComplete`.
- Clean up timers and animation controls on unmount.
- Ignore repeated clicks after leaving `sealed`.
- Let **Skip** move directly to `handoff` through the same guarded completion path.

### Timing

Target roughly three seconds from opening click to Draft Room:

| Moment | Target duration |
|---|---:|
| Pack open | 500–700 ms |
| Deal and staggered reveal | 900–1,200 ms |
| Fully revealed read period | 600–800 ms |
| Overlay fade | 150–250 ms |

Treat timing as a tuning target, not a fixed contract.

### Accessibility and interruption

- A `Skip opening` button is always available after the pack renders.
- Enter/Space opens the sealed pack; Escape skips the sequence.
- Respect `prefers-reduced-motion`: use a short fade or immediate reveal, with no mandatory shaking, flying, or flipping.
- Give the overlay a label such as `Opening your first draft pack`.
- Focus the open control initially; move focus to Skip once opening begins.

---

## 3. Responsive layout and animation rules

The number of revealed cards comes from `pack.length`. Never hard-code eight cards, even if the current balance produces seven player cards plus one Play.

| Screen size | Final card arrangement |
|---|---|
| Desktop | Shallow fan or wide two-row spread |
| Tablet | Compact two-by-four-style grid |
| Mobile | Two-column grid or tidy stacked spread |

Cards deal from a shared center point, then settle into their final layout before flipping. This retains the dramatic opening while keeping every card readable and within the viewport.

Use `perspective` and `backface-visibility: hidden` on the small reveal card only. Do not wrap the normal interactive `PlayerCard` or `PlayCard` in another 3D transform.

The opener fades out when complete; the normal Draft Room can keep its existing grid entrance animations. Avoid a shared-layout transition between different card components, which adds fragility without enough user benefit.

---

## 4. Draft Room integration

### [MODIFY] `frontend/src/components/DraftRoom.tsx`

Destructure `setDraftState` from the hook:

```tsx
const {
  draftState,
  seats,
  humanSeat,
  currentPackNumber,
  currentPickNumber,
  overallPick,
  pickLog,
  processPickAndPass,
  setDraftState,
  draftSeed,
} = useDraftEngine(allPlayers, playsDB);
```

After the existing loading / missing-seat guard and before the normal draft UI, render the opener:

```tsx
if (draftState === 'pack-intro') {
  return (
    <div className="fixed inset-0 z-50 bg-stone-950">
      <PackOpener
        pack={humanSeat.currentPack}
        onComplete={() => setDraftState('drafting')}
      />
    </div>
  );
}
```

Use a fixed viewport overlay rather than an absolute child container. The opener is the entire first-draft screen, so it should not depend on Draft Room layout or future parent positioning.

---

## 5. Asset usage

Use the static image with its browser path:

```tsx
<Image
  src="/pack_2025_2026.png"
  alt="Magic Ball 2025–26 draft pack"
  priority
  /* Provide real image dimensions or use a sized responsive wrapper. */
/>
```

The source file is verified at `frontend/public/pack_2025_2026.png`. Keep it in `public`; do not import an external URL or duplicate the asset in component code.

---

## 6. Verification plan

### Automated coverage

- Unit-test sealed → opening → dealing → revealing → handoff.
- Assert rapid repeated open clicks produce one completion only.
- Assert Skip and the normal sequence each call `onComplete` once.
- Test reduced-motion mode.
- Test a pack containing both a Player and a Play reveal item.
- Test that `processPickAndPass` cannot run while `draftState === 'pack-intro'`.
- In development, assert the reveal snapshot IDs equal the initial selectable pack IDs.

### Manual verification

- Start a new draft and verify the sealed pack renders from `/pack_2025_2026.png`.
- Confirm the card count matches the generated first pack, not a hard-coded number.
- Confirm player cards and the Play card each use the appropriate static reveal face.
- Confirm Rare and Mythic glow appears only after a card turns over.
- Confirm the opening is legible on desktop, tablet, and mobile sizes.
- Confirm Skip, Enter/Space, Escape, and reduced-motion behavior work.
- Confirm exactly one automatic transition enters the normal Draft Room.
- Confirm selectable Draft Room cards exactly match the revealed cards.

## Non-goals for this iteration

- Sound, particles, haptics, or external VFX.
- Opening later draft packs.
- Revealing detailed ratings, badge lists, or card backs during the cinematic.
- Changing draft generation, pack composition, pick order, or passing logic.

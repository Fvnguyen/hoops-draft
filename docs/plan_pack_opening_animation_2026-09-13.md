# Implementation Plan: Premium Pack-Opening Animation

This plan outlines the architecture for introducing a multi-step pack-opening animation before the first pack of a draft, utilizing React state machines and Framer Motion.

## User Feedback Addressed

1. **Pack Graphics:** We will use the provided `pack_2025_2026.png` from the `public` folder.
2. **Audio/VFX:** Deferred for now. We will strictly use Framer Motion + CSS for a clean, bug-free implementation.
3. **Card Backs:** Since the game's actual card "backs" show stats (which would spoil the reveal), we will create a generic, stylized CSS "Unrevealed Card Back" (e.g., a dark gradient with a logo/basketball icon) specifically for this animation. The cards will land showing this generic back, then flip to reveal the actual `PlayerCard` component (front side).
4. **Seamless Transition:** We will remove the "Start Drafting" button. Instead, the component will wait briefly after the final card flips and then automatically trigger `onComplete()`, dropping the user directly into the active draft.

## Proposed Changes

### 1. State Management Update
#### [MODIFY] `frontend/src/hooks/useDraftEngine.ts`
- **Draft States:** Expand the `draftState` union type to: `'loading' | 'pack-intro' | 'drafting' | 'deckbuilding'`.
- **Initialization:** Inside `startNewDraft`, instead of defaulting to `'drafting'`, set the initial state to `'pack-intro'`.

### 2. The Pack Opener Component
#### [NEW] `frontend/src/components/PackOpener.tsx`
Create a dedicated client component that receives the player's first pack (`DraftCard[]`) and an `onComplete` callback. It will manage an internal state machine:
- **State Type:** `type PackPhase = 'idle' | 'tearing' | 'revealing'`;
- **`idle` Phase:** Renders `pack_2025_2026.png` centrally with a CSS shimmer `@keyframes` effect and a subtle floating `framer-motion` loop. Click advances to `tearing`.
- **`tearing` Phase:** Uses Framer Motion's `animate` properties to scale the pack up slightly, shake it, and fade/scale it away (simulating a burst/tear). `onAnimationComplete` advances to `revealing`.
- **`revealing` Phase:** The pack image disappears. The 8 cards fan out from the center (using `framer-motion` layout animations and `staggerChildren`). 
  - They land showing the generic "Unrevealed Card Back".
  - They automatically flip (`rotateY: 180`) in sequence to reveal the actual `PlayerCard`.
  - Rare/Mythic cards get a CSS glow upon flipping.
  - An `onAnimationComplete` hook on the final card's flip animation will wait 1.5 seconds and then automatically call `onComplete()`.

### 3. Integrating into the Draft Room
#### [MODIFY] `frontend/src/components/DraftRoom.tsx`
- Add a conditional render block right after the `'loading'` state check:
```tsx
if (draftState === 'pack-intro') {
  return (
    <div className="flex h-screen items-center justify-center bg-stone-900 absolute inset-0 z-50">
      <PackOpener 
        pack={humanSeat.currentPack} 
        onComplete={() => setDraftState('drafting')} 
      />
    </div>
  );
}
```

## Verification Plan

### Manual Verification
- Launch the dev server and start a new draft.
- Verify the pack appears in the `idle` state with a shimmer.
- Click the pack and confirm the tearing animation feels impactful.
- Confirm exactly 8 cards slide out and flip to reveal their art and ratings.
- Verify that the sequence seamlessly transitions to the standard Draft Room UI, and the 8 cards in the UI perfectly match the cards revealed in the animation.

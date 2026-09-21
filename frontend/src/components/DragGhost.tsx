'use client';

/**
 * Hidden bench-sized HTML5 drag image (D24) — `DeckBuilder.tsx`'s `handleDragStart`
 * updates these refs imperatively (bar colour, headshot `src`, name text) and hands
 * `ghostRef.current` to `e.dataTransfer.setDragImage(...)` synchronously, so the refs
 * stay owned by the caller; this component only renders the (offscreen) markup they
 * point at.
 */
export function DragGhost({
  ghostRef,
  barRef,
  imgRef,
  nameRef,
}: {
  ghostRef: React.RefObject<HTMLDivElement | null>;
  barRef: React.RefObject<HTMLDivElement | null>;
  imgRef: React.RefObject<HTMLImageElement | null>;
  nameRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={ghostRef}
      className="fixed -left-[999px] -top-[999px] w-[160px] h-9 bg-surface-raised border border-line-strong rounded-control shadow flex items-center overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      <div ref={barRef} className="h-full w-1.5 shrink-0" />
      <div className="w-8 h-8 shrink-0 mx-1 rounded-full overflow-hidden bg-surface-sunken">
        <img ref={imgRef} alt="" className="w-full h-full object-cover object-top" />
      </div>
      <div ref={nameRef} className="flex-1 min-w-0 px-1 text-xs font-bold uppercase truncate text-ink" />
    </div>
  );
}

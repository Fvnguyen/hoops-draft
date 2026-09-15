'use client';

import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { panelVariants } from './Panel';

/**
 * plan_ui_foundation D3: the dropdown. Native <details>/<summary> (no JS to open, works
 * without hydration) plus the two things the native element lacks: close on outside
 * click and close on Escape. Replaces the two hand-rolled menus in TopNav.
 *
 *   <Menu onOpen={...}>
 *     <MenuTrigger label="Profile menu">...</MenuTrigger>
 *     <MenuPanel width="w-64">
 *       <MenuSection><MenuItem href="/x" icon={...}>Go</MenuItem></MenuSection>
 *       <MenuItem tone="danger" onClick={...}>Sign out</MenuItem>
 *     </MenuPanel>
 *   </Menu>
 */
export function Menu({
  onOpen,
  className,
  children,
}: {
  onOpen?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onPointer = (e: PointerEvent) => {
      if (el.open && !el.contains(e.target as Node)) el.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && el.open) el.open = false;
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <details
      ref={ref}
      className={cn('relative', className)}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open) onOpen?.();
      }}
    >
      {children}
    </details>
  );
}

/** The 44px trigger. Renders children (an icon, or icon + text) inside a summary. */
export function MenuTrigger({
  label,
  inverse = false,
  className,
  children,
}: {
  label: string;
  /** Light glyph over dark shells. */
  inverse?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <summary
      // Chromium exposes <summary> as a disclosure widget, not a button, so assistive
      // tech and `getByRole('button')` would miss it. It behaves as a button, name it one.
      role="button"
      aria-haspopup="menu"
      aria-label={label}
      title={label}
      className={cn(
        'flex min-h-control min-w-control cursor-pointer list-none items-center justify-center gap-2 rounded-full px-2 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus [&::-webkit-details-marker]:hidden',
        inverse ? 'text-ink-inverse hover:bg-white/10' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
        className,
      )}
    >
      {children}
    </summary>
  );
}

export function MenuPanel({
  align = 'right',
  width = 'w-64',
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { align?: 'left' | 'right'; width?: string }) {
  return (
    <div
      className={cn(
        panelVariants({ variant: 'raised', padding: 'none' }),
        'absolute top-full z-50 mt-2 max-h-96 overflow-y-auto overscroll-contain p-1 shadow-xl',
        align === 'right' ? 'right-0' : 'left-0',
        width,
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** A group with a bottom rule; the last section has none. */
export function MenuSection({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b border-line py-1 last:border-0', className)} {...rest} />;
}

/** Small uppercase eyebrow above a section's items. */
export function MenuLabel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <p className={cn('px-3 py-1 text-xs font-black uppercase tracking-widest text-ink-subtle', className)}>
      {children}
    </p>
  );
}

const itemBase =
  'flex min-h-control w-full items-center gap-2 rounded-control px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:bg-surface-sunken';

/** A row. `href` makes it a Link; otherwise a button. Rows are 44px tall (D2). */
export function MenuItem({
  href,
  onClick,
  icon,
  tone = 'default',
  className,
  children,
}: {
  href?: string;
  onClick?: () => void;
  icon?: ReactNode;
  tone?: 'default' | 'danger';
  className?: string;
  children: ReactNode;
}) {
  const classes = cn(
    itemBase,
    tone === 'danger' ? 'text-danger hover:bg-danger-soft' : 'text-ink hover:bg-surface-sunken',
    className,
  );
  if (href) {
    return (
      <Link href={href} className={classes} onClick={onClick}>
        {icon}
        {children}
      </Link>
    );
  }
  return (
    // The one raw <button> allowed outside Button: it is the Menu primitive itself.
    <button type="button" onClick={onClick} className={classes}>
      {icon}
      {children}
    </button>
  );
}

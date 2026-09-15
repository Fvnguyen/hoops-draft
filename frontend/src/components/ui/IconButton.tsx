'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import Link from 'next/link';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

/**
 * plan_ui_foundation D3: an icon-only control with a guaranteed 44x44 hit area (D2), no
 * matter how small the glyph is. `label` is required and becomes both the accessible
 * name and the hover title, so an icon button can never be unlabelled.
 */
export const iconButtonVariants = cva(
  [
    'inline-flex size-control shrink-0 select-none items-center justify-center rounded-full transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
    'disabled:pointer-events-none disabled:opacity-50',
  ],
  {
    variants: {
      variant: {
        ghost: 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
        raised: 'border border-line bg-surface-raised text-ink-muted shadow-sm hover:bg-surface-sunken hover:text-ink',
        /** Over dark shells: light glyph, translucent hover. */
        inverse: 'text-ink-inverse hover:bg-white/10',
      },
    },
    defaultVariants: { variant: 'ghost' },
  },
);

export type IconButtonProps = VariantProps<typeof iconButtonVariants> &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children' | 'aria-label' | 'title'> & {
    /** Accessible name + title. Required. */
    label: string;
    children: ReactNode;
    className?: string;
    href?: string;
  };

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant, className, label, children, href, type = 'button', ...rest },
  ref,
) {
  const classes = cn(iconButtonVariants({ variant }), className);
  if (href) {
    return (
      <Link
        href={href}
        className={classes}
        aria-label={label}
        title={label}
        onClick={rest.onClick as unknown as React.MouseEventHandler<HTMLAnchorElement>}
      >
        {children}
      </Link>
    );
  }
  return (
    <button ref={ref} type={type} className={classes} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
});

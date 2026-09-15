'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import Link from 'next/link';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

/**
 * plan_ui_foundation D3: THE button. Every clickable text control in product code is one
 * of these (the style gate rejects a raw `<button>` outside `components/ui/`).
 *
 * - `size` fixes the D2 control heights: md = 44px, lg = 52px (primary CTAs).
 * - `href` renders a Next `Link` with identical styling, so nav and actions look the same.
 * - Colours are semantic tokens only; the theme decides what they resolve to.
 */
export const buttonVariants = cva(
  [
    'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap',
    'rounded-control font-black uppercase tracking-widest transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
    'disabled:pointer-events-none disabled:opacity-50',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-ink shadow-sm hover:bg-accent-hover',
        secondary: 'border border-line-strong bg-surface-raised text-ink hover:bg-surface-sunken',
        ghost: 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
        danger: 'bg-danger text-white hover:opacity-90',
        /** For dark shells (home hero, game HUD): outlined, light text. */
        inverse: 'border border-line-inverse bg-white/5 text-ink-inverse hover:bg-white/10',
      },
      size: {
        md: 'h-control px-5 text-sm',
        lg: 'h-control-lg px-8 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

type Base = VariantProps<typeof buttonVariants> & {
  className?: string;
  children?: ReactNode;
  /** Leading icon slot; sized by the caller (16-20px). */
  icon?: ReactNode;
};

export type ButtonProps = Base &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & {
    /** When set, renders a Link styled as this button. */
    href?: string;
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, className, icon, children, href, type = 'button', ...rest },
  ref,
) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (href) {
    // Forward everything except button-only props, so data-testid / aria-* / title /
    // onClick reach the anchor (T7 group D found the earlier allow-list dropped
    // data-testid and had to bypass the primitive).
    const { disabled, form, formAction, value, name, ...anchorProps } = rest;
    void disabled; void form; void formAction; void value; void name;
    return (
      <Link
        href={href}
        className={classes}
        {...(anchorProps as unknown as Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>)}
      >
        {icon}
        {children}
      </Link>
    );
  }
  return (
    <button ref={ref} type={type} className={classes} {...rest}>
      {icon}
      {children}
    </button>
  );
});

import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

/**
 * plan_ui_foundation D3: the bordered surface every card, sheet, dropdown and toast sits
 * on. `inverse` is the dark shell (game HUD, toasts over the court); it also flips the
 * default text colour so children can stay on `text-ink*` tokens.
 */
export const panelVariants = cva('rounded-panel border', {
  variants: {
    variant: {
      raised: 'border-line bg-surface-raised text-ink shadow-sm',
      sunken: 'border-line bg-surface-sunken text-ink',
      inverse: 'border-line-inverse bg-surface-inverse text-ink-inverse shadow-lg',
    },
    padding: {
      none: '',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
    },
  },
  defaultVariants: { variant: 'raised', padding: 'md' },
});

export type PanelProps = VariantProps<typeof panelVariants> & HTMLAttributes<HTMLDivElement>;

export const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel(
  { variant, padding, className, ...rest },
  ref,
) {
  return <div ref={ref} className={cn(panelVariants({ variant, padding }), className)} {...rest} />;
});

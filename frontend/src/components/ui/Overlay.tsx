'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Panel } from './Panel';
import { IconButton } from './IconButton';

/**
 * plan_ui_foundation D3/D9: the modal. Fixed scrim, centred panel that can never exceed
 * the viewport (`max-h-[90dvh] overflow-y-auto`, the fix for the undismissable
 * WhatsNewSplash at 385px), Escape and backdrop both close, body scroll locked while
 * open. Render nothing when `open` is false.
 */
export function Overlay({
  open,
  onClose,
  size = 'md',
  labelledBy,
  showClose = true,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg';
  /** id of the heading inside, for aria-labelledby. */
  labelledBy?: string;
  showClose?: boolean;
  className?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-surface-scrim p-4 backdrop-blur-sm"
      onClick={onClose}
      data-overlay
    >
      <Panel
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        padding="none"
        variant="inverse"
        className={cn(
          'relative w-full max-h-[90dvh] overflow-y-auto overscroll-contain shadow-2xl',
          size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md',
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {showClose && (
          <IconButton
            label="Close"
            variant="inverse"
            className="absolute right-1 top-1 z-10"
            onClick={onClose}
          >
            <X className="size-5" />
          </IconButton>
        )}
        {children}
      </Panel>
    </div>
  );
}

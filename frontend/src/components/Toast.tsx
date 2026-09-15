'use client';

/**
 * Small toast provider (plan ui_draft_deckbuild_pack, D15). Replaces `alert`
 * and `confirm` in the deck builder: a toast shows immediately, optionally
 * with an action button (used for "Undo" after a move that already happened).
 */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui';

export interface ToastOptions {
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
  tone?: 'default' | 'error';
}

interface ToastItem extends ToastOptions {
  id: number;
  message: string;
}

interface ToastContextValue {
  show: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 5000;

/** Safe outside a provider (returns a no-op `show`) so it never throws in tests
 *  or components rendered without `ToastProvider`. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  return ctx ?? { show: () => {} };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems(prev => prev.filter(t => t.id !== id));
  }, []);

  const show = useCallback((message: string, options: ToastOptions = {}) => {
    const id = nextId.current++;
    setItems(prev => [...prev, { id, message, ...options }]);
    window.setTimeout(() => dismiss(id), options.durationMs ?? DEFAULT_DURATION_MS);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
        {items.map(item => (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto flex items-center gap-3 rounded-panel px-4 py-2.5 text-sm font-semibold shadow-lg',
              item.tone === 'error' ? 'bg-danger text-white' : 'bg-surface-inverse text-ink-inverse',
            )}
          >
            <span>{item.message}</span>
            {item.actionLabel && item.onAction && (
              <Button
                variant="ghost"
                onClick={() => { item.onAction?.(); dismiss(item.id); }}
                className="h-auto min-h-0 shrink-0 px-0 py-0 text-xs font-black normal-case tracking-wide text-accent hover:bg-transparent hover:text-accent-hover"
              >
                {item.actionLabel}
              </Button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

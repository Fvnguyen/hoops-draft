import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** plan_ui_foundation D3: the one class-combining helper. `clsx` handles conditionals,
 *  `twMerge` lets a caller's `className` override a primitive's own utilities
 *  (`cn('h-control', 'h-control-lg')` -> `h-control-lg`) instead of both applying. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

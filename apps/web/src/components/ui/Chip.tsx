'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(
  ({ active = false, className, type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex min-h-11 items-center rounded-pill border px-4 py-2 text-sm font-semibold transition-all outline-none focus-visible:ring-4',
          active
            ? 'border-transparent bg-lime text-ink focus-visible:ring-lime/30'
            : 'border-line bg-panel text-ink hover:border-accent hover:text-accent focus-visible:ring-accent/15',
          className,
        )}
        aria-pressed={active}
        {...props}
      />
    );
  },
);

Chip.displayName = 'Chip';

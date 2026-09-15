/**
 * Кастомный select-компонент с appearance-none и SVG-стрелкой.
 * Стилизация согласована с Input: rounded-card, border-line, bg-panel, focus-ring.
 */
'use client';

import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
  children: ReactNode;
};

/** SVG-стрелка вниз (chevron) для кастомного select */
function ChevronDown() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-muted"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ children, className, error, id, label, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;
    const errorId = error ? `${selectId}-error` : undefined;

    return (
      <div className="flex flex-col gap-2">
        {label ? (
          <label htmlFor={selectId} className="text-sm font-semibold text-ink">
            {label}
          </label>
        ) : null}

        <div
          className={cn(
            'relative flex items-center rounded-card border bg-panel transition-all focus-within:ring-4',
            error
              ? 'border-danger text-danger focus-within:ring-danger/15'
              : 'border-line text-muted focus-within:border-accent focus-within:text-accent-strong focus-within:ring-accent/15',
          )}
        >
          <select
            id={selectId}
            ref={ref}
            className={cn(
              'min-h-12 w-full appearance-none bg-transparent px-4 py-3 pr-10 text-sm text-ink outline-none',
              className,
            )}
            aria-describedby={errorId}
            aria-invalid={Boolean(error)}
            {...props}
          >
            {children}
          </select>
          <ChevronDown />
        </div>

        {error ? (
          <p id={errorId} className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);

Select.displayName = 'Select';

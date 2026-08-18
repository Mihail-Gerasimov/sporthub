'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  icon?: ReactNode;
  /** Кликабельный элемент справа (например, toggle видимости пароля) */
  endAdornment?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, endAdornment, error, icon, id, label, type = 'text', ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
      <div className="flex flex-col gap-2">
        {label ? (
          <label htmlFor={inputId} className="text-sm font-semibold text-ink">
            {label}
          </label>
        ) : null}

        <div
          className={cn(
            'relative flex items-center rounded-card border bg-panel px-4 transition-all focus-within:ring-4',
            error
              ? 'border-danger text-danger focus-within:ring-danger/15'
              : 'border-line text-muted focus-within:border-accent focus-within:text-accent focus-within:ring-accent/15',
          )}
        >
          {icon ? (
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
              {icon}
            </span>
          ) : null}
          <input
            id={inputId}
            ref={ref}
            type={type}
            className={cn(
              'min-h-12 w-full bg-transparent py-3 text-sm text-ink outline-none placeholder:text-muted',
              icon ? 'pl-7' : '',
              endAdornment ? 'pr-8' : '',
              className,
            )}
            aria-describedby={errorId}
            aria-invalid={Boolean(error)}
            {...props}
          />
          {endAdornment ? (
            <span className="absolute right-4 top-1/2 -translate-y-1/2">{endAdornment}</span>
          ) : null}
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

Input.displayName = 'Input';

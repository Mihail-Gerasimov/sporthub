'use client';

import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export type RatingProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> & {
  value: number;
  max?: number;
  interactive?: boolean;
  onChange?: (value: number) => void;
  disabled?: boolean;
};

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn('size-5 transition-colors', filled ? 'fill-current' : 'fill-none')}
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="m12 3.2 2.72 5.52 6.09.89-4.4 4.29 1.04 6.07L12 17.09l-5.45 2.88 1.04-6.07-4.4-4.29 6.09-.89L12 3.2Z" />
    </svg>
  );
}

export function Rating({
  className,
  disabled = false,
  interactive = false,
  max = 5,
  onChange,
  value,
  ...props
}: RatingProps) {
  const normalizedValue = Math.max(0, Math.min(value, max));
  const roundedValue = Math.round(normalizedValue);

  if (interactive) {
    return (
      <div
        className={cn('flex items-center gap-1 text-warning', className)}
        role="group"
        aria-label={`Оценка: ${normalizedValue} из ${max}`}
        {...props}
      >
        {Array.from({ length: max }, (_, index) => {
          const starValue = index + 1;
          const isActive = starValue <= roundedValue;

          return (
            <button
              key={starValue}
              type="button"
              className={cn(
                'rounded-pill p-1.5 transition-transform hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-warning/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
                isActive ? 'text-warning' : 'text-line',
              )}
              aria-label={`Оценить на ${starValue} из ${max}`}
              aria-pressed={isActive}
              disabled={disabled}
              onClick={() => {
                onChange?.(starValue);
              }}
            >
              <StarIcon filled={isActive} />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn('inline-flex items-center gap-2 text-warning', className)}
      role="img"
      aria-label={`Рейтинг: ${normalizedValue} из ${max}`}
      {...props}
    >
      <div className="flex items-center gap-1">
        {Array.from({ length: max }, (_, index) => (
          <span key={index} className={index + 1 <= roundedValue ? 'text-warning' : 'text-line'}>
            <StarIcon filled={index + 1 <= roundedValue} />
          </span>
        ))}
      </div>
      <span className="text-sm font-semibold text-ink">{normalizedValue.toFixed(1)}</span>
    </div>
  );
}

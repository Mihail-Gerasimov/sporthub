'use client';

// Кнопка дизайн-системы: четыре варианта, три размера, состояние загрузки.
// Вид — по эталону ПРОСПОРТ (шаг 38.14): подпись display-шрифтом в верхнем регистре,
// solid-primary с зелёным свечением и подъёмом на 1px при наведении — единственный
// вариант с тенью и с transform; остальные меняют только обводку, фон и цвет.
// Цвета — только токенами: перекраска кнопки = правка `globals.css`.

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Варианты:
 * - `primary` — solid: зелёный фон, свечение, подъём при наведении (один главный CTA);
 * - `secondary` — outline positive: зелёная обводка, при наведении заливается;
 * - `outline` — нейтральная обводка, при наведении зеленеет обводка и текст;
 * - `ghost` — без обводки и фона, при наведении светлая подложка.
 */
const variantClassNames: Record<ButtonVariant, string> = {
  primary:
    'border-transparent bg-lime text-ink shadow-glow hover:-translate-y-px hover:shadow-floating focus-visible:ring-lime/30',
  secondary: 'border-lime bg-card text-ink hover:bg-lime hover:text-ink focus-visible:ring-lime/25',
  outline:
    'border-line bg-card text-ink hover:border-lime hover:text-lime-hov focus-visible:ring-lime/20',
  ghost: 'border-transparent bg-transparent text-ink hover:bg-card-2 focus-visible:ring-ink/10',
};

const sizeClassNames: Record<ButtonSize, string> = {
  sm: 'min-h-10 px-4 text-sm',
  md: 'min-h-12 px-5 text-sm',
  lg: 'min-h-14 px-6 text-base',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      children,
      disabled,
      fullWidth = false,
      leadingIcon,
      loading = false,
      size = 'md',
      trailingIcon,
      type = 'button',
      variant = 'primary',
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-pill border-2 font-display font-bold tracking-[0.04em] uppercase transition-[background-color,border-color,color,box-shadow,transform] outline-none focus-visible:ring-4 disabled:pointer-events-none disabled:opacity-40',
          variantClassNames[variant],
          sizeClassNames[size],
          fullWidth && 'w-full',
          className,
        )}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-pill border-2 border-current border-t-transparent"
            />
            <span className="text-[11px]">Загрузка</span>
          </>
        ) : (
          leadingIcon && <span aria-hidden="true">{leadingIcon}</span>
        )}
        <span>{children}</span>
        {!loading && trailingIcon ? <span aria-hidden="true">{trailingIcon}</span> : null}
      </button>
    );
  },
);

Button.displayName = 'Button';

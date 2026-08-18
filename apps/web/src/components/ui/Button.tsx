'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

const variantClassNames: Record<ButtonVariant, string> = {
  primary:
    'border-transparent bg-accent text-ink hover:bg-accent-strong focus-visible:ring-accent/30',
  secondary: 'border-transparent bg-teal text-ink hover:bg-teal/90 focus-visible:ring-teal/25',
  outline:
    'border-line bg-panel text-ink hover:border-accent hover:text-accent focus-visible:ring-accent/20',
  ghost:
    'border-transparent bg-transparent text-ink hover:bg-panel-strong focus-visible:ring-ink/10',
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
          'inline-flex items-center justify-center gap-2 rounded-pill border font-semibold tracking-[0.01em] transition-all outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60',
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
            <span className="text-[11px] font-semibold uppercase tracking-[0.10em]">Загрузка</span>
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

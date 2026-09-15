'use client';

// Чип-фильтр дизайн-системы: кнопка-переключатель с `aria-pressed`.
// Вид — по эталону ПРОСПОРТ (шаг 38.14): активный — зелёная заливка с тёмным
// текстом (контраст на плашке), неактивный — нейтральная обводка, при наведении
// зеленеют обводка и текст. Без тени: светится только главный CTA страницы.

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
          'inline-flex min-h-11 items-center rounded-pill border px-4 py-2 text-sm font-semibold uppercase tracking-[0.04em] transition-[background-color,border-color,color] outline-none focus-visible:ring-4',
          active
            ? 'border-transparent bg-lime text-ink focus-visible:ring-lime/30'
            : 'border-line bg-card text-ink hover:border-lime hover:text-lime-hov focus-visible:ring-lime/15',
          className,
        )}
        aria-pressed={active}
        {...props}
      />
    );
  },
);

Chip.displayName = 'Chip';

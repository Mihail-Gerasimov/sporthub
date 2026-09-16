'use client';

// Чип-фильтр дизайн-системы: кнопка-переключатель с `aria-pressed`.
// Вид — чип категории эталона ПРОСПОРТ (шаг 38.77, `HomePage.tsx:362`, эталон
// step-17): радиус 10, подложка холста, обводка 1.5px на десятой доле чернил,
// 12px 700 строчными, отступы 7/13; активный — зелёная заливка с тёмным текстом
// и зелёной обводкой. Без тени: светится только главный CTA страницы.

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
          'inline-flex items-center gap-1.5 rounded-[10px] border-[1.5px] px-[13px] py-[7px] text-[12px] leading-[1.4] font-bold whitespace-nowrap transition-[background-color,border-color,color] outline-none focus-visible:ring-4',
          active
            ? 'border-lime bg-lime text-ink focus-visible:ring-lime/30'
            : 'border-ink/10 bg-bg text-muted hover:border-lime/50 hover:text-ink focus-visible:ring-lime/15',
          className,
        )}
        aria-pressed={active}
        {...props}
      />
    );
  },
);

Chip.displayName = 'Chip';

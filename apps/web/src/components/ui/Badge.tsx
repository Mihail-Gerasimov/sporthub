// Бейдж дизайн-системы: короткая метка в верхнем регистре с семантическим тоном.
// Вид — по эталону ПРОСПОРТ (шаг 38.14): мягкая подложка, тонкая обводка того же
// оттенка, тёмный текст оттенка на подложке — читаемость на светлом фоне.
// Тени нет: бейдж — метка, а не карточка.

import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

type BadgeTone =
  | 'neutral'
  | 'accent'
  | 'teal'
  | 'success'
  | 'warning'
  | 'danger'
  | 'pending'
  | 'outline';

/** `teal` и `success` — алиасы positive-тона: у палитры один зелёный. */
const toneClassNames: Record<BadgeTone, string> = {
  neutral: 'border-transparent bg-card-2 text-ink',
  accent: 'border-lime/25 bg-lime-soft text-lime-hov',
  teal: 'border-lime/25 bg-lime-soft text-lime-hov',
  success: 'border-lime/25 bg-lime-soft text-lime-hov',
  warning: 'border-orange/25 bg-orange-soft text-orange-text',
  danger: 'border-red/25 bg-red/10 text-red',
  // Ожидание решения (очереди модерации): золотой держит `pending` по палитре.
  pending: 'border-gold/30 bg-gold/10 text-gold',
  outline: 'border-line bg-card text-ink',
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em]',
        toneClassNames[tone],
        className,
      )}
      {...props}
    />
  );
}

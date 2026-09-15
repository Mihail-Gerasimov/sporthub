// Карточка дизайн-системы: белая поверхность с обводкой и радиусом 18px.
// Вид — по эталону ПРОСПОРТ (шаг 38.14): едва заметная подложка-тень по умолчанию,
// при наведении — обводка зеленеет и тень становится плавающей, без подъёма.
// `elevated` — плавающая тень всегда (блок записи, который должен читаться
// как отдельный слой).

import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

export type CardProps = ComponentPropsWithoutRef<'div'> & {
  elevated?: boolean;
};

export function Card({ className, elevated = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-line bg-card p-5 transition-[box-shadow,border-color] hover:border-lime/40 hover:shadow-floating',
        elevated ? 'shadow-floating' : 'shadow-card',
        className,
      )}
      {...props}
    />
  );
}

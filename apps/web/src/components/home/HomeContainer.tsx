// Контейнер секции (шаг 38.76, правка по ревью 38.66; ширина по макету — ревью 38.106):
// потолок и боковые поля — у КАЖДОЙ секции свои, а не у `main`. Одна ширина на страницу:
// 1320 и поля 24 (`HomePage.tsx`: `.hp-wrap`), как у героя и призыва; карточка витрины
// в сетке 3×2 получает 413px, как в макете (при 1440/40 выходило 442).

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function HomeContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('mx-auto w-full max-w-[1320px] px-6', className)}>{children}</div>;
}

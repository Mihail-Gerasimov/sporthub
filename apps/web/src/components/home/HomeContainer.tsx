// Контейнер секции главной (шаг 38.76, правка по ревью 38.66): потолок 1440 и боковые
// поля — у КАЖДОЙ секции свои, а не у `main`. Герой, «три шага», «возможности» и призыв
// стоят во всю ширину со своими контейнерами по эталону; секции рабочей части и лидеры
// берут этот. Одно объявление — одни поля, брейкпоинты сюда же.

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function HomeContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto w-full max-w-[1440px] px-3 sm:px-4 md:px-6 lg:px-10', className)}>
      {children}
    </div>
  );
}

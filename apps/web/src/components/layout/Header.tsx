// Шапка площадки (шаг 38.57) — по эталону ПРОСПОРТ: белая, липкая, 64px, контейнер
// 1440 с полями 24, снизу линия и мягкая тень. Слева логотип, по центру навигация
// из словаря `lib/navigation.ts`, справа кластер пользователя (`HeaderUser`).
//
// Адаптив: навигация видна с точки `menu` (960px), ниже — кнопка меню и выпадающая
// панель (`HeaderMenu`, шаг 38.58); плашка с именем — тоже с 960. Логотип и кластер
// пользователя есть на любой ширине.
//
// Шаг 38.108: пункты — ровно макет (`App.tsx` ~2778): Клубы · Тренеры · Командные ·
// Маркет; «Мой Спорт» — позже, решением заказчика. Колокольчик у гостя, который есть
// в макете, не рисуется — у гостя нет ящика, значку нечего считать (названо).
'use client';

import Link from 'next/link';

import { HeaderMenu } from '@/components/layout/HeaderMenu';
import { HeaderUser } from '@/components/layout/HeaderUser';
import { NavLink } from '@/components/layout/NavLink';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { HEADER_NAV } from '@/lib/navigation';

export function Header() {
  return (
    <header className="sticky top-0 z-[200] border-b border-line bg-card shadow-card">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center text-inherit no-underline">
          <BrandLogo />
        </Link>

        <nav aria-label="Основная навигация" className="hidden items-center gap-0.5 menu:flex">
          {HEADER_NAV.map((item) => (
            <NavLink
              key={item.key}
              item={item}
              className="rounded-[9px] px-[13px] py-[7px] font-body text-[13px] font-semibold text-ink no-underline transition-colors hover:bg-bg hover:text-lime-hov"
            />
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <HeaderUser />
          <HeaderMenu />
        </div>
      </div>
    </header>
  );
}

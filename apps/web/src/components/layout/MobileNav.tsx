// Мобильный нижний док-навигатор (шаг 38.62) — по эталону: белая полоса по низу экрана
// с четырьмя вкладками; активная — зелёная полоска сверху, иконка на мягкой зелёной
// подложке, тёмно-зелёная подпись. Виден до md (768), выше навигация в шапке.
// Пункты — из `lib/navigation.ts` (`MOBILE_NAV`: Главная / Каталог / Слоты), плюс
// «Профиль», чей адрес зависит от сессии; здесь у пунктов только SVG-иконки.
// Подсветка учитывает хэш на любой странице (38.79c): «Слоты» — якорь каталога;
// пункт-страница активен на своём пути, пока хэш не забрал другой пункт.
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { MOBILE_NAV } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/useUIStore';

import {
  cabinetSectionPath,
  DEFAULT_CABINET_SECTION,
  PERSONAL_CABINET_PATH,
  PROFILE_ROOT,
} from '@/lib/service-faces';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

type MobileNavItem = { href: string; label: string; matchPaths: string[]; glyph: ReactNode };

/** Иконки пунктов — по подписи из словаря навигации. */
const GLYPHS: Record<string, ReactNode> = {
  Главная: (
    <path
      d="M4.5 10.5 12 4l7.5 6.5v8a1 1 0 0 1-1 1H14v-5h-4v5H5.5a1 1 0 0 1-1-1v-8Z"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    />
  ),
  Каталог: (
    <>
      <rect
        x="4.5"
        y="4.5"
        width="6"
        height="6"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <rect
        x="13.5"
        y="4.5"
        width="6"
        height="6"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <rect
        x="4.5"
        y="13.5"
        width="6"
        height="6"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <rect
        x="13.5"
        y="13.5"
        width="6"
        height="6"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </>
  ),
  Слоты: (
    <>
      <rect
        x="5"
        y="4.5"
        width="14"
        height="15"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M8 8.5h8M8 12h8M8 15.5h5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </>
  ),
};

const mobileNavItems: ReadonlyArray<MobileNavItem> = [
  // Главная, поиск и слоты — из словаря: адрес и подпись там, иконка здесь.
  ...MOBILE_NAV.map((item) => ({ ...item, matchPaths: [item.href], glyph: GLYPHS[item.label] })),
  {
    href: cabinetSectionPath(PERSONAL_CABINET_PATH, DEFAULT_CABINET_SECTION),
    label: 'Профиль',
    // ⚠️ Шаг 35.31. Подсвечиваем по корню `/profile`, а не по двум прежним
    // адресам: кабинетов теперь столько, сколько у человека лиц, плюс личный,
    // и перечислять их здесь значило бы держать второй список адресов.
    matchPaths: [PROFILE_ROOT],
    glyph: (
      <>
        <circle cx="12" cy="8.5" r="3.3" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="M5.5 19c1.7-3 4-4.5 6.5-4.5S16.8 16 18.5 19"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.7"
        />
      </>
    ),
  },
];

/** Цель пункта — путь и якорь: `/catalog#availability` → `/catalog` + `#availability`. */
function splitTarget(target: string): { path: string; anchor: string } {
  const [path, anchor = ''] = target.split('#');

  return { path, anchor: anchor === '' ? '' : `#${anchor}` };
}

/**
 * Активен ли пункт. Пункт-якорь — ровно по паре «путь + хэш». Пункт-страница —
 * по своему пути (главная — только точно, кабинет — по корню), если пара
 * «путь + хэш» не принадлежит другому пункту дока: на `/catalog#availability`
 * активны «Слоты», а не «Каталог»; на `/#steps` — «Главная», якорей главной
 * в доке нет.
 */
function isMobileNavItemActive(
  item: MobileNavItem,
  pathname: string,
  hash: string,
  items: ReadonlyArray<MobileNavItem>,
): boolean {
  const claimedByOther = items.some(
    (other) => other !== item && other.matchPaths.includes(`${pathname}${hash}`),
  );

  return item.matchPaths.some((target) => {
    const { path, anchor } = splitTarget(target);

    if (anchor !== '') return pathname === path && hash === anchor;
    if (claimedByOther) return false;

    return path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);
  });
}

export function MobileNav() {
  const pathname = usePathname();
  const isHeaderMenuOpen = useUIStore((state) => state.isHeaderMenuOpen);
  // Хэш не приходит из `usePathname` — читаем окно (шаг 38.62: пункты «Поиск»
  // и «Слоты» — якоря главной, и подсветка без хэша была слепой).
  // ⚠️ `next/link` ведёт `/#discover` через `history.pushState`, а на него ни
  // `hashchange`, ни смена `pathname` не поднимаются — клик по самому доку оставлял
  // бы подсветку мёртвой (тупик № 10). Поэтому клик ставит хэш сам, «назад/вперёд»
  // ловит `popstate`, а `hashchange` остаётся для правки адреса руками.
  const [hash, setHash] = useState('');

  useEffect(() => {
    const readHash = () => setHash(window.location.hash);

    readHash();
    window.addEventListener('hashchange', readHash);
    window.addEventListener('popstate', readHash);

    return () => {
      window.removeEventListener('hashchange', readHash);
      window.removeEventListener('popstate', readHash);
    };
  }, [pathname]);

  // Пока открыто меню шапки, док не рисуется: у обёртки шапки свой контекст наложения,
  // и `fixed`-док лежал бы поверх оверлея, оставаясь кликабельным.
  if (isHeaderMenuOpen) return null;

  return (
    <nav
      aria-label="Мобильная навигация"
      className="fixed inset-x-0 bottom-0 z-50 flex items-stretch border-t border-line bg-card md:hidden"
    >
      {mobileNavItems.map((item) => {
        const isActive = isMobileNavItemActive(item, pathname, hash, mobileNavItems);

        return (
          <Link
            key={item.label}
            href={item.href}
            onClick={() => setHash(splitTarget(item.href).anchor)}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative flex min-w-0 flex-1 flex-col items-center gap-[3px] px-1 pt-2.5 pb-1.5 text-center font-body text-[10px] no-underline transition-colors',
              isActive ? 'font-bold text-lime-hov' : 'font-medium text-muted hover:text-lime-hov',
            )}
          >
            {/* Метка активного пункта — зелёная полоска сверху, как в эталоне */}
            {isActive ? (
              <span
                aria-hidden="true"
                className="absolute top-0 left-1/2 h-[3px] w-7 -translate-x-1/2 rounded-b-[3px] bg-lime"
              />
            ) : null}
            <span
              className={cn(
                'flex size-8 items-center justify-center rounded-[12px] transition-colors',
                isActive && 'bg-lime-soft',
              )}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
                {item.glyph}
              </svg>
            </span>
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// Мобильный нижний док-навигатор (шаг 38.62) — по эталону: белая полоса по низу экрана
// с вкладками; активная — зелёная полоска сверху, иконка на мягкой зелёной подложке,
// тёмно-зелёная подпись. Виден до md (768), выше навигация в шапке.
//
// Пункты — ровно `BOTTOM_TABS` макета (шаг 38.108, `App.tsx` ~2700): Главная / Клубы /
// Лента / Маркет из словаря `lib/navigation.ts` (`MOBILE_NAV`: адрес, подпись и режим
// там, иконка здесь) плюс «Мой»: гостю — кнопка входа (модалка, кабинета у гостя нет,
// ссылка вела бы на увод на главную), вошедшему — ссылка в личный кабинет.
// Пункт с режимом («Клубы») ставит режим стора на клике, как `NavLink` в шапке.
//
// Подсветка учитывает хэш на любой странице (38.79c): пункт-якорь — по паре «путь +
// хэш», пункт-страница — на своём пути, пока пара не принадлежит другому пункту.
// Адрес, который делят два пункта («Лента» и «Маркет» → «в разработке»), не подсвечивает
// никого — какой из них выбран, по адресу не узнать; подсветить оба значило бы соврать.
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { MOBILE_NAV, type NavItem } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/useAuthStore';
import { useFilterStore } from '@/stores/useFilterStore';
import { useUIStore } from '@/stores/useUIStore';

import {
  cabinetSectionPath,
  DEFAULT_CABINET_SECTION,
  PERSONAL_CABINET_PATH,
  PROFILE_ROOT,
} from '@/lib/service-faces';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

type MobileNavItem = NavItem & { matchPaths: string[]; glyph: ReactNode };

/** Подпись пункта кабинета — его адрес зависит от сессии, в словаре его нет. */
const CABINET_LABEL = 'Мой';

/** Иконки пунктов — по подписи из словаря навигации (дом, гантель, огонь, коробка). */
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
  Клубы: (
    <path
      d="M6.5 8.5v7M17.5 8.5v7M3.5 10v4M20.5 10v4M6.5 12h11"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.7"
    />
  ),
  Лента: (
    <path
      d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5Z"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    />
  ),
  Маркет: (
    <path
      d="M4 8.5 12 4l8 4.5v9L12 22l-8-4.5v-9ZM4 8.5 12 13l8-4.5M12 13v9"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    />
  ),
};

const mobileNavItems: ReadonlyArray<MobileNavItem> = [
  // Главная, клубы, лента и маркет — из словаря: адрес, подпись и режим там, иконка здесь.
  ...MOBILE_NAV.map((item) => ({ ...item, matchPaths: [item.href], glyph: GLYPHS[item.label] })),
  {
    href: cabinetSectionPath(PERSONAL_CABINET_PATH, DEFAULT_CABINET_SECTION),
    label: CABINET_LABEL,
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
 * активны «Клубы» — якорей каталога в доке нет; на `/#steps` — «Главная».
 * Цель, которую делят два пункта, не активна ни у одного: выбор по адресу неизвестен.
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
    const shared = items.filter((other) => other.matchPaths.includes(target)).length > 1;

    if (shared) return false;
    if (anchor !== '') return pathname === path && hash === anchor;
    if (claimedByOther) return false;

    return path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);
  });
}

export function MobileNav() {
  const pathname = usePathname();
  const isHeaderMenuOpen = useUIStore((state) => state.isHeaderMenuOpen);
  const openAuthModal = useUIStore((state) => state.openAuthModal);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const setDiscoveryMode = useFilterStore((state) => state.setDiscoveryMode);
  // Хэш не приходит из `usePathname` — читаем окно (шаг 38.62: пункты-якоря
  // без хэша подсвечивались слепо).
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
        // Один вид у ссылки и у кнопки: у кнопки сброшены рамка и заливка браузера.
        const className = cn(
          'relative flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-[3px] border-0 bg-transparent px-1 pt-2.5 pb-1.5 text-center font-body text-[10px] no-underline transition-colors',
          isActive ? 'font-bold text-lime-hov' : 'font-medium text-muted hover:text-lime-hov',
        );
        const body = (
          <>
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
          </>
        );

        // «Мой» гостю — вход: кабинета у гостя нет, ссылка вела бы на увод на главную.
        if (item.label === CABINET_LABEL && !isAuthenticated) {
          return (
            <button key={item.label} type="button" onClick={openAuthModal} className={className}>
              {body}
            </button>
          );
        }

        return (
          <Link
            key={item.label}
            href={item.href}
            onClick={() => {
              setHash(splitTarget(item.href).anchor);
              if (item.mode !== undefined) setDiscoveryMode(item.mode);
            }}
            aria-current={isActive ? 'page' : undefined}
            className={className}
          >
            {body}
          </Link>
        );
      })}
    </nav>
  );
}

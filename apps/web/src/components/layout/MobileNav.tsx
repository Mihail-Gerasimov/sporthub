// Phase 28: мобильный нижний док-навигатор. Виден только на 480 (sm-) — на md+
// nav в Header'е уже доступна. 4 пункта (Главная / Поиск / Слоты / Профиль) с
// SVG-иконками. В новой палитре — тёмная карточка с lime-акцентом для активного.
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const mobileNavItems: ReadonlyArray<{
  href: string;
  label: string;
  matchPaths: string[];
  glyph: ReactNode;
}> = [
  {
    href: '/',
    label: 'Главная',
    matchPaths: ['/'],
    glyph: (
      <path
        d="M4.5 10.5 12 4l7.5 6.5v8a1 1 0 0 1-1 1H14v-5h-4v5H5.5a1 1 0 0 1-1-1v-8Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    ),
  },
  {
    href: '/#discover',
    label: 'Поиск',
    matchPaths: ['/#discover'],
    glyph: (
      <>
        <circle cx="11" cy="11" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="m15.5 15.5 4 4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.7"
        />
      </>
    ),
  },
  {
    href: '/#availability',
    label: 'Слоты',
    matchPaths: ['/#availability'],
    glyph: (
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
  },
  {
    href: '/profile/athlete/dashboard',
    label: 'Профиль',
    matchPaths: ['/profile/athlete', '/profile/provider'],
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

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Мобильная навигация"
      className="fixed inset-x-3 bottom-3 z-50 flex items-center justify-between rounded-[18px] border border-[var(--ui-line)] bg-[var(--ui-card)] px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur md:hidden"
    >
      {mobileNavItems.map((item) => {
        // Активность определяем по pathname — точное совпадение для «/», префикс для разделов.
        const isActive = item.matchPaths.some((path) =>
          path === '/' ? pathname === '/' : pathname.startsWith(path),
        );
        const colorClass = isActive ? 'text-[var(--ui-lime)]' : 'text-[var(--ui-muted)]';
        return (
          <Link
            key={item.label}
            href={item.href}
            className={`flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-1 rounded-[14px] px-2 py-2 text-center font-body text-[10px] font-bold uppercase tracking-[0.10em] no-underline transition-colors hover:text-[var(--ui-lime)] ${colorClass}`}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6">
              {item.glyph}
            </svg>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

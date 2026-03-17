import Link from 'next/link';

import { Button } from '@/components/ui';

const navigationItems = [
  { href: '/#discover', label: 'Подборки' },
  { href: '/#clubs', label: 'Клубы' },
  { href: '/#trainers', label: 'Тренеры' },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-panel/90 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-10">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-card bg-accent text-lg font-bold text-panel shadow-floating">
            S
          </span>
          <span className="flex flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-[0.26em] text-muted">
              SportHub
            </span>
            <span className="font-display text-lg font-semibold tracking-tight text-ink">
              Найди свой ритм
            </span>
          </span>
        </Link>

        <nav
          aria-label="Основная навигация"
          className="hidden items-center gap-2 rounded-pill border border-line bg-canvas/80 px-3 py-2 md:flex"
        >
          {navigationItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="rounded-pill px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-panel hover:text-accent"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden text-right text-xs leading-5 text-muted xl:block">
            <p className="font-semibold uppercase tracking-[0.18em]">Samara MVP</p>
            <p>Маркетплейс занятий и клубов</p>
          </div>
          <Button size="sm">Войти</Button>
        </div>
      </div>
    </header>
  );
}

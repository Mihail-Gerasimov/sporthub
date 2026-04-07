'use client';

import Link from 'next/link';

import { AUTH_ACCOUNT_TYPE_LABELS } from '@/lib/constants';
import { Button } from '@/components/ui';
import { getPersonalCabinetConfig } from '@/stores/useAuthStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

const navigationItems = [
  { href: '/#discover', label: 'Подборки' },
  { href: '/#results', label: 'Выдача' },
  { href: '/#availability', label: 'Слоты' },
];

export function Header() {
  const openAuthModal = useUIStore((state) => state.openAuthModal);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const accountType = useAuthStore((state) => state.accountType);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const isImpersonating = useAuthStore((state) => state.isImpersonating);
  const logout = useAuthStore((state) => state.logout);
  const accountInitial = user?.name.trim().charAt(0).toUpperCase() || 'S';
  const cabinetConfig = getPersonalCabinetConfig(accountType);
  // Универсальная ссылка в кабинет — работает и для athlete, и для provider
  const cabinetHref = cabinetConfig?.profilePath ?? null;

  // Admin без impersonation → ссылка на «Панель управления» вместо кабинета
  const isAdminDirect = isAdmin && !isImpersonating;

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-panel/90 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-10">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-card bg-accent text-lg font-bold text-panel">
            S
          </span>
          <span className="flex flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
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
          {isAuthenticated && user ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden min-w-0 text-right md:block">
                <p className="truncate text-sm font-semibold leading-5 text-ink">{user.name}</p>
                {isAdminDirect ? (
                  <p className="text-[11px] uppercase tracking-[0.12em] leading-4 text-muted">
                    Администратор
                  </p>
                ) : accountType ? (
                  <p className="text-[11px] uppercase tracking-[0.12em] leading-4 text-muted">
                    {AUTH_ACCOUNT_TYPE_LABELS[accountType]}
                  </p>
                ) : null}
              </div>
              {isAdminDirect ? (
                <Link
                  href="/service-portal/dashboard"
                  aria-label="Панель управления"
                  className="flex size-11 shrink-0 items-center justify-center rounded-pill border border-line bg-canvas text-sm font-semibold uppercase text-ink transition-colors hover:border-accent hover:text-accent"
                >
                  {accountInitial}
                </Link>
              ) : cabinetHref ? (
                <Link
                  href={cabinetHref}
                  aria-label="Перейти в личный кабинет"
                  className="flex size-11 shrink-0 items-center justify-center rounded-pill border border-line bg-canvas text-sm font-semibold uppercase text-ink transition-colors hover:border-accent hover:text-accent"
                >
                  {accountInitial}
                </Link>
              ) : (
                <div
                  role="img"
                  aria-label={`Аватар ${user.name}`}
                  className="flex size-11 shrink-0 items-center justify-center rounded-pill border border-line bg-canvas text-sm font-semibold uppercase text-ink"
                >
                  {accountInitial}
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  logout();
                }}
              >
                Выйти
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={() => {
                openAuthModal();
              }}
            >
              Войти
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

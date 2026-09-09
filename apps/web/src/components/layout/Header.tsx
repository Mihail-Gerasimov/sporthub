// Phase 28: главный Header проекта SportHub в новой тёмной палитре дизайн-системы.
// Структура и адаптив 1-в-1 с claude-design/project/SportHub Header - Standalone Source.html.
//
// Адаптив:
// - sm (480-): logo-mark + cluster справа (bell + avatar + кнопка Выйти иконкой), nav и user-info скрыты.
// - md (768): добавляется logo-tag (без eyebrow), nav-pill из 3 пунктов, кнопка Выйти иконкой.
// - lg (1024+): добавляется logo-eyebrow «SPORTHUB» и user-info (имя + роль), кнопка Выйти текстом.
// - xxl (1440+): контейнер достигает потолка max-w-[1440px], пустые поля по бокам выше 1440.
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AUTH_ACCOUNT_TYPE_LABELS } from '@sporthub/types';
import { NotificationBell } from '@/components/layout/NotificationBell';
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
  const stopImpersonation = useAuthStore((state) => state.stopImpersonation);
  const router = useRouter();
  const accountInitial = user?.name.trim().charAt(0).toUpperCase() || 'S';
  const cabinetConfig = getPersonalCabinetConfig(accountType);
  const cabinetHref = cabinetConfig?.profilePath ?? null;

  // Admin без impersonation → ссылка на «Панель управления» вместо личного кабинета.
  const isAdminDirect = isAdmin && !isImpersonating;

  const handleLogout = async () => {
    if (isImpersonating) {
      stopImpersonation();
      router.push('/service-portal/dashboard');
      // Phase 30.6: симметрично stopImpersonation в ImpersonationBanner —
      // RSC-кэш сегмента инвалидируется, иначе страница висит на старой личности.
      router.refresh();
    } else {
      // ⚠️ Сначала дожидаемся выхода, потом уходим со страницы. Без ожидания
      // главная успевала бы отрисоваться на сервере под ЕЩЁ ЖИВОЙ сессией:
      // человек нажал «Выйти», а шапка показывает его имя.
      await logout();
      // Phase 30.6: replace, не push — выход не должен оставлять ЛК в history-back.
      // refresh после replace инвалидирует RSC-кэш текущего ЛК-сегмента.
      router.replace('/');
      router.refresh();
    }
  };

  return (
    <header className="relative border-b border-[#BFDFD2]/20 bg-[#0A1029] text-[var(--ui-bg)] after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-[linear-gradient(90deg,transparent,var(--ui-lime)_50%,transparent)] after:opacity-60">
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-3 px-4 py-4 md:gap-6 md:px-6 lg:px-10">
        {/* Лого: марка + (на md+ tagline, на lg+ ещё eyebrow) */}
        <Link href="/" className="flex shrink-0 items-center gap-3 text-inherit no-underline">
          {/* Лого-марка 44×44 с инкрустированным гранжем через ::before */}
          <span className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-[var(--ui-lime)] font-display text-[22px] leading-none text-[var(--ui-ink)] before:pointer-events-none before:absolute before:inset-0 before:opacity-[0.35] before:[background:repeating-linear-gradient(135deg,rgba(0,0,0,0.18)_0_2px,transparent_2px_8px)]">
            S
          </span>
          {/* Текст-лого: скрыт на sm (480-), tagline появляется на md (768+),
              eyebrow «SPORTHUB» — только на lg (1024+) */}
          <span className="hidden min-w-0 flex-col leading-none md:flex">
            <span className="mb-1 hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-[#BFDFD2] lg:inline">
              SportHub
            </span>
            <span className="whitespace-nowrap font-display text-[15px] uppercase tracking-[0.01em] text-[var(--ui-bg)] lg:text-base">
              Найди свой ритм
            </span>
          </span>
        </Link>

        {/* Pill-навигация: скрыта на 480, появляется на md+ */}
        <nav
          aria-label="Основная навигация"
          className="hidden items-center gap-1 rounded-full border border-[#BFDFD2]/20 bg-white/[0.06] p-[5px] md:flex"
        >
          {navigationItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="rounded-full px-3 py-2 font-body text-[11px] font-bold uppercase tracking-[0.10em] text-[var(--ui-bg)] transition-colors hover:bg-white/[0.12] hover:text-[var(--ui-lime)] md:px-4 md:text-[12px] md:tracking-[0.12em]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Cluster справа: bell + user-info + avatar + Выйти/Войти */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          {isAuthenticated && user ? (
            <>
              {/* NotificationBell — внутри своя стилизация */}
              <NotificationBell />

              {/* User-info: имя + роль, виден только lg+ */}
              <div className="hidden min-w-0 flex-col items-end text-right leading-tight lg:flex">
                <p
                  className="mb-1 max-w-[140px] truncate font-body text-[13px] font-medium text-[var(--ui-bg)]"
                  title={user.name}
                >
                  {user.name}
                </p>
                {isAdminDirect ? (
                  <p className="font-body text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--ui-lime)]">
                    Администратор
                  </p>
                ) : accountType ? (
                  <p className="font-body text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--ui-lime)]">
                    {AUTH_ACCOUNT_TYPE_LABELS[accountType]}
                  </p>
                ) : null}
              </div>

              {/* Аватар — пилюля 44×44 с инициалом, ссылка в кабинет */}
              {isAdminDirect ? (
                <Link
                  href="/service-portal/dashboard"
                  aria-label="Панель управления"
                  className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-[var(--ui-line)] bg-[var(--ui-card)] font-display text-[16px] uppercase text-[var(--ui-ink)] no-underline transition-colors hover:border-[var(--ui-lime)] hover:text-[var(--ui-lime)]"
                >
                  {accountInitial}
                </Link>
              ) : cabinetHref ? (
                <Link
                  href={cabinetHref}
                  aria-label="Перейти в личный кабинет"
                  className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-[var(--ui-line)] bg-[var(--ui-card)] font-display text-[16px] uppercase text-[var(--ui-ink)] no-underline transition-colors hover:border-[var(--ui-lime)] hover:text-[var(--ui-lime)]"
                >
                  {accountInitial}
                </Link>
              ) : (
                <div
                  role="img"
                  aria-label={`Аватар ${user.name}`}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-[var(--ui-line)] bg-[var(--ui-card)] font-display text-[16px] uppercase text-[var(--ui-ink)]"
                >
                  {accountInitial}
                </div>
              )}

              {/* Кнопка «Выйти» — warning-вариант. На 480/768 — иконка-дверь, на lg+ — текст. */}
              <button
                type="button"
                aria-label="Выйти"
                onClick={() => {
                  void handleLogout();
                }}
                className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border-2 border-[var(--ui-orange)] bg-[var(--ui-bg)] font-body font-bold uppercase tracking-[0.10em] text-[var(--ui-ink)] transition-all hover:bg-[var(--ui-orange)] hover:text-[var(--ui-bg)] lg:px-5 lg:py-3 lg:text-[13px]"
              >
                {/* Icon-only вариант на sm/md (44×44, иконка-дверь) */}
                <span className="flex size-11 items-center justify-center lg:hidden">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-[18px]"
                    aria-hidden="true"
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </span>
                {/* Текст «Выйти» — только lg+ */}
                <span className="hidden lg:inline">Выйти</span>
              </button>
            </>
          ) : (
            // Гость: одна кнопка «Войти» (primary outline lime)
            <button
              type="button"
              onClick={openAuthModal}
              className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border-2 border-[var(--ui-lime)] bg-[var(--ui-bg)] px-5 py-3 font-body text-[13px] font-bold uppercase tracking-[0.10em] text-[var(--ui-ink)] transition-all hover:bg-[var(--ui-lime)] hover:text-[var(--ui-bg)]"
            >
              Войти
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

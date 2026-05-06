/**
 * Client-component админ-Dashboard (Phase 28.20 rebrand).
 * Список пользователей платформы (без admin) с поиском, фильтрами и
 * быстрыми actions (impersonate, recompute reliability, lift quarantine).
 *
 * Phase 28.20:
 * — sec-head: eyebrow `Admin · Users` + Bowlby + sub `N пользователей · M показано`
 *   + sec-pill «обновлено сейчас» справа (статика);
 * — toolbar: search-input + lime-solid кнопка `Фильтры ⌃` (toggle ротация);
 * — filters-panel collapsible: grid 2-col Роль / Статус;
 * — user-card: grid `1fr 440px` на 1280+, 1-col на ≤1024;
 * — action правило: при карантине атлет получает «Снять карантин» вместо
 *   «Пересчитать рейтинг» (не плодим 3-ю кнопку, action-zone остаётся 2 кнопки);
 * — pagination client-side: 15 per page, pager всегда видим;
 * — admin фильтруются (как раньше), tag-бейджи «Новый/Ожидает» не вводим
 *   (ReliabilityBadge «Новый» этого достаточно).
 */
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ReliabilityBadge } from '@/components/ui/ReliabilityBadge';
import { getAthleteActiveFutureBookings } from '@/components/profile/athlete-bookings';
import { getProviderClubs, getProviderTrainers } from '@/components/profile/provider-helpers';
import {
  computeAthleteReliability,
  isAthleteInQuarantine,
  type QuarantineResult,
  type ReliabilityResult,
} from '@/lib/reliability';
import { cn } from '@/lib/utils';
import { useAuthStore, userRoleToAccountType, type AuthSessionUser } from '@/stores/useAuthStore';
import { useToastStore } from '@/stores/useToastStore';
import type { Booking, Club, Trainer, User, UserRole } from '@/types';

type DashboardPageProps = {
  users: User[];
  clubs: Club[];
  trainers: Trainer[];
  bookings: Booking[];
};

type RoleFilter = 'all' | 'athlete' | 'provider';
type StatusFilter = 'all' | 'active' | 'banned' | 'suspended';

const PAGE_SIZE = 15;
const MAX_VISIBLE_PAGE_BUTTONS = 5;

const ROLE_LABELS: Record<UserRole, string> = {
  athlete: 'Спортсмен',
  club_owner: 'Провайдер',
  trainer: 'Провайдер',
  admin: 'Администратор',
};

// Bейдж роли: атлет/провайдер — lime-fill, админ — orange-fill
type RoleTone = 'lime-fill' | 'orange-fill';
const ROLE_TONES: Record<UserRole, RoleTone> = {
  athlete: 'lime-fill',
  club_owner: 'lime-fill',
  trainer: 'lime-fill',
  admin: 'orange-fill',
};

const STATUS_LABELS: Record<NonNullable<User['status']>, string> = {
  active: 'Active',
  banned: 'Banned',
  suspended: 'Suspended',
};

// SVG иконки
const ICON_SEARCH = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.8"
    className="h-4 w-4"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);

const ICON_CHEV_DOWN = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2.4"
    className="h-3.5 w-3.5"
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const ICON_CHEV_LEFT = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2.4"
    className="h-3.5 w-3.5"
  >
    <path d="M15 6l-6 6 6 6" />
  </svg>
);

const ICON_CHEV_RIGHT = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2.4"
    className="h-3.5 w-3.5"
  >
    <path d="M9 6l6 6-6 6" />
  </svg>
);

/** Проверяет, соответствует ли роль пользователя фильтру */
function matchesRoleFilter(role: UserRole, filter: RoleFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'athlete') return role === 'athlete';
  if (filter === 'provider') return role === 'club_owner' || role === 'trainer';
  return true;
}

/** Возвращает краткую статистику пользователя */
function getUserStats(
  user: User,
  bookings: Booking[],
  clubs: Club[],
  trainers: Trainer[],
): { label: string; value: number } {
  if (user.role === 'athlete') {
    const activeBookings = getAthleteActiveFutureBookings({
      athleteUserId: user.id,
      bookings,
    });
    return { label: 'Активных записей', value: activeBookings.length };
  }
  // provider (club_owner или trainer)
  const providerClubs = getProviderClubs(clubs, user.id);
  const providerTrainers = getProviderTrainers(trainers, user.id);
  return { label: 'Публикаций', value: providerClubs.length + providerTrainers.length };
}

export function DashboardPage({ users, clubs, trainers, bookings }: DashboardPageProps) {
  const router = useRouter();
  const startImpersonation = useAuthStore((s) => s.startImpersonation);
  const addToast = useToastStore((s) => s.addToast);

  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  // Phase 24 Step 24.15: локальный оверлей снятых карантинов.
  const [liftedUserIds, setLiftedUserIds] = useState<Set<number>>(new Set());

  // Wrapper-обработчики, которые при смене фильтра возвращают пагинатор на 1-ю страницу.
  // Делаем явно через handler'ы (а не useEffect/useMemo с setState) — это чище и
  // не получает предупреждений react-hooks о cascading renders.
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };
  const handleRoleChange = (value: RoleFilter) => {
    setRoleFilter(value);
    setCurrentPage(1);
  };
  const handleStatusChange = (value: StatusFilter) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  // Исключаем admin из списка (как раньше — N3)
  const nonAdminUsers = useMemo(() => users.filter((u) => u.role !== 'admin'), [users]);

  // Фильтрация
  const filteredUsers = useMemo(() => {
    let result = nonAdminUsers;

    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      result = result.filter(
        (user) =>
          String(user.id).includes(query) ||
          user.name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query),
      );
    }
    if (roleFilter !== 'all') {
      result = result.filter((user) => matchesRoleFilter(user.role, roleFilter));
    }
    if (statusFilter !== 'all') {
      result = result.filter((user) => (user.status ?? 'active') === statusFilter);
    }
    return result;
  }, [nonAdminUsers, searchQuery, roleFilter, statusFilter]);

  // Pagination client-side
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedUsers = useMemo(
    () => filteredUsers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredUsers, safePage],
  );

  const visiblePageNumbers = useMemo(() => {
    const half = Math.floor(MAX_VISIBLE_PAGE_BUTTONS / 2);
    let start = Math.max(1, safePage - half);
    const end = Math.min(totalPages, start + MAX_VISIBLE_PAGE_BUTTONS - 1);
    start = Math.max(1, end - MAX_VISIBLE_PAGE_BUTTONS + 1);
    const pages: number[] = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }, [safePage, totalPages]);

  /** Обработчик impersonation */
  function handleImpersonate(user: User) {
    const targetAccountType = userRoleToAccountType(user.role);
    if (!targetAccountType) return;

    const targetSessionUser: AuthSessionUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
    };

    startImpersonation(targetSessionUser, targetAccountType);

    const adminUser = useAuthStore.getState().adminOriginalUser ?? useAuthStore.getState().user;
    fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'admin_impersonate_start',
        actorId: adminUser?.id ?? 0,
        actorRole: 'admin',
        entityType: 'user',
        entityId: targetSessionUser.id,
        meta: { targetUserName: targetSessionUser.name, targetAccountType },
      }),
    }).catch(() => {});

    const profilePath = targetAccountType === 'athlete' ? '/profile/athlete' : '/profile/provider';
    router.push(profilePath);
    router.refresh();
  }

  /** Phase 24 Step 24.15: снятие карантина */
  async function handleLiftQuarantine(userId: number) {
    const adminUserId = useAuthStore.getState().user?.id ?? 0;
    try {
      const response = await fetch(`/api/admin/users/${userId}/lift-quarantine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUserId }),
      });
      const body = (await response.json()) as { success: boolean; error?: string };
      if (!response.ok || !body.success) {
        addToast({ message: body.error ?? 'Не удалось снять карантин', tone: 'error' });
        return;
      }
      setLiftedUserIds((prev) => new Set(prev).add(userId));
      addToast({ message: 'Карантин снят', tone: 'success' });
      router.refresh();
    } catch {
      addToast({ message: 'Ошибка при снятии карантина', tone: 'error' });
    }
  }

  /** Phase 24 Step 24.15: пересчёт рейтинга (no-op + лог) */
  async function handleRecomputeReliability(userId: number) {
    const adminUserId = useAuthStore.getState().user?.id ?? 0;
    try {
      const response = await fetch(`/api/admin/users/${userId}/recompute-reliability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUserId }),
      });
      const body = (await response.json()) as { success: boolean; error?: string };
      if (!response.ok || !body.success) {
        addToast({ message: body.error ?? 'Не удалось пересчитать', tone: 'error' });
        return;
      }
      addToast({ message: 'Рейтинг пересчитан', tone: 'success' });
    } catch {
      addToast({ message: 'Ошибка при пересчёте рейтинга', tone: 'error' });
    }
  }

  return (
    <div className="flex w-full flex-col gap-5 sm:gap-[22px]">
      {/* Sec-head */}
      <header className="flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="m-0 text-[11px] font-bold uppercase tracking-[0.22em] text-muted">
            Admin · Users
          </p>
          <h1 className="m-0 font-display text-[24px] uppercase leading-none tracking-tight text-ink sm:text-[26px] lg:text-[28px] xl:text-[32px]">
            Пользователи платформы
          </h1>
          <p className="m-0 mt-1 text-[13px] font-normal leading-[1.5] text-muted">
            <span className="font-bold tabular-nums text-ink">{nonAdminUsers.length}</span>{' '}
            пользователей ·{' '}
            <span className="font-bold tabular-nums text-ink">{filteredUsers.length}</span> показано
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-ink">
          обновлено сейчас
        </span>
      </header>

      {/* Toolbar: search + lime-solid Фильтры toggle */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_auto]">
        <div
          className={cn(
            'relative rounded-[14px] border border-line bg-card-2 transition-colors focus-within:border-lime',
          )}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 inline-flex -translate-y-1/2 items-center text-muted"
          >
            {ICON_SEARCH}
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Поиск по ID, имени или email…"
            className="w-full bg-transparent py-3.5 pl-11 pr-4 text-sm font-medium text-ink outline-none placeholder:text-disabled"
          />
        </div>

        <button
          type="button"
          onClick={() => setShowFilters((prev) => !prev)}
          aria-expanded={showFilters}
          className="inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-[14px] border-0 bg-lime px-5 py-3.5 text-[11px] font-bold uppercase tracking-[0.14em] text-bg transition-colors hover:bg-lime-hov sm:px-6"
        >
          Фильтры
          <span
            aria-hidden="true"
            className={cn(
              'inline-flex items-center transition-transform',
              showFilters ? 'rotate-180' : 'rotate-0',
            )}
          >
            {ICON_CHEV_DOWN}
          </span>
        </button>
      </div>

      {/* Filters panel collapsible */}
      {showFilters ? (
        <div className="rounded-[14px] border border-line bg-card-2 p-[18px] sm:p-[18px_22px]">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FilterField label="Роль">
              <FilterSelect
                value={roleFilter}
                active={roleFilter !== 'all'}
                onChange={(v) => handleRoleChange(v as RoleFilter)}
                options={[
                  { value: 'all', label: 'Все роли' },
                  { value: 'athlete', label: 'Спортсмены' },
                  { value: 'provider', label: 'Провайдеры' },
                ]}
              />
            </FilterField>
            <FilterField label="Статус">
              <FilterSelect
                value={statusFilter}
                active={statusFilter !== 'all'}
                onChange={(v) => handleStatusChange(v as StatusFilter)}
                options={[
                  { value: 'all', label: 'Все статусы' },
                  { value: 'active', label: 'Active' },
                  { value: 'banned', label: 'Banned' },
                  { value: 'suspended', label: 'Suspended' },
                ]}
              />
            </FilterField>
          </div>
        </div>
      ) : null}

      {/* Список пользователей */}
      {pagedUsers.length === 0 ? (
        <div className="rounded-[16px] border border-line bg-card p-10 text-center text-muted">
          Ничего не найдено
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {pagedUsers.map((user) => {
            const stats = getUserStats(user, bookings, clubs, trainers);
            const reliability =
              user.role === 'athlete' ? computeAthleteReliability(bookings, user.id) : null;
            const quarantine: QuarantineResult | { inQuarantine: false } =
              user.role === 'athlete' && !liftedUserIds.has(user.id)
                ? isAthleteInQuarantine(bookings, user.id, new Date(), {
                    quarantineLiftedAt: user.quarantineLiftedAt ?? null,
                  })
                : { inQuarantine: false as const };

            return (
              <UserCard
                key={user.id}
                user={user}
                stats={stats}
                reliability={reliability}
                quarantine={quarantine}
                onImpersonate={() => handleImpersonate(user)}
                onLiftQuarantine={() => handleLiftQuarantine(user.id)}
                onRecomputeReliability={() => handleRecomputeReliability(user.id)}
              />
            );
          })}
        </div>
      )}

      {/* Pagination всегда видна */}
      <div className="flex flex-col gap-3 px-1 pt-1.5 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs font-medium text-muted">
          {filteredUsers.length === 0 ? (
            'Показано 0 из 0'
          ) : (
            <>
              Показано{' '}
              <strong className="font-bold text-ink">
                {(safePage - 1) * PAGE_SIZE + 1}–
                {Math.min(safePage * PAGE_SIZE, filteredUsers.length)}
              </strong>{' '}
              из <strong className="font-bold text-ink">{filteredUsers.length}</strong>
            </>
          )}
        </span>

        <div className="flex flex-wrap items-center gap-1.5">
          <PageButton
            disabled={safePage === 1}
            onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
            ariaLabel="Предыдущая страница"
          >
            {ICON_CHEV_LEFT}
          </PageButton>
          {visiblePageNumbers.map((page) => (
            <PageButton
              key={page}
              active={page === safePage}
              onClick={() => setCurrentPage(page)}
              ariaLabel={`Страница ${page}`}
            >
              {page}
            </PageButton>
          ))}
          <PageButton
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
            ariaLabel="Следующая страница"
          >
            {ICON_CHEV_RIGHT}
          </PageButton>
        </div>
      </div>
    </div>
  );
}

// --- Карточка пользователя ---

type UserCardProps = {
  user: User;
  stats: { label: string; value: number };
  reliability: ReliabilityResult | null;
  quarantine: QuarantineResult | { inQuarantine: false };
  onImpersonate: () => void;
  onLiftQuarantine: () => void;
  onRecomputeReliability: () => void;
};

function UserCard({
  user,
  stats,
  reliability,
  quarantine,
  onImpersonate,
  onLiftQuarantine,
  onRecomputeReliability,
}: UserCardProps) {
  const isAthlete = user.role === 'athlete';
  const inQuarantine = quarantine.inQuarantine;
  const userStatus = user.status ?? 'active';

  return (
    <article className="grid grid-cols-1 items-center gap-x-4 gap-y-3.5 rounded-[16px] border border-line bg-card p-[18px] transition-colors hover:border-line sm:p-[18px_22px] xl:grid-cols-[1fr_440px]">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-[13px] font-semibold tabular-nums text-muted">
            #{user.id}
          </span>
          <h2 className="m-0 break-words font-display text-[18px] uppercase leading-none tracking-tight text-ink">
            {user.name}
          </h2>
          <Badge tone={ROLE_TONES[user.role]}>{ROLE_LABELS[user.role]}</Badge>
          <StatusBadge status={userStatus} />
          {reliability ? <ReliabilityBadge reliability={reliability} compact showDetails /> : null}
          {inQuarantine && quarantine.until ? (
            <Badge tone="red">Карантин до {formatQuarantineUntil(quarantine.until)}</Badge>
          ) : null}
        </div>

        <p className="m-0 break-all text-[13px] font-medium text-muted">{user.email}</p>

        <p className="m-0 text-xs font-medium text-muted">
          {stats.label}: <strong className="font-bold tabular-nums text-ink">{stats.value}</strong>
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {isAthlete && inQuarantine ? (
          // Атлет в карантине: «Снять карантин» заменяет «Пересчитать рейтинг»
          <ButtonGhost onClick={onLiftQuarantine}>Снять карантин</ButtonGhost>
        ) : isAthlete ? (
          // Атлет без карантина: «Пересчитать рейтинг»
          <ButtonGhost onClick={onRecomputeReliability}>Пересчитать рейтинг</ButtonGhost>
        ) : null}

        <ButtonPrimary onClick={onImpersonate}>Войти как пользователь</ButtonPrimary>
      </div>
    </article>
  );
}

function formatQuarantineUntil(until: string): string {
  const date = new Date(until);
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// --- Внутренние UI-элементы ---

function ButtonPrimary({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex flex-1 items-center justify-center whitespace-nowrap rounded-full border-0 bg-lime px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-bg transition-all hover:-translate-y-px hover:bg-lime-hov sm:flex-none sm:px-5"
    >
      {children}
    </button>
  );
}

function ButtonGhost({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex flex-1 items-center justify-center whitespace-nowrap rounded-full border border-line bg-transparent px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:border-lime hover:text-lime sm:flex-none sm:px-5"
    >
      {children}
    </button>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted">{label}</span>
      {children}
    </label>
  );
}

function FilterSelect({
  value,
  active,
  onChange,
  options,
}: {
  value: string;
  active: boolean;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <span
      className={cn(
        'relative block rounded-[10px] border bg-bg transition-colors focus-within:border-lime',
        active ? 'border-lime' : 'border-line',
      )}
    >
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer appearance-none bg-transparent py-2.5 pl-3.5 pr-9 text-[13px] font-semibold text-ink outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute right-3.5 top-1/2 inline-block h-2 w-2 -translate-y-[70%] rotate-45 border-b-[1.6px] border-r-[1.6px] transition-colors',
          active ? 'border-lime' : 'border-muted',
        )}
      />
    </span>
  );
}

function PageButton({
  active = false,
  disabled = false,
  onClick,
  children,
  ariaLabel,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex h-8 min-w-[32px] items-center justify-center rounded-[8px] border px-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        active
          ? 'border-lime bg-lime text-bg'
          : 'border-line bg-transparent text-ink hover:border-lime hover:text-lime',
      )}
    >
      {children}
    </button>
  );
}

type BadgeTone = 'lime-fill' | 'orange-fill' | 'red';
function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  const classes: Record<BadgeTone, string> = {
    'lime-fill': 'border-transparent bg-lime text-bg',
    'orange-fill': 'border-transparent bg-orange text-bg',
    red: 'border-[rgba(231,76,60,0.30)] bg-[rgba(231,76,60,0.10)] text-red',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-[5px] text-[10px] font-bold uppercase tracking-[0.14em]',
        classes[tone],
      )}
    >
      {children}
    </span>
  );
}

function StatusBadge({ status }: { status: NonNullable<User['status']> }) {
  const label = STATUS_LABELS[status];
  if (status === 'banned') {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full border border-[rgba(231,76,60,0.30)] bg-[rgba(231,76,60,0.10)] px-2.5 py-[5px] text-[10px] font-bold uppercase tracking-[0.14em] text-red">
        {label}
      </span>
    );
  }
  if (status === 'suspended') {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full border border-[rgba(245,197,24,0.28)] bg-[rgba(245,197,24,0.10)] px-2.5 py-[5px] text-[10px] font-bold uppercase tracking-[0.14em] text-gold">
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-[rgba(132,192,3,0.28)] bg-lime-soft px-2.5 py-[5px] text-[10px] font-bold uppercase tracking-[0.14em] text-lime">
      {label}
    </span>
  );
}

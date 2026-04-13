/**
 * Client component dashboard admin-панели.
 * Список пользователей платформы с расширенным поиском:
 * текстовое поле (ID/имя/email) + динамические фильтры (роль, статус).
 * Статистика переиспользует существующие хелперы.
 */
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Badge, Button, Card, Input, Select } from '@/components/ui';
import { getAthleteActiveFutureBookings } from '@/components/profile/athlete-bookings';
import { getProviderClubs, getProviderTrainers } from '@/components/profile/provider-helpers';
import { useAuthStore, userRoleToAccountType, type AuthSessionUser } from '@/stores/useAuthStore';
import type { Booking, Club, Trainer, User, UserRole } from '@/types';

type DashboardPageProps = {
  users: User[];
  clubs: Club[];
  trainers: Trainer[];
  bookings: Booking[];
};

type RoleFilter = 'all' | 'athlete' | 'provider';
type StatusFilter = 'all' | 'active' | 'banned' | 'suspended';

const ROLE_LABELS: Record<UserRole, string> = {
  athlete: 'Спортсмен',
  club_owner: 'Провайдер',
  trainer: 'Провайдер',
  admin: 'Администратор',
};

const ROLE_TONES: Record<UserRole, 'teal' | 'accent' | 'outline'> = {
  athlete: 'teal',
  club_owner: 'accent',
  trainer: 'accent',
  admin: 'outline',
};

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

  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Исключаем admin из списка
  const nonAdminUsers = useMemo(() => users.filter((u) => u.role !== 'admin'), [users]);

  // Фильтрация
  const filteredUsers = useMemo(() => {
    let result = nonAdminUsers;

    // Текстовый поиск (по ID, имени, email)
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();

      result = result.filter(
        (user) =>
          String(user.id).includes(query) ||
          user.name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query),
      );
    }

    // Фильтр по роли
    if (roleFilter !== 'all') {
      result = result.filter((user) => matchesRoleFilter(user.role, roleFilter));
    }

    // Фильтр по статусу
    if (statusFilter !== 'all') {
      result = result.filter((user) => (user.status ?? 'active') === statusFilter);
    }

    return result;
  }, [nonAdminUsers, searchQuery, roleFilter, statusFilter]);

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

    // Логируем начало impersonation (fire-and-forget)
    // actorId = текущий admin (ДО impersonation), entityId = target user
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
  }

  return (
    <div className="w-full max-w-5xl">
      {/* Заголовок */}
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
          Пользователи платформы
        </h1>
        <p className="mt-1 text-sm text-muted">
          {nonAdminUsers.length} пользователей · {filteredUsers.length} показано
        </p>
      </div>

      {/* Поиск и фильтры */}
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              placeholder="Поиск по ID, имени или email…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => setShowFilters((prev) => !prev)}
            aria-expanded={showFilters}
          >
            Фильтры {showFilters ? '▲' : '▼'}
          </Button>
        </div>

        {/* Динамическая панель фильтров */}
        {showFilters ? (
          <div className="flex flex-wrap gap-4 rounded-card border border-line bg-panel p-4">
            <Select
              label="Роль"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
            >
              <option value="all">Все роли</option>
              <option value="athlete">Спортсмены</option>
              <option value="provider">Провайдеры</option>
            </Select>

            <Select
              label="Статус"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">Все статусы</option>
              <option value="active">Активные</option>
              <option value="banned">Заблокированные</option>
              <option value="suspended">Приостановленные</option>
            </Select>
          </div>
        ) : null}
      </div>

      {/* Список пользователей */}
      {filteredUsers.length === 0 ? (
        <div className="rounded-card border border-line bg-panel p-8 text-center">
          <p className="text-muted">Ничего не найдено</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredUsers.map((user) => {
            const stats = getUserStats(user, bookings, clubs, trainers);

            return (
              <UserCard
                key={user.id}
                user={user}
                stats={stats}
                onImpersonate={() => handleImpersonate(user)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Карточка пользователя ---

type UserCardProps = {
  user: User;
  stats: { label: string; value: number };
  onImpersonate: () => void;
};

function UserCard({ user, stats, onImpersonate }: UserCardProps) {
  return (
    <article>
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono text-muted">#{user.id}</span>
            <h2 className="font-display text-lg font-semibold text-ink">{user.name}</h2>
            <Badge tone={ROLE_TONES[user.role]}>{ROLE_LABELS[user.role]}</Badge>
            <Badge tone={user.status === 'active' ? 'success' : 'danger'}>
              {user.status ?? 'active'}
            </Badge>
          </div>

          <p className="text-sm text-muted">{user.email}</p>

          <p className="text-xs text-muted">
            {stats.label}: <span className="font-semibold text-ink">{stats.value}</span>
          </p>
        </div>

        <div className="shrink-0">
          <Button variant="secondary" size="sm" onClick={onImpersonate}>
            Войти как пользователь
          </Button>
        </div>
      </Card>
    </article>
  );
}

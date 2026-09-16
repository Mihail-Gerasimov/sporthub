/**
 * Client-component админ-Dashboard (Phase 28.20 rebrand).
 * Список пользователей платформы (без admin) с поиском, фильтрами и
 * быстрым действием «войти как пользователь».
 *
 * Phase 28.20:
 * — sec-head: eyebrow `Admin · Users` + display + sub `N пользователей · M показано`
 *   + sec-pill «обновлено сейчас» справа (статика);
 * — toolbar: search-input + lime-solid кнопка `Фильтры ⌃` (toggle ротация);
 * — filters-panel collapsible: grid 2-col Лица услуг / Статус;
 * — user-card: grid `1fr 440px` на 1280+, 1-col на ≤1024;
 * — action-зона — «Войти как пользователь» (фаза 35, этап Э0a: ручное послабление
 *   санкций за неявки удалено вместе с самим механизмом; фаза 38, шаг 38.25: кнопка
 *   «Пересчитать рейтинг» и бейдж надёжности вырезаны вместе с механизмом — маршрута
 *   пересчёта на бэкенде с шага 38.23 нет);
 * — pagination client-side: 15 per page, pager всегда видим;
 * — служебные записи фильтруются (как раньше), tag-бейджи «Новый/Ожидает» не вводим.
 *
 * ⚠️ Шаг 35.24. Роли нет, и раздел больше не спрашивает «кем человек является».
 * Всё, что он показывал ролью, выводится из ВЛАДЕНИЯ: есть клуб или карточка
 * тренера — человек ведёт услуги, нет — просто занимается. Служебная запись
 * отличается видом учётной записи, и он из владения не выводится.
 */
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AdminUpdatePasswordModal } from '@/components/admin/AdminUpdatePasswordModal';
import { ToolbarSelect } from '@/components/admin/ToolbarSelect';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { getAthleteActiveFutureBookings } from '@/components/profile/athlete-bookings';
import { accountKindOf, isAdminKind } from '@sporthub/domain';
import type { AdminUser } from '@/lib/server-api';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/useAuthStore';
import { useToastStore } from '@/stores/useToastStore';
import type { Booking, User } from '@sporthub/types';

type DashboardPageProps = {
  users: AdminUser[];
  bookings: Booking[];
};

/** Отбор по владению лицами услуг — то, что раньше делал отбор по роли. */
type FacesFilter = 'all' | 'with' | 'without';
type StatusFilter = 'all' | 'active' | 'banned' | 'suspended';

const PAGE_SIZE = 15;

// Подписи отбора по лицам услуг — один словарь на фильтр и на бейдж карточки.
const FACES_LABELS: Record<Exclude<FacesFilter, 'all'>, string> = {
  with: 'Ведёт услуги',
  without: 'Занимается',
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

/** Соответствует ли человек отбору по лицам услуг. */
function matchesFacesFilter(faceCount: number, filter: FacesFilter): boolean {
  if (filter === 'all') return true;

  return filter === 'with' ? faceCount > 0 : faceCount === 0;
}

/** Краткая статистика: у ведущего услуги — лица, у прочих — активные записи. */
function getUserStats(
  user: User,
  bookings: Booking[],
  faceCount: number,
): { label: string; value: number } {
  if (faceCount > 0) {
    return { label: 'Лиц услуг', value: faceCount };
  }

  const activeBookings = getAthleteActiveFutureBookings({ athleteUserId: user.id, bookings });

  return { label: 'Активных записей', value: activeBookings.length };
}

export function DashboardPage({ users, bookings }: DashboardPageProps) {
  const router = useRouter();
  const startImpersonation = useAuthStore((s) => s.startImpersonation);
  const addToast = useToastStore((s) => s.addToast);

  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [facesFilter, setFacesFilter] = useState<FacesFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Wrapper-обработчики, которые при смене фильтра возвращают пагинатор на 1-ю страницу.
  // Делаем явно через handler'ы (а не useEffect/useMemo с setState) — это чище и
  // не получает предупреждений react-hooks о cascading renders.
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };
  const handleFacesChange = (value: FacesFilter) => {
    setFacesFilter(value);
    setCurrentPage(1);
  };
  const handleStatusChange = (value: StatusFilter) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  // Исключаем служебные записи из списка (как раньше — N3). Признак берётся
  // из вида учётной записи: роли, по которой это решалось, больше нет.
  const nonAdminUsers = useMemo(() => users.filter((u) => !isAdminKind(accountKindOf(u))), [users]);

  // Число лиц услуг на человека приходит ОТВЕТОМ маршрута, а не считается здесь.
  //
  // ⚠️ Шаг 35.20a. Раньше раздел скачивал весь каталог и сверял `managedByUserId`
  // каждой публикации с номером человека. Это поле из публичной выдачи ушло:
  // по нему кто угодно строил карту «эти лица принадлежат одному человеку»
  // одним запросом. Админу владельцы положены (право `manage_any_user`), и он
  // получает их СВОИМ маршрутом — `GET /api/users` считает лица группировкой
  // в базе. Отбор, бейдж и строка статистики берут число отсюда, из одной карты,
  // а не пересчитывают каждый по-своему.
  const faceCounts = useMemo(
    () => new Map(nonAdminUsers.map((user) => [user.id, user.serviceFaceCount])),
    [nonAdminUsers],
  );

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
    if (facesFilter !== 'all') {
      result = result.filter((user) =>
        matchesFacesFilter(faceCounts.get(user.id) ?? 0, facesFilter),
      );
    }
    if (statusFilter !== 'all') {
      result = result.filter((user) => (user.status ?? 'active') === statusFilter);
    }
    return result;
  }, [nonAdminUsers, faceCounts, searchQuery, facesFilter, statusFilter]);

  // Pagination client-side
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedUsers = useMemo(
    () => filteredUsers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredUsers, safePage],
  );

  /**
   * Обработчик impersonation.
   *
   * ⚠️ Подмену выполняет СЕРВЕР. Раньше она делалась целиком в браузере: стор
   * подменял себе личность, а сессия оставалась администраторской — экран
   * показывал чужой кабинет, права оставались своими, а первая же перезагрузка
   * страницы возвращала всё назад без объяснений.
   */
  async function handleImpersonate(user: User) {
    // У администратора кабинета нет ни одного — от его лица работать некуда.
    // Сервер это тоже запрещает; здесь проверка бережёт лишний запрос.
    //
    // ⚠️ Шаг 35.34: признак — вид учётной записи, а не роль. У старых записей
    // поля может не быть — тогда решает сервер, и запрос уходит.
    if (user.accountKind === 'admin') return;

    // ⚠️ Куда идти, говорит сессия цели: есть лица услуг — кабинет лица, нет —
    // личный кабинет. Раньше здесь по типу учётной записи собирался адрес
    // прямо в этом файле, и адрес кабинета жил в двух местах сразу.
    const cabinetHref = await startImpersonation(user.id);

    if (cabinetHref === null) {
      addToast({ message: 'Не удалось войти от лица пользователя', tone: 'error' });
      return;
    }

    // ⚠️ Записи в журнал отсюда БОЛЬШЕ НЕТ. Маршрут `POST /api/logs` удалён:
    // браузер сам называл исполнителя и сам же решал, что записать, — то есть
    // журнал говорил ровно то, что ему велел клиент. Теперь его ведёт сервер
    // и берёт исполнителя из сессии.
    router.push(cabinetHref);
    router.refresh();
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
          className="inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-[14px] border-0 bg-lime px-5 py-3.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:bg-lime-hov sm:px-6"
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
            <ToolbarSelect
              label="Лица услуг"
              value={facesFilter}
              active={facesFilter !== 'all'}
              onChange={(v) => handleFacesChange(v as FacesFilter)}
              options={[
                { value: 'all', label: 'Все' },
                { value: 'without', label: 'Без лиц услуг' },
                { value: 'with', label: 'С лицами услуг' },
              ]}
            />
            <ToolbarSelect
              label="Статус"
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
            const faceCount = faceCounts.get(user.id) ?? 0;
            const stats = getUserStats(user, bookings, faceCount);
            return (
              <UserCard
                key={user.id}
                user={user}
                faceCount={faceCount}
                stats={stats}
                onImpersonate={() => handleImpersonate(user)}
              />
            );
          })}
        </div>
      )}

      {/* Pagination всегда видна */}
      <PaginationBar
        shape="boxed"
        className="px-1 pt-1.5"
        page={safePage}
        pageSize={PAGE_SIZE}
        total={filteredUsers.length}
        shownCount={pagedUsers.length}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}

// --- Карточка пользователя ---

type UserCardProps = {
  user: User;
  /** Сколько у человека лиц услуг. Ноль — он только занимается сам. */
  faceCount: number;
  stats: { label: string; value: number };
  onImpersonate: () => void;
};

function UserCard({ user, faceCount, stats, onImpersonate }: UserCardProps) {
  const leadsServices = faceCount > 0;
  const userStatus = user.status ?? 'active';

  // Блок «Учётные данные». Phase 33 Step 33.10: показа чужого пароля здесь
  // больше нет — в хранилище лежит argon2id-хеш, и показывать физически
  // нечего. Осталась смена пароля: админ выдаёт новый и один раз видит
  // выданное значение внутри модалки.
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  return (
    <article className="grid grid-cols-1 items-start gap-x-4 gap-y-3.5 rounded-[16px] border border-line bg-card p-[18px] transition-colors hover:border-line sm:p-[18px_22px] xl:grid-cols-[1fr_440px]">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-[13px] font-semibold tabular-nums text-muted">
            #{user.id}
          </span>
          <h2 className="m-0 break-words font-display text-[18px] uppercase leading-none tracking-tight text-ink">
            {user.name}
          </h2>
          <Badge tone={leadsServices ? 'orange-fill' : 'lime-fill'}>
            {leadsServices ? FACES_LABELS.with : FACES_LABELS.without}
          </Badge>
          <StatusBadge status={userStatus} />
        </div>

        <p className="m-0 break-all text-[13px] font-medium text-muted">{user.email}</p>

        <p className="m-0 text-xs font-medium text-muted">
          {stats.label}: <strong className="font-bold tabular-nums text-ink">{stats.value}</strong>
        </p>

        {/* Блок «Учётные данные» — login (=email) и смена пароля. Виден
            только super-admin'у (DashboardPage живёт под admin-guard в layout).
            Phone опускаем — он уже в основной строке profile, отдельно
            дублировать не нужно.
            Phase 33 Step 33.10: значения пароля здесь нет и быть не может —
            хранится хеш. Админ выдаёт новый пароль и один раз видит выданное. */}
        <div
          data-testid={`user-credentials-${user.id}`}
          className="mt-2 flex flex-col gap-1.5 rounded-[12px] border border-line bg-bg p-3 sm:flex-row sm:items-center sm:gap-4"
        >
          <div className="flex flex-col gap-0.5 sm:min-w-[160px]">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Логин
            </span>
            <span className="break-all font-mono text-[12px] text-ink">{user.email}</span>
          </div>
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Пароль
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span
                data-testid={`user-credentials-password-${user.id}`}
                className="text-[12px] text-muted"
              >
                Хранится хешем — показать нельзя
              </span>
              <button
                type="button"
                data-testid={`user-credentials-change-${user.id}`}
                onClick={() => setPasswordModalOpen(true)}
                className="rounded-pill border border-line bg-bg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.10em] text-ink hover:border-lime hover:text-lime-hov"
              >
                Изменить пароль
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <ButtonPrimary onClick={onImpersonate}>Войти как пользователь</ButtonPrimary>
      </div>

      <AdminUpdatePasswordModal
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        userId={user.id}
        userName={user.name}
      />
    </article>
  );
}

// --- Внутренние UI-элементы ---

function ButtonPrimary({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex flex-1 items-center justify-center whitespace-nowrap rounded-full border-0 bg-lime px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink transition-all hover:-translate-y-px hover:bg-lime-hov sm:flex-none sm:px-5"
    >
      {children}
    </button>
  );
}

type BadgeTone = 'lime-fill' | 'orange-fill' | 'red';
function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  const classes: Record<BadgeTone, string> = {
    'lime-fill': 'border-transparent bg-lime text-ink',
    'orange-fill': 'border-transparent bg-orange text-ink',
    red: 'border-red/30 bg-red/10 text-red',
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
      <span className="inline-flex items-center whitespace-nowrap rounded-full border border-red/30 bg-red/10 px-2.5 py-[5px] text-[10px] font-bold uppercase tracking-[0.14em] text-red">
        {label}
      </span>
    );
  }
  if (status === 'suspended') {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full border border-gold/30 bg-gold/10 px-2.5 py-[5px] text-[10px] font-bold uppercase tracking-[0.14em] text-gold">
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-lime/30 bg-lime-soft px-2.5 py-[5px] text-[10px] font-bold uppercase tracking-[0.14em] text-lime-hov">
      {label}
    </span>
  );
}

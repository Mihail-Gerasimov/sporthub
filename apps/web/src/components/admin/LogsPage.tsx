/**
 * Клиентский компонент страницы логов активности платформы (Phase 28.18 rebrand).
 * Хронологическая лента событий с фильтрами, пагинацией и автообновлением.
 *
 * Phase 28.18:
 * — sec-head: eyebrow `Admin · Activity Logs` + display `Логи активности` +
 *   actions-блок справа (`↻ Обновить` ghost-button + auto-status pill с точкой);
 * — auto-status pulse: серая точка когда off, лайм + box-shadow pulse 1.6s когда on
 *   (см. .admin-pulse-dot в globals.css, уважает prefers-reduced-motion);
 * — фильтры в обёртке `bg-card-2 border-line rounded-[16px] p-[18px_22px]`,
 *   grid 3-col на 1024+, 2-col + last-field на 768, 1-col на 480;
 * — log-card: grid `1fr auto`, info-блок (badge-action lime-soft / gold / red /
 *   line-outline + actor-string + target-string + opt. `История FSM` btn-mini)
 *   + timestamp справа. На 480 — 1-col, time переезжает наверх с order:-1;
 * — pagination: PAGE_SIZE=15 (унификация с Users), pager отображается ВСЕГДА
 *   numbered кнопками (max ~5 видимых) + prev/next chevrons.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { actorLabel as formatActorLabel } from '@sporthub/domain';

import { BookingStatusHistoryDrawer } from '@/components/admin/BookingStatusHistoryDrawer';
import { PaginationBar, Skeleton } from '@/components/ui';
import {
  ACTION_LABELS,
  ACTION_TONES,
  LEGACY_ACTION_LABELS,
  type ActionTone,
} from '@/lib/log-action-labels';
import { cn } from '@/lib/utils';
import { useToastStore } from '@/stores/useToastStore';
import type { Booking, EntityId, LogEntityType, LogEntry } from '@sporthub/types';

const ACTION_TONE_CLASSES: Record<ActionTone, string> = {
  good: 'border-lime/40 bg-lime-soft text-lime-hov',
  warn: 'border-gold/35 bg-gold/10 text-gold',
  danger: 'border-red/40 bg-red/10 text-red',
  neutral: 'border-line bg-card-2 text-ink',
};

// Маппинг entityType → русское название.
// Тип Record<LogEntityType, string> держит словарь полным: пропущенный
// тип сущности (как было с trainer_club_link) не соберётся.
const ENTITY_TYPE_LABELS: Record<LogEntityType, string> = {
  club: 'Клуб',
  trainer: 'Тренер',
  booking: 'Запись',
  user: 'Пользователь',
  trainer_club_link: 'Связь тренера с клубом',
};

// Пресеты периодов
type PeriodFilter = 'all' | 'today' | 'week';

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: 'all', label: 'Всё время' },
  { value: 'today', label: 'Сегодня' },
  { value: 'week', label: 'Последняя неделя' },
];

// Опции фильтра по action
const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Все действия' },
  ...Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label })),
];

// Phase 28.18: PAGE_SIZE снижен с 20 до 15 для унификации со страницами
// Users (client-side) и Moderation (server-side). Pager всегда видим.
const PAGE_SIZE = 15;
const POLL_INTERVAL_MS = 30_000;
// Максимум видимых нумерованных кнопок в pager'е, чтобы не разбухал на 100+ страницах

/** Вычисляет ISO-строку from/to для пресета периода */
function getPeriodRange(period: PeriodFilter): { from?: string; to?: string } {
  if (period === 'all') return {};

  const now = new Date();

  if (period === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString() };
  }

  if (period === 'week') {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { from: start.toISOString() };
  }

  return {};
}

/** Форматирует дату лога в читаемый вид */
function formatLogDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  if (isToday) return `Сегодня, ${time}`;

  return `${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${time}`;
}

// SVG-иконки
const ICON_REFRESH = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    className="h-3.5 w-3.5"
  >
    <path d="M21 12a9 9 0 11-3-6.7L21 8" />
    <path d="M21 3v5h-5" />
  </svg>
);

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [actorFilter, setActorFilter] = useState('');
  const [autoPolling, setAutoPolling] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Phase 25 Step 25.15: drawer-wire-up — клик по entity-booking в логе открывает
  // BookingStatusHistoryDrawer с полной FSM-историей.
  const [drawerBooking, setDrawerBooking] = useState<Booking | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const addToast = useToastStore((state) => state.addToast);

  const handleOpenBookingDrawer = useCallback(
    async (bookingId: EntityId) => {
      try {
        // ⚠️ Прежнего параметра с номером пользователя в адресе больше нет.
        // Он был не отбором, а предъявлением личности: браузер сообщал серверу,
        // кем себя считает. Права на чтение записи сервер проверяет по сессии.
        const response = await fetch(`/api/bookings/${bookingId}`);
        const body = (await response.json()) as {
          success: boolean;
          data?: Booking;
          error?: string;
        };
        if (!response.ok || !body.success || !body.data) {
          addToast({ message: body.error ?? 'Не удалось загрузить запись', tone: 'error' });
          return;
        }
        setDrawerBooking(body.data);
        setDrawerOpen(true);
      } catch {
        addToast({ message: 'Не удалось загрузить запись', tone: 'error' });
      }
    },
    [addToast],
  );

  /** Загружает логи из API с текущими фильтрами */
  const fetchLogs = useCallback(async () => {
    setLoading(true);

    try {
      const params = new URLSearchParams();

      if (actionFilter !== 'all') params.set('action', actionFilter);
      if (actorFilter.trim()) params.set('actorId', actorFilter.trim());

      const period = getPeriodRange(periodFilter);
      if (period.from) params.set('from', period.from);
      if (period.to) params.set('to', period.to);

      params.set('offset', String(offset));
      params.set('limit', String(PAGE_SIZE));

      const response = await fetch(`/api/logs?${params.toString()}`);
      const json = await response.json();

      if (json.success) {
        setLogs(json.data);
        setTotal(json.total);
      }
    } catch {
      // Ошибка загрузки — сохраняем текущее состояние
    } finally {
      setLoading(false);
    }
  }, [actionFilter, periodFilter, actorFilter, offset]);

  // Загрузка при изменении фильтров или пагинации
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Автополлинг
  useEffect(() => {
    if (autoPolling) {
      pollingRef.current = setInterval(fetchLogs, POLL_INTERVAL_MS);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [autoPolling, fetchLogs]);

  // Сброс offset при смене фильтров
  const handleActionChange = (value: string) => {
    setActionFilter(value);
    setOffset(0);
  };

  const handlePeriodChange = (value: string) => {
    setPeriodFilter(value as PeriodFilter);
    setOffset(0);
  };

  const handleActorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setActorFilter(event.target.value);
    setOffset(0);
  };

  // Сдвиг и номер страницы — одно и то же, записанное по-разному: здесь живёт
  // сдвиг (его ждёт запрос), полосе нужен номер.
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="flex w-full flex-col gap-5 sm:gap-[22px]">
      {/* Sec-head: eyebrow + display title + actions-блок справа */}
      <header className="flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="m-0 text-[11px] font-bold uppercase tracking-[0.22em] text-muted">
            Admin · Activity Logs
          </p>
          <h1 className="m-0 font-display text-[24px] uppercase leading-none tracking-tight text-ink sm:text-[26px] lg:text-[28px] xl:text-[32px]">
            Логи активности
          </h1>
        </div>

        {/* Actions: btn-ghost «Обновить» + auto-status pill */}
        <div className="flex w-full shrink-0 flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-end">
          <button
            type="button"
            onClick={fetchLogs}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-transparent px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:border-lime hover:text-lime-hov"
          >
            {ICON_REFRESH}
            Обновить
          </button>

          <button
            type="button"
            onClick={() => setAutoPolling((prev) => !prev)}
            className="inline-flex items-center gap-2 text-xs font-medium text-muted transition-colors hover:text-ink"
            aria-pressed={autoPolling}
          >
            <span
              aria-hidden="true"
              className={cn(
                'inline-block h-2 w-2 rounded-full',
                autoPolling
                  ? 'admin-pulse-dot bg-lime shadow-[0_0_0_4px_var(--ui-lime-soft)]'
                  : 'bg-disabled',
              )}
            />
            {autoPolling ? 'Автообновление вкл' : 'Автообновление выкл'}
          </button>
        </div>
      </header>

      {/* Фильтры в карточке */}
      <div className="rounded-[16px] border border-line bg-card-2 p-[18px] sm:p-[18px_22px]">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <FilterField label="Тип действия">
            <FilterSelect
              value={actionFilter}
              active={actionFilter !== 'all'}
              onChange={handleActionChange}
              options={ACTION_OPTIONS}
            />
          </FilterField>

          <FilterField label="Период">
            <FilterSelect
              value={periodFilter}
              active={periodFilter !== 'all'}
              onChange={handlePeriodChange}
              options={PERIOD_OPTIONS}
            />
          </FilterField>

          <FilterField label="ID актора" className="md:col-span-2 lg:col-span-1">
            <span
              className={cn(
                'block rounded-[12px] border bg-bg transition-colors focus-within:border-lime',
                actorFilter ? 'border-lime' : 'border-line',
              )}
            >
              <input
                id="actor-filter"
                type="text"
                inputMode="numeric"
                placeholder="Например, 2"
                value={actorFilter}
                onChange={handleActorChange}
                className="w-full bg-transparent px-3.5 py-3 text-[13px] font-medium text-ink outline-none placeholder:text-disabled"
              />
            </span>
          </FilterField>
        </div>
      </div>

      {/* Лента событий */}
      {loading ? (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-[16px]" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-[16px] border border-line bg-card p-10 text-center text-muted">
          Нет событий по выбранным фильтрам
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {logs.map((log) => (
            <LogCard key={log.id} log={log} onOpenBookingDrawer={handleOpenBookingDrawer} />
          ))}
        </div>
      )}

      {/* Пагинация (всегда видна, даже при 1 странице) */}
      <PaginationBar
        shape="boxed"
        className="px-1 pt-1.5"
        page={currentPage}
        pageSize={PAGE_SIZE}
        total={total}
        shownCount={logs.length}
        onPageChange={(page) => setOffset((page - 1) * PAGE_SIZE)}
      />

      {/* Phase 25 Step 25.15: drawer FSM-истории booking'а. */}
      <BookingStatusHistoryDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        booking={drawerBooking}
      />
    </div>
  );
}

// --- Вспомогательные компоненты ---

/** Обёртка для поля фильтра: label + content */
function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-2', className)}>
      <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink">{label}</span>
      {children}
    </label>
  );
}

/** Кастомный select-wrap для админских фильтров (без трогания глобального Select) */
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
        'relative block rounded-[12px] border bg-bg transition-colors focus-within:border-lime',
        active ? 'border-lime' : 'border-line',
      )}
    >
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer appearance-none bg-transparent py-3 pl-3.5 pr-9 text-[13px] font-medium text-ink outline-none"
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

/** Карточка одного лога */
function LogCard({
  log,
  onOpenBookingDrawer,
}: {
  log: LogEntry;
  onOpenBookingDrawer: (id: EntityId) => void;
}) {
  // Порядок разбора важен и повторяет `actorLabel` из `@sporthub/domain`:
  // сначала нынешние действия, потом словарь прошлого, и только если не узнали —
  // само значение. Пустоту не показываем никогда: неизвестное лучше показать
  // как есть, чем спрятать.
  const actionLabel = ACTION_LABELS[log.action] ?? LEGACY_ACTION_LABELS[log.action] ?? log.action;
  // Тон у прошлого один — нейтральный: разметка тяжести подсказывает, куда
  // смотреть СЕЙЧАС, а событий, которых система больше не производит, это
  // не касается.
  const actionTone = ACTION_TONES[log.action] ?? 'neutral';
  // Исполнитель в записи — исторический снимок: в строках до фазы 35 лежит имя
  // роли, в новых — вид учётной записи. Подпись читает оба, иначе половина
  // журнала стала бы нечитаемой.
  const actorLabel = formatActorLabel(log.actorRole);
  const entityLabel = ENTITY_TYPE_LABELS[log.entityType] ?? log.entityType;
  const metaName = log.meta?.name as string | undefined;

  return (
    <article className="grid grid-cols-1 items-start gap-2 rounded-[16px] border border-line bg-card p-[18px] sm:grid-cols-[1fr_auto] sm:gap-x-4 sm:p-[18px_22px]">
      <div className="order-2 flex min-w-0 flex-col gap-2 sm:order-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className={cn(
              'inline-flex items-center whitespace-nowrap rounded-full border px-3 py-[5px] text-[10px] font-bold uppercase tracking-[0.14em]',
              ACTION_TONE_CLASSES[actionTone],
            )}
          >
            {actionLabel}
          </span>
          <span className="text-[13px] font-medium text-muted">
            {actorLabel} <strong className="font-bold text-ink">#{log.actorId}</strong>
          </span>
        </div>
        <p className="m-0 break-words text-sm font-semibold leading-[1.3] text-ink">
          {entityLabel} #{log.entityId}
          {metaName && <span className="font-medium text-muted"> — {metaName}</span>}
        </p>
        {log.entityType === 'booking' ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid={`logs-open-booking-history-${log.entityId}`}
              onClick={() => onOpenBookingDrawer(log.entityId)}
              className="inline-flex items-center rounded-full border border-line bg-card-2 px-3 py-[5px] text-[10px] font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:border-lime hover:text-lime-hov"
            >
              История FSM
            </button>
          </div>
        ) : null}
      </div>

      <time
        className="order-1 whitespace-nowrap text-xs font-semibold text-muted sm:order-2 sm:pt-1 sm:font-medium"
        dateTime={log.createdAt}
      >
        {formatLogDate(log.createdAt)}
      </time>
    </article>
  );
}

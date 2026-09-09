'use client';

/**
 * Страница модерации публикаций (Phase 28.19 rebrand).
 * Объединённый список клубов и тренеров с фильтрами, поиском, пагинацией
 * и действиями hide/unhide.
 *
 * Phase 28.19:
 * — sec-head: eyebrow + Bowlby title + sub с количеством карточек;
 * — toolbar: grid `1.4fr + 4×1fr` на 1440, `1.2fr + 4×1fr` на 1280, `1fr 1fr`
 *   на 1024/768/480 с search full-width;
 * — item-card: grid `1fr 220px` на 1280+, 1-col на ≤1024 (action в новой строке);
 * — badge тоны: type-{trainer|club} (lime-fill), status-published (lime-soft),
 *   status-hidden (muted-outline), status-pending (gold через `--ui-gold`);
 * — pagination: PAGE_SIZE 20 → 15, pager отображается ВСЕГДА (numbered + ‹ ›).
 *
 * Phase 34 Step 34.49: поле `moderatorId` из тела действий ушло. Кто скрыл
 * публикацию, сервер знает из сессии; до этого модератора называл браузер —
 * и в журнале оставался тот, кого он назвал.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { City } from '@sporthub/types';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

import { HideReasonModal } from './HideReasonModal';

/** Тип элемента из GET /api/publications */
interface PublicationItem {
  id: number;
  name: string;
  type: 'club' | 'trainer';
  city: string;
  sportIds: number[];
  status: string | undefined;
  createdAt: string;
  managedByUserId: number | undefined;
  hideReason?: string;
  hiddenAt?: string;
}

interface ModerationPageProps {
  sports: Array<{ id: number; name: string }>;
}

// Phase 28.19: единый PAGE_SIZE с Logs/Users
const PAGE_SIZE = 15;
const MAX_VISIBLE_PAGE_BUTTONS = 5;

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

export function ModerationPage({ sports }: ModerationPageProps) {

  const [cities, setCities] = useState<City[]>([]);

  useEffect(() => {
    fetch('/api/cities')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setCities(json.data);
      })
      .catch(() => {});
  }, []);

  // Фильтры
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('');
  const [sportFilter, setSportFilter] = useState('');
  const [search, setSearch] = useState('');

  // Данные
  const [items, setItems] = useState<PublicationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  // Модалка скрытия
  const [hideTarget, setHideTarget] = useState<PublicationItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (typeFilter !== 'all') params.set('type', typeFilter);
    if (cityFilter) params.set('city', cityFilter);
    if (sportFilter) params.set('sportId', sportFilter);
    if (search.trim()) params.set('search', search.trim());
    params.set('offset', String(offset));
    params.set('limit', String(PAGE_SIZE));

    try {
      const res = await fetch(`/api/publications?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setItems(json.data);
        setTotal(json.total);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, cityFilter, sportFilter, search, offset]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Сброс offset при смене фильтров
  useEffect(() => {
    setOffset(0);
  }, [statusFilter, typeFilter, cityFilter, sportFilter, search]);

  const handleHide = async (reason: string) => {
    if (!hideTarget) return;
    setActionLoading(true);
    try {
      await fetch('/api/moderation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'hide',
          entityType: hideTarget.type,
          entityId: hideTarget.id,
          reason,
        }),
      });
      setHideTarget(null);
      fetchData();
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnhide = async (item: PublicationItem) => {
    if (!confirm(`Показать публикацию «${item.name}»?`)) return;
    setActionLoading(true);
    try {
      await fetch('/api/moderation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unhide',
          entityType: item.type,
          entityId: item.id,
        }),
      });
      fetchData();
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const visiblePageNumbers = useMemo(() => {
    const half = Math.floor(MAX_VISIBLE_PAGE_BUTTONS / 2);
    let start = Math.max(1, currentPage - half);
    const end = Math.min(totalPages, start + MAX_VISIBLE_PAGE_BUTTONS - 1);
    start = Math.max(1, end - MAX_VISIBLE_PAGE_BUTTONS + 1);
    const pages: number[] = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }, [currentPage, totalPages]);

  return (
    <div className="flex w-full flex-col gap-5 sm:gap-[22px]">
      {/* Sec-head */}
      <header className="flex min-w-0 flex-col gap-1.5">
        <p className="m-0 text-[11px] font-bold uppercase tracking-[0.22em] text-muted">
          Admin · Moderation
        </p>
        <h1 className="m-0 font-display text-[24px] uppercase leading-none tracking-tight text-ink sm:text-[26px] lg:text-[28px] xl:text-[32px]">
          Модерация публикаций
        </h1>
        <p className="m-0 mt-1 text-[13px] font-normal leading-[1.5] text-muted">
          Управление видимостью клубов и тренеров на платформе ·{' '}
          <span className="font-bold text-ink tabular-nums">{total}</span> карточек
        </p>
      </header>

      {/* Toolbar: search + 4 select */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,1fr))] xxl:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]">
        <div
          className={cn(
            'relative col-span-1 sm:col-span-2 xl:col-span-1',
            'rounded-[14px] border border-line bg-card-2 transition-colors focus-within:border-lime',
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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию..."
            className="w-full bg-transparent py-3.5 pl-11 pr-4 text-sm font-medium text-ink outline-none placeholder:text-disabled"
          />
        </div>

        <ToolbarSelect
          value={statusFilter}
          active={statusFilter !== 'all'}
          onChange={setStatusFilter}
          options={[
            { value: 'all', label: 'Все статусы' },
            { value: 'published', label: 'Опубликовано' },
            { value: 'hidden', label: 'Скрыто' },
          ]}
        />

        <ToolbarSelect
          value={typeFilter}
          active={typeFilter !== 'all'}
          onChange={setTypeFilter}
          options={[
            { value: 'all', label: 'Все типы' },
            { value: 'club', label: 'Клубы' },
            { value: 'trainer', label: 'Тренеры' },
          ]}
        />

        <ToolbarSelect
          value={cityFilter}
          active={cityFilter !== ''}
          onChange={setCityFilter}
          options={[
            { value: '', label: 'Все города' },
            ...cities.map((c) => ({ value: c.name, label: c.name })),
          ]}
        />

        <ToolbarSelect
          value={sportFilter}
          active={sportFilter !== ''}
          onChange={setSportFilter}
          options={[
            { value: '', label: 'Все виды спорта' },
            ...sports.map((s) => ({ value: String(s.id), label: s.name })),
          ]}
        />
      </div>

      {/* Список публикаций */}
      {loading ? (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-[16px]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[16px] border border-line bg-card p-10 text-center text-muted">
          Публикации не найдены
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((item) => (
            <ItemCard
              key={`${item.type}-${item.id}`}
              item={item}
              actionLoading={actionLoading}
              onHide={() => setHideTarget(item)}
              onUnhide={() => handleUnhide(item)}
            />
          ))}
        </div>
      )}

      {/* Пагинация всегда видна */}
      <div className="flex flex-col gap-3 px-1 pt-1.5 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs font-medium text-muted">
          {total === 0 ? (
            'Показано 0 из 0'
          ) : (
            <>
              Показано{' '}
              <strong className="font-bold text-ink">
                {offset + 1}–{Math.min(offset + items.length, total)}
              </strong>{' '}
              из <strong className="font-bold text-ink">{total}</strong>
            </>
          )}
        </span>

        <div className="flex flex-wrap items-center gap-1.5">
          <PageButton
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            ariaLabel="Предыдущая страница"
          >
            {ICON_CHEV_LEFT}
          </PageButton>
          {visiblePageNumbers.map((page) => (
            <PageButton
              key={page}
              active={page === currentPage}
              onClick={() => setOffset((page - 1) * PAGE_SIZE)}
              ariaLabel={`Страница ${page}`}
            >
              {page}
            </PageButton>
          ))}
          <PageButton
            disabled={currentPage >= totalPages}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            ariaLabel="Следующая страница"
          >
            {ICON_CHEV_RIGHT}
          </PageButton>
        </div>
      </div>

      {/* Модалка скрытия */}
      <HideReasonModal
        open={!!hideTarget}
        onClose={() => setHideTarget(null)}
        onConfirm={handleHide}
        entityName={hideTarget?.name ?? ''}
        loading={actionLoading}
      />
    </div>
  );
}

// --- Внутренние компоненты ---

function ToolbarSelect({
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
        'relative block rounded-[14px] border bg-card-2 transition-colors focus-within:border-lime',
        active ? 'border-lime' : 'border-line',
      )}
    >
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer appearance-none bg-transparent py-3.5 pl-4 pr-9 text-[13px] font-semibold text-ink outline-none"
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
          'pointer-events-none absolute right-4 top-1/2 inline-block h-2 w-2 -translate-y-[70%] rotate-45 border-b-[1.6px] border-r-[1.6px] transition-colors',
          active ? 'border-lime' : 'border-muted',
        )}
      />
    </span>
  );
}

function ItemCard({
  item,
  actionLoading,
  onHide,
  onUnhide,
}: {
  item: PublicationItem;
  actionLoading: boolean;
  onHide: () => void;
  onUnhide: () => void;
}) {
  const isHidden = item.status === 'hidden';
  const isPending = item.status === 'pending';
  const dateLabel = new Date(item.createdAt).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <article className="grid grid-cols-1 items-center gap-x-4 gap-y-3.5 rounded-[16px] border border-line bg-card p-[18px] sm:p-[18px_22px] xl:grid-cols-[1fr_220px]">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className="m-0 break-words font-display text-[18px] uppercase leading-none tracking-tight text-ink">
            {item.name}
          </h3>
          <Badge tone={item.type === 'club' ? 'lime-fill' : 'lime-fill'}>
            {item.type === 'club' ? 'Клуб' : 'Тренер'}
          </Badge>
          {isHidden ? (
            <Badge tone="muted">Скрыто</Badge>
          ) : isPending ? (
            <Badge tone="gold">На проверке</Badge>
          ) : (
            <Badge tone="lime-soft">Опубликовано</Badge>
          )}
        </div>
        <p className="m-0 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs font-medium text-muted">
          {item.city && <span>{item.city}</span>}
          {item.city ? (
            <span
              aria-hidden="true"
              className="inline-block h-[3px] w-[3px] rounded-full bg-disabled"
            />
          ) : null}
          <span>Создано: {dateLabel}</span>
        </p>
        {isHidden && item.hideReason ? (
          <p className="m-0 text-xs font-medium text-red">Причина: {item.hideReason}</p>
        ) : null}
      </div>

      <div className="flex justify-end">
        {isHidden ? (
          <button
            type="button"
            onClick={onUnhide}
            disabled={actionLoading}
            className="inline-flex w-full items-center justify-center whitespace-nowrap rounded-full border-0 bg-lime px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:bg-lime-hov disabled:opacity-50 sm:w-auto"
          >
            Показать
          </button>
        ) : (
          <button
            type="button"
            onClick={onHide}
            disabled={actionLoading}
            className="inline-flex w-full items-center justify-center whitespace-nowrap rounded-full border border-[rgba(231,76,60,0.45)] bg-transparent px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-red transition-colors hover:border-red hover:bg-red hover:text-white disabled:opacity-50 sm:w-auto"
          >
            Скрыть
          </button>
        )}
      </div>
    </article>
  );
}

type BadgeTone = 'lime-fill' | 'lime-soft' | 'muted' | 'gold';

function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  const classes: Record<BadgeTone, string> = {
    'lime-fill': 'border-transparent bg-lime text-ink',
    'lime-soft': 'border-[rgba(132,192,3,0.28)] bg-lime-soft text-lime',
    muted: 'border-line bg-[rgba(160,160,160,0.10)] text-muted',
    gold: 'border-[rgba(245,197,24,0.28)] bg-[rgba(245,197,24,0.10)] text-gold',
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
          ? 'border-lime bg-lime text-ink'
          : 'border-line bg-transparent text-ink hover:border-lime hover:text-lime',
      )}
    >
      {children}
    </button>
  );
}

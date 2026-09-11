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
 *
 * Phase 36 Step 36.22: у раздела появилась вторая очередь — публикации, которые
 * модератор скрыл, а владелец уже исправил. Отбор по ней уходит В ЗАПРОС
 * (`awaitingRecheck=true`), под него в базе заведён частичный индекс; отбирать
 * признак в браузере нельзя — цена такого раздела росла бы вместе с каталогом.
 *
 * ⚠️ Две очереди легко спутать, поэтому подписи разведены словами, а не оттенком:
 * «Новая, на проверке» — публикация, которую ещё ни разу не смотрели
 * (`status === 'pending'`); «Исправлено, ждёт проверки» — скрытая модератором
 * и починенная владельцем (`awaitingRecheck`). Прежняя подпись «На проверке»
 * годилась и туда и сюда.
 *
 * Phase 37 Step 37.54: весь отбор раздела переехал В АДРЕС. До этого шага раздел
 * не принимал параметров адреса вовсе — фильтры жили в локальном состоянии,
 * и быстрый переход из надзорной ленты («публикация скрыта» → карточка этой
 * публикации) построить было не из чего.
 *
 * ⚠️ Переехал ВЕСЬ отбор, а не только номер публикации, и это не расширение
 * работы. Часть отбора в адресе и часть в памяти — это два источника правды:
 * они расходятся молча, и раздел после «назад» показывает не то, что в адресе.
 * Разбор адреса — одна функция на раздел (`lib/moderation-filters`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { HIDE_KIND_LABELS, isHideKind } from '@sporthub/domain';
import type { City, HideKindValue } from '@sporthub/types';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  MODERATION_DEFAULT_FILTERS,
  MODERATION_PAGE_SIZE,
  isFocusedPublication,
  moderationAddressQuery,
  moderationRequestQuery,
  parseModerationFilters,
  type ModerationFilters,
} from '@/lib/moderation-filters';
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
  /** Вид скрытия: архив владельца или работа модератора (шаг 36.12). */
  hiddenKind?: HideKindValue;
  /** Владелец исправил скрытую публикацию, она ждёт повторной проверки. */
  awaitingRecheck?: boolean;
}

interface ModerationPageProps {
  sports: Array<{ id: number; name: string }>;
}

// Phase 28.19: единый PAGE_SIZE с Logs/Users.
// Шаг 37.54: объявлен в `lib/moderation-filters` — оттуда же собирается смещение
// в запросе, и двух разных представлений о размере страницы быть не должно.
const PAGE_SIZE = MODERATION_PAGE_SIZE;
const MAX_VISIBLE_PAGE_BUTTONS = 5;

/**
 * Задержка перед тем, как поиск попадёт в адрес.
 *
 * ⚠️ Набор текста — не шаг навигации. Без задержки каждая буква правила бы адрес,
 * то есть звала бы навигацию и поход за страницей раздела; в истории браузера
 * оставалось бы по записи на букву. Отбор при этом всё равно уходит в запрос —
 * задержан момент, а не место отбора.
 */
const SEARCH_DEBOUNCE_MS = 300;

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /**
   * Отбор раздела приходит из адреса и только из него: своего состояния
   * у фильтров нет. Поэтому «назад» в браузере возвращает не только адрес,
   * но и выдачу, а ссылкой на раздел можно поделиться.
   */
  const filters = useMemo(() => parseModerationFilters(searchParams), [searchParams]);

  const [cities, setCities] = useState<City[]>([]);

  useEffect(() => {
    fetch('/api/cities')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setCities(json.data);
      })
      .catch(() => {});
  }, []);

  // Данные
  const [items, setItems] = useState<PublicationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Модалка скрытия
  const [hideTarget, setHideTarget] = useState<PublicationItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  /**
   * Свежий отбор для отложенных правок (поиск с задержкой).
   *
   * ⚠️ Без него отложенная правка накладывалась бы на снимок отбора, каким он был
   * в момент нажатия клавиши: человек за эти 300 мс мог переключить селект,
   * и правка вернула бы прежнее значение — молча.
   */
  const filtersRef = useRef(filters);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  /**
   * Перевести раздел на новый отбор. Меняется АДРЕС — выдача идёт за ним.
   *
   * `replace` — для набора текста: правка адреса на каждую букву превратила бы
   * кнопку «назад» в откат по одному символу.
   */
  const applyFilters = useCallback(
    (patch: Partial<ModerationFilters>, mode: 'push' | 'replace' = 'push') => {
      // Любая правка отбора возвращает на первую страницу и снимает наводку
      // из уведомления: человек уже смотрит раздел, а не пришедшую публикацию.
      const next: ModerationFilters = { ...filtersRef.current, page: 1, focusId: null, ...patch };
      const query = moderationAddressQuery(next);
      const href = query ? `${pathname}?${query}` : pathname;

      if (mode === 'replace') router.replace(href);
      else router.push(href);
    },
    [pathname, router],
  );

  /**
   * Черновик поля поиска. Само поле остаётся отзывчивым, а в адрес значение
   * уезжает с задержкой; `committedSearchRef` отличает наш собственный ответ
   * адреса от чужой правки (переход по ссылке, «назад»), чтобы не затирать
   * недописанное слово.
   */
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const committedSearchRef = useRef(filters.search);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addressSearch = filters.search;

  useEffect(() => {
    if (addressSearch === committedSearchRef.current) return;

    committedSearchRef.current = addressSearch;
    setSearchDraft(addressSearch);
  }, [addressSearch]);

  useEffect(
    () => () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    },
    [],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchDraft(value);

      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

      searchTimerRef.current = setTimeout(() => {
        committedSearchRef.current = value;
        applyFilters({ search: value }, 'replace');
      }, SEARCH_DEBOUNCE_MS);
    },
    [applyFilters],
  );

  /**
   * Адрес запроса собирается из отбора одной функцией.
   *
   * ⚠️ Весь отбор и постраничность — В ЗАПРОСЕ, а не после ответа. Страница,
   * которая просит всё и разбирается сама, выглядит на экране точно так же —
   * и именно так фаза 35 потеряла разделение по лицам в семи разделах кабинета.
   */
  const requestQuery = moderationRequestQuery(filters);

  const fetchData = useCallback(async () => {
    setLoading(true);

    try {
      const res = await fetch(`/api/publications?${requestQuery}`);
      const json = await res.json();
      if (json.success) {
        setItems(json.data);
        setTotal(json.total);
      }
    } finally {
      setLoading(false);
    }
  }, [requestQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
  // Страница — из адреса, смещение считается от неё (и так же — в запросе).
  const currentPage = filters.page;
  const offset = (currentPage - 1) * PAGE_SIZE;

  /**
   * Публикация, ради которой пришли из уведомления.
   *
   * ⚠️ Это НЕ отбор в памяти: отбор сделал сервер по номеру в запросе, здесь
   * только ответ на вопрос «дошла ли она до выдачи». Не дошла (стёрта, другого
   * вида, маршрут номера не знает) — раздел говорит об этом вслух, а не показывает
   * молча не ту страницу.
   */
  const focusedItem =
    filters.focusId === null
      ? null
      : (items.find((item) => isFocusedPublication(filters, item)) ?? null);
  const focusMissing = filters.focusId !== null && !loading && focusedItem === null;

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
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_repeat(5,minmax(0,1fr))] xxl:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))]">
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
            value={searchDraft}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Поиск по названию..."
            aria-label="Поиск по названию"
            className="w-full bg-transparent py-3.5 pl-11 pr-4 text-sm font-medium text-ink outline-none placeholder:text-disabled"
          />
        </div>

        <ToolbarSelect
          ariaLabel="Статус публикации"
          value={filters.status}
          active={filters.status !== 'all'}
          onChange={(value) => applyFilters({ status: value as ModerationFilters['status'] })}
          options={[
            { value: 'all', label: 'Все статусы' },
            { value: 'published', label: 'Опубликовано' },
            { value: 'hidden', label: 'Скрыто' },
          ]}
        />

        {/*
         * Вторая очередь раздела. Она НЕ значение статуса: публикация, которую
         * владелец исправил, остаётся скрытой — признак живёт поверх скрытия,
         * и спрашивать их можно вместе.
         */}
        <ToolbarSelect
          ariaLabel="Повторная проверка"
          value={filters.recheck}
          active={filters.recheck !== 'all'}
          onChange={(value) => applyFilters({ recheck: value as ModerationFilters['recheck'] })}
          options={[
            { value: 'all', label: 'Все публикации' },
            { value: 'awaiting', label: 'Исправленные, ждут проверки' },
          ]}
        />

        <ToolbarSelect
          ariaLabel="Тип публикации"
          value={filters.type}
          active={filters.type !== 'all'}
          onChange={(value) => applyFilters({ type: value as ModerationFilters['type'] })}
          options={[
            { value: 'all', label: 'Все типы' },
            { value: 'club', label: 'Клубы' },
            { value: 'trainer', label: 'Тренеры' },
          ]}
        />

        <ToolbarSelect
          ariaLabel="Город"
          value={filters.city}
          active={filters.city !== ''}
          onChange={(value) => applyFilters({ city: value })}
          options={[
            { value: '', label: 'Все города' },
            ...cities.map((c) => ({ value: c.name, label: c.name })),
          ]}
        />

        <ToolbarSelect
          ariaLabel="Вид спорта"
          value={filters.sportId}
          active={filters.sportId !== ''}
          onChange={(value) => applyFilters({ sportId: value })}
          options={[
            { value: '', label: 'Все виды спорта' },
            ...sports.map((s) => ({ value: String(s.id), label: s.name })),
          ]}
        />
      </div>

      {/*
       * Полоса наводки: раздел открыт ссылкой из уведомления, и это сказано вслух.
       * Без неё модератор видит выдачу из одной строки и не понимает, почему
       * раздел «пустой», — а если предмет не дошёл, не понимает и этого.
       */}
      {filters.focusId !== null ? (
        <aside className="flex flex-col gap-2.5 rounded-[16px] border border-lime bg-lime-soft/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0 text-[13px] font-medium leading-[1.5] text-ink">
            {focusMissing
              ? `Публикация №${filters.focusId} в выдаче не видна: возможно, её уже стёрли.`
              : `Показана публикация №${filters.focusId} — переход из уведомления.`}
          </p>
          <button
            type="button"
            onClick={() => applyFilters(MODERATION_DEFAULT_FILTERS)}
            className="inline-flex w-full items-center justify-center whitespace-nowrap rounded-full border-2 border-lime bg-bg px-5 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:bg-lime sm:w-auto"
          >
            Весь раздел
          </button>
        </aside>
      ) : null}

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
              focused={item === focusedItem}
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
            disabled={currentPage <= 1}
            onClick={() => applyFilters({ page: Math.max(1, currentPage - 1) })}
            ariaLabel="Предыдущая страница"
          >
            {ICON_CHEV_LEFT}
          </PageButton>
          {visiblePageNumbers.map((page) => (
            <PageButton
              key={page}
              active={page === currentPage}
              onClick={() => applyFilters({ page })}
              ariaLabel={`Страница ${page}`}
            >
              {page}
            </PageButton>
          ))}
          <PageButton
            disabled={currentPage >= totalPages}
            onClick={() => applyFilters({ page: currentPage + 1 })}
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

/**
 * Селект тулбара.
 *
 * ⚠️ `ariaLabel` обязателен. Видимой подписи у селекта нет — её роль играет
 * первый вариант («Все статусы»), и экранный диктор читал бы пять одинаковых
 * «списков» подряд. Фаза 35 уже ловила дефект, видимый только в дереве
 * доступности: подпись врала, а на экране всё выглядело правильно.
 */
function ToolbarSelect({
  ariaLabel,
  value,
  active,
  onChange,
  options,
}: {
  ariaLabel: string;
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
        aria-label={ariaLabel}
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
  focused,
  actionLoading,
  onHide,
  onUnhide,
}: {
  item: PublicationItem;
  /** Та самая публикация, ради которой перешли из уведомления. */
  focused: boolean;
  actionLoading: boolean;
  onHide: () => void;
  onUnhide: () => void;
}) {
  const isHidden = item.status === 'hidden';
  const isPending = item.status === 'pending';
  // Признак повторной проверки: владелец исправил то, что скрыл модератор.
  const isAwaitingRecheck = item.awaitingRecheck === true;
  /**
   * Подпись скрытия берётся из словаря `@sporthub/domain` по ПРИЗНАКУ вида,
   * а не сравнением текста причины с константой: иначе владельцу достаточно
   * вписать служебную строку руками, чтобы его архив выглядел работой модератора.
   * Публикации, скрытые до появления признака, остаются с прежней подписью.
   */
  const hiddenLabel = isHideKind(item.hiddenKind) ? HIDE_KIND_LABELS[item.hiddenKind] : 'Скрыто';
  const dateLabel = new Date(item.createdAt).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <article
      className={cn(
        'grid grid-cols-1 items-center gap-x-4 gap-y-3.5 rounded-[16px] border bg-card p-[18px] sm:p-[18px_22px] xl:grid-cols-[1fr_220px]',
        focused ? 'border-lime' : 'border-line',
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className="m-0 break-words font-display text-[18px] uppercase leading-none tracking-tight text-ink">
            {item.name}
          </h3>
          <Badge tone={item.type === 'club' ? 'lime-fill' : 'lime-fill'}>
            {item.type === 'club' ? 'Клуб' : 'Тренер'}
          </Badge>
          {isHidden ? (
            <Badge tone="muted">{hiddenLabel}</Badge>
          ) : isPending ? (
            // ⚠️ «Новая», а не «На проверке»: рядом живёт вторая очередь —
            // исправленные после скрытия. Прежняя подпись годилась обеим,
            // и модератор не мог понять, какую именно очередь он смотрит.
            <Badge tone="gold">Новая, на проверке</Badge>
          ) : (
            <Badge tone="lime-soft">Опубликовано</Badge>
          )}
          {/* Признак идёт рядом со скрытием, а не вместо него: публикация
              всё ещё вне каталога, но разбирательство уже сдвинулось. */}
          {isAwaitingRecheck ? <Badge tone="gold">Исправлено, ждёт проверки</Badge> : null}
          {/* Бейдж наводки — рядом с состоянием, а не вместо него: он говорит,
              ПОЧЕМУ эта строка здесь, и ничего не сообщает о самой публикации. */}
          {focused ? <Badge tone="lime-fill">Из уведомления</Badge> : null}
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

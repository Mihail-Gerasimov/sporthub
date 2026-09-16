'use client';

/**
 * Страница модерации публикаций (Phase 28.19 rebrand).
 * Объединённый список клубов и тренеров с фильтрами, поиском, пагинацией
 * и действиями hide/unhide.
 *
 * Phase 28.19:
 * — sec-head: eyebrow + display title + sub с количеством карточек;
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
 *
 * Phase 38 Step 38.54: третья очередь — проверка площадкой. Отбор «непроверенные /
 * проверенные» уходит В ЗАПРОС (`verified=false|true`, индекс по `(status, created_at)`
 * на бэкенде), действия «Подтвердить» и «Отозвать» — через тот же `POST /api/moderation`
 * по словарю действий домена; отзыв — с обязательной причиной в той же модалке,
 * что у скрытия. Карточка строки вынесена в `ModerationItemCard`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import type { ModerationAction } from '@sporthub/domain';
import type { City } from '@sporthub/types';
import { PaginationBar } from '@/components/ui/PaginationBar';
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

import { ModerationItemCard, type PublicationItem } from './ModerationItemCard';
import { ReasonModal, type ReasonPurpose } from './ReasonModal';

interface ModerationPageProps {
  sports: Array<{ id: number; name: string }>;
}

// Phase 28.19: единый PAGE_SIZE с Logs/Users.
// Шаг 37.54: объявлен в `lib/moderation-filters` — оттуда же собирается смещение
// в запросе, и двух разных представлений о размере страницы быть не должно.
const PAGE_SIZE = MODERATION_PAGE_SIZE;

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

  // Модалка причины: скрытие или отзыв проверки — одна на оба действия.
  const [reasonTarget, setReasonTarget] = useState<{
    item: PublicationItem;
    purpose: ReasonPurpose;
  } | null>(null);
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

  /**
   * Одно действие модерации — по словарю домена. Причина уходит только там, где
   * она есть: сервер сам знает, какому действию она обязательна.
   */
  const runAction = async (action: ModerationAction, item: PublicationItem, reason?: string) => {
    setActionLoading(true);
    try {
      await fetch('/api/moderation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          entityType: item.type,
          entityId: item.id,
          ...(reason === undefined ? {} : { reason }),
        }),
      });
      fetchData();
    } finally {
      setActionLoading(false);
    }
  };

  /** Причина из модалки: скрытие или отзыв — по её назначению. */
  const handleReason = async (reason: string) => {
    if (!reasonTarget) return;
    const { item, purpose } = reasonTarget;
    setReasonTarget(null);
    await runAction(purpose, item, reason);
  };

  const handleUnhide = async (item: PublicationItem) => {
    if (!confirm(`Показать публикацию «${item.name}»?`)) return;
    await runAction('unhide', item);
  };

  // Страница — из адреса: отбор и постраничность живут в нём одинаково,
  // и ссылку на вторую страницу модерации можно дать кому угодно.
  const currentPage = filters.page;

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

      {/* Toolbar: search + 6 select */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[minmax(0,1.2fr)_repeat(6,minmax(0,1fr))] xxl:grid-cols-[minmax(0,1.4fr)_repeat(6,minmax(0,1fr))]">
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

        {/* Третья очередь (38.54): проверка площадкой. Отбор — в запросе, `verified=false|true`. */}
        <ToolbarSelect
          ariaLabel="Проверка площадкой"
          value={filters.verification}
          active={filters.verification !== 'all'}
          onChange={(value) =>
            applyFilters({ verification: value as ModerationFilters['verification'] })
          }
          options={[
            { value: 'all', label: 'Проверка: все' },
            { value: 'unverified', label: 'Непроверенные' },
            { value: 'verified', label: 'Проверенные' },
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
            <ModerationItemCard
              key={`${item.type}-${item.id}`}
              item={item}
              focused={item === focusedItem}
              actionLoading={actionLoading}
              onHide={() => setReasonTarget({ item, purpose: 'hide' })}
              onUnhide={() => handleUnhide(item)}
              onVerify={() => runAction('verify', item)}
              onUnverify={() => setReasonTarget({ item, purpose: 'unverify' })}
            />
          ))}
        </div>
      )}

      {/* Пагинация всегда видна */}
      <PaginationBar
        shape="boxed"
        className="px-1 pt-1.5"
        page={currentPage}
        pageSize={PAGE_SIZE}
        total={total}
        shownCount={items.length}
        onPageChange={(page) => applyFilters({ page })}
      />

      {/* Модалка причины — скрытие и отзыв проверки */}
      <ReasonModal
        open={reasonTarget !== null}
        purpose={reasonTarget?.purpose ?? 'hide'}
        onClose={() => setReasonTarget(null)}
        onConfirm={handleReason}
        entityName={reasonTarget?.item.name ?? ''}
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

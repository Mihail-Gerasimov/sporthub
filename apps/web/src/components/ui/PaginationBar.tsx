/**
 * Полоса постраничности: подпись «Показано 1–15 из 52» и ряд кнопок «‹ 1 2 3 ›».
 * Одно объявление на все списки проекта (шаг 37.67).
 *
 * ⚠️ Что здесь сведено. Полоса была написана заново ПЯТЬ раз — журнал, люди,
 * модерация и очередь надзора в служебной панели плюс лента уведомлений
 * в кабинете, — и все пять копий появились одинаково дёшево: списку нужен
 * пагинатор, автор пишет тридцать строк разметки и пятнадцать строк кнопки,
 * и в дереве становится на копию больше. Расхождения уже накопились: у одной
 * копии цифры были с `tabular-nums`, у четырёх — без, и это видно глазом, когда
 * при переключении страниц ряд кнопок дёргается по ширине.
 *
 * ⚠️ Вид задаётся `shape`, и это НЕ флаг «панель или кабинет». Флаг говорит,
 * откуда зовут, и ничего не говорит о том, что поменяется; `boxed` / `pill`
 * называют саму внешность — по имени видно, что станет с кнопкой. Два вида
 * оставлены намеренно: панель и кабинет действительно выглядят по-разному,
 * и причёсывать их под один вид этой работой нельзя — это была бы правка
 * дизайна под видом уборки дубля.
 *
 * ⚠️ Отступы полосы от страницы задаёт `className` вызывающего, а не вид.
 * Они принадлежат вёрстке конкретной страницы (в панели полоса стоит с отбивкой
 * `px-1 pt-1.5`, в кабинете — без неё), и прятать их в вид значило бы связать
 * два несвязанных решения: сменил скругление — поехали отступы.
 *
 * ⚠️ Постраничность считается от `total`, а не от длины выданной страницы:
 * пятнадцать строк делятся на пятнадцать ровно всегда, и пагинатор показывал бы
 * вечную «одну страницу» при любой длине списка.
 */
'use client';

import { useMemo, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { ChevronIcon } from '@/components/ui/ChevronIcon';

/** Сколько номеров страниц показываем разом — окно вокруг текущей. */
const MAX_VISIBLE_PAGE_BUTTONS = 5;

/**
 * Внешность полосы.
 *
 * `boxed` — кнопка-плитка: скругление 8px, body 700, прозрачный фон
 * у неактивной. Так полоса выглядит в служебной панели.
 *
 * `pill` — кнопка-таблетка: полное скругление, body 600, белый фон
 * у неактивной. Так полоса выглядит в кабинете.
 */
export type PaginationShape = 'boxed' | 'pill';

/** Классы, которыми два вида и различаются. Один словарь — одно объявление. */
const SHAPE_STYLES: Record<
  PaginationShape,
  { readonly button: string; readonly inactive: string; readonly rangeWeight: string }
> = {
  boxed: {
    button: 'rounded-[8px] font-bold',
    inactive: 'bg-transparent',
    rangeWeight: 'font-bold',
  },
  pill: {
    button: 'rounded-pill font-semibold',
    inactive: 'bg-card',
    rangeWeight: 'font-semibold',
  },
};

const ICON_CHEV_LEFT = <ChevronIcon direction="left" className="size-3.5" strokeWidth={2.4} />;
const ICON_CHEV_RIGHT = <ChevronIcon direction="right" className="size-3.5" strokeWidth={2.4} />;

/**
 * Окно номеров вокруг текущей страницы: не больше `MAX_VISIBLE_PAGE_BUTTONS`
 * кнопок, и у краёв окно прижимается, а не укорачивается — иначе на последней
 * странице ряд оказывался бы короче, чем на первой.
 */
function visiblePageWindow(currentPage: number, totalPages: number): number[] {
  const half = Math.floor(MAX_VISIBLE_PAGE_BUTTONS / 2);
  let start = Math.max(1, currentPage - half);
  const end = Math.min(totalPages, start + MAX_VISIBLE_PAGE_BUTTONS - 1);

  start = Math.max(1, end - MAX_VISIBLE_PAGE_BUTTONS + 1);

  const pages: number[] = [];

  for (let i = start; i <= end; i++) pages.push(i);

  return pages;
}

type PaginationBarProps = {
  /** Текущая страница, считая с единицы. */
  page: number;
  /** Сколько строк помещается на страницу. */
  pageSize: number;
  /** Сколько строк всего по текущему отбору. Отсюда и число страниц. */
  total: number;
  /**
   * Сколько строк показано СЕЙЧАС. Последняя страница почти всегда короче
   * `pageSize`, и подпись обязана называть то, что человек видит, а не то,
   * сколько влезло бы.
   */
  shownCount: number;
  /** Нажали номер или стрелку. Номер приходит уже в границах 1…totalPages. */
  onPageChange: (page: number) => void;
  /** Внешность полосы — см. `PaginationShape`. */
  shape: PaginationShape;
  /** Признак для тестов на подписи диапазона. Нужен не каждой поверхности. */
  rangeTestId?: string;
  /** Отбивка полосы от списка — вёрстка страницы, а не вид полосы. */
  className?: string;
};

export function PaginationBar({
  page,
  pageSize,
  total,
  shownCount,
  onPageChange,
  shape,
  rangeTestId,
  className,
}: PaginationBarProps) {
  const styles = SHAPE_STYLES[shape];
  // Страница всегда есть, даже когда список пуст: полоса видна ВСЕГДА, иначе
  // она появлялась бы и исчезала при смене отбора, дёргая высоту страницы.
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const offset = (page - 1) * pageSize;
  const pages = useMemo(() => visiblePageWindow(page, totalPages), [page, totalPages]);

  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <span className="text-xs font-medium text-muted" data-testid={rangeTestId}>
        {total === 0 ? (
          'Показано 0 из 0'
        ) : (
          <>
            Показано{' '}
            {/* tabular-nums обязателен: без него подпись прыгает по ширине при
                каждом переходе на соседнюю страницу. */}
            <strong className={cn('tabular-nums text-ink', styles.rangeWeight)}>
              {offset + 1}–{Math.min(offset + shownCount, total)}
            </strong>{' '}
            из <strong className={cn('tabular-nums text-ink', styles.rangeWeight)}>{total}</strong>
          </>
        )}
      </span>

      <div className="flex flex-wrap items-center gap-1.5">
        <PageButton
          shape={shape}
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          ariaLabel="Предыдущая страница"
        >
          {ICON_CHEV_LEFT}
        </PageButton>
        {pages.map((number) => (
          <PageButton
            key={number}
            shape={shape}
            active={number === page}
            onClick={() => onPageChange(number)}
            ariaLabel={`Страница ${number}`}
          >
            {number}
          </PageButton>
        ))}
        <PageButton
          shape={shape}
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          ariaLabel="Следующая страница"
        >
          {ICON_CHEV_RIGHT}
        </PageButton>
      </div>
    </div>
  );
}

/**
 * Кнопка пагинатора — номер или стрелка.
 *
 * Подпись для экранного диктора обязательна у каждой: голая цифра диктору
 * не сообщает ничего, а стрелка без подписи не сообщает вовсе ничего.
 */
function PageButton({
  shape,
  active = false,
  disabled = false,
  onClick,
  children,
  ariaLabel,
}: {
  shape: PaginationShape;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  ariaLabel: string;
}) {
  const styles = SHAPE_STYLES[shape];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex h-8 min-w-8 items-center justify-center border px-2 text-xs tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        styles.button,
        active
          ? 'border-lime bg-lime text-ink'
          : cn('border-line text-ink hover:border-lime hover:text-lime-hov', styles.inactive),
      )}
    >
      {children}
    </button>
  );
}

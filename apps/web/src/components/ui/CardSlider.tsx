'use client';

/*
 * CardSlider — переиспользуемый клиентский слайдер карточек со step-based
 * translateX-rail, стрелками prev/next и точками-индикаторами.
 *
 * Phase 28.6: применяется в ClubList/TrainerList для выдачи под фильтр.
 * Phase 28.12: расширен — добавлены опц. props `tools` (кастомный блок
 * вместо pill-счётчика) и `visibleByBp` (тернарный адаптив 1↔2↔3
 * через два mediaQuery'я). Используется в TrainerAvailability (slot-блок).
 *
 * Дизайн взят из claude-design/cards-trainers/sporthub/project/
 * SportHub Cards - Clubs.html (28.6) и slots-availability/sporthub/
 * project/SportHub Slots - Availability.html (28.12).
 *
 * Фаза 38, шаг 38.106: режим сетки — `gridFrom={{ md, lg }}` (витрина главной по
 * макету `HomePage.tsx:244-264`: с 768 — две в ряд, с 1024 — клубы 3×2, тренеры
 * четыре в ряд). Слайдер — только там, где сетка не помещается: ниже `md` та же
 * лента со свайпом, одна карточка в кадре. С `md` лента становится CSS-grid,
 * стрелки и точки прячутся, сдвиг и drag выключены. Один компонент, не вторая
 * карусель (сторож `carousel-single`). Переключение — классами (`md:grid`), без
 * мигания при гидрации; JS лишь снимает сдвиг и drag.
 *
 * Шапка секции — по макету (`HomePage.tsx:582-600`): рубрика 10px зелёная, заголовок
 * шкалы `t-h2`, справа `tools` — кнопка «Все …»; одна разметка на все ширины
 * (ниже lg инструменты и стрелки — рядом под заголовком), без ветки по JS.
 *
 * При total=0 рендерится empty-state, сам rail не создаётся.
 */
import { Children, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { ChevronIcon } from '@/components/ui/ChevronIcon';

type VisibleByBp = {
  /** ≤ md (по дефолту mobile) */
  sm?: number;
  /** ≥ 768px */
  md?: number;
  /** ≥ 1280px */
  xl?: number;
};

type CardSliderProps = {
  children: ReactNode;
  /** Длина списка для max-idx и pill-счётчика */
  total: number;
  /** Маленькое UPPERCASE-eyebrow над заголовком */
  eyebrow: string;
  /** Главный заголовок секции (display) */
  title: string;
  /** Цвет акцента: lime — для клубов/слотов, orange — для тренеров */
  accent: 'lime' | 'orange';
  /** Уникальный идентификатор слайдера в DOM */
  sliderId: string;
  /**
   * Старое API: сколько карточек видно одновременно — на lg и в дефолте.
   * Используется ClubList/TrainerList (28.6/28.10). Если задан и
   * `visibleByBp` НЕ задан — работает старое поведение 1↔2 на 1024px.
   */
  visiblePerBreakpoint?: { lg: number; default: number };
  /**
   * Новое API (Phase 28.12): тернарный адаптив через два mediaQuery'я
   * `(min-width: 768px)` и `(min-width: 1280px)`. Если задан —
   * `visiblePerBreakpoint` игнорируется. Любой ключ опционален,
   * fallback на ближайший меньший (sm → md → xl).
   */
  visibleByBp?: VisibleByBp;
  /** Подпись pill-счётчика по умолчанию (если `tools` не передан) */
  countLabel?: string;
  /** Сообщение пустого состояния (рендерится при total=0) */
  emptyMessage?: string;
  /**
   * Phase 28.12: кастомный блок справа от title (вместо дефолтного
   * pill-счётчика «N в выдаче»). Стрелки prev/next CardSlider добавляет
   * сам — рядом с `tools` на lg+, отдельным рядом сверху на <lg.
   */
  tools?: ReactNode;
  /**
   * 38.106: сетка вместо ленты — с `md` в `md` колонок, с `lg` в `lg` колонок;
   * стрелки, точки, сдвиг и drag с `md` уходят. Ниже `md` — лента по `visibleByBp`.
   */
  gridFrom?: { md: GridColumns; lg: GridColumns };
};

type GridColumns = 2 | 3 | 4;

/** Рубрика секции — по макету: 10px, полужирная, зелёная, разрядка 0.12em. */
const EYEBROW_CLASS = 'font-body text-[10px] font-bold uppercase tracking-[0.12em] text-lime-hov';

const NAV_BUTTON_CLASS =
  'flex h-10 w-10 items-center justify-center rounded-full border border-[var(--ui-line)] bg-[var(--ui-card-2)] text-[var(--ui-ink)] transition-colors disabled:pointer-events-none disabled:opacity-35';

/** Классы сетки — статичными строками: Tailwind собирает их из исходника. */
const GRID_MD: Record<GridColumns, string> = {
  2: 'md:grid md:grid-cols-2',
  3: 'md:grid md:grid-cols-3',
  4: 'md:grid md:grid-cols-4',
};
/** Зазор — по макету: у клубов 16, у тренеров (четыре в ряд) 14. */
const GRID_LG: Record<GridColumns, string> = {
  2: 'md:gap-4 lg:grid-cols-2',
  3: 'md:gap-4 lg:grid-cols-3',
  4: 'md:gap-3.5 lg:grid-cols-4',
};

export function CardSlider({
  children,
  total,
  eyebrow,
  title,
  accent,
  sliderId,
  visiblePerBreakpoint = { lg: 2, default: 1 },
  visibleByBp,
  countLabel = 'в выдаче',
  emptyMessage = 'Ничего не нашли. Попробуйте сменить фильтры.',
  tools,
  gridFrom,
}: CardSliderProps) {
  // Выбираем «начальный» visible как fallback если медиа не сматчится.
  const fallbackVisible = visibleByBp?.sm ?? visiblePerBreakpoint.default;

  // Текущий индекс левого края rail-контейнера (шаг = 1 карточка).
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(fallbackVisible);
  // 768px — точка сетки `gridFrom`: с md листать нечего (maxIdx 0). Шапку по флагу
  // не ветвим (ревью 38.106): она одной разметкой.
  const [isMdUp, setIsMdUp] = useState(false);
  const railRef = useRef<HTMLDivElement | null>(null);

  // Слушаем matchMedia. Если задан `visibleByBp` — два запроса
  // (md и xl) для тернарного 1↔2↔3. Иначе старое поведение (1↔2).
  useEffect(() => {
    const onChangeHandlers: Array<{ mq: MediaQueryList; handler: () => void }> = [];

    function applyVisible(next: number) {
      setVisible(next);
      const nextMax = Math.max(0, total - next);
      setIdx((prev) => Math.min(prev, nextMax));
    }

    if (visibleByBp) {
      const mqMd = window.matchMedia('(min-width: 768px)');
      const mqXl = window.matchMedia('(min-width: 1280px)');

      const update = () => {
        const sm = visibleByBp.sm ?? 1;
        const md = visibleByBp.md ?? sm;
        const xl = visibleByBp.xl ?? md;
        const next = mqXl.matches ? xl : mqMd.matches ? md : sm;
        applyVisible(next);
        setIsMdUp(mqMd.matches);
      };

      update();
      mqMd.addEventListener('change', update);
      mqXl.addEventListener('change', update);
      onChangeHandlers.push({ mq: mqMd, handler: update }, { mq: mqXl, handler: update });
    } else {
      const mq = window.matchMedia('(min-width: 1024px)');
      const update = () => {
        const next = mq.matches ? visiblePerBreakpoint.lg : visiblePerBreakpoint.default;
        applyVisible(next);
        setIsMdUp(window.matchMedia('(min-width: 768px)').matches);
      };
      update();
      mq.addEventListener('change', update);
      onChangeHandlers.push({ mq, handler: update });
    }

    return () => {
      onChangeHandlers.forEach(({ mq, handler }) => mq.removeEventListener('change', handler));
    };
  }, [
    total,
    visiblePerBreakpoint.lg,
    visiblePerBreakpoint.default,
    visibleByBp,
    visibleByBp?.sm,
    visibleByBp?.md,
    visibleByBp?.xl,
  ]);

  // Сетка с md (38.106): листать нечего — maxIdx 0 выключает стрелки, точки и drag.
  const gridActive = gridFrom !== undefined && isMdUp;
  const maxIdx = gridActive ? 0 : Math.max(0, total - visible);
  const safeIdx = Math.min(idx, maxIdx);

  // Обновляем translateX rail при смене idx или числа видимых; в сетке сдвига нет.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    if (gridActive) {
      rail.style.transform = '';
      return;
    }
    const slide = rail.querySelector('[data-card-slider-slide]') as HTMLElement | null;
    const slideW = slide?.offsetWidth ?? 0;
    rail.style.transform = `translateX(${-safeIdx * slideW}px)`;
  }, [safeIdx, visible, gridActive]);

  const go = useCallback(
    (delta: number) => {
      setIdx((prev) => Math.max(0, Math.min(maxIdx, prev + delta)));
    },
    [maxIdx],
  );

  // Phase 28.14: drag/swipe (mouse + touch) на rail. Паттерн как в ChipMarquee
  // (28.6) — setPointerCapture + порог переключения 25% ширины слайда +
  // edge-resistance × 0.35 на крайних слайдах + click-suppress если
  // |dragOffsetPx| > 6 (чтобы drag по карточке не сработал как навигация
  // <Link> внутри). На rail-обёртке — `cursor:grab; touch-action: pan-y`
  // (вертикальный скролл страницы пальцем сохраняется).
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startIdx: number;
    slideW: number;
    dx: number;
    moved: boolean;
  } | null>(null);
  const wasDragRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      // Игнорируем drag, если pointer-target — стрелка/dot/link/button/CTA
      // внутри карточки (включая <a> на имени и <button> «К записи»).
      const target = e.target as HTMLElement | null;
      if (target?.closest('a, button, [role="button"], [data-card-slider-dot]')) {
        return;
      }
      const rail = railRef.current;
      if (!rail) return;
      const slide = rail.querySelector('[data-card-slider-slide]') as HTMLElement | null;
      const slideW = slide?.offsetWidth ?? 0;
      if (slideW === 0 || maxIdx === 0) return;

      dragStateRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startIdx: safeIdx,
        slideW,
        dx: 0,
        moved: false,
      };
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      setIsDragging(true);
    },
    [maxIdx, safeIdx],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== e.pointerId) return;
      let dx = e.clientX - state.startX;
      // Edge-resistance на крайних слайдах.
      if ((state.startIdx === 0 && dx > 0) || (state.startIdx === maxIdx && dx < 0)) {
        dx *= 0.35;
      }
      state.dx = dx;
      if (Math.abs(dx) > 6) state.moved = true;
      const rail = railRef.current;
      if (rail) {
        rail.style.transform = `translateX(${-state.startIdx * state.slideW + dx}px)`;
      }
    },
    [maxIdx],
  );

  const onPointerEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== e.pointerId) return;
      const threshold = state.slideW * 0.25;
      let nextIdx = state.startIdx;
      if (state.dx <= -threshold) nextIdx = Math.min(maxIdx, state.startIdx + 1);
      else if (state.dx >= threshold) nextIdx = Math.max(0, state.startIdx - 1);

      wasDragRef.current = state.moved;
      try {
        (e.currentTarget as Element).releasePointerCapture(state.pointerId);
      } catch {
        /* ignore */
      }
      dragStateRef.current = null;
      setIsDragging(false);
      // setIdx триггерит useEffect, который применяет финальный transform с
      // restored transition. Если nextIdx === safeIdx, snap-back делаем
      // вручную (useEffect не сработает на том же значении).
      if (nextIdx === safeIdx) {
        const rail = railRef.current;
        if (rail) rail.style.transform = `translateX(${-safeIdx * state.slideW}px)`;
      } else {
        setIdx(nextIdx);
      }
    },
    [maxIdx, safeIdx],
  );

  const onClickCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (wasDragRef.current) {
      e.preventDefault();
      e.stopPropagation();
      wasDragRef.current = false;
    }
  }, []);

  // Empty state — нет карточек, показываем только заголовок и сообщение.
  if (total === 0) {
    return (
      <section id={sliderId} className="space-y-6">
        <header className="flex flex-col gap-2">
          <span className={EYEBROW_CLASS}>{eyebrow}</span>
          <h2 className="t-h2 text-ink">{title}</h2>
        </header>
        <p
          data-card-slider-empty
          className="rounded-[18px] border border-dashed border-[var(--ui-line)] bg-[var(--ui-card)] p-6 text-sm leading-relaxed text-[var(--ui-muted)]"
        >
          {emptyMessage}
        </p>
      </section>
    );
  }

  // Hover-классы стрелок зависят от accent (lime/orange).
  const navHoverClass =
    accent === 'lime'
      ? 'hover:border-lime hover:text-lime-hov'
      : 'hover:border-orange hover:text-orange-text';

  // Pill-счётчик и активная точка — классами по акценту, а не инлайновым стилем:
  // цвет идёт через токен, и перекраска его видит.
  const pillAccentClass =
    accent === 'lime' ? 'bg-lime-soft text-lime-hov' : 'bg-orange-soft text-orange-text';
  const dotActiveClass =
    accent === 'lime' ? 'data-[active=true]:bg-lime' : 'data-[active=true]:bg-orange';

  // Дефолтный pill-счётчик «N в выдаче» — рендерится только если `tools`
  // не передан. Иначе вместо него — пользовательский tools-блок.
  const defaultTools = (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 font-body text-[11px] font-bold uppercase tracking-[0.16em] ${pillAccentClass}`}
    >
      <span className="font-display text-[14px] tabular-nums leading-none">{total}</span>
      {countLabel}
    </span>
  );

  // В режиме сетки стрелки и точки с lg спрятаны классом — без мигания при гидрации.
  const hideFromMd = gridFrom !== undefined ? 'md:hidden' : '';

  const navButtons = (
    <div className={`flex items-center gap-2 ${hideFromMd}`}>
      <button
        type="button"
        onClick={() => go(-1)}
        disabled={safeIdx <= 0}
        aria-label="Назад"
        className={`${NAV_BUTTON_CLASS} ${navHoverClass}`}
      >
        <ChevronIcon direction="left" />
      </button>
      <button
        type="button"
        onClick={() => go(1)}
        disabled={safeIdx >= maxIdx}
        aria-label="Вперёд"
        className={`${NAV_BUTTON_CLASS} ${navHoverClass}`}
      >
        <ChevronIcon direction="right" />
      </button>
    </div>
  );

  // Шапка — ОДНА разметка на все ширины (ревью 38.106: ветка по `isLgUp` из JS
  // прыгала при гидрации на lg): ниже lg — рубрика и заголовок, ниже ряд
  // «инструменты · стрелки»; с lg — в одну строку, инструменты и стрелки справа.
  // Отступ до карточек — 36px (12 + 24), как в макете.
  const renderHeader = () => (
    <header className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-5">
      <div className="flex min-w-0 flex-col gap-2">
        <span className={EYEBROW_CLASS}>{eyebrow}</span>
        <h2 className="t-h2 text-ink">{title}</h2>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 lg:flex-nowrap lg:justify-end">
        {tools ?? defaultTools}
        {navButtons}
      </div>
    </header>
  );

  return (
    <section id={sliderId} className="space-y-6">
      {renderHeader()}

      <div className="relative">
        <div
          className={`overflow-hidden rounded-[22px] ${gridFrom !== undefined ? 'md:overflow-visible md:rounded-none' : ''} ${maxIdx > 0 ? 'cursor-grab touch-pan-y select-none' : ''} ${isDragging ? 'cursor-grabbing' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onClickCapture={onClickCapture}
        >
          <div
            ref={railRef}
            data-card-slider-rail
            className={`flex will-change-transform ${isDragging ? '' : 'transition-transform duration-[350ms] [transition-timing-function:cubic-bezier(.2,.7,.2,1)]'} ${gridFrom !== undefined ? `${GRID_MD[gridFrom.md]} ${GRID_LG[gridFrom.lg]}` : ''}`}
          >
            {Children.map(children, (child) => (
              <div
                data-card-slider-slide
                // Зазор слайда — только в режиме ленты: в сетке с md его нет вовсе
                // (`md:pr-0` рядом с `md:pr-[22px]` на одной точке проигрывал — карточки
                // были уже ячеек на 22px; прогон 38.112).
                className={`flex-shrink-0 pr-[14px] last:pr-0 sm:pr-[18px] ${gridFrom !== undefined ? 'md:pr-0' : 'md:pr-[22px]'}`}
                style={{ flexBasis: `calc(100% / ${visible})` }}
              >
                {child}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={`mt-2 flex items-center justify-center gap-2 ${hideFromMd}`}>
        {Array.from({ length: maxIdx + 1 }, (_, i) => (
          <button
            key={i}
            type="button"
            data-card-slider-dot
            data-active={i === safeIdx ? 'true' : 'false'}
            onClick={() => setIdx(i)}
            aria-label={`Слайд ${i + 1}`}
            className={`h-1 w-7 cursor-pointer rounded-full border-0 bg-line p-0 transition-[background,width] duration-200 data-[active=true]:w-10 ${dotActiveClass}`}
          />
        ))}
      </div>
    </section>
  );
}

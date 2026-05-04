'use client';

/*
 * CardSlider — переиспользуемый клиентский слайдер карточек со step-based
 * translateX-rail, стрелками prev/next и точками-индикаторами.
 *
 * Используется в ClubList/TrainerList для отображения результатов поиска
 * (Phase 28). Дизайн взят из claude-design/cards-trainers/sporthub/project/
 * SportHub Cards - Clubs.html — блок .slider + setupSlider.
 *
 * Адаптив: 2 видимых карточки на 1024+, 1 видимая на ≤768. Шаг слайдера —
 * всегда 1 карточка. На краях соответствующая стрелка disabled.
 *
 * При total=0 рендерится empty-state (заголовок + emptyMessage), сам rail
 * не создаётся.
 */
import { Children, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type CardSliderProps = {
  children: ReactNode;
  /** Длина списка для max-idx и pill-счётчика */
  total: number;
  /** Маленькое UPPERCASE-eyebrow над заголовком (например "Club list") */
  eyebrow: string;
  /** Главный заголовок секции (Bowlby) */
  title: string;
  /** Цвет акцента: lime — для клубов, orange — для тренеров */
  accent: 'lime' | 'orange';
  /** Уникальный идентификатор слайдера в DOM */
  sliderId: string;
  /** Сколько карточек видно одновременно — на lg и в дефолте (≤768) */
  visiblePerBreakpoint?: { lg: number; default: number };
  /** Подпись pill-счётчика (по умолчанию "в выдаче") */
  countLabel?: string;
  /** Сообщение пустого состояния (рендерится при total=0) */
  emptyMessage?: string;
};

export function CardSlider({
  children,
  total,
  eyebrow,
  title,
  accent,
  sliderId,
  visiblePerBreakpoint = { lg: 2, default: 1 },
  countLabel = 'в выдаче',
  emptyMessage = 'Ничего не нашли. Попробуйте сменить фильтры.',
}: CardSliderProps) {
  // Текущий индекс левого края rail-контейнера (шаг = 1 карточка).
  const [idx, setIdx] = useState(0);
  // Адаптивное число видимых карточек: 2 на 1024+, 1 на меньших.
  const [visible, setVisible] = useState(visiblePerBreakpoint.default);
  const railRef = useRef<HTMLDivElement | null>(null);

  // Слушаем matchMedia для переключения visible на бэйкпоинте 1024px.
  // При смене visible сразу нормализуем idx: если он стал больше нового
  // maxIdx — сжимаем, чтобы не было «пустого» сдвига rail. Делаем здесь
  // (не отдельным эффектом), чтобы не нарушать правило set-state-in-effect.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    function update() {
      const next = mq.matches ? visiblePerBreakpoint.lg : visiblePerBreakpoint.default;
      setVisible(next);
      const nextMax = Math.max(0, total - next);
      setIdx((prev) => Math.min(prev, nextMax));
    }
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [visiblePerBreakpoint.lg, visiblePerBreakpoint.default, total]);

  // maxIdx считаем синхронно с idx — на случай если total уменьшился
  // (например, после фильтрации в ClubList) idx нормализуется через
  // Math.min ниже, а сам idx-state остаётся как есть до следующего
  // взаимодействия пользователя.
  const maxIdx = Math.max(0, total - visible);
  const safeIdx = Math.min(idx, maxIdx);

  // Обновляем translateX rail при смене idx или числа видимых.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const slide = rail.querySelector('[data-card-slider-slide]') as HTMLElement | null;
    const slideW = slide?.offsetWidth ?? 0;
    rail.style.transform = `translateX(${-safeIdx * slideW}px)`;
  }, [safeIdx, visible]);

  const go = useCallback(
    (delta: number) => {
      setIdx((prev) => Math.max(0, Math.min(maxIdx, prev + delta)));
    },
    [maxIdx],
  );

  // Empty state — нет карточек, показываем только заголовок и сообщение.
  if (total === 0) {
    return (
      <section id={sliderId} className="space-y-6">
        <header className="flex flex-col gap-2">
          <span className="font-body text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--ui-muted)]">
            {eyebrow}
          </span>
          <h2 className="font-display text-[26px] uppercase leading-none tracking-[-0.005em] text-[var(--ui-ink)] sm:text-[30px]">
            {title}
          </h2>
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
      ? 'hover:border-[var(--ui-lime)] hover:text-[var(--ui-lime)]'
      : 'hover:border-[var(--ui-orange)] hover:text-[var(--ui-orange)]';

  // Стили pill-счётчика и активной dot — через CSS-переменные accent.
  const accentVar = accent === 'lime' ? 'var(--ui-lime)' : 'var(--ui-orange)';
  const accentSoftVar = accent === 'lime' ? 'var(--ui-lime-soft)' : 'var(--ui-orange-soft)';

  return (
    <section id={sliderId} className="space-y-6">
      <header className="mb-2 flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="font-body text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--ui-muted)]">
            {eyebrow}
          </span>
          <h2 className="font-display text-[26px] uppercase leading-none tracking-[-0.005em] text-[var(--ui-ink)] sm:text-[30px]">
            {title}
          </h2>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 font-body text-[11px] font-bold uppercase tracking-[0.16em]"
            style={{ background: accentSoftVar, color: accentVar }}
          >
            <span className="font-display text-[14px] tabular-nums leading-none">{total}</span>
            {countLabel}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={safeIdx <= 0}
              aria-label="Назад"
              className={`flex h-10 w-10 items-center justify-center rounded-full border border-[var(--ui-line)] bg-[var(--ui-card-2)] text-[var(--ui-ink)] transition-colors ${navHoverClass} disabled:pointer-events-none disabled:opacity-35`}
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={safeIdx >= maxIdx}
              aria-label="Вперёд"
              className={`flex h-10 w-10 items-center justify-center rounded-full border border-[var(--ui-line)] bg-[var(--ui-card-2)] text-[var(--ui-ink)] transition-colors ${navHoverClass} disabled:pointer-events-none disabled:opacity-35`}
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="relative">
        <div className="overflow-hidden rounded-[22px]">
          <div
            ref={railRef}
            data-card-slider-rail
            className="flex transition-transform duration-[350ms] [transition-timing-function:cubic-bezier(.2,.7,.2,1)] will-change-transform"
          >
            {Children.map(children, (child) => (
              <div
                data-card-slider-slide
                className="flex-shrink-0 pr-[14px] last:pr-0 sm:pr-[18px] md:pr-[22px]"
                style={{ flexBasis: `calc(100% / ${visible})` }}
              >
                {child}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-center gap-2">
        {Array.from({ length: maxIdx + 1 }, (_, i) => (
          <button
            key={i}
            type="button"
            data-card-slider-dot
            data-active={i === safeIdx ? 'true' : 'false'}
            onClick={() => setIdx(i)}
            aria-label={`Слайд ${i + 1}`}
            className="h-1 cursor-pointer rounded-full border-0 p-0 transition-[background,width] duration-200"
            style={{
              width: i === safeIdx ? '40px' : '28px',
              background: i === safeIdx ? accentVar : 'var(--ui-line)',
            }}
          />
        ))}
      </div>
    </section>
  );
}

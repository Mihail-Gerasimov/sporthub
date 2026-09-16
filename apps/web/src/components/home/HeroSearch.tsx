'use client';

/**
 * Поисковый виджет героя (шаг 38.67) — по эталону (`HomePage.tsx:310-352`, чек-лист
 * step-11…15, 20): белая карточка радиусом 18 с отступом 8 и плавающей тенью;
 * переключатель «Клубы / Тренеры» на подложке холста (радиус 12, отступ 4), активный
 * сегмент зелёный со свечением; поле с иконкой (`padding-left 42`, фон холста,
 * радиус 12, зелёная рамка 1.5px и каретка в фокусе); кнопка «Найти» — зелёная,
 * радиус 12, display-шрифтом, стрелка 14px.
 *
 * Логика наша, не макета: стор фильтров тот же, что у рабочей части, поэтому ввод
 * фильтрует живьём (реестр № 62), а кнопка и Enter дают цели — ведут к выдаче
 * каталога `/catalog#results`, НЕ теряя введённого: в дизайне строка подменялась подписью категории.
 * Выпадашка подсказок (38.68) открывается по фокусу в поле; `↓` и `Escape` на поле
 * слушает она сама через ссылку на поле; клик вне виджета и уход фокуса за его
 * пределы закрывают её (правка по ревью 38.67) — иначе она висела бы над картой.
 *
 * Почему не `ui/Input`: у поля героя рамка 1.5px в цвет каретки, иконка внутри
 * и подложка холста на белой карточке — форма эталона, а не поля формы кабинета.
 * Кнопка «Найти» — `ui/Button primary`: ховер подъёмом и тенью, без смены фона
 * (тёмно-зелёная заливка под тёмным текстом давала бы ≈3.2:1).
 */
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';

import type { HomeSport } from '@/components/home/home-data';
import { SearchSuggest } from '@/components/home/SearchSuggest';
import { Button } from '@/components/ui/Button';
import { SEARCH } from '@/lib/home-copy';
import { catalogSectionHref } from '@/lib/catalog-sections';
import { cn } from '@/lib/utils';
import { useFilterStore, type DiscoveryMode } from '@/stores/useFilterStore';

type HeroSearchProps = {
  /** Категории выпадашки — виды спорта из справочника, как у чипов рабочей части. */
  sports: readonly HomeSport[];
};

const MODES: readonly DiscoveryMode[] = ['clubs', 'trainers'];

export function HeroSearch({ sports }: HeroSearchProps) {
  const router = useRouter();
  const discoveryMode = useFilterStore((state) => state.discoveryMode);
  const searchQuery = useFilterStore((state) => state.searchQuery);
  const setDiscoveryMode = useFilterStore((state) => state.setDiscoveryMode);
  const setSearch = useFilterStore((state) => state.setSearch);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  // Последнее нажатие было внутри виджета: WebKit не даёт фокус кнопке по клику,
  // и `blur` поля приходит с пустым `relatedTarget` раньше `click` по пункту —
  // без этого признака список закрывался бы до выбора (правка по ревью 38.67).
  const pointerInsideRef = useRef(false);
  const [suggestOpen, setSuggestOpen] = useState(false);

  // Клик (касание) вне виджета закрывает выпадашку — как любой всплывающий список.
  useEffect(() => {
    if (!suggestOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        pointerInsideRef.current = false;
        setSuggestOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);

    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [suggestOpen]);

  /** Фокус ушёл за пределы виджета (Tab дальше по странице) — выпадашка закрывается. */
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    // Нажатие внутри виджета без фокусируемой цели (WebKit, пустое место) — не уход.
    if (pointerInsideRef.current) {
      pointerInsideRef.current = false;
      return;
    }

    if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setSuggestOpen(false);
  };

  /**
   * Цель кнопки и Enter: запрос уже в сторе, остаётся довести человека до выдачи —
   * на `/catalog#results` (38.79a): стор общий, запрос переезжает вместе с ним.
   */
  const goToResults = () => {
    setSuggestOpen(false);
    router.push(catalogSectionHref('results'));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      goToResults();
    }
  };

  return (
    <div
      ref={rootRef}
      onBlur={handleBlur}
      onPointerDownCapture={() => {
        pointerInsideRef.current = true;
      }}
      className="rounded-[18px] bg-card p-2 shadow-hero"
    >
      {/* Переключатель: два сегмента на подложке холста, активный — зелёный со свечением. */}
      <div
        role="group"
        aria-label={SEARCH.modesLabel}
        className="mb-1.5 flex gap-[3px] rounded-[12px] bg-bg p-1"
      >
        {MODES.map((mode) => {
          const active = discoveryMode === mode;

          return (
            <button
              key={mode}
              type="button"
              aria-pressed={active}
              onClick={() => setDiscoveryMode(mode)}
              className={cn(
                'flex-1 rounded-[9px] border-0 py-[9px] font-body text-[13px] font-bold transition-[background-color,color,box-shadow]',
                active
                  ? 'bg-lime text-ink shadow-glow'
                  : 'bg-transparent text-muted hover:text-ink',
              )}
            >
              {SEARCH.modes[mode]}
            </button>
          );
        })}
      </div>

      {/* Поле с иконкой и кнопка — в один ряд. */}
      <div className="flex gap-1.5">
        <div className="relative min-w-0 flex-1">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-3.5 top-1/2 size-[15px] -translate-y-1/2 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="6" />
            <path d="m20 20-4.5-4.5" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={searchQuery}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setSuggestOpen(true)}
            aria-label={SEARCH.inputLabel[discoveryMode]}
            placeholder={SEARCH.placeholder[discoveryMode]}
            autoComplete="off"
            className="w-full rounded-[12px] border-[1.5px] border-transparent bg-bg py-[13px] pl-[42px] pr-3.5 font-body text-[14px] text-ink caret-lime outline-none transition-colors placeholder:text-muted focus:border-lime"
          />
          <SearchSuggest
            open={suggestOpen}
            sports={sports}
            inputRef={inputRef}
            onClose={() => setSuggestOpen(false)}
          />
        </div>
        <Button
          size="md"
          glow={false}
          onClick={goToResults}
          className="shrink-0 px-6 tracking-[0.04em]"
          trailingIcon={
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-[14px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          }
        >
          {SEARCH.button}
        </Button>
      </div>
    </div>
  );
}

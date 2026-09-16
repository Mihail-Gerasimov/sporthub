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
 * `#results`, НЕ теряя введённого: в дизайне строка подменялась подписью категории.
 * Выпадашка подсказок (38.68) открывается по фокусу в поле; `↓` и `Escape` на поле
 * слушает она сама через ссылку на поле.
 *
 * Почему не `ui/Input`: у поля героя рамка 1.5px в цвет каретки, иконка внутри
 * и подложка холста на белой карточке — форма эталона, а не поля формы кабинета.
 */
import { useRouter } from 'next/navigation';
import { useRef, useState, type KeyboardEvent } from 'react';

import { SearchSuggest } from '@/components/home/SearchSuggest';
import { SEARCH } from '@/lib/home-copy';
import { homeSectionHref } from '@/lib/home-sections';
import { cn } from '@/lib/utils';
import { useFilterStore, type DiscoveryMode } from '@/stores/useFilterStore';
import type { Sport } from '@sporthub/types';

type HeroSearchProps = {
  /** Категории выпадашки — виды спорта из справочника, как у чипов рабочей части. */
  sports: readonly Pick<Sport, 'id' | 'name' | 'icon'>[];
};

const MODES: readonly DiscoveryMode[] = ['clubs', 'trainers'];

export function HeroSearch({ sports }: HeroSearchProps) {
  const router = useRouter();
  const discoveryMode = useFilterStore((state) => state.discoveryMode);
  const searchQuery = useFilterStore((state) => state.searchQuery);
  const setDiscoveryMode = useFilterStore((state) => state.setDiscoveryMode);
  const setSearch = useFilterStore((state) => state.setSearch);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);

  /** Цель кнопки и Enter: запрос уже в сторе, остаётся довести человека до выдачи. */
  const goToResults = () => {
    setSuggestOpen(false);
    router.push(homeSectionHref('results'));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      goToResults();
    }
  };

  return (
    <div className="rounded-[18px] bg-card p-2 shadow-floating">
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
        <button
          type="button"
          onClick={goToResults}
          className="inline-flex shrink-0 items-center gap-[7px] whitespace-nowrap rounded-[12px] border-0 bg-lime px-6 py-[13px] font-display text-[14px] font-black tracking-[0.04em] text-ink transition-colors hover:bg-lime-hov"
        >
          {SEARCH.button}
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
        </button>
      </div>
    </div>
  );
}

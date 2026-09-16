/**
 * Выпадашка подсказок под полем поиска героя (шаг 38.68).
 *
 * По эталону (`HomePage.tsx:356-384`): открывается под полем (`top: calc(100% + 6px)`),
 * радиус 14, плавающая тень, две рубрики. Первая — категории: виды спорта из базы
 * (`getSports()`, пропсом). Вторая — вместо «популярных запросов» макета (их нет:
 * ни данных, ни счётчика, реестр № 63) — популярные виды: `GET /api/sports?popular=N`,
 * популярность считает бэкенд числом опубликованных публикаций.
 *
 * Выбор вида — тем же путём, что чипы `SportFilters`: `setSport(id)` в сторе поиска,
 * затем переход к выдаче `/#results`. ⚠️ Введённый текст НЕ теряется: макет
 * подменял строку поиска подписью категории (`HomePage.tsx:363`), у нас запрос
 * и вид спорта — два разных фильтра, и один не затирает другой.
 *
 * Клавиатура (у макета не было — обработчики висели на `onMouseDown`, эталон step-85):
 * `↓` из поля — в первый пункт, `↑`/`↓` по пунктам, `Home`/`End`, `Enter`/пробел —
 * выбор, `Escape` — закрыть и вернуть фокус в поле. Роли: `listbox` с группами,
 * пункты — `option`. Поле поиска — снаружи (виджет героя, 38.67): сюда приходит
 * ссылкой, чтобы повесить `↓` и `Escape` на него.
 *
 * Почему не `ui/*`: `Chip` — переключатель с `aria-pressed`, пункт списка выбора
 * с ним несовместим (`option` + `aria-pressed` — два состояния на одном элементе);
 * `Modal` — диалог с ловушкой фокуса, а это всплывающий список при поле.
 */
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';

import type { Sport } from '@sporthub/types';

import { SEARCH } from '@/lib/home-copy';
import { homeSectionHref } from '@/lib/home-sections';
import { useFilterStore } from '@/stores/useFilterStore';

/** Сколько популярных видов спрашивать — одно число, оно же уезжает в адрес. */
const POPULAR_SPORTS_LIMIT = 5;

type SportItem = Pick<Sport, 'id' | 'name' | 'icon'>;

type SearchSuggestProps = {
  open: boolean;
  /** Категории — виды спорта из справочника, как у чипов ниже по странице. */
  sports: readonly SportItem[];
  /** Поле поиска героя: на него вешаются `↓` (в список) и `Escape`. */
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
};

const OPTION_CLASS =
  'flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] text-left font-body text-ink outline-none transition-[background-color,border-color] hover:bg-bg focus-visible:bg-bg focus-visible:ring-2 focus-visible:ring-lime/40';

/** Популярные виды — с числом публикаций. */
type PopularSport = SportItem & { publicationCount: number };

export function SearchSuggest({ open, sports, inputRef, onClose }: SearchSuggestProps) {
  const router = useRouter();
  const discoveryMode = useFilterStore((state) => state.discoveryMode);
  const selectedSportId = useFilterStore((state) => state.selectedSportId);
  const setSport = useFilterStore((state) => state.setSport);
  const listRef = useRef<HTMLDivElement>(null);
  const categoriesId = useId();
  const popularId = useId();
  const [popular, setPopular] = useState<PopularSport[] | null>(null);

  // Популярные виды спрашиваются один раз, при первом открытии: закрытая
  // выпадашка запросов не шлёт, а страница без поиска — тем более.
  useEffect(() => {
    if (!open || popular !== null) return;

    let cancelled = false;

    fetch(`/api/sports?popular=${POPULAR_SPORTS_LIMIT}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { success?: boolean; data?: PopularSport[] } | null) => {
        if (!cancelled) setPopular(body?.success && Array.isArray(body.data) ? body.data : []);
      })
      .catch(() => {
        if (!cancelled) setPopular([]);
      });

    return () => {
      cancelled = true;
    };
  }, [open, popular]);

  /** Пункты по порядку разметки — по ним ходят стрелки. */
  const options = (): HTMLElement[] =>
    Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);

  // Сначала фокус в поле, потом закрыть: виджет может открывать выпадашку по фокусу
  // поля, и обратный порядок открыл бы её заново сразу после `Escape`.
  const closeToInput = () => {
    inputRef.current?.focus();
    onClose();
  };

  // `↓` из поля ведёт в первый пункт, `Escape` закрывает — поле снаружи, слушаем его.
  useEffect(() => {
    const input = inputRef.current;

    if (!open || input === null) return;

    const onInputKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        listRef.current?.querySelector<HTMLElement>('[role="option"]')?.focus();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    input.addEventListener('keydown', onInputKey);

    return () => input.removeEventListener('keydown', onInputKey);
  }, [open, inputRef, onClose]);

  const pick = (sportId: number) => {
    // Тот же путь, что у чипов: фильтр в сторе; текст запроса не трогаем.
    setSport(sportId);
    onClose();
    router.push(homeSectionHref('results'));
  };

  const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = options();
    const index = items.findIndex((item) => item === document.activeElement);

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
    } else if (event.key === 'Enter' && index >= 0) {
      // Выбор — явно, а не только штатной активацией кнопки: `preventDefault`
      // гасит её, иначе выбор сработал бы дважды. Пробел остаётся штатным.
      event.preventDefault();
      items[index]?.click();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeToInput();
    }
  };

  if (!open) return null;

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Подсказки поиска"
      onKeyDown={onListKey}
      className="absolute inset-x-0 top-[calc(100%+6px)] z-50 rounded-[14px] bg-card px-[18px] py-4 text-ink shadow-floating"
    >
      <div role="group" aria-labelledby={categoriesId}>
        <p
          id={categoriesId}
          className="m-0 mb-2.5 font-body text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted"
        >
          {SEARCH.categoriesTitle[discoveryMode]}
        </p>
        <div className="mb-3.5 flex flex-wrap gap-1.5">
          {sports.map((sport) => {
            const active = sport.id === selectedSportId;

            return (
              <button
                key={sport.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => pick(sport.id)}
                className={`${OPTION_CLASS} w-auto border px-3 py-[7px] text-[12px] font-bold ${
                  active
                    ? 'border-lime bg-lime text-ink'
                    : 'border-line bg-bg text-muted hover:border-lime hover:text-ink'
                }`}
              >
                <span aria-hidden="true">{sport.icon}</span>
                {sport.name}
              </button>
            );
          })}
        </div>
      </div>

      <div role="group" aria-labelledby={popularId}>
        <p
          id={popularId}
          className="m-0 mb-2 font-body text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted"
        >
          {SEARCH.popularTitle}
        </p>
        <div className="flex flex-col gap-0.5" aria-busy={popular === null}>
          {(popular ?? []).map((sport) => (
            <button
              key={sport.id}
              type="button"
              role="option"
              aria-selected={sport.id === selectedSportId}
              onClick={() => pick(sport.id)}
              className={`${OPTION_CLASS} rounded-[8px] px-2.5 py-2`}
            >
              <span aria-hidden="true" className="text-[12px]">
                {sport.icon}
              </span>
              <span className="text-[13px] font-medium">{sport.name}</span>
              <span className="ml-auto font-body text-[11px] text-muted tabular-nums">
                {sport.publicationCount}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

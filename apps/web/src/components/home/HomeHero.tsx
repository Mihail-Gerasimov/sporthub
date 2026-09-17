/**
 * Герой главной (шаг 38.65) — по эталону (`HomePage.tsx:269-500`, чек-лист сценарий 1):
 * тёмная секция с зелёным свечением справа сверху, контейнер 1320 с отступом 72/24,
 * сетка `1fr min(480px, 42%)` с зазором 56, плашка-«новинка», H1 в три строки
 * (третья — зелёная), подзаголовок 15px на приглушённом белом, снизу — волна 56px
 * цветом холста. Правая колонка есть только на широких экранах (эталон: до 1100 её нет;
 * у нас — точка `xl`).
 *
 * Поиск и счётчики — свои компоненты (38.67, 38.69); герой оставляет им места
 * по разметке эталона и принимает их как слоты. Правая колонка — `FocusCard` (38.70),
 * герой рисует её сам по данным дня. Без слотов секция рисуется целой, с ними —
 * как в макете. Тексты — из `lib/home-copy.ts`; `id` и подпись секции — из словаря
 * секций, не литералом. Город — в подзаголовке из стора фильтров (`HeroSubtitle`,
 * 38.78/38.107): тот же, что в селекторе каталога; чипа города и ленты видов спорта
 * в герое нет — в макете их нет (38.107).
 *
 * Почему не `ui/*`: секция-плашка с собственной сеткой и волной — единственная
 * на площадке, компонент общего вида под неё не нужен; кнопки и карточки внутри
 * приходят слотами и собраны из `ui/*` у своих владельцев.
 */
import type { ReactNode } from 'react';

import { FocusCard } from '@/components/home/FocusCard';
import { HomeContainer } from '@/components/home/HomeContainer';
import { HeroSubtitle } from '@/components/home/HeroSubtitle';
import type { UpcomingSessionItem } from '@/components/schedule';
import type { Club } from '@sporthub/types';
import { HERO } from '@/lib/home-copy';
import { HOME_SECTIONS } from '@/lib/home-sections';

type HomeHeroProps = {
  /** Поисковый виджет (38.67) — под подзаголовком. */
  search?: ReactNode;
  /** Ряд счётчиков (38.69) — под поиском. */
  counters?: ReactNode;
  /** Данные правой колонки (38.70, 38.116): клуб героя, его занятия дня и дата словами. */
  focus?: { club?: Club; sessions: UpcomingSessionItem[]; dateLabel: string };
};

export function HomeHero({ search, counters, focus }: HomeHeroProps) {
  return (
    <section
      id={HOME_SECTIONS.hero.id}
      aria-label={HOME_SECTIONS.hero.label}
      className="relative overflow-hidden bg-plate pb-[72px] text-plate-ink before:pointer-events-none before:absolute before:inset-0 before:[background:var(--ui-decor-plate-glow)]"
    >
      <HomeContainer className="relative pt-[72px]">
        <div className="grid items-center gap-14 xl:grid-cols-[1fr_min(480px,42%)]">
          <div className="min-w-0">
            {/* Плашка над заголовком (`HomePage.tsx:283-294`): метка + текст + шеврон-декор.
                Не кнопка и не ссылка — в макете у неё нет обработчика. */}
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-lime/20 bg-lime/8 py-[5px] pr-3.5 pl-2 font-body">
              <span className="rounded-full bg-lime px-2.5 py-0.5 text-[9px] font-black tracking-[0.08em] text-ink uppercase">
                {HERO.eyebrowTag}
              </span>
              <span className="text-[12px] font-semibold text-plate-muted">{HERO.eyebrow}</span>
              <svg
                viewBox="0 0 12 12"
                aria-hidden="true"
                className="size-3 shrink-0 text-plate-muted"
              >
                <path
                  d="m4.5 2.5 3.5 3.5-3.5 3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.6"
                />
              </svg>
            </p>

            <h1 className="t-hero mb-4 text-plate-ink">
              {HERO.titleLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
              <span className="block text-lime">{HERO.titleAccent}</span>
            </h1>

            <HeroSubtitle />

            {search ? <div className="relative mb-9">{search}</div> : null}
            {counters}
          </div>

          {/* Карточка в колонке со сдвигом 32 слева (`HomePage.tsx:405`: left 32 → ширина 448) */}
          {focus ? (
            <div className="relative hidden min-w-0 xl:block xl:pl-8" data-hero-aside>
              <FocusCard club={focus.club} sessions={focus.sessions} dateLabel={focus.dateLabel} />
            </div>
          ) : null}
        </div>
      </HomeContainer>

      {/* Волна-переход к холсту страницы: цвет — токен фона, не hex */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 -bottom-px h-14 overflow-hidden text-bg"
      >
        <svg viewBox="0 0 1440 56" preserveAspectRatio="none" className="block h-full w-full">
          <path d="M0,0 C360,56 1080,56 1440,0 L1440,56 L0,56 Z" fill="currentColor" />
        </svg>
      </div>
    </section>
  );
}

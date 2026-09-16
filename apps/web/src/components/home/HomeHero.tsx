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
 * как в макете. Тексты — из `lib/home-copy.ts`. Рядом с плашкой — город из стора
 * фильтров (`HeroCityBadge`, 38.78): тот же, что в селекторе, а не литерал.
 *
 * Почему не `ui/*`: секция-плашка с собственной сеткой и волной — единственная
 * на площадке, компонент общего вида под неё не нужен; кнопки и карточки внутри
 * приходят слотами и собраны из `ui/*` у своих владельцев.
 */
import type { ReactNode } from 'react';

import { FocusCard } from '@/components/home/FocusCard';
import { HeroCityBadge } from '@/components/home/HeroCityBadge';
import type { UpcomingSessionItem } from '@/components/schedule';
import { HERO } from '@/lib/home-copy';

type HomeHeroProps = {
  /** Поисковый виджет (38.67) — под подзаголовком. */
  search?: ReactNode;
  /** Ряд счётчиков (38.69) — под поиском. */
  counters?: ReactNode;
  /** Данные правой колонки (38.70): занятия дня и дата словами; без них колонки нет. */
  focus?: { sessions: UpcomingSessionItem[]; dateLabel: string };
};

export function HomeHero({ search, counters, focus }: HomeHeroProps) {
  return (
    <section
      id="hero"
      aria-label="Главный экран"
      className="relative overflow-hidden bg-plate pb-[72px] text-plate-ink before:pointer-events-none before:absolute before:inset-0 before:[background:var(--ui-decor-plate-glow)]"
    >
      <div className="relative mx-auto w-full max-w-[1320px] px-6 pt-[72px]">
        <div className="grid items-center gap-14 xl:grid-cols-[1fr_min(480px,42%)]">
          <div className="min-w-0">
            <div className="mb-6 flex flex-wrap items-center gap-2">
              {/* Плашка над заголовком: метка + текст. Не кнопка и не ссылка, как в эталоне. */}
              <p className="inline-flex items-center gap-2 rounded-full border border-lime/20 bg-lime/10 py-[5px] pr-3.5 pl-2 font-body">
                <span className="rounded-full bg-lime px-2.5 py-0.5 text-[9px] font-black tracking-[0.08em] text-ink uppercase">
                  {HERO.eyebrowTag}
                </span>
                <span className="text-[12px] font-semibold text-plate-muted">{HERO.eyebrow}</span>
              </p>
              <HeroCityBadge />
            </div>

            <h1 className="t-hero mb-4 text-plate-ink">
              {HERO.titleLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
              <span className="block text-lime">{HERO.titleAccent}</span>
            </h1>

            <p className="mb-8 max-w-[480px] font-body text-[15px] leading-[1.7] text-plate-muted">
              {HERO.subtitle}
            </p>

            {search ? <div className="relative mb-9">{search}</div> : null}
            {counters}
          </div>

          {focus ? (
            <div className="relative hidden min-w-0 xl:block" data-hero-aside>
              <FocusCard sessions={focus.sessions} dateLabel={focus.dateLabel} />
            </div>
          ) : null}
        </div>
      </div>

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

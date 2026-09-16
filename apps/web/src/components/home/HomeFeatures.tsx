/**
 * «Возможности» — секция главной (шаг 38.72): четыре плитки из восьми макета.
 *
 * По эталону (`HomePage.tsx:542-580`): рубрика, H2 в две строки, сетка 4 → 2 → 1;
 * плитка — радиус 16, отступы 20×18, иконка на белом квадрате 44 радиусом 13.
 * Что снято и почему — по реестру переноса (строка 10 приложения В): дневники
 * тренировок и питания, маркет, челленджи — долг фазы (Д-12, Д-13, Д-8, Д-5),
 * онлайн-оплата — Д-11. Тексты — из `home-copy` (`FEATURES`).
 *
 * ⚠️ Каждая плитка — ССЫЛКА на существующую цель, не декорация: у макета плитки
 * выглядели кликабельными и не вели никуда (`cursor:default`, тупик № 10
 * приложения Б). Цели — из словаря секций главной и фиксированных маршрутов
 * кабинета; их существование стережёт `home-features.test.tsx` тем же способом,
 * что `menu-routes-exist`. У макета у каждой плитки свой цветной фон из восьми
 * `rgba` — у нас подложка одна, токеном: восемь оттенков вне палитры.
 *
 * Почему не `ui/Card`: плитка — ссылка целиком (`<a>`), а `Card` — `div`;
 * заворачивать `Card` в ссылку значило бы вкладывать интерактив в блок с ховером
 * поверх ховера. Иконки — инлайновые SVG на `currentColor`: библиотеки иконок нет.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

import { FEATURES } from '@/lib/home-copy';
import { homeSectionHref } from '@/lib/home-sections';

const ICON_CLASS = 'size-[22px]';

const icons: readonly ReactNode[] = [
  // Календарь — онлайн-запись.
  <svg
    key="booking"
    className={ICON_CLASS}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
  </svg>,
  // Столбцы — статистика.
  <svg
    key="stats"
    className={ICON_CLASS}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M5 20V10M12 20V4M19 20v-7" strokeLinecap="round" />
  </svg>,
  // Стрелка вверх — прогресс.
  <svg
    key="progress"
    className={ICON_CLASS}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M4 17l6-6 4 4 6-7M14 8h6v6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>,
  // Звезда — отзывы и рейтинг.
  <svg
    key="reviews"
    className={ICON_CLASS}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path
      d="m12 3 2.7 5.6 6.1.8-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.8z"
      strokeLinejoin="round"
    />
  </svg>,
];

/**
 * Цели плиток — по порядку `FEATURES.items` из словаря. Запись ведёт к слотам
 * на главной; остальное — в разделы кабинета человека (`/profile/me/*`).
 */
const FEATURE_TARGETS: readonly string[] = [
  homeSectionHref('availability'),
  '/profile/me/stats',
  '/profile/me/dashboard',
  '/profile/me/reviews',
];

export function HomeFeatures() {
  return (
    <section
      aria-labelledby="home-features-title"
      className="border-t border-line bg-card py-16 md:py-[72px]"
    >
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <div className="mb-10">
          <p className="m-0 mb-2.5 font-body text-[10px] font-bold uppercase tracking-[0.12em] text-lime-hov">
            {FEATURES.eyebrow}
          </p>
          <h2 id="home-features-title" className="t-h2 m-0 uppercase leading-[0.95] text-ink">
            {FEATURES.titleLines.map((line, index) => (
              <span key={line} className={index === 0 ? undefined : 'block'}>
                {line}
              </span>
            ))}
          </h2>
        </div>

        <ul className="m-0 grid list-none grid-cols-1 gap-3.5 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.items.map((feature, index) => (
            <li key={feature.title} className="min-w-0">
              <Link
                href={FEATURE_TARGETS[index]}
                className="block h-full rounded-[16px] border border-line bg-lime-soft/60 px-[18px] py-5 text-ink no-underline transition-[border-color] hover:border-lime focus-visible:border-lime focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lime/25"
              >
                <span className="mb-3.5 inline-flex size-11 items-center justify-center rounded-[13px] bg-card text-lime-hov shadow-card">
                  {icons[index]}
                </span>
                <span className="t-h4 mb-1.5 block uppercase tracking-[0.02em] text-ink">
                  {feature.title}
                </span>
                <span className="block font-body text-[12px] leading-[1.6] text-muted">
                  {feature.body}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

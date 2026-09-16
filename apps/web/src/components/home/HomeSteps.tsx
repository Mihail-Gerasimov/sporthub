/**
 * «Три шага до первой тренировки» — секция главной (шаг 38.71).
 *
 * По эталону (`HomePage.tsx:502-540`): рубрика и H2 по центру, одна белая полоса
 * радиусом 22 с разделителями `border`, а не `gap`; в карточке шага — номер
 * крупным display-шрифтом еле видимой заливкой (40px, 5 % чернил — как в макете),
 * иконка 44×44 на мягкой зелёной подложке, заголовок и абзац. Ховера нет вовсе
 * (эталон, step-30). Заголовок шага — `.t-h3` словаря типографики (38.109): Inter
 * полужирный обычным регистром; display-шрифт остаётся за H1/H2.
 *
 * Третий шаг — БЕЗ дневника (решение заказчика): у нас нет ни дневника тренировок,
 * ни челленджей (долг Д-12, Д-5); третий шаг говорит о том, что есть, — история
 * занятий в кабинете и отзывы после посещения.
 *
 * Почему не `ui/Card`: карточки шагов не самостоятельны — это одна полоса с общей
 * обводкой и внутренними разделителями, у `Card` обводка и тень у каждой своей.
 * Иконки — инлайновые SVG на `currentColor`: библиотеки иконок в проекте нет
 * (зависимостей у `apps/web` девять, решение заказчика 11).
 */

import type { ReactNode } from 'react';

import { STEPS } from '@/lib/home-copy';
import { HOME_SECTIONS } from '@/lib/home-sections';

const ICON_CLASS = 'size-[22px]';

/** Лупа — поиск. */
const SearchIcon = (
  <svg
    className={ICON_CLASS}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" strokeLinecap="round" />
  </svg>
);

/** Календарь — запись на время. */
const CalendarIcon = (
  <svg
    className={ICON_CLASS}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
  </svg>
);

/** Галочка в круге — посещение и отзыв. */
const CheckIcon = (
  <svg
    className={ICON_CLASS}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Ключ шага — из словаря: новый шаг без иконки здесь не соберётся. */
type StepKey = (typeof STEPS.items)[number]['key'];

/**
 * Иконки шагов — по КЛЮЧУ записи словаря, не по позиции (ревью 38.71: параллельный
 * массив по индексу расходится молча). Тексты живут в словаре, иконки — здесь:
 * словарь не знает разметки.
 */
const STEP_ICONS: Record<StepKey, ReactNode> = {
  find: SearchIcon,
  book: CalendarIcon,
  train: CheckIcon,
};

export function HomeSteps() {
  return (
    // Якорь и подпись — из записи словаря секций (38.66): секция мимо словаря — красный `anchors-exist`.
    <section
      id={HOME_SECTIONS.steps.id}
      aria-label={HOME_SECTIONS.steps.label}
      className="py-14 md:py-16"
    >
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <div className="mb-10 text-center">
          <p className="m-0 mb-2.5 font-body text-[10px] font-bold uppercase tracking-[0.12em] text-lime-hov">
            {STEPS.eyebrow}
          </p>
          <h2 id="home-steps-title" className="t-h2 m-0 uppercase leading-[0.95] text-ink">
            {STEPS.title}
          </h2>
        </div>

        {/* Одна полоса: обводка общая, разделители — линии между колонками, не зазоры. */}
        <ol className="m-0 grid list-none grid-cols-1 overflow-hidden rounded-[22px] border border-line bg-card p-0 md:grid-cols-3">
          {STEPS.items.map((step) => (
            <li
              key={step.key}
              className="min-w-0 border-line px-7 py-8 [&:not(:last-child)]:border-b md:[&:not(:last-child)]:border-r md:[&:not(:last-child)]:border-b-0"
            >
              <div className="mb-4 flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="font-display text-[40px] font-black leading-none text-ink/[0.05]"
                >
                  {step.number}
                </span>
                <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[13px] bg-lime-soft text-lime-hov">
                  {STEP_ICONS[step.key]}
                </span>
              </div>
              {/* Заголовок шага — `.t-h3` словаря (38.109): Inter полужирный 20px обычным регистром, как в макете. */}
              <h3 className="t-h3 m-0 mb-2 text-ink">{step.title}</h3>
              <p className="m-0 font-body text-[13px] leading-[1.65] text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

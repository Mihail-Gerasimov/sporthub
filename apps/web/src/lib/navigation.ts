// Навигация площадки — пункты шапки, подвала и мобильного дока из одного места (шаг 38.56).
//
// ⚠️ Зачем. Пункты меню были выписаны в трёх компонентах отдельно (шапка, подвал,
// мобильный док), и подвал вёл на `#about` и `#contacts`, которых нет ни на одной
// странице, — «признаваясь» в этом строкой копирайта. Здесь пункты собираются
// из двух словарей: секции главной (`home-sections.ts`) — якоря, и разделы сайта
// (`SITE_SECTIONS`) — фиксированные маршруты. Разделы вне фазы 38 («Командные»,
// «Маркет») ведут на страницу «раздел в разработке» — ФИКСИРОВАННЫЙ маршрут
// `/coming-soon`, не catch-all: с `[...rest]` любой адрес «существует», и сторож
// `menu-routes-exist` не покраснел бы никогда (диверсия д-34).
//
// ⚠️ Сторож `menu-routes-exist` (`test/design/menu-routes-exist.test.ts`) сверяет
// каждый маршрут отсюда с файлом `src/app/**/page.tsx`; якоря `/#…` стережёт
// `anchors-exist` (38.66). Модуль нейтральный, без `'use client'`.

import { HOME_SECTIONS, homeSectionHref, type HomeSectionKey } from '@/lib/home-sections';

/** Страница «раздел в разработке» — один адрес на все разделы вне фазы. */
const COMING_SOON_PATH = '/coming-soon';

/**
 * Разделы сайта вне главной: назначение → подпись и адрес. Раздел появится —
 * правится адрес здесь, меню и подвал узнают сами.
 */
const SITE_SECTIONS = {
  /** Командные виды — долг Д-7. */
  teams: { label: 'Командные', href: COMING_SOON_PATH },
  /** Маркет — долг Д-8. */
  market: { label: 'Маркет', href: COMING_SOON_PATH },
} as const;

export type NavItem = { label: string; href: string };

/** Пункт из секции главной. */
function homeItem(key: HomeSectionKey): NavItem {
  return { label: HOME_SECTIONS[key].label, href: homeSectionHref(key) };
}

/** Шапка: секции главной, затем разделы сайта. */
export const HEADER_NAV: readonly NavItem[] = [
  homeItem('discover'),
  homeItem('results'),
  homeItem('availability'),
  SITE_SECTIONS.teams,
  SITE_SECTIONS.market,
];

/** Подвал: те же цели, что в шапке, — и ни одной, которой нет. */
export const FOOTER_NAV: readonly NavItem[] = HEADER_NAV;

/**
 * Мобильный док: главная, поиск и слоты с главной; кабинет добавляет сам компонент —
 * его адрес зависит от сессии, а не от словаря.
 */
export const MOBILE_NAV: readonly NavItem[] = [
  { label: 'Главная', href: '/' },
  { label: 'Поиск', href: homeSectionHref('discover') },
  { label: 'Слоты', href: homeSectionHref('availability') },
];

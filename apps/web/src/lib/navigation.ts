// Навигация площадки — пункты шапки, подвала и мобильного дока из одного места (шаг 38.56).
//
// ⚠️ Зачем. Пункты меню были выписаны в трёх компонентах отдельно (шапка, подвал,
// мобильный док), и подвал вёл на `#about` и `#contacts`, которых нет ни на одной
// странице, — «признаваясь» в этом строкой копирайта. Здесь пункты собираются
// из словарей: секции главной (`home-sections.ts`) и каталога (`catalog-sections.ts`) —
// якоря, и разделы сайта (`SITE_SECTIONS`) — фиксированные маршруты. Разделы вне
// фазы 38 («Командные», «Маркет») ведут на страницу «раздел в разработке» —
// ФИКСИРОВАННЫЙ маршрут `/coming-soon`, не catch-all: с `[...rest]` любой адрес
// «существует», и сторож `menu-routes-exist` не покраснел бы никогда (диверсия д-34).
//
// ⚠️ Шаг 38.79c (решение заказчика 16.09): шапка — по макету. «Клубы» и «Тренеры»
// ведут на выдачу каталога и несут режим стора (`mode`): клик переключает
// `discoveryMode`, как чип сегмента (`NavLink`). Прямой заход по адресу открывает
// режим по умолчанию — принятое ограничение (Д-15: режим и фильтры в адресе).
//
// ⚠️ Сторож `menu-routes-exist` (`test/design/menu-routes-exist.test.ts`) сверяет
// каждый маршрут отсюда с файлом `src/app/**/page.tsx`; якоря стережёт
// `anchors-exist` (38.66) на обеих страницах. Модуль нейтральный, без `'use client'`
// (тип режима импортируется как тип — в бандл не попадает).

import { CATALOG_PATH, catalogSectionHref } from '@/lib/catalog-sections';
import { HOME_SECTIONS, homeSectionHref, type HomeSectionKey } from '@/lib/home-sections';
import type { DiscoveryMode } from '@/stores/useFilterStore';

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

/** Пункт навигации; `mode` — режим стора, который ставит клик (выдача каталога). */
export type NavItem = { label: string; href: string; mode?: DiscoveryMode };

/** Пункт из секции главной. */
function homeItem(key: HomeSectionKey): NavItem {
  return { label: HOME_SECTIONS[key].label, href: homeSectionHref(key) };
}

/** Выдача каталога в режиме: «Клубы» и «Тренеры» — один адрес, разный режим стора. */
const CATALOG_MODES: Record<DiscoveryMode, NavItem> = {
  clubs: { label: 'Клубы', href: catalogSectionHref('results'), mode: 'clubs' },
  trainers: { label: 'Тренеры', href: catalogSectionHref('results'), mode: 'trainers' },
};

/** Шапка — по макету: каталог в двух режимах, две секции витрины, разделы сайта. */
export const HEADER_NAV: readonly NavItem[] = [
  CATALOG_MODES.clubs,
  CATALOG_MODES.trainers,
  homeItem('steps'),
  homeItem('features'),
  SITE_SECTIONS.teams,
  SITE_SECTIONS.market,
];

/** Подвал: те же цели, что в шапке, — и ни одной, которой нет. */
export const FOOTER_NAV: readonly NavItem[] = HEADER_NAV;

/**
 * Мобильный док: главная, каталог и слоты каталога; кабинет добавляет сам компонент —
 * его адрес зависит от сессии, а не от словаря.
 */
export const MOBILE_NAV: readonly NavItem[] = [
  { label: 'Главная', href: '/' },
  { label: 'Каталог', href: CATALOG_PATH },
  { label: 'Слоты', href: catalogSectionHref('availability') },
];

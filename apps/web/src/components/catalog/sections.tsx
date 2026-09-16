// Карта «ключ секции → компонент» каталога (шаг 38.79a), по образцу главной.
//
// Словарь секций (`lib/catalog-sections.ts`) — только данные: он едет в клиентский
// бандл шапки. Компоненты живут здесь, и читает карту только `app/catalog/page.tsx`.
// Тип `Record<CatalogSectionKey, …>` — половина сторожа на компиляторе: запись
// словаря без компонента не соберётся, компонент без записи — тоже. Вторая половина,
// jsdom (`anchors-exist`): каждая `section[id]` в разметке каталога — из словаря.

import type { ComponentType } from 'react';

import type { CatalogSectionProps } from '@/components/catalog/catalog-data';
import { CatalogDiscover } from '@/components/catalog/CatalogDiscover';
import {
  CatalogAvailability,
  CatalogMap,
  CatalogResults,
} from '@/components/catalog/CatalogWorkbench';
import type { CatalogSectionKey } from '@/lib/catalog-sections';

export const CATALOG_SECTION_COMPONENTS: Record<
  CatalogSectionKey,
  ComponentType<CatalogSectionProps>
> = {
  discover: CatalogDiscover,
  map: CatalogMap,
  results: CatalogResults,
  availability: CatalogAvailability,
};

// Карта «ключ секции → компонент» главной (шаг 38.66).
//
// Словарь секций (`lib/home-sections.ts`) — только данные: он едет в клиентский бандл
// шапки. Компоненты живут здесь, и читает карту только `app/page.tsx`. Тип
// `Record<HomeSectionKey, …>` — половина сторожа на компиляторе: запись словаря без
// компонента не соберётся, компонент без записи — тоже. Вторая половина, jsdom
// (`anchors-exist`): каждая `section[id]` в разметке главной — из словаря.
//
// Статичной секции данные не нужны — компонент без входных свойств подходит под тип.

import type { ComponentType } from 'react';

import type { HomeSectionProps } from '@/components/home/home-data';
import { HomeCta } from '@/components/home/HomeCta';
import { HomeFeatures } from '@/components/home/HomeFeatures';
import { HomeHeroSection } from '@/components/home/HomeHeroSection';
import { HomeClubs, HomeTrainers } from '@/components/home/HomeShowcase';
import { HomeSteps } from '@/components/home/HomeSteps';
import type { HomeSectionKey } from '@/lib/home-sections';

export const HOME_SECTION_COMPONENTS: Record<HomeSectionKey, ComponentType<HomeSectionProps>> = {
  hero: HomeHeroSection,
  steps: HomeSteps,
  features: HomeFeatures,
  clubs: HomeClubs,
  trainers: HomeTrainers,
  cta: HomeCta,
};

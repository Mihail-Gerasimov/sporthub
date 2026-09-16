// Данные дня главной — что страница загружает один раз и отдаёт каждой секции (38.66).
//
// Только типы: секции витрины читают своё из `HomeData` и не ходят за данными сами.
// Здесь, а не в `lib/home-sections.ts`: тот словарь едет в клиентский бандл шапки,
// а типы компонентов каталога ему не нужны.

import type { CatalogData, CatalogSport } from '@/components/catalog/catalog-data';
import type { Club, PlatformOverview, Trainer } from '@sporthub/types';

/** Вид спорта главной — тот же срез, что у каталога (38.80: с цветом). */
export type HomeSport = CatalogSport;

/**
 * ⚠️ 38.79a: рабочая часть переезжает на `/catalog`, её данные — `CatalogData`.
 * Главная пока несёт их же (секции рабочей части ещё стоят и здесь) — шаг 38.79b
 * оставит витрине только своё: сводку, шесть клубов и четырёх тренеров.
 */
export type HomeData = CatalogData & {
  /** Четыре числа героя — `GET /api/stats/overview`, четыре `count` на бэкенде (38.30). */
  overview: PlatformOverview;
  /** Лидеры каталога — запросом `sort=rating&limit=1`; пусто — каталог пуст. */
  featuredClub?: Club;
  featuredTrainer?: Trainer;
  /** Подпись услуги лидера-тренера: из справочника, иначе биография. */
  featuredTrainerTitle?: string;
};

/** Входные свойства секции: одни и те же данные дня у каждой. */
export type HomeSectionProps = { data: HomeData };

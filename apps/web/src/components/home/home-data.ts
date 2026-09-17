// Данные дня главной — что страница загружает один раз и отдаёт каждой секции (38.66).
//
// Только типы: секции витрины читают своё из `HomeData` и не ходят за данными сами.
// Здесь, а не в `lib/home-sections.ts`: тот словарь едет в клиентский бандл шапки,
// а типы компонентов каталога ему не нужны.

import type { CatalogSport } from '@/components/catalog/catalog-data';
import type { UpcomingSessionItem } from '@/components/schedule';
import type { TrainerDirectoryItem } from '@/components/trainers';
import type { Club, PlatformOverview, Tag } from '@sporthub/types';

/** Вид спорта главной — тот же срез, что у каталога (38.80: с цветом). */
export type HomeSport = CatalogSport;

/**
 * Данные витрины (38.79b): главная — ровно макет, рабочая часть — на `/catalog`
 * (`CatalogData`). Здесь только то, что читают герой и карусели.
 */
export type HomeData = {
  /** Четыре числа героя — `GET /api/stats/overview`, четыре `count` на бэкенде (38.30). */
  overview: PlatformOverview;
  /** Виды спорта — лента героя, подсказки поиска, категория на карточке клуба. */
  sports: HomeSport[];
  tags: Tag[];
  /**
   * Правая колонка героя (38.116): клуб ближайшего занятия дня (иначе лучший по рейтингу)
   * и его занятия сегодня, ближайшее — первым; дата словами для пустого состояния.
   */
  heroClub?: Club;
  heroSessions: UpcomingSessionItem[];
  upcomingSessionsLabel: string;
  /** Витрина: шесть клубов и четыре тренера по рейтингу — запросом с `limit`. */
  showcaseClubs: Club[];
  showcaseTrainers: TrainerDirectoryItem[];
};

/** Входные свойства секции: одни и те же данные дня у каждой. */
export type HomeSectionProps = { data: HomeData };

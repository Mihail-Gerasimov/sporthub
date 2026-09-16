// Загрузка данных витрины главной (шаг 38.79b): шесть клубов и четыре тренера
// по рейтингу — запросом, сводка счётчиков — четырьмя `count` на бэкенде.
//
// ⚠️ Переходно (до снятия рабочей части с главной): справочники, услуги, расписание
// тренеров и связи для карточек тренеров берутся из уже загруженных данных каталога
// (`loadCatalogData`), чтобы не спрашивать их дважды на одной странице.

import { buildTrainerDirectory } from '@/components/trainers';
import { getPlatformOverview, getPublishedClubs, getPublishedTrainers } from '@/lib/server-api';
import { getDateKeyInTimeZone } from '@/lib/utils';

import type { CatalogData } from '@/components/catalog/catalog-data';
import type { HomeData } from '@/components/home/home-data';
import type { Offering, Schedule, Specialty, TrainerClubLink } from '@sporthub/types';

/** Сколько карточек витрина просит у базы — макет: клубов шесть, тренеров четыре. */
const HOME_SHOWCASE_LIMITS = { clubs: 6, trainers: 4 } as const;

/** Справочники, по которым собирается карточка тренера (площадка, услуга, окно). */
export type TrainerCardReferences = {
  offerings: Offering[];
  trainerSchedule: Schedule[];
  specialties: Specialty[];
  trainerClubLinks: TrainerClubLink[];
};

type LoadHomeDataInput = {
  now: Date;
  catalog: CatalogData;
  references: TrainerCardReferences;
};

export async function loadHomeData({
  now,
  catalog,
  references,
}: LoadHomeDataInput): Promise<HomeData> {
  const [showcaseClubs, showcaseTrainers, overview] = await Promise.all([
    getPublishedClubs({ sort: 'rating', limit: HOME_SHOWCASE_LIMITS.clubs }),
    getPublishedTrainers({ sort: 'rating', limit: HOME_SHOWCASE_LIMITS.trainers }),
    // Счётчики героя — четыре `count` на бэкенде, а не длины списков (38.30, д-20).
    getPlatformOverview(),
  ]);

  // Карточка тренера — та же, что в каталоге: площадка, услуга, ближайшее окно и
  // «доступен сейчас» считаются справочником по четырём тренерам витрины.
  const showcaseTrainerDirectory = buildTrainerDirectory({
    clubs: catalog.clubs,
    offerings: references.offerings,
    schedule: references.trainerSchedule,
    specialties: references.specialties,
    sports: catalog.sports,
    trainers: showcaseTrainers,
    trainerClubLinks: references.trainerClubLinks,
    targetDate: getDateKeyInTimeZone(now),
    now,
  });

  return { ...catalog, overview, showcaseClubs, showcaseTrainers: showcaseTrainerDirectory };
}

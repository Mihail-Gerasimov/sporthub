// Загрузка данных витрины главной (шаг 38.79b) — один раз на запрос страницы.
//
// Витрина — запросом: шесть клубов и четыре тренера по рейтингу приходят с `limit`
// и порядком из базы, счётчики героя — четырьмя `count` на бэкенде. Полного списка
// тренеров и лидеров `limit=1` страница больше не спрашивает.
//
// ⚠️ Полный список клубов остаётся: «Сегодня в фокусе» в герое — занятия дня ВСЕЙ
// площадки с именами клубов, а площадка тренера в карточке — клуб по связи; ни то,
// ни другое шестью клубами витрины не покрыть. Каталог клубов в запрос — долг Д-15.

import { buildTrainerDirectory } from '@/components/trainers';
import { getUpcomingSessions } from '@/components/schedule';
import {
  getOfferings,
  getPlatformOverview,
  getPublishedClubs,
  getPublishedTrainers,
  getSchedule,
  getSpecialties,
  getSports,
  getTags,
  getTrainerClubLinks,
} from '@/lib/server-api';
import { formatDate, getDateKeyInTimeZone } from '@/lib/utils';

import type { HomeData } from '@/components/home/home-data';

/** Сколько карточек витрина просит у базы — макет: клубов шесть, тренеров четыре. */
const HOME_SHOWCASE_LIMITS = { clubs: 6, trainers: 4 } as const;

export async function loadHomeData(now: Date): Promise<HomeData> {
  const [
    showcaseClubs,
    showcaseTrainers,
    overview,
    clubs,
    clubSchedule,
    trainerSchedule,
    offerings,
    specialties,
    sports,
    tags,
    trainerClubLinks,
  ] = await Promise.all([
    getPublishedClubs({ sort: 'rating', limit: HOME_SHOWCASE_LIMITS.clubs }),
    getPublishedTrainers({ sort: 'rating', limit: HOME_SHOWCASE_LIMITS.trainers }),
    // Счётчики героя — четыре `count` на бэкенде, а не длины списков (38.30, д-20).
    getPlatformOverview(),
    getPublishedClubs(),
    getSchedule(),
    getSchedule({ ownerType: 'trainer' }),
    getOfferings(),
    getSpecialties(),
    getSports(),
    getTags(),
    getTrainerClubLinks({ status: 'confirmed' }),
  ]);

  const todayDateKey = getDateKeyInTimeZone(now);
  // Цвет вида (38.80) едет до карточек и ленты героя вместе с именем и иконкой.
  const homeSports = sports.map(({ id, name, icon, color }) => ({ id, name, icon, color }));

  return {
    overview,
    sports: homeSports,
    tags,
    // Занятия дня для героя: сегодня, не начались, есть места, по времени (38.81).
    upcomingSessions: getUpcomingSessions({
      clubs,
      schedule: clubSchedule,
      targetDate: todayDateKey,
      now,
    }),
    upcomingSessionsLabel: formatDate(todayDateKey, { day: 'numeric', month: 'long' }),
    showcaseClubs,
    // Карточка тренера — та же, что в каталоге: площадка, услуга, ближайшее окно и
    // «доступен сейчас» считаются справочником по четырём тренерам витрины.
    showcaseTrainers: buildTrainerDirectory({
      clubs,
      offerings,
      schedule: trainerSchedule,
      specialties,
      sports: homeSports,
      trainers: showcaseTrainers,
      trainerClubLinks,
      targetDate: todayDateKey,
      now,
    }),
  };
}

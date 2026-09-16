// Загрузка данных каталога — один раз на запрос страницы (шаг 38.79a).
//
// Вынесено из `app/page.tsx`: рабочая часть переезжает на `/catalog`, и до шага 38.79b
// её данные читают обе страницы — загрузчик один, чтобы не держать два списка вызовов.
// Полный каталог — без `limit`: поиск, карта и слоты фильтруют в памяти по построению
// (действующее ограничение, долг Д-15). Момент `now` приходит аргументом: день и отбор
// занятий считаются от одного момента, иначе на границе суток они разошлись бы.

import { buildTrainerDirectory, getTrainerAvailability } from '@/components/trainers';
import { getUpcomingSessions } from '@/components/schedule';
import {
  getOfferings,
  getPublishedClubs,
  getPublishedTrainers,
  getSchedule,
  getSpecialties,
  getSports,
  getTags,
  getTrainerClubLinks,
} from '@/lib/server-api';
import { formatDate, getDateKeyInTimeZone } from '@/lib/utils';

import type { CatalogData } from '@/components/catalog/catalog-data';

export async function loadCatalogData(now: Date): Promise<CatalogData> {
  const [
    clubs,
    clubSchedule,
    offerings,
    specialties,
    sports,
    tags,
    trainerSchedule,
    trainers,
    trainerClubLinks,
  ] = await Promise.all([
    // Phase 27 Step 27.12: публичные витрины читают только не-hidden коллекции —
    // хелперы симметричны фильтру в /api/clubs и /api/trainers.
    getPublishedClubs(),
    getSchedule(),
    getOfferings(),
    getSpecialties(),
    getSports(),
    getTags(),
    getSchedule({ ownerType: 'trainer' }),
    getPublishedTrainers(),
    getTrainerClubLinks({ status: 'confirmed' }),
  ]);

  const todayDateKey = getDateKeyInTimeZone(now);
  // Цвет вида (38.80) едет до карты и легенды вместе с именем и иконкой.
  const catalogSports = sports.map(({ id, name, icon, color }) => ({ id, name, icon, color }));
  // Занятия дня без фильтров и среза: фильтры выдачи и первые N применяет секция
  // слотов по стору (38.81).
  const upcomingSessions = getUpcomingSessions({
    clubs,
    schedule: clubSchedule,
    targetDate: todayDateKey,
    now,
  });
  const trainerDirectory = buildTrainerDirectory({
    clubs,
    offerings,
    schedule: trainerSchedule,
    specialties,
    sports: catalogSports,
    trainers,
    trainerClubLinks,
    targetDate: todayDateKey,
    now,
  });
  const trainerAvailability = getTrainerAvailability({
    schedule: trainerSchedule,
    trainers: trainerDirectory,
    targetDate: todayDateKey,
    now,
  });

  return {
    clubs,
    sports: catalogSports,
    tags,
    trainerDirectory,
    upcomingSessions,
    upcomingSessionsLabel: formatDate(todayDateKey, { day: 'numeric', month: 'long' }),
    trainerAvailability,
    trainerAvailabilityLabel: formatDate(trainerAvailability[0]?.date ?? todayDateKey, {
      day: 'numeric',
      month: 'long',
    }),
  };
}

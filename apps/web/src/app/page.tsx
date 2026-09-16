// Главная — витрина и рабочая часть (фаза 38, шаг 38.66): страница загружает данные
// дня ОДИН раз и рисует секции ИЗ СЛОВАРЯ `lib/home-sections.ts` по его порядку.
// Своей разметки секций у страницы нет: секция главной — запись словаря плюс
// компонент; секция мимо словаря краснит сторож `anchors-exist` (диверсия д-28).
//
// Данные: витринные вызовы — с `limit` и порядком в запросе (лидеры — `sort=rating&limit=1`,
// шаг 38.31); полный каталог — для РАБОЧЕЙ части: поиск, карта и слоты фильтруют
// в памяти по построению (действующее ограничение, долг Д-15).
//
// Карта: внутренняя логика `MapSection` (Yandex Maps, фаза 19) не трогается.
import { buildTrainerDirectory, getTrainerAvailability } from '@/components/trainers';
import { getUpcomingSessions } from '@/components/schedule';
import { HOME_SECTION_COMPONENTS } from '@/components/home/sections';
import type { HomeData } from '@/components/home/home-data';
import { HOME_SECTION_KEYS } from '@/lib/home-sections';
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

// Витрина читает живые JSON-данные после publish/edit/delete провайдеров.
export const dynamic = 'force-dynamic';

export default async function Home() {
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
    // Лидеры пришли отсортированными и обрезанными базой — берётся первая строка.
    [featuredClub],
    [featuredTrainer],
    overview,
  ] = await Promise.all([
    // Phase 27 Step 27.12: публичные SSR-витрины читают только не-hidden коллекции,
    // чтобы скрытые админом публикации не оставались в выдаче, на карте, в счётчиках
    // и featured-блоке. Хелперы симметричны фильтру в /api/clubs и /api/trainers.
    //
    // ⚠️ Полный список — для РАБОЧЕЙ части: поиск, карта и слоты фильтруют в памяти
    // по построению (действующее ограничение, долг Д-15). Витринные вызовы ниже —
    // с `limit`: порядок и срез делает база.
    getPublishedClubs(),
    getSchedule(),
    getOfferings(),
    getSpecialties(),
    getSports(),
    getTags(),
    getSchedule({ ownerType: 'trainer' }),
    getPublishedTrainers(),
    getTrainerClubLinks({ status: 'confirmed' }),
    // Лидеры каталога — запросом (шаг 38.31): лучший по рейтингу, при равенстве —
    // по числу отзывов, ничьи разводит номер. Прежде та же сортировка шла в памяти
    // по всему каталогу ради одной карточки.
    getPublishedClubs({ sort: 'rating', limit: 1 }),
    getPublishedTrainers({ sort: 'rating', limit: 1 }),
    // Счётчики героя — четыре `count` на бэкенде, а не длины списков (38.30, д-20).
    getPlatformOverview(),
  ]);

  // Момент передаётся явно: без аргумента форматирование берёт время в обход
  // подменённых часов, и зафиксировать расчёт тестом становится нечем.
  // Один момент на день и на отбор занятий — иначе на границе суток они разошлись бы.
  const now = new Date();
  const todayDateKey = getDateKeyInTimeZone(now);
  // Занятия дня без фильтров и среза: фильтры выдачи и первые N применяет секция
  // слотов по стору (38.81), правая колонка героя берёт список как есть.
  const upcomingSessions = getUpcomingSessions({
    clubs,
    schedule: clubSchedule,
    targetDate: todayDateKey,
    now,
  });
  // Цвет вида (38.80) едет до карты и легенды вместе с именем и иконкой.
  const searchFilterSports = sports.map(({ id, name, icon, color }) => ({ id, name, icon, color }));
  const trainerDirectory = buildTrainerDirectory({
    clubs,
    offerings,
    schedule: trainerSchedule,
    specialties,
    sports: searchFilterSports,
    trainers,
    trainerClubLinks,
    targetDate: todayDateKey,
  });
  const trainerAvailability = getTrainerAvailability({
    schedule: trainerSchedule,
    trainers: trainerDirectory,
    targetDate: todayDateKey,
  });

  // Подпись услуги лидера — из справочника тренеров (у него свой отсев: без адреса
  // и координат тренер туда не попадает), иначе биография.
  const featuredTrainerTitle =
    trainerDirectory.find((item) => item.id === featuredTrainer?.id)?.primaryOfferingTitle ??
    featuredTrainer?.bio;

  const data: HomeData = {
    overview,
    clubs,
    sports: searchFilterSports,
    tags,
    trainerDirectory,
    upcomingSessions,
    upcomingSessionsLabel: formatDate(todayDateKey, { day: 'numeric', month: 'long' }),
    trainerAvailability,
    trainerAvailabilityLabel: formatDate(trainerAvailability[0]?.date ?? todayDateKey, {
      day: 'numeric',
      month: 'long',
    }),
    featuredClub,
    featuredTrainer,
    featuredTrainerTitle,
  };

  // Ни полей, ни потолка у `main`: герой и призыв — во всю ширину, как в эталоне;
  // контейнер — у каждой секции свой (`HomeContainer` у рабочей части и лидеров).
  return (
    <main className="min-h-screen overflow-x-hidden bg-bg-deep">
      <div className="flex flex-col gap-6 pb-10 lg:gap-10">
        {HOME_SECTION_KEYS.map((key) => {
          const Section = HOME_SECTION_COMPONENTS[key];

          return <Section key={key} data={data} />;
        })}
      </div>
    </main>
  );
}

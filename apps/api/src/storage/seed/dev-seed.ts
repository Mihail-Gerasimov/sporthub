// Сид для разработки: минимальная, но работающая база на пустой машине.
//
// Зачем он нужен отдельно от переноса. Каталог `data/` в репозитории не лежит и после
// шага 33.58 исчезнет и локально. Без сида новый разработчик, подняв базу, получает
// двадцать семь пустых таблиц: каталог пуст, войти некем, ни одна страница не работает,
// и понять, сломан проект или просто пуст, невозможно.
//
// Устройство. Сид НЕ пишет в базу сам: он собирает такой же срез, какой лежал бы
// в файлах, и отдаёт его переносу. Писателя в проекте один — `importSourceData`,
// и правила у сида те же самые: порядок вставки, идемпотентность, поднятые счётчики.
// Второй писатель разошёлся бы с первым при первой же правке схемы.
//
// Чистка мусорных текстов сюда НЕ применяется: её словарь привязан к номерам записей
// боевых данных, и слот с номером 9 получил бы чужое название зала.
//
// Модуль — инструмент разработчика: он не участвует ни в одном пути запроса и в боевом
// образе не выполняется. Поэтому справочник видов спорта он вправе брать из общего
// пакета фикстур, которым снят эталон контрактов, — так у справочника остаётся
// ровно одно объявление на весь проект.

import { fixtureSports } from '@sporthub/fixtures';

import { hashPassword } from '../../common/password';
import type { PrismaClient } from '../prisma-client/client';
import { importSourceData, type ImportReport } from './import-from-files';
import type { SourceData } from './source-data';

/**
 * Пароль всех демонстрационных учётных записей.
 *
 * Открытым текстом он здесь именно потому, что это учебные данные для машины
 * разработчика: смысл сида в том, чтобы войти сразу, ничего не выясняя.
 * В базу он попадает хешем — считает его та же функция, что и регистрация.
 */
export const DEV_PASSWORD = 'sporthub123';

/** Общая метка создания демонстрационных записей: одна и та же при каждом запуске. */
const SEEDED_AT = '2026-01-01T09:00:00.000Z';

// Остальные справочники объявлены здесь, а НЕ взяты из общего пакета: там лежат
// намеренно урезанные наборы под тесты (два тега, два удобства, два города), и сид
// на них дал бы разработчику каталог, в котором нечего фильтровать. Полные наборы
// нужны именно сиду — он заменяет собой исчезающий каталог `data/`.
const CITIES = [
  { id: 1, name: 'Самара', lat: 53.195878, lng: 50.100202 },
  { id: 2, name: 'Москва', lat: 55.7558, lng: 37.6173 },
  { id: 3, name: 'Санкт-Петербург', lat: 59.9343, lng: 30.3351 },
  { id: 4, name: 'Казань', lat: 55.7887, lng: 49.1221 },
  { id: 5, name: 'Екатеринбург', lat: 56.8389, lng: 60.6057 },
  { id: 6, name: 'Тольятти', lat: 53.5078, lng: 49.4204 },
];

const TAGS = [
  'Для начинающих',
  'Для детей',
  'Для продвинутых',
  'Бассейн',
  'Восстановление',
  'Силовые',
  'Кардио',
  'Йога',
  'Пилатес',
  'Функциональный тренинг',
  'Групповые занятия',
  'Индивидуальный подход',
  'Утренние группы',
  'Вечерние группы',
  'Выходные',
];

const AMENITIES = [
  'Парковка',
  'Душевые',
  'Раздевалки',
  'Сауна',
  'Бассейн 25 м',
  'Кондиционер',
  'Wi-Fi',
  'Детская комната',
  'Кафе / бар',
  'Прокат инвентаря',
  'Коврики и блоки',
  'Тренажёры',
  'Зеркальный зал',
  'Ринг',
  'Татами',
];

const SPECIALTIES = [
  'Подготовка к соревнованиям',
  'Реабилитация',
  'Детские группы',
  'Похудение',
  'Набор мышечной массы',
  'Растяжка и гибкость',
  'Постановка техники',
  'Кроль',
  'Постановка дыхания',
  'Силовые тренировки',
  'Хатха-йога',
  'Функциональный тренинг',
  'Коррекция осанки',
  'Самооборона',
  'ОФП',
];

const WORK_FORMATS = [
  'В зале',
  'На выезде',
  'Онлайн',
  'На открытом воздухе',
  'В бассейне',
  'На стадионе',
];

/** Справочник «номер + имя»: одинаков у тегов, удобств, специализаций и форматов. */
function numbered(names: string[]): { id: number; createdAt: string; name: string }[] {
  return names.map((name, index) => ({ id: index + 1, createdAt: SEEDED_AT, name }));
}

/** День через `shift` суток от опорного, в виде `YYYY-MM-DD`. */
function dayAfter(base: Date, shift: number): string {
  const moved = new Date(base.getTime());

  moved.setUTCDate(moved.getUTCDate() + shift);

  return moved.toISOString().slice(0, 10);
}

export type DevSeedOptions = {
  client: PrismaClient;
  /**
   * Опорный день расписания. По умолчанию — сегодняшний: занятия в сиде обязаны
   * лежать в будущем, иначе половина сценариев (запись, отмена, подтверждение)
   * на свежей машине недоступна с первой минуты.
   */
  today?: Date;
};

/** Демонстрационный срез: справочники плюс минимальный работающий набор. */
export async function buildDevSourceData(today: Date = new Date()): Promise<SourceData> {
  const passwordHash = await hashPassword(DEV_PASSWORD);

  return {
    cities: CITIES.map((city) => ({
      id: city.id,
      createdAt: SEEDED_AT,
      name: city.name,
      coordinates: { lat: city.lat, lng: city.lng },
    })),
    // Виды спорта берутся из общего пакета: этот справочник объявлен один раз
    // и им же снят эталон контрактов. Своя копия здесь разошлась бы с эталоном
    // молча — и увидели бы мы это только по расхождению ответов.
    sports: fixtureSports,
    tags: numbered(TAGS),
    amenities: numbered(AMENITIES),
    specialties: numbered(SPECIALTIES),
    workFormats: numbered(WORK_FORMATS),

    // ⚠️ Фаза 35: по человеку на каждый НАБОР ЛИЦ, а не на каждую роль.
    //
    // Ролей больше нет, и «по одному на роль» перестало что-либо покрывать.
    // Проверять надо другое — что кабинет собирается по владению:
    //   • человек без лиц                — только личные разделы;
    //   • человек с клубами              — разделы клубов;
    //   • человек с карточкой тренера    — раздел карточки;
    //   • человек с ТЕМ И ДРУГИМ         — оба, и это живой случай заказчика:
    //     свой зал плюс персоналки на выезде;
    //   • администратор                  — служебная панель и ничего из базового набора.
    //
    // Пятый набор — «и то и другое» — в прежнем сиде выразить было нельзя вовсе:
    // роль позволяла быть кем-то одним.
    users: [
      {
        id: 1,
        createdAt: SEEDED_AT,
        // ⚠️ Единственное место сида, где вид учётной записи указан явно.
        // Из владения он не выводится: администратора назначают, и без этой
        // строки после удаления роли (шаг 35.24) сид поднял бы площадку
        // вообще без входа в служебную панель.
        accountKind: 'admin',
        status: 'active',
        name: 'Администратор SportHub',
        email: 'admin@sporthub.local',
        phone: '+7 (900) 000-00-01',
        passwordHash,
        favoriteClubIds: [],
        city: 'Самара',
      },
      {
        id: 2,
        createdAt: SEEDED_AT,
        status: 'active',
        name: 'Ольга Владелец',
        email: 'owner@sporthub.local',
        phone: '+7 (900) 000-00-02',
        passwordHash,
        favoriteClubIds: [],
        city: 'Самара',
      },
      {
        id: 3,
        createdAt: SEEDED_AT,
        status: 'active',
        name: 'Павел Тренеров',
        email: 'trainer@sporthub.local',
        phone: '+7 (900) 000-00-03',
        passwordHash,
        favoriteClubIds: [],
        city: 'Самара',
      },
      {
        id: 4,
        createdAt: SEEDED_AT,
        status: 'active',
        name: 'Ирина Спортсменова',
        email: 'athlete@sporthub.local',
        phone: '+7 (900) 000-00-04',
        passwordHash,
        favoriteClubIds: [1],
        city: 'Самара',
      },
      {
        // Пятый набор: и зал, и персоналки. Ради него затевалась фаза —
        // прежде такому человеку пришлось бы завести два аккаунта, и его
        // отзывы, история и связи разошлись бы по двум учётным записям.
        id: 5,
        createdAt: SEEDED_AT,
        status: 'active',
        name: 'Егор Двулицев',
        email: 'both@sporthub.local',
        phone: '+7 (900) 000-00-05',
        passwordHash,
        favoriteClubIds: [],
        city: 'Самара',
      },
    ],

    clubs: [
      {
        id: 1,
        createdAt: SEEDED_AT,
        name: 'Фитнес-центр «Ритм»',
        slug: 'fitnes-centr-ritm',
        description:
          'Просторный зал с кроссфит-зоной, тренажёрами и групповыми программами. Тренировки идут с утра до позднего вечера, есть направления для новичков.',
        shortDescription: 'Кроссфит, тренажёрный зал и групповые программы в центре города.',
        city: 'Самара',
        address: 'Ново-Садовая ул., 106',
        phone: '+7 (846) 000-10-10',
        email: 'ritm@sporthub.local',
        coordinates: { lat: 53.22102, lng: 50.151918 },
        sportIds: [4, 6],
        imageUrls: [],
        amenityIds: [1, 2, 3, 12],
        tagIds: [1, 6, 10],
        rating: 0,
        reviewCount: 0,
        priceFrom: 900,
        distanceKm: 0,
        managedByUserId: 2,
        source: 'seed',
        status: 'published',
      },
      {
        id: 2,
        createdAt: SEEDED_AT,
        name: 'Студия «Баланс»',
        slug: 'studiya-balans',
        description:
          'Небольшая студия йоги и пилатеса. Мягкий формат, малые группы, отдельные занятия по работе с осанкой.',
        shortDescription: 'Йога и пилатес малыми группами.',
        city: 'Самара',
        address: 'Молодогвардейская ул., 204',
        phone: '+7 (846) 000-20-20',
        email: 'balans@sporthub.local',
        coordinates: { lat: 53.202373, lng: 50.151343 },
        sportIds: [1, 8],
        imageUrls: [],
        amenityIds: [3, 11, 13],
        tagIds: [1, 8, 9],
        rating: 0,
        reviewCount: 0,
        priceFrom: 700,
        distanceKm: 0,
        managedByUserId: 2,
        source: 'seed',
        status: 'published',
      },
      {
        // Зал того же человека, у которого есть карточка тренера (пользователь 5).
        id: 3,
        createdAt: SEEDED_AT,
        name: 'Кроссфит «Свобода»',
        slug: 'crossfit-svoboda',
        description:
          'Небольшой кроссфит-зал: функциональный тренинг, свободные веса, групповые занятия и персональные тренировки у владельца зала.',
        shortDescription: 'Кроссфит и персональные тренировки',
        city: 'Самара',
        address: 'ул. Свободы, 12',
        phone: '+7 (846) 000-10-30',
        email: 'svoboda@sporthub.local',
        coordinates: { lat: 53.235, lng: 50.19 },
        sportIds: [6],
        imageUrls: [],
        amenityIds: [1, 2],
        tagIds: [1],
        rating: 0,
        reviewCount: 0,
        priceFrom: 1200,
        distanceKm: 0,
        managedByUserId: 5,
        source: 'seed',
        status: 'published',
      },
    ],

    trainers: [
      {
        id: 1,
        createdAt: SEEDED_AT,
        name: 'Мария Орлова',
        slug: 'mariya-orlova',
        bio: 'Веду йогу и пилатес десять лет. Работаю и в зале клуба, и индивидуально: помогаю вернуть подвижность после долгой сидячей работы.',
        avatarUrl: '',
        experienceYears: 10,
        specialtyIds: [2, 6, 13],
        workFormatIds: [1, 3],
        rating: 0,
        reviewCount: 0,
        priceFrom: 1500,
        sportIds: [1, 8],
        sportId: 1,
        city: 'Самара',
        address: 'Ново-Садовая ул., 106',
        coordinates: { lat: 53.22102, lng: 50.151918 },
        phone: '+7 (900) 000-00-03',
        managedByUserId: 3,
        source: 'seed',
        status: 'published',
      },
      {
        // Карточка того же человека, у которого есть клуб (пользователь 5).
        // Это и есть пятый набор лиц — ради него затевалась фаза.
        id: 2,
        createdAt: SEEDED_AT,
        name: 'Егор Двулицев',
        slug: 'egor-dvulitsev',
        bio: 'Веду кроссфит в собственном зале и персональные тренировки на выезде — дома у клиента и в чужих залах по договорённости.',
        avatarUrl: '',
        experienceYears: 8,
        specialtyIds: [1, 5],
        workFormatIds: [1, 2],
        rating: 0,
        reviewCount: 0,
        priceFrom: 2000,
        sportIds: [6],
        sportId: 6,
        city: 'Самара',
        address: 'ул. Свободы, 12',
        coordinates: { lat: 53.235, lng: 50.19 },
        phone: '+7 (900) 000-00-05',
        managedByUserId: 5,
        source: 'seed',
        status: 'published',
      },
    ],

    // Подтверждённая связь: без неё тренерская услуга «в зале клуба» не соберётся,
    // а это самый хрупкий из путей каталога.
    trainerClubLinks: [
      {
        id: 1,
        createdAt: SEEDED_AT,
        trainerId: 1,
        clubId: 1,
        status: 'confirmed',
        initiatedBy: 'trainer',
        approvedAt: SEEDED_AT,
        approvedByUserId: 2,
      },
    ],

    offerings: [
      {
        id: 1,
        createdAt: SEEDED_AT,
        ownerType: 'club',
        ownerId: 1,
        sportId: 4,
        title: 'Кроссфит — групповая тренировка',
        description: 'Функциональный круг с прогрессией нагрузки. Группы до двенадцати человек.',
        format: 'group',
        price: 900,
        durationMinutes: 60,
        capacity: 12,
        address: 'Ново-Садовая ул., 106',
        coordinates: { lat: 53.22102, lng: 50.151918 },
        cancellationPolicy: 'free_until_24h',
      },
      {
        id: 2,
        createdAt: SEEDED_AT,
        ownerType: 'club',
        ownerId: 2,
        sportId: 1,
        title: 'Йога для начинающих',
        description: 'Спокойный темп, разбор базовых положений, работа с дыханием.',
        format: 'group',
        price: 700,
        durationMinutes: 75,
        capacity: 10,
        address: 'Молодогвардейская ул., 204',
        coordinates: { lat: 53.202373, lng: 50.151343 },
        cancellationPolicy: 'free_until_24h',
      },
      // Услуга тренера в зале клуба: прежняя привязка проставлена намеренно —
      // перенос выведет из неё и площадку, и ссылку на подтверждённую связь.
      {
        id: 3,
        createdAt: SEEDED_AT,
        ownerType: 'trainer',
        ownerId: 1,
        affiliatedClubId: 1,
        sportId: 8,
        title: 'Пилатес — индивидуально',
        description: 'Персональное занятие с разбором осанки и подбором программы.',
        format: 'personal',
        price: 1500,
        durationMinutes: 55,
        capacity: 1,
        address: 'Ново-Садовая ул., 106',
        coordinates: { lat: 53.22102, lng: 50.151918 },
        cancellationPolicy: 'free_until_2h',
      },
    ],

    schedule: [
      {
        id: 1,
        createdAt: SEEDED_AT,
        offeringId: 1,
        ownerType: 'club',
        ownerId: 1,
        clubId: 1,
        sportId: 4,
        title: 'Кроссфит — групповая тренировка',
        date: dayAfter(today, 1),
        startTime: '18:00',
        endTime: '19:00',
        durationMinutes: 60,
        level: 'all_levels',
        capacity: 12,
        bookedCount: 0,
        price: 900,
        room: 'Большой зал',
      },
      {
        id: 2,
        createdAt: SEEDED_AT,
        offeringId: 1,
        ownerType: 'club',
        ownerId: 1,
        clubId: 1,
        sportId: 4,
        title: 'Кроссфит — групповая тренировка',
        date: dayAfter(today, 2),
        startTime: '19:00',
        endTime: '20:00',
        durationMinutes: 60,
        level: 'intermediate',
        capacity: 12,
        bookedCount: 0,
        price: 900,
        room: 'Большой зал',
      },
      {
        id: 3,
        createdAt: SEEDED_AT,
        offeringId: 2,
        ownerType: 'club',
        ownerId: 2,
        clubId: 2,
        sportId: 1,
        title: 'Йога для начинающих',
        date: dayAfter(today, 1),
        startTime: '10:00',
        endTime: '11:15',
        durationMinutes: 75,
        level: 'beginner',
        capacity: 10,
        bookedCount: 0,
        price: 700,
        room: 'Зал А',
      },
      {
        id: 4,
        createdAt: SEEDED_AT,
        offeringId: 3,
        ownerType: 'trainer',
        ownerId: 1,
        trainerId: 1,
        affiliatedClubId: 1,
        sportId: 8,
        title: 'Пилатес — индивидуально',
        date: dayAfter(today, 3),
        startTime: '08:00',
        endTime: '08:55',
        durationMinutes: 55,
        level: 'all_levels',
        capacity: 1,
        bookedCount: 0,
        price: 1500,
        room: 'Малый зал',
      },
    ],

    // Записей, отзывов, уведомлений и журнала в сиде нет намеренно: их заводит
    // сам разработчик, проходя сценарий, — иначе первая же проверка идёт
    // на данных, которых он не создавал и не понимает.
    bookings: [],
    reviews: [],
    notifications: [],
    logs: [],
    providerClientNotes: [],
  };
}

/** Наполнить базу демонстрационным набором. Повторный запуск ничего не удваивает. */
export async function seedDevData({ client, today }: DevSeedOptions): Promise<ImportReport> {
  const source = await buildDevSourceData(today);

  return importSourceData({ client, source, repairTexts: false });
}

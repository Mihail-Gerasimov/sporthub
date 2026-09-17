// Сид для разработки: минимальная, но работающая база на пустой машине.
//
// Зачем он нужен отдельно от переноса. Каталог `data/` в репозитории не лежит и после
// шага 33.58 исчезнет и локально. Без сида новый разработчик, подняв базу, получает
// двадцать семь пустых таблиц: каталог пуст, войти некем, ни одна страница не работает,
// и понять, сломан проект или просто пуст, невозможно.
//
// Устройство. Сид НЕ пишет в базу сам: он собирает срез и отдаёт его писателю
// `writeDevSeed`. Подготовку строк писатель делит с переносом (общий `prepareRows`),
// а вот стратегия вставки у сида СВОЯ, и это решение шага 36.33: перенос писал
// строки по номеру, потому что номера были источником правды в файлах, а сид
// дописывает недостающее в базу, номера в которой раздаёт сама база. На живой базе
// запись по номеру падала на уникальном индексе почты, а когда не падала —
// затирала живые строки. Подробности и замеры — в шапке `write-dev-seed.ts`.
//
// Чистка мусорных текстов сюда НЕ применяется: её словарь привязан к номерам записей
// боевых данных, и слот с номером 9 получил бы чужое название зала.
//
// ⚠️ ДЕМО-ДАННЫЕ: знаки «проверено» и отзывы здесь СИНТЕТИЧЕСКИЕ, только для стенда
// разработчика. На боевой базе они были бы подделкой — писатель отказывает при
// `NODE_ENV=production`, если запуск не разрешён явно (`SPORTHUB_ALLOW_DEMO_SEED=1`,
// чистая установка по docker/PRODUCTION.md §5.3).
//
// ⚠️ Шаг 38.115 — сид под макет главной (довесок Э14): шесть клубов и четыре тренера
// со снимками макета (`prosport/src/app/HomePage.tsx:607-668`, Unsplash), у каждой
// публикации несколько отзывов (рейтинг СЧИТАЕТСЯ из них при подготовке строк, а не
// пишется числом), у части — знак «проверено», занятия — «сегодня» и «завтра»
// относительно опорного дня (`today`), чтобы «Сегодня в фокусе», «Доступен сейчас»
// и слоты каталога были живыми в любой день. Три прежних клуба и два тренера
// (сценарии кабинетов фазы 35) остались; на живой базе их строки не переписываются
// (правило 36.33) — снимки у них появятся только на свежей базе.
//
// Модуль — инструмент разработчика: он не участвует ни в одном пути запроса и в боевом
// образе не выполняется. Поэтому справочник видов спорта он вправе брать из общего
// пакета фикстур, которым снят эталон контрактов, — так у справочника остаётся
// ровно одно объявление на весь проект.

import { fixtureSports } from '@sporthub/fixtures';

import { hashPassword } from '../../common/password';
import type { PrismaClient } from '../prisma-client/client';
import type { ImportReport } from './import-from-files';
import type { SourceData } from './source-data';
import { writeDevSeed } from './write-dev-seed';

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

/**
 * Снимки макета — Unsplash, те же адреса и размеры, что в `HomePage.tsx` (клубы —
 * `w=500&h=220`, лица тренеров — `w=200&h=200&crop=faces`). Одно объявление, по одному
 * на публикацию; клубам-сценариям фазы 35 достались снимки того же вида спорта.
 */
const PHOTO = {
  crossfit:
    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=500&h=220&fit=crop&auto=format',
  yoga: 'https://images.unsplash.com/photo-1545389336-cf090694435e?w=500&h=220&fit=crop&auto=format',
  martial:
    'https://images.unsplash.com/photo-1549476464-37392f717541?w=500&h=220&fit=crop&auto=format',
  aqua: 'https://images.unsplash.com/photo-1575429198097-0414ec08e8cd?w=500&h=220&fit=crop&auto=format',
  gym: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=500&h=220&fit=crop&auto=format',
  dance:
    'https://images.unsplash.com/photo-1547153760-18fc86324498?w=500&h=220&fit=crop&auto=format',
} as const;

const FACE = {
  klimov:
    'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=200&h=200&fit=crop&crop=faces',
  voronova:
    'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=200&h=200&fit=crop&crop=faces',
  karpov:
    'https://images.unsplash.com/photo-1548690312-e3b507d8c110?w=200&h=200&fit=crop&crop=faces',
  belova:
    'https://images.unsplash.com/photo-1521804906057-1df8fdb718b7?w=200&h=200&fit=crop&crop=faces',
} as const;

/** Администратор сида — им подтверждена проверка у части публикаций. */
const ADMIN_USER_ID = 1;

/** Знак «проверено» площадкой: пара «когда + кем», как её пишет модерация. */
const VERIFIED = { verifiedAt: SEEDED_AT, verifiedByUserId: ADMIN_USER_ID } as const;

/**
 * Люди, оставляющие отзывы, — только новые люди этого же сида (7–10): писатель кладёт
 * отзыв лишь от человека, заведённого этим прогоном, и рейтинг, посчитанный из отзывов
 * при подготовке строк, сходится с тем, что легло в базу. Владельцу своей публикации
 * отзыв не приписывается (правило «сам себе»).
 */
const REVIEWERS = [7, 8, 9, 10] as const;

/** День через `shift` суток от опорного, в виде `YYYY-MM-DD`. */
function dayAfter(base: Date, shift: number): string {
  const moved = new Date(base.getTime());

  moved.setUTCDate(moved.getUTCDate() + shift);

  return moved.toISOString().slice(0, 10);
}

/** Строка занятия клуба: услуга, зал и вид берутся у клуба, время — аргументом. */
type SlotSpec = {
  offeringId: number;
  clubId: number;
  sportId: number;
  title: string;
  price: number;
  capacity: number;
  room: string;
  level: 'beginner' | 'intermediate' | 'all_levels';
};

const CLUB_SLOTS: SlotSpec[] = [
  {
    offeringId: 1,
    clubId: 1,
    sportId: 4,
    title: 'Кроссфит — групповая тренировка',
    price: 900,
    capacity: 12,
    room: 'Большой зал',
    level: 'all_levels',
  },
  {
    offeringId: 2,
    clubId: 2,
    sportId: 1,
    title: 'Йога для начинающих',
    price: 700,
    capacity: 10,
    room: 'Зал А',
    level: 'beginner',
  },
  {
    offeringId: 4,
    clubId: 4,
    sportId: 2,
    title: 'Бокс — групповая тренировка',
    price: 2000,
    capacity: 10,
    room: 'Ринг',
    level: 'intermediate',
  },
  {
    offeringId: 5,
    clubId: 5,
    sportId: 3,
    title: 'Плавание — техника кроля',
    price: 900,
    capacity: 8,
    room: 'Дорожка 3',
    level: 'all_levels',
  },
  {
    offeringId: 6,
    clubId: 6,
    sportId: 5,
    title: 'Хип-хоп — открытый класс',
    price: 1500,
    capacity: 14,
    room: 'Зеркальный зал',
    level: 'all_levels',
  },
];

/** Часы занятий клубов по дням: сегодня — по всему дню, завтра — утро и вечер. */
const CLUB_TIMES: Record<'today' | 'tomorrow', [string, string][]> = {
  today: [
    ['07:00', '08:00'],
    ['10:00', '11:00'],
    ['12:30', '13:30'],
    ['15:00', '16:00'],
    ['18:00', '19:00'],
    ['19:30', '20:30'],
    ['21:00', '22:00'],
  ],
  tomorrow: [
    ['08:00', '09:00'],
    ['11:00', '12:00'],
    ['18:00', '19:00'],
    ['19:30', '20:30'],
  ],
};

/** Окна тренеров: услуга, карточка, клуб-площадка, вид, название, цена. */
const TRAINER_SLOTS = [
  {
    offeringId: 3,
    trainerId: 1,
    clubId: 1,
    sportId: 8,
    title: 'Пилатес — индивидуально',
    price: 1500,
    room: 'Малый зал',
  },
  {
    offeringId: 7,
    trainerId: 3,
    clubId: 4,
    sportId: 2,
    title: 'Бокс — персональная тренировка',
    price: 3000,
    room: 'Ринг',
  },
  {
    offeringId: 8,
    trainerId: 4,
    clubId: 1,
    sportId: 6,
    title: 'Силовая — персональная тренировка',
    price: 2800,
    room: 'Тренажёрный зал',
  },
] as const;

const TRAINER_TIMES: [string, string][] = [
  ['08:00', '09:00'],
  ['13:00', '14:00'],
  ['17:00', '18:00'],
  ['20:30', '21:30'],
];

/**
 * Расписание относительно опорного дня: занятия каждого клуба сегодня и завтра,
 * окна каждого тренера сегодня, завтра и послезавтра. Занятость везде ноль — и это
 * не упущение: `bookedCount` пересчитывается при подготовке строк из живых записей,
 * а записей сид не заводит (у них нет естественного ключа); подписи «мало мест»
 * и «Занято» появятся от настоящих записей. Номера — по порядку.
 */
function buildSchedule(today: Date): SourceData['schedule'] {
  const rows: SourceData['schedule'] = [];
  let id = 0;
  const days: ['today' | 'tomorrow', number][] = [
    ['today', 0],
    ['tomorrow', 1],
  ];

  for (const [day, shift] of days) {
    CLUB_TIMES[day].forEach(([startTime, endTime], slotIndex) => {
      // Каждое время — у одного-двух клубов по кругу, а не у всех сразу.
      for (const spec of CLUB_SLOTS.filter((_, index) => (index + slotIndex) % 2 === 0)) {
        id += 1;
        rows.push({
          id,
          createdAt: SEEDED_AT,
          offeringId: spec.offeringId,
          ownerType: 'club',
          ownerId: spec.clubId,
          clubId: spec.clubId,
          sportId: spec.sportId,
          title: spec.title,
          date: dayAfter(today, shift),
          startTime,
          endTime,
          durationMinutes: 60,
          level: spec.level,
          capacity: spec.capacity,
          bookedCount: 0,
          price: spec.price,
          room: spec.room,
        });
      }
    });
  }

  for (const shift of [0, 1, 2]) {
    for (const spec of TRAINER_SLOTS) {
      TRAINER_TIMES.forEach(([startTime, endTime]) => {
        id += 1;
        rows.push({
          id,
          createdAt: SEEDED_AT,
          offeringId: spec.offeringId,
          ownerType: 'trainer',
          ownerId: spec.trainerId,
          trainerId: spec.trainerId,
          affiliatedClubId: spec.clubId,
          sportId: spec.sportId,
          title: spec.title,
          date: dayAfter(today, shift),
          startTime,
          endTime,
          durationMinutes: 60,
          level: 'all_levels',
          capacity: 1,
          bookedCount: 0,
          price: spec.price,
          room: spec.room,
        });
      });
    }
  }

  return rows;
}

/** Тексты отзывов — короткие, без обещаний; оценки 4 и 5 дают рейтинги 4,7–5,0, как в макете. */
const REVIEW_TEXTS = [
  'Отличные тренеры, всё по делу и без воды.',
  'Чисто, удобное расписание, записалась за минуту.',
  'Хорошая атмосфера, группы небольшие — внимание каждому.',
  'Пришёл новичком, через месяц уже видна разница.',
  'Занятия вовремя, зал просторный, есть парковка.',
];

/** Отзывы на клубы и карточки тренеров сида — от людей, которым они не принадлежат. */
function buildReviews(): SourceData['reviews'] {
  const rows: SourceData['reviews'] = [];
  let id = 0;
  const ownerOf: Record<'club' | 'trainer', Record<number, number>> = {
    club: { 1: 2, 2: 2, 3: 5, 4: 2, 5: 2, 6: 2 },
    trainer: { 1: 3, 2: 5, 3: 6, 4: 9 },
  };

  for (const kind of ['club', 'trainer'] as const) {
    for (const [subjectId, ownerId] of Object.entries(ownerOf[kind])) {
      const subject = Number(subjectId);
      // Число отзывов — 3–5, чередуется по номеру публикации.
      const count = 3 + (subject % 3);

      REVIEWERS.filter((userId) => userId !== ownerId)
        .slice(0, count)
        .forEach((userId, index) => {
          id += 1;
          rows.push({
            id,
            createdAt: `2026-0${1 + (index % 8)}-1${index}T10:00:00.000Z`,
            userId,
            ...(kind === 'club' ? { clubId: subject } : { trainerId: subject }),
            rating: index % 3 === 2 ? 4 : 5,
            text: REVIEW_TEXTS[(subject + index) % REVIEW_TEXTS.length],
          });
        });
    }
  }

  return rows;
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
      // Люди макета (38.115): два тренера с карточками и трое спортсменов-рецензентов —
      // отзывы под рейтинги витрины оставляют они, а не владельцы.
      {
        id: 6,
        createdAt: SEEDED_AT,
        status: 'active',
        name: 'Евгений Карпов',
        email: 'karpov@sporthub.local',
        phone: '+7 (900) 000-00-06',
        passwordHash,
        favoriteClubIds: [],
        city: 'Самара',
      },
      {
        id: 7,
        createdAt: SEEDED_AT,
        status: 'active',
        name: 'Дмитрий Соколов',
        email: 'sokolov@sporthub.local',
        phone: '+7 (900) 000-00-07',
        passwordHash,
        favoriteClubIds: [4],
        city: 'Самара',
      },
      {
        id: 8,
        createdAt: SEEDED_AT,
        status: 'active',
        name: 'Анна Лебедева',
        email: 'lebedeva@sporthub.local',
        phone: '+7 (900) 000-00-08',
        passwordHash,
        favoriteClubIds: [5],
        city: 'Самара',
      },
      {
        id: 9,
        createdAt: SEEDED_AT,
        status: 'active',
        name: 'Мария Белова',
        email: 'belova@sporthub.local',
        phone: '+7 (900) 000-00-09',
        passwordHash,
        favoriteClubIds: [],
        city: 'Самара',
      },
      {
        id: 10,
        createdAt: SEEDED_AT,
        status: 'active',
        name: 'Игорь Волков',
        email: 'volkov@sporthub.local',
        phone: '+7 (900) 000-00-10',
        passwordHash,
        favoriteClubIds: [6],
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
        imageUrls: [PHOTO.gym],
        amenityIds: [1, 2, 3, 12],
        tagIds: [1, 6, 10],
        rating: 0,
        reviewCount: 0,
        priceFrom: 900,
        distanceKm: 0,
        managedByUserId: 2,
        source: 'seed',
        status: 'published',
        ...VERIFIED,
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
        imageUrls: [PHOTO.yoga],
        amenityIds: [3, 11, 13],
        tagIds: [1, 8, 9],
        rating: 0,
        reviewCount: 0,
        priceFrom: 700,
        distanceKm: 0,
        managedByUserId: 2,
        source: 'seed',
        status: 'published',
        ...VERIFIED,
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
        imageUrls: [PHOTO.crossfit],
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
      // Три клуба макета (38.115): единоборства, плавание, танцы — со снимками макета;
      // владелец — та же Ольга, у которой «Ритм» и «Баланс».
      {
        id: 4,
        createdAt: SEEDED_AT,
        name: 'Bushido Fight Club',
        slug: 'bushido-fight-club',
        description:
          'Клуб единоборств: бокс, кикбоксинг и борьба. Ринг, татами, группы для взрослых и подростков, спарринги по выходным.',
        shortDescription: 'Бокс, кикбоксинг и борьба — ринг и татами.',
        city: 'Самара',
        address: 'Московское ш., 41',
        phone: '+7 (846) 000-40-40',
        email: 'bushido@sporthub.local',
        coordinates: { lat: 53.2112, lng: 50.1932 },
        sportIds: [7, 2],
        imageUrls: [PHOTO.martial],
        amenityIds: [2, 3, 14, 15],
        tagIds: [1, 3, 11, 14],
        rating: 0,
        reviewCount: 0,
        priceFrom: 2000,
        distanceKm: 0,
        managedByUserId: 2,
        source: 'seed',
        status: 'published',
        ...VERIFIED,
      },
      {
        id: 5,
        createdAt: SEEDED_AT,
        name: 'Aqua Sport Center',
        slug: 'aqua-sport-center',
        description:
          'Бассейн 25 метров, дорожки для свободного плавания и группы по технике. Утренние сеансы с шести утра, детские группы после обеда.',
        shortDescription: 'Бассейн 25 м, техника плавания, детские группы.',
        city: 'Самара',
        address: 'ул. Ново-Вокзальная, 62',
        phone: '+7 (846) 000-50-50',
        email: 'aqua@sporthub.local',
        coordinates: { lat: 53.2201, lng: 50.2201 },
        sportIds: [3],
        imageUrls: [PHOTO.aqua],
        amenityIds: [1, 2, 3, 4, 5],
        tagIds: [2, 4, 13],
        rating: 0,
        reviewCount: 0,
        priceFrom: 900,
        distanceKm: 0,
        managedByUserId: 2,
        source: 'seed',
        status: 'published',
        ...VERIFIED,
      },
      {
        id: 6,
        createdAt: SEEDED_AT,
        name: 'Dance Universe',
        slug: 'dance-universe',
        description:
          'Танцевальная студия: хип-хоп, контемпорари, латина и растяжка. Зеркальные залы, группы по уровням, вечерние занятия для взрослых.',
        shortDescription: 'Хип-хоп, контемпорари, латина — зеркальные залы.',
        city: 'Самара',
        address: 'ул. Ленинградская, 77',
        phone: '+7 (846) 000-60-60',
        email: 'dance@sporthub.local',
        coordinates: { lat: 53.1876, lng: 50.0942 },
        sportIds: [5],
        imageUrls: [PHOTO.dance],
        amenityIds: [3, 6, 13],
        tagIds: [1, 11, 14],
        rating: 0,
        reviewCount: 0,
        priceFrom: 1500,
        distanceKm: 0,
        managedByUserId: 2,
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
        avatarUrl: FACE.voronova,
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
        ...VERIFIED,
      },
      {
        // Карточка того же человека, у которого есть клуб (пользователь 5).
        // Это и есть пятый набор лиц — ради него затевалась фаза.
        id: 2,
        createdAt: SEEDED_AT,
        name: 'Егор Двулицев',
        slug: 'egor-dvulitsev',
        bio: 'Веду кроссфит в собственном зале и персональные тренировки на выезде — дома у клиента и в чужих залах по договорённости.',
        avatarUrl: FACE.klimov,
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
        ...VERIFIED,
      },
      // Два тренера макета (38.115): бокс и силовые — с лицами макета.
      {
        id: 3,
        createdAt: SEEDED_AT,
        name: 'Евгений Карпов',
        slug: 'evgeniy-karpov',
        bio: 'Мастер спорта по боксу. Ставлю технику удара и защиты с нуля, готовлю к первым боям, работаю с подростками и взрослыми.',
        avatarUrl: FACE.karpov,
        experienceYears: 12,
        specialtyIds: [1, 7, 14],
        workFormatIds: [1],
        rating: 0,
        reviewCount: 0,
        priceFrom: 3000,
        sportIds: [2, 7],
        sportId: 2,
        city: 'Самара',
        address: 'Московское ш., 41',
        coordinates: { lat: 53.2112, lng: 50.1932 },
        phone: '+7 (900) 000-00-06',
        managedByUserId: 6,
        source: 'seed',
        status: 'published',
        ...VERIFIED,
      },
      {
        id: 4,
        createdAt: SEEDED_AT,
        name: 'Мария Белова',
        slug: 'mariya-belova',
        bio: 'Кандидат в мастера спорта по пауэрлифтингу. Силовые тренировки для женщин и мужчин: техника базовых движений, набор массы, выход из плато.',
        avatarUrl: FACE.belova,
        experienceYears: 7,
        specialtyIds: [5, 10, 7],
        workFormatIds: [1, 3],
        rating: 0,
        reviewCount: 0,
        priceFrom: 2800,
        sportIds: [6],
        sportId: 6,
        city: 'Самара',
        address: 'Ново-Садовая ул., 106',
        coordinates: { lat: 53.22102, lng: 50.151918 },
        phone: '+7 (900) 000-00-09',
        managedByUserId: 9,
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
      // Тренеры макета работают в залах макета: бокс — в Bushido, силовые — в «Ритме».
      {
        id: 2,
        createdAt: SEEDED_AT,
        trainerId: 3,
        clubId: 4,
        status: 'confirmed',
        initiatedBy: 'trainer',
        approvedAt: SEEDED_AT,
        approvedByUserId: 2,
      },
      {
        id: 3,
        createdAt: SEEDED_AT,
        trainerId: 4,
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
      // Услуги клубов макета — по одной групповой на клуб, под занятия «сегодня/завтра».
      {
        id: 4,
        createdAt: SEEDED_AT,
        ownerType: 'club',
        ownerId: 4,
        sportId: 2,
        title: 'Бокс — групповая тренировка',
        description: 'Работа в парах, лапы, техника защиты. Группы до десяти человек.',
        format: 'group',
        price: 2000,
        durationMinutes: 60,
        capacity: 10,
        address: 'Московское ш., 41',
        coordinates: { lat: 53.2112, lng: 50.1932 },
        cancellationPolicy: 'free_until_24h',
      },
      {
        id: 5,
        createdAt: SEEDED_AT,
        ownerType: 'club',
        ownerId: 5,
        sportId: 3,
        title: 'Плавание — техника кроля',
        description: 'Постановка дыхания и гребка, дорожка на группу до восьми человек.',
        format: 'group',
        price: 900,
        durationMinutes: 60,
        capacity: 8,
        address: 'ул. Ново-Вокзальная, 62',
        coordinates: { lat: 53.2201, lng: 50.2201 },
        cancellationPolicy: 'free_until_24h',
      },
      {
        id: 6,
        createdAt: SEEDED_AT,
        ownerType: 'club',
        ownerId: 6,
        sportId: 5,
        title: 'Хип-хоп — открытый класс',
        description: 'Базовые связки и импровизация, любой уровень.',
        format: 'group',
        price: 1500,
        durationMinutes: 60,
        capacity: 14,
        address: 'ул. Ленинградская, 77',
        coordinates: { lat: 53.1876, lng: 50.0942 },
        cancellationPolicy: 'free_until_24h',
      },
      // Персональные услуги тренеров макета — в залах их клубов.
      {
        id: 7,
        createdAt: SEEDED_AT,
        ownerType: 'trainer',
        ownerId: 3,
        affiliatedClubId: 4,
        sportId: 2,
        title: 'Бокс — персональная тренировка',
        description: 'Индивидуальная работа на лапах и технике, разбор боя.',
        format: 'personal',
        price: 3000,
        durationMinutes: 60,
        capacity: 1,
        address: 'Московское ш., 41',
        coordinates: { lat: 53.2112, lng: 50.1932 },
        cancellationPolicy: 'free_until_2h',
      },
      {
        id: 8,
        createdAt: SEEDED_AT,
        ownerType: 'trainer',
        ownerId: 4,
        affiliatedClubId: 1,
        sportId: 6,
        title: 'Силовая — персональная тренировка',
        description: 'Техника базовых движений и программа под цель.',
        format: 'personal',
        price: 2800,
        durationMinutes: 60,
        capacity: 1,
        address: 'Ново-Садовая ул., 106',
        coordinates: { lat: 53.22102, lng: 50.151918 },
        cancellationPolicy: 'free_until_2h',
      },
    ],

    // Занятия — «сегодня» и «завтра» относительно опорного дня (38.115): в любой день
    // на витрине есть занятия, куда ещё можно прийти (`isSlotOpenToday`), и окна
    // тренеров «доступен сейчас». Времена расставлены по всему дню, поздние —
    // до 21:30: даже вечером что-то ещё впереди. Послезавтра и дальше — по-прежнему
    // есть, чтобы сценарии записи и отмены не упирались в один день.
    schedule: buildSchedule(today),

    // Записей, отзывов, уведомлений и журнала в сиде нет намеренно: их заводит
    // сам разработчик, проходя сценарий, — иначе первая же проверка идёт
    // на данных, которых он не создавал и не понимает.
    bookings: [],
    // Отзывы (38.115): по несколько на каждую публикацию от спортсменов сида —
    // из них при подготовке строк СЧИТАЮТСЯ рейтинг и число отзывов; писатель кладёт
    // их только у публикаций, заведённых этим же прогоном (естественного ключа
    // у отзыва нет, чужие публикации сид не трогает).
    reviews: buildReviews(),
    notifications: [],
    logs: [],
    providerClientNotes: [],
  };
}

/**
 * Наполнить базу демонстрационным набором.
 *
 * Повторный запуск ничего не удваивает И ничего не переписывает — в том числе
 * на базе, которой уже пользовались: строки с теми же естественными ключами
 * сид оставляет как есть (шаги 36.33 и 36.34).
 */
export async function seedDevData({ client, today }: DevSeedOptions): Promise<ImportReport> {
  const source = await buildDevSourceData(today);

  return writeDevSeed({ client, source });
}

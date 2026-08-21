// Репозитории клубов, тренеров и расписания.
//
// Здесь живут три «починки» данных, перенесённые из db.ts дословно. Все они —
// следствие того, что JSON накопил legacy-поля и рассинхрон со схемой типов.
// В фазе базы они исчезнут (колонки станут NOT NULL, поиск по slug — индексом),
// поэтому им место внутри JSON-реализации, а не в интерфейсе репозитория.

import { getTrainerPrimarySportId, getTrainerSportIds } from '@sporthub/domain';
import type { CatalogOwnerType, Club, Offering, Schedule, Trainer } from '@sporthub/types';

import type { JsonStorage } from '../storage/json-storage';
import { ownerIdMatcher, type OwnerIdFilter } from './crud.repository';

// --- Токены внедрения ---------------------------------------------------------

export const CLUBS_REPOSITORY = Symbol('CLUBS_REPOSITORY');
export const TRAINERS_REPOSITORY = Symbol('TRAINERS_REPOSITORY');
export const SCHEDULE_REPOSITORY = Symbol('SCHEDULE_REPOSITORY');

// --- Нормализация (детали JSON-хранилища) -------------------------------------

/**
 * Приведение slug к сравнимому виду: снимаем URI-кодирование, нормализуем
 * юникод и опускаем регистр. Нужно, чтобы кириллический slug находился и в
 * сыром виде, и в виде `%D0%BA%D1%80%D0%BE%D1%81%D1%81%D1%84%D0%B8%D1%82`.
 */
export function normalizeSlugLookupValue(slug: string): string {
  const trimmedSlug = slug.trim();

  if (trimmedSlug === '') {
    return '';
  }

  let decodedSlug = trimmedSlug;

  try {
    decodedSlug = decodeURIComponent(trimmedSlug);
  } catch {
    decodedSlug = trimmedSlug;
  }

  return decodedSlug.normalize('NFC').toLocaleLowerCase('ru-RU');
}

/**
 * Починка тренера: в данных встречается устаревшее одиночное `sportId`,
 * тогда как тип объявляет массив `sportIds`. Приводим к обоим представлениям,
 * чтобы потребители не гадали. Сама формула — в `@sporthub/domain`: её же
 * читает фронт, и разойтись они не должны.
 */
function normalizeTrainer(trainer: Trainer): Trainer {
  return {
    ...trainer,
    sportIds: getTrainerSportIds(trainer),
    sportId: getTrainerPrimarySportId(trainer),
  };
}

/**
 * Починка слота: часть записей не хранит владельца явно, он выводится из
 * связанной услуги. Клуб для тренерских слотов здесь НЕ достраивается — это
 * делает потребитель через `offering.trainerClubLinkId`.
 */
function normalizeSchedule(scheduleItem: Schedule, offeringsById: Map<number, Offering>): Schedule {
  const offering =
    scheduleItem.offeringId !== undefined
      ? (offeringsById.get(scheduleItem.offeringId) ?? null)
      : null;
  const ownerType = scheduleItem.ownerType ?? offering?.ownerType ?? 'club';
  const ownerId =
    scheduleItem.ownerId ??
    offering?.ownerId ??
    (ownerType === 'club' ? scheduleItem.clubId : scheduleItem.trainerId);
  const clubId =
    scheduleItem.clubId ?? (ownerType === 'club' && ownerId !== undefined ? ownerId : undefined);
  const trainerId =
    scheduleItem.trainerId ??
    (ownerType === 'trainer' && ownerId !== undefined ? ownerId : undefined);

  return {
    ...scheduleItem,
    clubId,
    offeringId: scheduleItem.offeringId ?? offering?.id,
    ownerId,
    ownerType,
    trainerId,
  };
}

// --- Интерфейсы ---------------------------------------------------------------

/**
 * Отбор публикаций (клубов и тренеров). Все поля необязательные.
 *
 * ⚠️ До этого шага каталог поднимал ВСЕ публикации платформы и отсеивал их в памяти:
 * вид спорта, минимальный рейтинг, поиск по подстроке. Счётчики рабочей базы показывали
 * у таблицы клубов **200030 обращений полным перебором и ноль обращений по индексам** —
 * при том, что индексы `[status, rating desc, reviewCount desc]` и связующая таблица
 * `club_sports` уже существовали. Необязательность полей нужна, чтобы прежние вызовы —
 * `findAll()`, `findAll({ excludeHidden: true })` — означали ровно то же, что означали.
 */
export type PublicationStatusFilter = {
  /** `hidden` скрывается из публичных выдач. */
  excludeHidden?: boolean;
  /** Отбор по конкретным номерам. Пустой массив — пустая выдача без запроса. */
  ids?: number[];
  /** Вид спорта: публикация числится по нему в связующей таблице. */
  sportId?: number;
  /** Нижняя граница рейтинга включительно. */
  minRating?: number;
  /** Город публикации — точное совпадение, как в прежнем отборе в памяти. */
  city?: string;
  /**
   * Владелец публикации — пользователь, который ей управляет.
   *
   * Под это уже есть индексы `clubs_managed_by_user_id_idx` и
   * `trainers_managed_by_user_id_idx`; до сих пор публикации провайдера
   * отбирались перебором всей таблицы в памяти.
   */
  managedByUserId?: number;
  /**
   * Только скрытые. Обратное к `excludeHidden`, нужно очереди модерации.
   *
   * Отдельным полем, а не значением состояния: состояний три, а спрашивают
   * ровно эти два среза, и называть их своими именами честнее, чем заводить
   * строковый параметр, который потом придётся сверять со словарём.
   */
  onlyHidden?: boolean;
  /**
   * Поиск по названию, без учёта регистра.
   *
   * ⚠️ Индекса под поиск подстрокой нет — полнотекстовый поиск изменил бы выдачу
   * и вынесен за границы фазы. Но даже без индекса отбор в запросе лучше отбора
   * после чтения: до приложения доезжают только подходящие строки, а не вся таблица.
   */
  search?: string;
};

export interface ClubsRepository {
  findAll(filter?: PublicationStatusFilter): Promise<Club[]>;
  findById(id: number): Promise<Club | null>;
  findBySlug(slug: string): Promise<Club | null>;
  insert(club: Omit<Club, 'id' | 'createdAt'>): Promise<Club>;
  update(id: number, patch: Partial<Club>): Promise<Club>;
  remove(id: number): Promise<void>;
}

export interface TrainersRepository {
  findAll(filter?: PublicationStatusFilter): Promise<Trainer[]>;
  findById(id: number): Promise<Trainer | null>;
  findBySlug(slug: string): Promise<Trainer | null>;
  insert(trainer: Omit<Trainer, 'id' | 'createdAt'>): Promise<Trainer>;
  update(id: number, patch: Partial<Trainer>): Promise<Trainer>;
  remove(id: number): Promise<void>;
}

/**
 * Порядок выдачи слотов.
 *
 * - `id` — по возрастанию номера. Умолчание, и оно ОДИНАКОВО у обеих реализаций:
 *   база сортирует запросом, файловое хранилище — после чтения. Прежнее умолчание
 *   называлось «порядок хранилища» и означало у них разное, потому что строки
 *   в файле лежат не по номеру.
 * - `dateTime` — по дню занятия, затем по времени начала. Так расписание показывают
 *   пользователю. Раньше этот порядок наводил контроллер уже ПОСЛЕ чтения всей выдачи;
 *   с уходом отбора в запрос сортировать после чтения стало нечего — порядок задаёт,
 *   какие строки вообще поднимутся из базы, поэтому он уходит туда же, где и отбор.
 */
export type ScheduleOrder = 'id' | 'dateTime';

/**
 * Отбор слотов расписания. Все поля необязательные — это главное свойство фильтра.
 *
 * ⚠️ До этого шага маршрут расписания поднимал ВСЕ клубные слоты платформы и отсеивал
 * их пятью проходами в памяти: заполненные, чужой клуб, чужой тренер, другой вид спорта,
 * другой день. Девять индексов таблицы при этом не использовались ни разу
 * (`seq_scan` рос, `idx_scan` стоял на нуле). Необязательность полей нужна, чтобы
 * прежние вызовы — `findMany()`, `findMany({ ownerType: 'all' })` — продолжали означать
 * ровно то же, что означали.
 */
export interface ScheduleFilter {
  /** Владелец занятия. Умолчание — только клубные слоты (перенесено из db.ts). */
  ownerType?: CatalogOwnerType | 'all';
  /**
   * Отбор по конкретным номерам слотов.
   *
   * Поле фильтра, а не отдельный метод `findByIds`: набор номеров редко нужен сам
   * по себе — его почти всегда сопровождает ещё одно условие (владелец, день,
   * свободные места), а отдельный метод такие сочетания сложить не даст и потребует
   * второго прохода в памяти. Пустой массив значит «пустой набор»: выдача пуста,
   * и запроса к хранилищу не делается вовсе.
   */
  ids?: number[];
  /** Клуб занятия: владелец-клуб ИЛИ клуб-площадка (зал, где ведёт тренер). */
  clubId?: number;
  /** Тренер занятия: владелец-тренер ИЛИ ведущий клубного занятия. */
  trainerId?: number;
  sportId?: number;
  /** День занятия, строка `YYYY-MM-DD`. */
  date?: string;
  /** Только слоты со свободными местами: `bookedCount < capacity`. */
  onlyWithFreeSeats?: boolean;
  /**
   * Набор владельцев: слот считается своим, если совпал клуб ИЛИ тренер.
   *
   * Тот же вид отбора, что у записей (`BookingsFilter.owners`) — сводка провайдера
   * ограничивается его публикациями, а их всегда несколько.
   */
  owners?: OwnerIdFilter;
  /**
   * Порядок выдачи. По умолчанию — по возрастанию номера.
   *
   * ⚠️ Раньше умолчание называлось «порядок хранилища» и означало у двух реализаций
   * РАЗНОЕ: база отдаёт по номеру, а файл — в том порядке, в каком строки лежат в нём
   * физически (`data/schedule.json` хранит их как `9,10,6,4,5,3,2,8,7,1`). Пока
   * единственный потребитель сортировал сам, расхождение не проявлялось — но путь
   * отката обязан совпадать с базой по РЕЗУЛЬТАТУ, иначе следующий потребитель
   * получил бы два разных ответа на один вызов и узнал бы об этом на проде.
   */
  order?: ScheduleOrder;
}

/**
 * Сравнение слотов «по дню и времени начала».
 *
 * Третьим ключом стоит номер, и он обязателен: без него два занятия в один день
 * и в одну минуту вставали бы в произвольном порядке, а «произвольный» у базы значит
 * «может меняться от запроса к запросу». Обе реализации сравнивают одинаково —
 * иначе выдачи разошлись бы на первом же совпадении дня и времени.
 */
export function compareSlotsByDateTime(left: Schedule, right: Schedule): number {
  const byDate = left.date.localeCompare(right.date);

  if (byDate !== 0) return byDate;

  const byStartTime = left.startTime.localeCompare(right.startTime);

  if (byStartTime !== 0) return byStartTime;

  return left.id - right.id;
}

export interface ScheduleRepository {
  findMany(filter?: ScheduleFilter): Promise<Schedule[]>;
  findById(id: number): Promise<Schedule | null>;
  findByOfferingId(offeringId: number): Promise<Schedule[]>;
  insertMany(slots: Omit<Schedule, 'id' | 'createdAt'>[]): Promise<Schedule[]>;
  update(id: number, patch: Partial<Schedule>): Promise<Schedule>;
  /**
   * Занято и всего мест по отобранным слотам — двумя суммами.
   *
   * ⚠️ Нужно сводке платформы, и ради этих двух чисел она поднимала ВСЁ расписание
   * платформы. Расписание растёт со временем, а не с числом пользователей, поэтому
   * сводка ломалась бы первой. Слоты без мест (`capacity = 0`) в суммы не входят —
   * так считалось и раньше.
   */
  sumSeats(filter?: ScheduleFilter): Promise<{ booked: number; capacity: number }>;
  /** Пересчёт занятых мест. Дельта, а не абсолютное значение — так делает FSM. */
  changeBookedCount(id: number, delta: number): Promise<Schedule>;
  removeMany(ids: number[]): Promise<number>;
}

// --- Реализации ---------------------------------------------------------------

/**
 * Отбор публикаций в памяти — общий для клубов и тренеров.
 *
 * Свойство файлового хранилища, а не решение: это путь отката, и его дело —
 * совпасть с базой по РЕЗУЛЬТАТУ, а не по способу. Отдельная функция, потому что
 * условия у клубов и тренеров одни и те же, а две копии разошлись бы при первой правке.
 */
function selectPublications<T extends Club | Trainer>(
  items: T[],
  filter: PublicationStatusFilter,
): T[] {
  const ids = filter.ids === undefined ? null : new Set(filter.ids);

  const needle = filter.search?.trim().toLowerCase();

  return items.filter((item) => {
    if (filter.excludeHidden === true && item.status === 'hidden') return false;
    if (filter.onlyHidden === true && item.status !== 'hidden') return false;
    if (ids !== null && !ids.has(item.id)) return false;
    if (filter.sportId !== undefined && !item.sportIds.includes(filter.sportId)) return false;
    if (filter.minRating !== undefined && item.rating < filter.minRating) return false;
    if (filter.city !== undefined && item.city !== filter.city) return false;
    if (filter.managedByUserId !== undefined && item.managedByUserId !== filter.managedByUserId) {
      return false;
    }
    if (needle !== undefined && needle !== '' && !item.name.toLowerCase().includes(needle)) {
      return false;
    }

    return true;
  });
}

export class JsonClubsRepository implements ClubsRepository {
  constructor(private readonly storage: JsonStorage) {}

  async findAll(filter: PublicationStatusFilter = {}): Promise<Club[]> {
    // Пустой набор номеров — заведомо пустая выдача, читать файлы незачем.
    if (filter.ids !== undefined && filter.ids.length === 0) return [];

    const clubs = await this.storage.read('clubs');

    return selectPublications(clubs, filter);
  }

  async findById(id: number): Promise<Club | null> {
    const clubs = await this.storage.read('clubs');

    return clubs.find((club) => club.id === id) ?? null;
  }

  async findBySlug(slug: string): Promise<Club | null> {
    const target = normalizeSlugLookupValue(slug);

    if (target === '') return null;

    const clubs = await this.storage.read('clubs');

    return clubs.find((club) => normalizeSlugLookupValue(club.slug) === target) ?? null;
  }

  async insert(club: Omit<Club, 'id' | 'createdAt'>): Promise<Club> {
    const clubs = await this.storage.read('clubs');
    const created: Club = {
      id: this.storage.getNextEntityId(clubs),
      createdAt: new Date().toISOString(),
      ...club,
    };

    await this.storage.write('clubs', [...clubs, created]);

    return created;
  }

  async update(id: number, patch: Partial<Club>): Promise<Club> {
    const clubs = await this.storage.read('clubs');
    const index = clubs.findIndex((club) => club.id === id);

    if (index === -1) {
      throw new Error(`Клуб с id ${id} не найден`);
    }

    const updated: Club = { ...clubs[index], ...patch };
    const next = [...clubs];
    next[index] = updated;
    await this.storage.write('clubs', next);

    return updated;
  }

  async remove(id: number): Promise<void> {
    const clubs = await this.storage.read('clubs');

    await this.storage.write(
      'clubs',
      clubs.filter((club) => club.id !== id),
    );
  }
}

export class JsonTrainersRepository implements TrainersRepository {
  constructor(private readonly storage: JsonStorage) {}

  private async readNormalized(): Promise<Trainer[]> {
    const trainers = await this.storage.read('trainers');

    return trainers.map(normalizeTrainer);
  }

  async findAll(filter: PublicationStatusFilter = {}): Promise<Trainer[]> {
    // Пустой набор номеров — заведомо пустая выдача, читать файлы незачем.
    if (filter.ids !== undefined && filter.ids.length === 0) return [];

    const trainers = await this.readNormalized();

    return selectPublications(trainers, filter);
  }

  async findById(id: number): Promise<Trainer | null> {
    const trainers = await this.readNormalized();

    return trainers.find((trainer) => trainer.id === id) ?? null;
  }

  async findBySlug(slug: string): Promise<Trainer | null> {
    const target = normalizeSlugLookupValue(slug);

    if (target === '') return null;

    const trainers = await this.readNormalized();

    return trainers.find((trainer) => normalizeSlugLookupValue(trainer.slug) === target) ?? null;
  }

  async insert(trainer: Omit<Trainer, 'id' | 'createdAt'>): Promise<Trainer> {
    const trainers = await this.storage.read('trainers');
    const created: Trainer = {
      id: this.storage.getNextEntityId(trainers),
      createdAt: new Date().toISOString(),
      ...trainer,
    };

    await this.storage.write('trainers', [...trainers, created]);

    return created;
  }

  async update(id: number, patch: Partial<Trainer>): Promise<Trainer> {
    const trainers = await this.storage.read('trainers');
    const index = trainers.findIndex((trainer) => trainer.id === id);

    if (index === -1) {
      throw new Error(`Тренер с id ${id} не найден`);
    }

    const updated: Trainer = { ...trainers[index], ...patch };
    const next = [...trainers];
    next[index] = updated;
    await this.storage.write('trainers', next);

    return normalizeTrainer(updated);
  }

  async remove(id: number): Promise<void> {
    const trainers = await this.storage.read('trainers');

    await this.storage.write(
      'trainers',
      trainers.filter((trainer) => trainer.id !== id),
    );
  }
}

export class JsonScheduleRepository implements ScheduleRepository {
  constructor(private readonly storage: JsonStorage) {}

  private async readNormalized(): Promise<Schedule[]> {
    const [schedule, offerings] = await Promise.all([
      this.storage.read('schedule'),
      this.storage.read('offerings'),
    ]);
    const offeringsById = new Map(offerings.map((offering) => [offering.id, offering]));

    return schedule.map((slot) => normalizeSchedule(slot, offeringsById));
  }

  async findMany(filter: ScheduleFilter = {}): Promise<Schedule[]> {
    // Пустой набор номеров — заведомо пустая выдача. Читать файлы ради этого незачем,
    // и у реализации на базе здесь так же не будет запроса.
    if (filter.ids !== undefined && filter.ids.length === 0) return [];

    const slots = await this.readNormalized();
    // Умолчание из db.ts: без указания владельца отдаются только клубные слоты.
    const ownerType = filter.ownerType ?? 'club';
    const ids = filter.ids === undefined ? null : new Set(filter.ids);
    const matchesOwner = ownerIdMatcher(filter.owners);

    // Отбор в памяти — свойство файлового хранилища, а не решение: это путь отката,
    // и его дело — совпасть с базой по результату, а не по способу.
    const selected = slots.filter((slot) => {
      if (ownerType !== 'all' && slot.ownerType !== ownerType) return false;
      if (ids !== null && !ids.has(slot.id)) return false;
      if (filter.clubId !== undefined && slot.clubId !== filter.clubId) return false;
      if (filter.trainerId !== undefined && slot.trainerId !== filter.trainerId) return false;
      if (filter.sportId !== undefined && slot.sportId !== filter.sportId) return false;
      if (filter.date !== undefined && slot.date !== filter.date) return false;
      if (filter.onlyWithFreeSeats === true && slot.bookedCount >= slot.capacity) return false;
      if (!matchesOwner(slot)) return false;

      return true;
    });

    // Порядок задаётся всегда: по дню и времени — если просили, иначе по номеру.
    // Отдать «как лежит в файле» нельзя: база так не умеет, и две реализации
    // разошлись бы в ответе на один и тот же вызов.
    selected.sort(
      filter.order === 'dateTime' ? compareSlotsByDateTime : (left, right) => left.id - right.id,
    );

    return selected;
  }

  async sumSeats(filter: ScheduleFilter = {}): Promise<{ booked: number; capacity: number }> {
    // Через тот же `findMany`, а не своим проходом: два набора условий разошлись бы
    // при первой правке, и сводка начала бы считать не по тем слотам.
    const slots = await this.findMany(filter);

    return slots
      .filter((slot) => slot.capacity > 0)
      .reduce(
        (sum, slot) => ({
          booked: sum.booked + slot.bookedCount,
          capacity: sum.capacity + slot.capacity,
        }),
        { booked: 0, capacity: 0 },
      );
  }

  async findById(id: number): Promise<Schedule | null> {
    const slots = await this.readNormalized();

    return slots.find((slot) => slot.id === id) ?? null;
  }

  async findByOfferingId(offeringId: number): Promise<Schedule[]> {
    const slots = await this.readNormalized();

    return slots.filter((slot) => slot.offeringId === offeringId);
  }

  async insertMany(slots: Omit<Schedule, 'id' | 'createdAt'>[]): Promise<Schedule[]> {
    if (slots.length === 0) return [];

    const schedule = await this.storage.read('schedule');
    const created: Schedule[] = [];
    let nextId = this.storage.getNextEntityId(schedule);

    for (const slot of slots) {
      created.push({
        id: nextId,
        createdAt: new Date().toISOString(),
        ...slot,
      });
      nextId += 1;
    }

    await this.storage.write('schedule', [...schedule, ...created]);

    return created;
  }

  async update(id: number, patch: Partial<Schedule>): Promise<Schedule> {
    const schedule = await this.storage.read('schedule');
    const index = schedule.findIndex((slot) => slot.id === id);

    if (index === -1) {
      throw new Error(`Слот с id ${id} не найден`);
    }

    const updated: Schedule = { ...schedule[index], ...patch };
    const next = [...schedule];
    next[index] = updated;
    await this.storage.write('schedule', next);

    return updated;
  }

  async changeBookedCount(id: number, delta: number): Promise<Schedule> {
    const schedule = await this.storage.read('schedule');
    const index = schedule.findIndex((slot) => slot.id === id);

    if (index === -1) {
      throw new Error(`Слот с id ${id} не найден`);
    }

    // Отрицательного числа занятых мест быть не может — как в db.ts.
    const bookedCount = Math.max(0, schedule[index].bookedCount + delta);
    const updated: Schedule = { ...schedule[index], bookedCount };
    const next = [...schedule];
    next[index] = updated;
    await this.storage.write('schedule', next);

    return updated;
  }

  async removeMany(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;

    const schedule = await this.storage.read('schedule');
    const target = new Set(ids);
    const kept = schedule.filter((slot) => !target.has(slot.id));

    await this.storage.write('schedule', kept);

    return schedule.length - kept.length;
  }
}

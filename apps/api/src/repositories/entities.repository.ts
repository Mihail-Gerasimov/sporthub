// Репозитории клубов, тренеров и расписания.
//
// Здесь живут три «починки» данных, перенесённые из db.ts дословно. Все они —
// следствие того, что JSON накопил legacy-поля и рассинхрон со схемой типов.
// В фазе базы они исчезнут (колонки станут NOT NULL, поиск по slug — индексом),
// поэтому им место внутри JSON-реализации, а не в интерфейсе репозитория.

import type {
  CatalogOwnerType,
  Club,
  Offering,
  Schedule,
  Trainer,
} from "@sporthub/types";

import type { JsonStorage } from "../storage/json-storage";

// --- Токены внедрения ---------------------------------------------------------

export const CLUBS_REPOSITORY = Symbol("CLUBS_REPOSITORY");
export const TRAINERS_REPOSITORY = Symbol("TRAINERS_REPOSITORY");
export const SCHEDULE_REPOSITORY = Symbol("SCHEDULE_REPOSITORY");

// --- Нормализация (детали JSON-хранилища) -------------------------------------

/**
 * Приведение slug к сравнимому виду: снимаем URI-кодирование, нормализуем
 * юникод и опускаем регистр. Нужно, чтобы кириллический slug находился и в
 * сыром виде, и в виде `%D0%BA%D1%80%D0%BE%D1%81%D1%81%D1%84%D0%B8%D1%82`.
 */
export function normalizeSlugLookupValue(slug: string): string {
  const trimmedSlug = slug.trim();

  if (trimmedSlug === "") {
    return "";
  }

  let decodedSlug = trimmedSlug;

  try {
    decodedSlug = decodeURIComponent(trimmedSlug);
  } catch {
    decodedSlug = trimmedSlug;
  }

  return decodedSlug.normalize("NFC").toLocaleLowerCase("ru-RU");
}

/**
 * Починка тренера: в данных встречается устаревшее одиночное `sportId`,
 * тогда как тип объявляет массив `sportIds`. Приводим к обоим представлениям,
 * чтобы потребители не гадали.
 */
function normalizeTrainer(trainer: Trainer): Trainer {
  const sportIds =
    Array.isArray(trainer.sportIds) && trainer.sportIds.length > 0
      ? trainer.sportIds
      : trainer.sportId !== undefined
        ? [trainer.sportId]
        : [];

  return { ...trainer, sportIds, sportId: trainer.sportId ?? sportIds[0] };
}

/**
 * Починка слота: часть записей не хранит владельца явно, он выводится из
 * связанной услуги. Клуб для тренерских слотов здесь НЕ достраивается — это
 * делает потребитель через `offering.trainerClubLinkId`.
 */
function normalizeSchedule(
  scheduleItem: Schedule,
  offeringsById: Map<number, Offering>,
): Schedule {
  const offering =
    scheduleItem.offeringId !== undefined
      ? (offeringsById.get(scheduleItem.offeringId) ?? null)
      : null;
  const ownerType = scheduleItem.ownerType ?? offering?.ownerType ?? "club";
  const ownerId =
    scheduleItem.ownerId ??
    offering?.ownerId ??
    (ownerType === "club" ? scheduleItem.clubId : scheduleItem.trainerId);
  const clubId =
    scheduleItem.clubId ??
    (ownerType === "club" && ownerId !== undefined ? ownerId : undefined);
  const trainerId =
    scheduleItem.trainerId ??
    (ownerType === "trainer" && ownerId !== undefined ? ownerId : undefined);

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

/** Фильтр статуса: `hidden` скрывает публикацию из публичных выдач. */
export type PublicationStatusFilter = { excludeHidden?: boolean };

export interface ClubsRepository {
  findAll(filter?: PublicationStatusFilter): Promise<Club[]>;
  findById(id: number): Promise<Club | null>;
  findBySlug(slug: string): Promise<Club | null>;
  insert(club: Omit<Club, "id" | "createdAt">): Promise<Club>;
  update(id: number, patch: Partial<Club>): Promise<Club>;
  remove(id: number): Promise<void>;
}

export interface TrainersRepository {
  findAll(filter?: PublicationStatusFilter): Promise<Trainer[]>;
  findById(id: number): Promise<Trainer | null>;
  findBySlug(slug: string): Promise<Trainer | null>;
  insert(trainer: Omit<Trainer, "id" | "createdAt">): Promise<Trainer>;
  update(id: number, patch: Partial<Trainer>): Promise<Trainer>;
  remove(id: number): Promise<void>;
}

export interface ScheduleRepository {
  findMany(filter?: {
    ownerType?: CatalogOwnerType | "all";
  }): Promise<Schedule[]>;
  findById(id: number): Promise<Schedule | null>;
  findByOfferingId(offeringId: number): Promise<Schedule[]>;
  insertMany(slots: Omit<Schedule, "id" | "createdAt">[]): Promise<Schedule[]>;
  update(id: number, patch: Partial<Schedule>): Promise<Schedule>;
  /** Пересчёт занятых мест. Дельта, а не абсолютное значение — так делает FSM. */
  changeBookedCount(id: number, delta: number): Promise<Schedule>;
  removeMany(ids: number[]): Promise<number>;
}

// --- Реализации ---------------------------------------------------------------

export class JsonClubsRepository implements ClubsRepository {
  constructor(private readonly storage: JsonStorage) {}

  async findAll(filter: PublicationStatusFilter = {}): Promise<Club[]> {
    const clubs = await this.storage.read("clubs");

    return filter.excludeHidden === true
      ? clubs.filter((club) => club.status !== "hidden")
      : clubs;
  }

  async findById(id: number): Promise<Club | null> {
    const clubs = await this.storage.read("clubs");

    return clubs.find((club) => club.id === id) ?? null;
  }

  async findBySlug(slug: string): Promise<Club | null> {
    const target = normalizeSlugLookupValue(slug);

    if (target === "") return null;

    const clubs = await this.storage.read("clubs");

    return (
      clubs.find((club) => normalizeSlugLookupValue(club.slug) === target) ??
      null
    );
  }

  async insert(club: Omit<Club, "id" | "createdAt">): Promise<Club> {
    const clubs = await this.storage.read("clubs");
    const created: Club = {
      id: this.storage.getNextEntityId(clubs),
      createdAt: new Date().toISOString(),
      ...club,
    };

    await this.storage.write("clubs", [...clubs, created]);

    return created;
  }

  async update(id: number, patch: Partial<Club>): Promise<Club> {
    const clubs = await this.storage.read("clubs");
    const index = clubs.findIndex((club) => club.id === id);

    if (index === -1) {
      throw new Error(`Клуб с id ${id} не найден`);
    }

    const updated: Club = { ...clubs[index], ...patch };
    const next = [...clubs];
    next[index] = updated;
    await this.storage.write("clubs", next);

    return updated;
  }

  async remove(id: number): Promise<void> {
    const clubs = await this.storage.read("clubs");

    await this.storage.write(
      "clubs",
      clubs.filter((club) => club.id !== id),
    );
  }
}

export class JsonTrainersRepository implements TrainersRepository {
  constructor(private readonly storage: JsonStorage) {}

  private async readNormalized(): Promise<Trainer[]> {
    const trainers = await this.storage.read("trainers");

    return trainers.map(normalizeTrainer);
  }

  async findAll(filter: PublicationStatusFilter = {}): Promise<Trainer[]> {
    const trainers = await this.readNormalized();

    return filter.excludeHidden === true
      ? trainers.filter((trainer) => trainer.status !== "hidden")
      : trainers;
  }

  async findById(id: number): Promise<Trainer | null> {
    const trainers = await this.readNormalized();

    return trainers.find((trainer) => trainer.id === id) ?? null;
  }

  async findBySlug(slug: string): Promise<Trainer | null> {
    const target = normalizeSlugLookupValue(slug);

    if (target === "") return null;

    const trainers = await this.readNormalized();

    return (
      trainers.find(
        (trainer) => normalizeSlugLookupValue(trainer.slug) === target,
      ) ?? null
    );
  }

  async insert(trainer: Omit<Trainer, "id" | "createdAt">): Promise<Trainer> {
    const trainers = await this.storage.read("trainers");
    const created: Trainer = {
      id: this.storage.getNextEntityId(trainers),
      createdAt: new Date().toISOString(),
      ...trainer,
    };

    await this.storage.write("trainers", [...trainers, created]);

    return created;
  }

  async update(id: number, patch: Partial<Trainer>): Promise<Trainer> {
    const trainers = await this.storage.read("trainers");
    const index = trainers.findIndex((trainer) => trainer.id === id);

    if (index === -1) {
      throw new Error(`Тренер с id ${id} не найден`);
    }

    const updated: Trainer = { ...trainers[index], ...patch };
    const next = [...trainers];
    next[index] = updated;
    await this.storage.write("trainers", next);

    return normalizeTrainer(updated);
  }

  async remove(id: number): Promise<void> {
    const trainers = await this.storage.read("trainers");

    await this.storage.write(
      "trainers",
      trainers.filter((trainer) => trainer.id !== id),
    );
  }
}

export class JsonScheduleRepository implements ScheduleRepository {
  constructor(private readonly storage: JsonStorage) {}

  private async readNormalized(): Promise<Schedule[]> {
    const [schedule, offerings] = await Promise.all([
      this.storage.read("schedule"),
      this.storage.read("offerings"),
    ]);
    const offeringsById = new Map(
      offerings.map((offering) => [offering.id, offering]),
    );

    return schedule.map((slot) => normalizeSchedule(slot, offeringsById));
  }

  async findMany(
    filter: { ownerType?: CatalogOwnerType | "all" } = {},
  ): Promise<Schedule[]> {
    const slots = await this.readNormalized();
    // Умолчание из db.ts: без указания владельца отдаются только клубные слоты.
    const ownerType = filter.ownerType ?? "club";

    return ownerType === "all"
      ? slots
      : slots.filter((slot) => slot.ownerType === ownerType);
  }

  async findById(id: number): Promise<Schedule | null> {
    const slots = await this.readNormalized();

    return slots.find((slot) => slot.id === id) ?? null;
  }

  async findByOfferingId(offeringId: number): Promise<Schedule[]> {
    const slots = await this.readNormalized();

    return slots.filter((slot) => slot.offeringId === offeringId);
  }

  async insertMany(
    slots: Omit<Schedule, "id" | "createdAt">[],
  ): Promise<Schedule[]> {
    if (slots.length === 0) return [];

    const schedule = await this.storage.read("schedule");
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

    await this.storage.write("schedule", [...schedule, ...created]);

    return created;
  }

  async update(id: number, patch: Partial<Schedule>): Promise<Schedule> {
    const schedule = await this.storage.read("schedule");
    const index = schedule.findIndex((slot) => slot.id === id);

    if (index === -1) {
      throw new Error(`Слот с id ${id} не найден`);
    }

    const updated: Schedule = { ...schedule[index], ...patch };
    const next = [...schedule];
    next[index] = updated;
    await this.storage.write("schedule", next);

    return updated;
  }

  async changeBookedCount(id: number, delta: number): Promise<Schedule> {
    const schedule = await this.storage.read("schedule");
    const index = schedule.findIndex((slot) => slot.id === id);

    if (index === -1) {
      throw new Error(`Слот с id ${id} не найден`);
    }

    // Отрицательного числа занятых мест быть не может — как в db.ts.
    const bookedCount = Math.max(0, schedule[index].bookedCount + delta);
    const updated: Schedule = { ...schedule[index], bookedCount };
    const next = [...schedule];
    next[index] = updated;
    await this.storage.write("schedule", next);

    return updated;
  }

  async removeMany(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;

    const schedule = await this.storage.read("schedule");
    const target = new Set(ids);
    const kept = schedule.filter((slot) => !target.has(slot.id));

    await this.storage.write("schedule", kept);

    return schedule.length - kept.length;
  }
}

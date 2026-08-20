// Исходный срез данных: то, что лежит в `data/*.json` перед переездом в базу.
//
// Зачем отдельный модуль, а не прямое чтение из скрипта переноса.
//
// 1. **В файлах есть поля, которых нет в типах.** `offerings[].affiliatedClubId`,
//    `schedule[].affiliatedClubId`, `trainer-club-links[].initiatedByUserId` — следы
//    прежних фаз. Они не мусор: для услуги 3 и слотов 4 и 5 это ЕДИНСТВЕННЫЙ след
//    клуба, в зале которого идёт занятие. Прочитать их через общие типы нельзя —
//    компилятор о них не знает, — поэтому здесь объявлены расширенные виды записей.
// 2. **Имена файлов остаются в одном месте.** Чтение идёт через `JsonStorage`:
//    единственный модуль проекта, который знает, что данные лежат в файлах.
//    Второй словарь имён файлов разъехался бы с первым при первом же переименовании.

import type {
  Amenity,
  Booking,
  City,
  Club,
  EntityId,
  LogEntry,
  Notification,
  Offering,
  ProviderClientNote,
  Review,
  Schedule,
  Specialty,
  Sport,
  Tag,
  Trainer,
  TrainerClubLink,
  User,
  WorkFormat,
} from '@sporthub/types';

import { JsonStorage } from '../json-storage';

/** Услуга в файле: сверх типа хранит прежнюю привязку к клубу. */
export type SourceOffering = Offering & { affiliatedClubId?: EntityId };

/** Слот в файле: та же прежняя привязка к клубу. */
export type SourceSchedule = Schedule & { affiliatedClubId?: EntityId };

/** Тренер в файле: два поля, удалённые из типа в фазе 25 (источник правды — связи). */
export type SourceTrainer = Trainer & { affiliatedClubId?: EntityId; clubId?: EntityId };

/** Связь в файле: инициатора-пользователя тип не объявляет, а данные хранят. */
export type SourceTrainerClubLink = TrainerClubLink & { initiatedByUserId?: EntityId };

/** Весь исходный срез — ровно семнадцать коллекций из `data/`. */
export type SourceData = {
  amenities: Amenity[];
  bookings: Booking[];
  cities: City[];
  clubs: Club[];
  logs: LogEntry[];
  notifications: Notification[];
  offerings: SourceOffering[];
  providerClientNotes: ProviderClientNote[];
  reviews: Review[];
  schedule: SourceSchedule[];
  specialties: Specialty[];
  sports: Sport[];
  tags: Tag[];
  trainers: SourceTrainer[];
  trainerClubLinks: SourceTrainerClubLink[];
  users: User[];
  workFormats: WorkFormat[];
};

/**
 * Прочитать срез целиком.
 *
 * Читается всё сразу и до единой записи в базу: перенос считает счётчики занятых мест
 * и рейтинги по фактическим записям и отзывам, то есть коллекции нужны ему одновременно.
 * Объём — четыре сотни записей, экономить на этом нечего.
 */
export async function readSourceData(dataDirectory: string): Promise<SourceData> {
  const storage = new JsonStorage(dataDirectory);

  const [
    amenities,
    bookings,
    cities,
    clubs,
    logs,
    notifications,
    offerings,
    providerClientNotes,
    reviews,
    schedule,
    specialties,
    sports,
    tags,
    trainers,
    trainerClubLinks,
    users,
    workFormats,
  ] = await Promise.all([
    storage.read('amenities'),
    storage.read('bookings'),
    storage.read('cities'),
    storage.read('clubs'),
    storage.read('logs'),
    storage.read('notifications'),
    storage.read('offerings'),
    storage.read('providerClientNotes'),
    storage.read('reviews'),
    storage.read('schedule'),
    storage.read('specialties'),
    storage.read('sports'),
    storage.read('tags'),
    storage.read('trainers'),
    storage.read('trainerClubLinks'),
    storage.read('users'),
    storage.read('workFormats'),
  ]);

  return {
    amenities,
    bookings,
    cities,
    clubs,
    logs,
    notifications,
    // Расширенные виды отличаются от общих типов только полями вне типов:
    // значения те же самые, приведение здесь ничего не меняет в данных.
    offerings: offerings as SourceOffering[],
    providerClientNotes,
    reviews,
    schedule: schedule as SourceSchedule[],
    specialties,
    sports,
    tags,
    trainers: trainers as SourceTrainer[],
    trainerClubLinks: trainerClubLinks as SourceTrainerClubLink[],
    users,
    workFormats,
  };
}

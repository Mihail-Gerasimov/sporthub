// Вид среза данных, которым засеивают базу.
//
// Чтение из `data/*.json` удалено в фазе 34 вместе с файловым хранилищем: переезд
// состоялся, источника больше нет. Сами типы остались — по ним собирают срез и сид
// для разработки, и обвязка тестов.
//
// Виды записей здесь шире общих типов, и это не случайность: `offerings[].affiliatedClubId`,
// `schedule[].affiliatedClubId`, `trainer-club-links[].initiatedByUserId` — следы прежних
// фаз, которые пережили переезд, потому что для части услуг и слотов это ЕДИНСТВЕННЫЙ
// след клуба, в зале которого идёт занятие.

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

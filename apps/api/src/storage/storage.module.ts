// Модуль данных: единственное место во всём бэкенде, где написано, ГДЕ лежат данные.
//
// Здесь и только здесь токены репозиториев связываются с реализациями. Сервисы,
// контроллеры и их тесты про хранилище не знают вовсе — это и есть то обещание,
// ради которого в фазе 32 заводились интерфейсы, а в фазе 33 оно исполняется:
// переезд на базу — правка этого файла, а не двадцати.
//
// ⚠️ Реализаций две, и файловая остаётся ЖИВОЙ до выкатки на боевой сервер.
// Это не «оставили на всякий случай»: пока данные не перенесены и не проверены
// на проде, возврат на файлы — единственный путь отката, и он обязан работать
// одной переменной окружения, а не откатом ветки.

import { Global, Module } from '@nestjs/common';

import {
  AMENITIES_REPOSITORY,
  CITIES_REPOSITORY,
  JsonCitiesRepository,
  JsonSimpleDictionaryRepository,
  SPECIALTIES_REPOSITORY,
  SPORTS_REPOSITORY,
  TAGS_REPOSITORY,
  WORK_FORMATS_REPOSITORY,
} from '../dictionaries/dictionaries.repository';
import { BOOKINGS_REPOSITORY, JsonBookingsRepository } from '../repositories/bookings.repository';
import {
  JsonNotificationsRepository,
  JsonOfferingsRepository,
  JsonTrainerClubLinksRepository,
  NOTIFICATIONS_REPOSITORY,
  OFFERINGS_REPOSITORY,
  TRAINER_CLUB_LINKS_REPOSITORY,
} from '../repositories/catalog.repository';
import {
  JsonLogsRepository,
  JsonProviderClientNotesRepository,
  JsonReviewsRepository,
  JsonUsersRepository,
  LOGS_REPOSITORY,
  PROVIDER_CLIENT_NOTES_REPOSITORY,
  REVIEWS_REPOSITORY,
  USERS_REPOSITORY,
} from '../repositories/crud.repository';
import {
  CLUBS_REPOSITORY,
  JsonClubsRepository,
  JsonScheduleRepository,
  JsonTrainersRepository,
  SCHEDULE_REPOSITORY,
  TRAINERS_REPOSITORY,
} from '../repositories/entities.repository';
import { PrismaBookingsRepository } from '../repositories/prisma/bookings.repository';
import {
  PrismaNotificationsRepository,
  PrismaOfferingsRepository,
  PrismaTrainerClubLinksRepository,
} from '../repositories/prisma/catalog.repository';
import {
  PrismaLogsRepository,
  PrismaProviderClientNotesRepository,
  PrismaReviewsRepository,
  PrismaUsersRepository,
} from '../repositories/prisma/crud.repository';
import {
  PrismaCitiesRepository,
  PrismaSimpleDictionaryRepository,
  PrismaSportsRepository,
} from '../repositories/prisma/dictionaries.repository';
import {
  PrismaClubsRepository,
  PrismaScheduleRepository,
  PrismaTrainersRepository,
} from '../repositories/prisma/entities.repository';
import { JsonStorage } from './json-storage';
import { PrismaTransactionRunner } from './prisma-transaction';
import { DATABASE_SETTINGS, PrismaService, readDatabaseSettings } from './prisma.service';
import { resolveDataDirectory } from './resolve-data-directory';
import { STORAGE_HEALTH } from './storage-health';
import { TRANSACTION_RUNNER } from './transaction-runner';

/**
 * Где лежат данные.
 *
 * `database` — обычный режим. `files` — путь отката и способ прогнать тот же набор
 * проверок на прежней реализации: совпадение результатов и есть доказательство,
 * что интерфейсы репозиториев не протекли деталями хранилища.
 */
export type StorageKind = 'database' | 'files';

export function resolveStorageKind(env: NodeJS.ProcessEnv = process.env): StorageKind {
  const value = env.SPORT_HUB_STORAGE;

  if (value === undefined || value === 'database') return 'database';
  if (value === 'files') return 'files';

  throw new Error(
    `Неизвестное значение SPORT_HUB_STORAGE: ${value}. Допустимо «database» или «files».`,
  );
}

/**
 * ⚠️ Выбор читается при КАЖДОМ создании репозитория, а не один раз при загрузке модуля.
 *
 * Загрузка модуля происходит на импорте — раньше, чем тест успевает выставить
 * переменную окружения. Один раз прочитанное значение навсегда прибило бы весь
 * прогон к одному хранилищу, и прогнать тот же набор на второй реализации стало
 * бы нечем.
 */
const useDatabase = (): boolean => resolveStorageKind() === 'database';

/**
 * Простые справочники отличаются только именем коллекции — у файлов — и именем
 * таблицы — у базы. Одно объявление на пять справочников вместо десяти провайдеров.
 */
const simpleDictionary = (
  collection: Parameters<JsonStorage['read']>[0],
  table: 'tag' | 'amenity' | 'specialty' | 'workFormat',
) => ({
  useFactory: (transactions: PrismaTransactionRunner, storage: JsonStorage) =>
    useDatabase()
      ? new PrismaSimpleDictionaryRepository(transactions, table)
      : new JsonSimpleDictionaryRepository(storage, collection),
  inject: [PrismaTransactionRunner, JsonStorage],
});

/** Провайдер репозитория: пара «реализация на базе» и «реализация на файлах». */
const repository = <TPrisma, TJson>(
  OnDatabase: new (transactions: PrismaTransactionRunner) => TPrisma,
  OnFiles: new (storage: JsonStorage) => TJson,
) => ({
  useFactory: (transactions: PrismaTransactionRunner, storage: JsonStorage) =>
    useDatabase() ? new OnDatabase(transactions) : new OnFiles(storage),
  inject: [PrismaTransactionRunner, JsonStorage],
});

@Global()
@Module({
  providers: [
    // Поднимается только выбранное хранилище. Иначе режим отката всё равно
    // открывал бы соединение с базой и падал бы на её отсутствии — то есть
    // откат не работал бы ровно тогда, когда он нужен.
    // Оба хранилища объявлены всегда. Соединение с базой открывается лениво,
    // при первом обращении к клиенту, поэтому в режиме отката оно не откроется вовсе.
    {
      provide: DATABASE_SETTINGS,
      useFactory: () => (useDatabase() ? readDatabaseSettings() : null),
    },
    PrismaService,
    PrismaTransactionRunner,
    { provide: JsonStorage, useFactory: () => new JsonStorage(resolveDataDirectory()) },

    // --- Транзакции и живость: сервисам достаётся только они ---
    {
      provide: TRANSACTION_RUNNER,
      useFactory: (onDatabase: PrismaTransactionRunner, onFiles: JsonStorage) =>
        useDatabase() ? onDatabase : onFiles,
      inject: [PrismaTransactionRunner, JsonStorage],
    },
    {
      provide: STORAGE_HEALTH,
      useFactory: (onDatabase: PrismaService, onFiles: JsonStorage) =>
        useDatabase() ? onDatabase : onFiles,
      inject: [PrismaService, JsonStorage],
    },

    // --- Справочники ---
    {
      provide: SPORTS_REPOSITORY,
      useFactory: (transactions: PrismaTransactionRunner, storage: JsonStorage) =>
        useDatabase()
          ? new PrismaSportsRepository(transactions)
          : new JsonSimpleDictionaryRepository(storage, 'sports'),
      inject: [PrismaTransactionRunner, JsonStorage],
    },
    { provide: TAGS_REPOSITORY, ...simpleDictionary('tags', 'tag') },
    { provide: AMENITIES_REPOSITORY, ...simpleDictionary('amenities', 'amenity') },
    { provide: WORK_FORMATS_REPOSITORY, ...simpleDictionary('workFormats', 'workFormat') },
    { provide: SPECIALTIES_REPOSITORY, ...simpleDictionary('specialties', 'specialty') },
    { provide: CITIES_REPOSITORY, ...repository(PrismaCitiesRepository, JsonCitiesRepository) },

    // --- Публикации ---
    { provide: CLUBS_REPOSITORY, ...repository(PrismaClubsRepository, JsonClubsRepository) },
    {
      provide: TRAINERS_REPOSITORY,
      ...repository(PrismaTrainersRepository, JsonTrainersRepository),
    },
    {
      provide: SCHEDULE_REPOSITORY,
      ...repository(PrismaScheduleRepository, JsonScheduleRepository),
    },

    // --- Каталог ---
    {
      provide: TRAINER_CLUB_LINKS_REPOSITORY,
      ...repository(PrismaTrainerClubLinksRepository, JsonTrainerClubLinksRepository),
    },
    {
      provide: OFFERINGS_REPOSITORY,
      ...repository(PrismaOfferingsRepository, JsonOfferingsRepository),
    },
    {
      provide: NOTIFICATIONS_REPOSITORY,
      ...repository(PrismaNotificationsRepository, JsonNotificationsRepository),
    },

    // --- Пользователи, отзывы, журнал, заметки ---
    { provide: LOGS_REPOSITORY, ...repository(PrismaLogsRepository, JsonLogsRepository) },
    { provide: REVIEWS_REPOSITORY, ...repository(PrismaReviewsRepository, JsonReviewsRepository) },
    { provide: USERS_REPOSITORY, ...repository(PrismaUsersRepository, JsonUsersRepository) },
    {
      provide: PROVIDER_CLIENT_NOTES_REPOSITORY,
      ...repository(PrismaProviderClientNotesRepository, JsonProviderClientNotesRepository),
    },

    // --- Записи ---
    {
      provide: BOOKINGS_REPOSITORY,
      ...repository(PrismaBookingsRepository, JsonBookingsRepository),
    },
  ],
  exports: [
    TRANSACTION_RUNNER,
    STORAGE_HEALTH,
    SPORTS_REPOSITORY,
    TAGS_REPOSITORY,
    AMENITIES_REPOSITORY,
    WORK_FORMATS_REPOSITORY,
    SPECIALTIES_REPOSITORY,
    CITIES_REPOSITORY,
    LOGS_REPOSITORY,
    REVIEWS_REPOSITORY,
    USERS_REPOSITORY,
    PROVIDER_CLIENT_NOTES_REPOSITORY,
    TRAINER_CLUB_LINKS_REPOSITORY,
    OFFERINGS_REPOSITORY,
    NOTIFICATIONS_REPOSITORY,
    CLUBS_REPOSITORY,
    TRAINERS_REPOSITORY,
    SCHEDULE_REPOSITORY,
    BOOKINGS_REPOSITORY,
  ],
})
export class StorageModule {}

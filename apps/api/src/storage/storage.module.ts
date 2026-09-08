// Модуль данных: единственное место во всём бэкенде, где написано, ГДЕ лежат данные.
//
// Здесь и только здесь токены репозиториев связываются с реализациями. Сервисы,
// контроллеры и их тесты про хранилище не знают вовсе — это и есть то обещание,
// ради которого в фазе 32 заводились интерфейсы, а в фазе 33 оно исполнилось:
// переезд на базу оказался правкой этого файла, а не двадцати.
//
// Реализация одна — база. Файловая удалена в фазе 34 (этап Э0a) вместе с выбором
// хранилища: пока данные не были перенесены и проверены, возврат на файлы оставался
// путём отката и обязан был работать одной переменной окружения. Данные перенесены,
// решение заказчика — путь отката закрыть. Цена второй реализации была не в её
// поддержке, а в том, что КАЖДАЯ новая таблица требовала бы вторую реализацию,
// заведомо идущую в мусор.

import { Global, Module } from '@nestjs/common';

import {
  AMENITIES_REPOSITORY,
  CITIES_REPOSITORY,
  SPECIALTIES_REPOSITORY,
  SPORTS_REPOSITORY,
  TAGS_REPOSITORY,
  WORK_FORMATS_REPOSITORY,
} from '../dictionaries/dictionaries.repository';
import { BOOKINGS_REPOSITORY } from '../repositories/bookings.repository';
import {
  NOTIFICATIONS_REPOSITORY,
  OFFERINGS_REPOSITORY,
  TRAINER_CLUB_LINKS_REPOSITORY,
} from '../repositories/catalog.repository';
import {
  LOGS_REPOSITORY,
  PROVIDER_CLIENT_NOTES_REPOSITORY,
  REVIEWS_REPOSITORY,
  USERS_REPOSITORY,
} from '../repositories/crud.repository';
import {
  CLUBS_REPOSITORY,
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
import { PrismaTransactionRunner } from './prisma-transaction';
import { DATABASE_SETTINGS, PrismaService, readDatabaseSettings } from './prisma.service';
import { STORAGE_HEALTH } from './storage-health';
import { TRANSACTION_RUNNER } from './transaction-runner';

/**
 * Простые справочники отличаются только именем таблицы. Одно объявление на четыре
 * справочника вместо четырёх одинаковых провайдеров.
 */
const simpleDictionary = (table: 'tag' | 'amenity' | 'specialty' | 'workFormat') => ({
  useFactory: (transactions: PrismaTransactionRunner) =>
    new PrismaSimpleDictionaryRepository(transactions, table),
  inject: [PrismaTransactionRunner],
});

/** Провайдер репозитория: реализация одна, различается только классом. */
const repository = <TRepository>(
  Implementation: new (transactions: PrismaTransactionRunner) => TRepository,
) => ({
  useFactory: (transactions: PrismaTransactionRunner) => new Implementation(transactions),
  inject: [PrismaTransactionRunner],
});

@Global()
@Module({
  providers: [
    // Соединение открывается лениво, при первом обращении к клиенту: процесс
    // поднимается и без живой базы, а недоступность видна честной ошибкой,
    // а не падением на старте.
    { provide: DATABASE_SETTINGS, useFactory: () => readDatabaseSettings() },
    PrismaService,
    PrismaTransactionRunner,

    // --- Транзакции и живость: сервисам достаётся только они ---
    { provide: TRANSACTION_RUNNER, useExisting: PrismaTransactionRunner },
    { provide: STORAGE_HEALTH, useExisting: PrismaService },

    // --- Справочники ---
    { provide: SPORTS_REPOSITORY, ...repository(PrismaSportsRepository) },
    { provide: TAGS_REPOSITORY, ...simpleDictionary('tag') },
    { provide: AMENITIES_REPOSITORY, ...simpleDictionary('amenity') },
    { provide: WORK_FORMATS_REPOSITORY, ...simpleDictionary('workFormat') },
    { provide: SPECIALTIES_REPOSITORY, ...simpleDictionary('specialty') },
    { provide: CITIES_REPOSITORY, ...repository(PrismaCitiesRepository) },

    // --- Публикации ---
    { provide: CLUBS_REPOSITORY, ...repository(PrismaClubsRepository) },
    { provide: TRAINERS_REPOSITORY, ...repository(PrismaTrainersRepository) },
    { provide: SCHEDULE_REPOSITORY, ...repository(PrismaScheduleRepository) },

    // --- Каталог ---
    { provide: TRAINER_CLUB_LINKS_REPOSITORY, ...repository(PrismaTrainerClubLinksRepository) },
    { provide: OFFERINGS_REPOSITORY, ...repository(PrismaOfferingsRepository) },
    { provide: NOTIFICATIONS_REPOSITORY, ...repository(PrismaNotificationsRepository) },

    // --- Пользователи, отзывы, журнал, заметки ---
    { provide: LOGS_REPOSITORY, ...repository(PrismaLogsRepository) },
    { provide: REVIEWS_REPOSITORY, ...repository(PrismaReviewsRepository) },
    { provide: USERS_REPOSITORY, ...repository(PrismaUsersRepository) },
    {
      provide: PROVIDER_CLIENT_NOTES_REPOSITORY,
      ...repository(PrismaProviderClientNotesRepository),
    },

    // --- Записи ---
    { provide: BOOKINGS_REPOSITORY, ...repository(PrismaBookingsRepository) },
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

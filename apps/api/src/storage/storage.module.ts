// Модуль данных: связывает токены репозиториев с JSON-реализациями.
//
// Это единственное место во всём бэкенде, где написано, что данные лежат
// в файлах. В фазе базы здесь меняются реализации на Prisma-версии — сервисы
// и их тесты не трогаются вовсе. Проверяется это подменой реализации в тестах:
// набор проверок обязан пройти на обеих.

import { Global, Module } from "@nestjs/common";

import {
  AMENITIES_REPOSITORY,
  CITIES_REPOSITORY,
  JsonCitiesRepository,
  JsonSimpleDictionaryRepository,
  SPECIALTIES_REPOSITORY,
  SPORTS_REPOSITORY,
  TAGS_REPOSITORY,
  WORK_FORMATS_REPOSITORY,
} from "../dictionaries/dictionaries.repository";
import {
  BOOKINGS_REPOSITORY,
  JsonBookingsRepository,
} from "../repositories/bookings.repository";
import {
  JsonNotificationsRepository,
  JsonOfferingsRepository,
  JsonTrainerClubLinksRepository,
  NOTIFICATIONS_REPOSITORY,
  OFFERINGS_REPOSITORY,
  TRAINER_CLUB_LINKS_REPOSITORY,
} from "../repositories/catalog.repository";
import {
  JsonLogsRepository,
  JsonProviderClientNotesRepository,
  JsonReviewsRepository,
  JsonUsersRepository,
  LOGS_REPOSITORY,
  PROVIDER_CLIENT_NOTES_REPOSITORY,
  REVIEWS_REPOSITORY,
  USERS_REPOSITORY,
} from "../repositories/crud.repository";
import {
  CLUBS_REPOSITORY,
  JsonClubsRepository,
  JsonScheduleRepository,
  JsonTrainersRepository,
  SCHEDULE_REPOSITORY,
  TRAINERS_REPOSITORY,
} from "../repositories/entities.repository";
import { JsonStorage } from "./json-storage";
import { resolveDataDirectory } from "./resolve-data-directory";

/** Простые справочники отличаются только именем коллекции. */
const simpleDictionary = (collection: Parameters<JsonStorage["read"]>[0]) => ({
  useFactory: (storage: JsonStorage) =>
    new JsonSimpleDictionaryRepository(storage, collection),
  inject: [JsonStorage],
});

@Global()
@Module({
  providers: [
    {
      provide: JsonStorage,
      useFactory: () => new JsonStorage(resolveDataDirectory()),
    },
    { provide: SPORTS_REPOSITORY, ...simpleDictionary("sports") },
    { provide: TAGS_REPOSITORY, ...simpleDictionary("tags") },
    { provide: AMENITIES_REPOSITORY, ...simpleDictionary("amenities") },
    { provide: WORK_FORMATS_REPOSITORY, ...simpleDictionary("workFormats") },
    { provide: SPECIALTIES_REPOSITORY, ...simpleDictionary("specialties") },
    {
      provide: CITIES_REPOSITORY,
      useFactory: (storage: JsonStorage) => new JsonCitiesRepository(storage),
      inject: [JsonStorage],
    },
    {
      provide: LOGS_REPOSITORY,
      useFactory: (storage: JsonStorage) => new JsonLogsRepository(storage),
      inject: [JsonStorage],
    },
    {
      provide: REVIEWS_REPOSITORY,
      useFactory: (storage: JsonStorage) => new JsonReviewsRepository(storage),
      inject: [JsonStorage],
    },
    {
      provide: USERS_REPOSITORY,
      useFactory: (storage: JsonStorage) => new JsonUsersRepository(storage),
      inject: [JsonStorage],
    },
    {
      provide: PROVIDER_CLIENT_NOTES_REPOSITORY,
      useFactory: (storage: JsonStorage) =>
        new JsonProviderClientNotesRepository(storage),
      inject: [JsonStorage],
    },
    {
      provide: TRAINER_CLUB_LINKS_REPOSITORY,
      useFactory: (storage: JsonStorage) =>
        new JsonTrainerClubLinksRepository(storage),
      inject: [JsonStorage],
    },
    {
      provide: OFFERINGS_REPOSITORY,
      useFactory: (storage: JsonStorage) =>
        new JsonOfferingsRepository(storage),
      inject: [JsonStorage],
    },
    {
      provide: NOTIFICATIONS_REPOSITORY,
      useFactory: (storage: JsonStorage) =>
        new JsonNotificationsRepository(storage),
      inject: [JsonStorage],
    },
    {
      provide: CLUBS_REPOSITORY,
      useFactory: (storage: JsonStorage) => new JsonClubsRepository(storage),
      inject: [JsonStorage],
    },
    {
      provide: TRAINERS_REPOSITORY,
      useFactory: (storage: JsonStorage) => new JsonTrainersRepository(storage),
      inject: [JsonStorage],
    },
    {
      provide: SCHEDULE_REPOSITORY,
      useFactory: (storage: JsonStorage) => new JsonScheduleRepository(storage),
      inject: [JsonStorage],
    },
    {
      provide: BOOKINGS_REPOSITORY,
      useFactory: (storage: JsonStorage) => new JsonBookingsRepository(storage),
      inject: [JsonStorage],
    },
  ],
  exports: [
    JsonStorage,
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

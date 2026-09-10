// Выборки каталога: публичные списки клубов и тренеров, детальные карточки.
//
// Это сервис, а не метод репозитория: детальная карточка собирает данные пяти
// доменов, а фильтр поиска джойнит клуб со справочником тегов. Репозиторий
// обязан отвечать за одну коллекцию, иначе в фазе базы такой метод не станет
// обычным запросом.

import { Inject, Injectable } from '@nestjs/common';
import {
  computeProviderReliabilityFromCounts,
  PROVIDER_RELIABILITY_STATUSES,
  type ProviderReliabilityCounts,
} from '@sporthub/domain';
import type { BookingStatus, Club, ReliabilityResult, Sport, Trainer, User } from '@sporthub/types';

import { NotFoundError } from '../common/domain-error';
import type {
  CitiesRepository,
  SimpleDictionaryRepository,
} from '../dictionaries/dictionaries.repository';
import {
  CITIES_REPOSITORY,
  SPORTS_REPOSITORY,
  TAGS_REPOSITORY,
} from '../dictionaries/dictionaries.repository';
import type { BookingsRepository } from '../repositories/bookings.repository';
import { BOOKINGS_REPOSITORY } from '../repositories/bookings.repository';
import type {
  OfferingsRepository,
  TrainerClubLinksRepository,
} from '../repositories/catalog.repository';
import {
  OFFERINGS_REPOSITORY,
  TRAINER_CLUB_LINKS_REPOSITORY,
} from '../repositories/catalog.repository';
import type { ReviewsRepository, UsersRepository } from '../repositories/crud.repository';
import { REVIEWS_REPOSITORY, USERS_REPOSITORY } from '../repositories/crud.repository';
import type {
  ClubsRepository,
  ScheduleRepository,
  TrainersRepository,
} from '../repositories/entities.repository';
import {
  CLUBS_REPOSITORY,
  SCHEDULE_REPOSITORY,
  TRAINERS_REPOSITORY,
} from '../repositories/entities.repository';
import {
  stripOptionalPublicationOwner,
  stripPublicationOwner,
  type PublicClub,
  type PublicTrainer,
} from './public-view';

/** Надёжность публикаций одной выдачи: отдельно клубы, отдельно тренеры. */
export interface ReliabilityByOwner {
  clubs: Map<number, ReliabilityResult>;
  trainers: Map<number, ReliabilityResult>;
}

/**
 * Статус записи → поле счётчика надёжности.
 *
 * Словарь, а не цепочка условий: добавить статус в расчёт станет правкой ОДНОЙ
 * строки здесь и одной в объявлении статусов, а не поиском всех мест, где статусы
 * перечислены руками.
 */
const COUNTS_FIELD_BY_STATUS: Partial<Record<BookingStatus, keyof ProviderReliabilityCounts>> = {
  completed: 'completed',
  no_show: 'noShow',
  cancelled_by_provider: 'cancelledByProvider',
  rejected_by_provider: 'rejectedByProvider',
};

const emptyCounts = (): ProviderReliabilityCounts => ({
  completed: 0,
  noShow: 0,
  cancelledByProvider: 0,
  rejectedByProvider: 0,
});

@Injectable()
export class CatalogQueryService {
  constructor(
    @Inject(CLUBS_REPOSITORY) private readonly clubs: ClubsRepository,
    @Inject(TRAINERS_REPOSITORY) private readonly trainers: TrainersRepository,
    @Inject(OFFERINGS_REPOSITORY)
    private readonly offerings: OfferingsRepository,
    @Inject(SCHEDULE_REPOSITORY) private readonly schedule: ScheduleRepository,
    @Inject(REVIEWS_REPOSITORY) private readonly reviews: ReviewsRepository,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(BOOKINGS_REPOSITORY) private readonly bookings: BookingsRepository,
    @Inject(TRAINER_CLUB_LINKS_REPOSITORY)
    private readonly links: TrainerClubLinksRepository,
    @Inject(CITIES_REPOSITORY) private readonly cities: CitiesRepository,
    @Inject(TAGS_REPOSITORY)
    private readonly tags: SimpleDictionaryRepository<{
      id: number;
      name: string;
    }>,
    @Inject(SPORTS_REPOSITORY)
    private readonly sports: SimpleDictionaryRepository<Sport>,
  ) {}

  /** Виды спорта публикации в порядке справочника — так их отдавали раньше. */
  private async resolveSports(sportIds: readonly number[]): Promise<Sport[]> {
    const all = await this.sports.findAll();

    return all.filter((sport) => sportIds.includes(sport.id));
  }

  /**
   * Надёжность перечисленных публикаций — запросом-агрегатом.
   *
   * ⚠️ Записи здесь НЕ поднимаются вовсе, и это главное свойство метода. Сначала
   * читалась вся таблица записей платформы, потом — записи только нужных публикаций
   * и только значимых статусов; но и это остаётся выдачей строк ради восьми чисел
   * на карточку. База умеет посчитать сама, и здесь она это и делает: один обход
   * таблицы отдаёт счётчики по публикациям и статусам, а формула надёжности —
   * та же самая, из `@sporthub/domain`.
   *
   * Публикация без единой записи обязана получить результат, а не пропуск: карта
   * заполняется нулями заранее, иначе новый клуб приходил бы на фронт без поля,
   * и «нет записей» стало бы неотличимо от «надёжность не посчитали».
   */
  async reliabilityFor(owners: {
    clubIds: number[];
    trainerIds: number[];
  }): Promise<ReliabilityByOwner> {
    const clubs = new Map(owners.clubIds.map((id) => [id, emptyCounts()]));
    const trainers = new Map(owners.trainerIds.map((id) => [id, emptyCounts()]));

    if (clubs.size > 0 || trainers.size > 0) {
      const rows = await this.bookings.countByOwnerAndStatus({
        owners,
        // Набор статусов берётся из того же объявления, которым пользуется расчёт:
        // повторив список своими словами, запрос разошёлся бы с ним молча.
        status: [...PROVIDER_RELIABILITY_STATUSES],
      });

      for (const row of rows) {
        // Строка чужой публикации — законная: отбор по клубам ловит и тренерские
        // занятия в их залах, а значит приносит счётчики тренеров, о которых
        // не спрашивали. Такие строки просто некуда положить.
        const counts = (row.type === 'club' ? clubs : trainers).get(row.id);
        const field = COUNTS_FIELD_BY_STATUS[row.status];

        if (counts !== undefined && field !== undefined) counts[field] += row.count;
      }
    }

    return {
      clubs: new Map(
        [...clubs].map(([id, counts]) => [id, computeProviderReliabilityFromCounts(counts)]),
      ),
      trainers: new Map(
        [...trainers].map(([id, counts]) => [id, computeProviderReliabilityFromCounts(counts)]),
      ),
    };
  }

  /** Поиск по адресу-ссылке. Сравнение нечувствительно к регистру и кодировке. */
  findClubBySlug(slug: string): Promise<Club | null> {
    return this.clubs.findBySlug(slug);
  }

  findTrainerBySlug(slug: string): Promise<Trainer | null> {
    return this.trainers.findBySlug(slug);
  }

  findClub(clubId: number): Promise<Club | null> {
    return this.clubs.findById(clubId);
  }

  findTrainer(trainerId: number): Promise<Trainer | null> {
    return this.trainers.findById(trainerId);
  }

  /** Пользователь обязан существовать — иначе публикацию не к кому привязать. */
  async requireUser(userId: number): Promise<User> {
    const user = await this.users.findById(userId);

    if (!user) {
      throw new NotFoundError('Пользователь не найден');
    }

    return user;
  }

  /** Новый город запоминается при публикации. Дубликаты не создаются. */
  async rememberCity(
    name: string | undefined,
    coordinates: { lat: number; lng: number } | undefined,
  ): Promise<void> {
    if (!name || !coordinates) return;

    await this.cities.findOrCreateByName({ name, coordinates });
  }

  /**
   * Публичный список клубов.
   *
   * ⚠️ Тип выдачи — `PublicClub`, а не `Club`, и это не косметика: номер
   * владельца из публичного каталога убран (шаг 35.20a), а компилятор не даст
   * вернуть отсюда полную сущность и вернуть поле обратно случайно.
   */
  async findPublishedClubs(filter: {
    sportId?: number;
    search?: string;
    minRating?: number;
    /** Все скрытые — только модератору (шаг 36.14). */
    includeHidden?: boolean;
    /** Скрытые ЭТОГО владельца — его кабинету. Условие уходит в запрос. */
    includeHiddenOwnedBy?: number;
  }): Promise<PublicClub[]> {
    // Вид спорта и рейтинг — условия запроса: под них есть связующая таблица
    // и индекс с рейтингом в ключе. Раньше оба отсеивались уже после того, как
    // из базы поднялась вся таблица публикаций.
    let clubs = await this.clubs.findAll({
      excludeHidden: !filter.includeHidden,
      includeHiddenOwnedBy: filter.includeHiddenOwnedBy,
      sportId: filter.sportId,
      minRating: filter.minRating,
    });

    if (filter.search !== undefined) {
      // Поиск идёт и по названиям тегов, поэтому справочник подтягивается.
      const needle = filter.search.toLowerCase();
      const tags = await this.tags.findAll();
      const tagNameById = new Map(tags.map((tag) => [tag.id, tag.name]));

      clubs = clubs.filter((club) => {
        const haystack = [
          club.name,
          club.shortDescription,
          club.description,
          club.address,
          ...club.tagIds.map((id) => tagNameById.get(id) ?? ''),
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(needle);
      });
    }

    return clubs.map(stripPublicationOwner);
  }

  /** Публичный список тренеров. Номер владельца убран, как и у клубов. */
  async findPublishedTrainers(filter: {
    clubId?: number;
    sportId?: number;
    includeHidden?: boolean;
    includeHiddenOwnedBy?: number;
  }): Promise<PublicTrainer[]> {
    // Тренеры клуба — только через подтверждённую связь. Номера берутся ПЕРВЫМ
    // запросом и уходят условием во второй: раньше поднимались все тренеры
    // платформы и отсеивались по множеству в памяти.
    let ids: number[] | undefined;

    if (filter.clubId !== undefined) {
      const confirmed = await this.links.findMany({
        clubId: filter.clubId,
        status: 'confirmed',
      });

      ids = [...new Set(confirmed.map((link) => link.trainerId))];
    }

    const trainers = await this.trainers.findAll({
      excludeHidden: !filter.includeHidden,
      includeHiddenOwnedBy: filter.includeHiddenOwnedBy,
      ids,
      sportId: filter.sportId,
    });

    return trainers.map(stripPublicationOwner);
  }

  /** Детальная карточка клуба: тренеры через связи, расписание и отзывы по времени. */
  async getClubDetail(clubId: number): Promise<unknown | null> {
    const club = await this.clubs.findById(clubId);

    if (!club) return null;

    // ⚠️ Связи запрашиваются ПЕРВЫМИ, потому что от них зависят номера тренеров.
    // Раньше вместо этого поднимались ВСЕ тренеры платформы и ВСЁ расписание клубов,
    // а лишнее отсеивалось в памяти — карточка одного клуба стоила двух полных таблиц.
    const confirmed = await this.links.findMany({ clubId, status: 'confirmed' });
    const trainerIds = [...new Set(confirmed.map((link) => link.trainerId))];

    const [primaryOffering, clubTrainers, slots, allReviews, sports, reliability] =
      await Promise.all([
        this.offerings.findFirst({ ownerType: 'club', ownerId: clubId }),
        this.trainers.findAll({ ids: trainerIds }),
        // Порядок задаёт запрос: сортировать после чтения можно было, пока читалось всё.
        this.schedule.findMany({ ownerType: 'club', clubId, order: 'dateTime' }),
        this.reviews.findMany({ clubId, order: 'newest' }),
        this.resolveSports(club.sportIds),
        // Бейдж надёжности едет вместе с карточкой. Раньше его считал фронт, для чего
        // забирал записи ВСЕЙ площадки; после закрытия полного среза публичная
        // страница просто перестала открываться.
        this.reliabilityFor({ clubIds: [clubId], trainerIds: [] }),
      ]);

    return {
      // Номер владельца убран и у самого клуба, и у его тренеров (шаг 35.20a):
      // карточка клуба — такая же публичная выдача, как и список каталога,
      // а тренеры клуба принадлежат другим людям, и их владельцев тут тем более
      // сообщать нечему.
      club: { ...stripPublicationOwner(club), reliability: reliability.clubs.get(clubId) },
      primaryOffering,
      sports,
      // Порядок «сначала с высоким рейтингом» остаётся в памяти намеренно: тренеров
      // у клуба единицы, а условие отбора у них — номера, не рейтинг.
      trainers: [...clubTrainers]
        .sort((left, right) => right.rating - left.rating)
        .map(stripPublicationOwner),
      schedule: slots,
      // Отзывы приходят из запроса уже «свежие первыми», с тай-брейкером по номеру.
      reviews: allReviews,
    };
  }

  /** Детальная карточка тренера. Первая услуга считается основной. */
  async getTrainerDetail(trainerId: number): Promise<unknown | null> {
    const trainer = await this.trainers.findById(trainerId);

    if (!trainer) return null;

    const [offerings, trainerSchedule, allReviews, confirmed, sports, reliability] =
      await Promise.all([
        this.offerings.findMany({ ownerType: 'trainer', ownerId: trainerId }),
        // Отбор по тренеру и порядок — в запросе: раньше поднималось всё тренерское
        // расписание платформы и отсеивалось в памяти.
        this.schedule.findMany({ ownerType: 'trainer', trainerId, order: 'dateTime' }),
        this.reviews.findMany({ trainerId, order: 'newest' }),
        this.links.findMany({ trainerId, status: 'confirmed' }),
        this.resolveSports(trainer.sportIds),
        // Симметрично карточке клуба: надёжность приходит числом, а не пачкой записей.
        this.reliabilityFor({ clubIds: [], trainerIds: [trainerId] }),
      ]);

    const venueClubId = confirmed[0]?.clubId;
    // Клуб-площадка тем более чужой: он принадлежит другому человеку,
    // и его владельца публичная карточка тренера сообщать не должна.
    const affiliatedClub = stripOptionalPublicationOwner(
      venueClubId === undefined ? null : await this.clubs.findById(venueClubId),
    );

    return {
      trainer: {
        ...stripPublicationOwner(trainer),
        reliability: reliability.trainers.get(trainerId),
      },
      affiliatedClub,
      // Дубли ключей сохранены намеренно: на них завязан прежний фронт.
      club: affiliatedClub,
      primaryOffering: offerings[0] ?? null,
      additionalOfferings: offerings.slice(1).map((offering) => ({
        offering,
        schedules: trainerSchedule.filter((slot) => slot.offeringId === offering.id),
      })),
      offerings: [...offerings].sort((left, right) => left.price - right.price),
      // Основной вид спорта продублирован под двумя именами — на обоих
      // завязан прежний фронт.
      primarySport: sports[0] ?? null,
      sport: sports[0] ?? null,
      sports,
      schedule: trainerSchedule,
      // Отзывы приходят из запроса уже «свежие первыми», с тай-брейкером по номеру.
      reviews: allReviews,
    };
  }
}

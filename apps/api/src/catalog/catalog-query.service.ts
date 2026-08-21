// Выборки каталога: публичные списки клубов и тренеров, детальные карточки.
//
// Это сервис, а не метод репозитория: детальная карточка собирает данные пяти
// доменов, а фильтр поиска джойнит клуб со справочником тегов. Репозиторий
// обязан отвечать за одну коллекцию, иначе в фазе базы такой метод не станет
// обычным запросом.

import { Inject, Injectable } from '@nestjs/common';
import type { Booking, Club, Sport, Trainer, User } from '@sporthub/types';

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

  allBookings(): Promise<Booking[]> {
    return this.bookings.findAll();
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

  async findPublishedClubs(filter: {
    sportId?: number;
    search?: string;
    minRating?: number;
    includeHidden?: boolean;
  }): Promise<Club[]> {
    // Вид спорта и рейтинг — условия запроса: под них есть связующая таблица
    // и индекс с рейтингом в ключе. Раньше оба отсеивались уже после того, как
    // из базы поднялась вся таблица публикаций.
    let clubs = await this.clubs.findAll({
      excludeHidden: !filter.includeHidden,
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

    return clubs;
  }

  async findPublishedTrainers(filter: {
    clubId?: number;
    sportId?: number;
    includeHidden?: boolean;
  }): Promise<Trainer[]> {
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

    return this.trainers.findAll({
      excludeHidden: !filter.includeHidden,
      ids,
      sportId: filter.sportId,
    });
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

    const [primaryOffering, clubTrainers, slots, allReviews, sports] = await Promise.all([
      this.offerings.findFirst({ ownerType: 'club', ownerId: clubId }),
      this.trainers.findAll({ ids: trainerIds }),
      // Порядок задаёт запрос: сортировать после чтения можно было, пока читалось всё.
      this.schedule.findMany({ ownerType: 'club', clubId, order: 'dateTime' }),
      this.reviews.findMany({ clubId, order: 'newest' }),
      this.resolveSports(club.sportIds),
    ]);

    return {
      club,
      primaryOffering,
      sports,
      // Порядок «сначала с высоким рейтингом» остаётся в памяти намеренно: тренеров
      // у клуба единицы, а условие отбора у них — номера, не рейтинг.
      trainers: [...clubTrainers].sort((left, right) => right.rating - left.rating),
      schedule: slots,
      // Отзывы приходят из запроса уже «свежие первыми», с тай-брейкером по номеру.
      reviews: allReviews,
    };
  }

  /** Детальная карточка тренера. Первая услуга считается основной. */
  async getTrainerDetail(trainerId: number): Promise<unknown | null> {
    const trainer = await this.trainers.findById(trainerId);

    if (!trainer) return null;

    const [offerings, trainerSchedule, allReviews, confirmed, sports] = await Promise.all([
      this.offerings.findMany({ ownerType: 'trainer', ownerId: trainerId }),
      // Отбор по тренеру и порядок — в запросе: раньше поднималось всё тренерское
      // расписание платформы и отсеивалось в памяти.
      this.schedule.findMany({ ownerType: 'trainer', trainerId, order: 'dateTime' }),
      this.reviews.findMany({ trainerId, order: 'newest' }),
      this.links.findMany({ trainerId, status: 'confirmed' }),
      this.resolveSports(trainer.sportIds),
    ]);

    const venueClubId = confirmed[0]?.clubId;
    const affiliatedClub =
      venueClubId === undefined ? null : await this.clubs.findById(venueClubId);

    return {
      trainer,
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

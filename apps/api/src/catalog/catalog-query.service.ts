// Выборки каталога: публичные списки клубов и тренеров, детальные карточки.
//
// Это сервис, а не метод репозитория: детальная карточка собирает данные пяти
// доменов, а фильтр поиска джойнит клуб со справочником тегов. Репозиторий
// обязан отвечать за одну коллекцию, иначе в фазе базы такой метод не станет
// обычным запросом.

import { Inject, Injectable } from '@nestjs/common';
import { compareByCreatedAtDesc } from '@sporthub/domain';
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
    let clubs = await this.clubs.findAll({ excludeHidden: !filter.includeHidden });

    if (filter.sportId !== undefined) {
      clubs = clubs.filter((club) => club.sportIds.includes(filter.sportId as number));
    }

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

    if (filter.minRating !== undefined) {
      clubs = clubs.filter((club) => club.rating >= (filter.minRating as number));
    }

    return clubs;
  }

  async findPublishedTrainers(filter: {
    clubId?: number;
    sportId?: number;
    includeHidden?: boolean;
  }): Promise<Trainer[]> {
    let trainers = await this.trainers.findAll({ excludeHidden: !filter.includeHidden });

    if (filter.clubId !== undefined) {
      // Тренеры клуба — только через подтверждённую связь.
      const confirmed = await this.links.findMany({
        clubId: filter.clubId,
        status: 'confirmed',
      });
      const ids = new Set(confirmed.map((link) => link.trainerId));
      trainers = trainers.filter((trainer) => ids.has(trainer.id));
    }

    if (filter.sportId !== undefined) {
      trainers = trainers.filter((trainer) => trainer.sportIds.includes(filter.sportId as number));
    }

    return trainers;
  }

  /** Детальная карточка клуба: тренеры через связи, расписание и отзывы по времени. */
  async getClubDetail(clubId: number): Promise<unknown | null> {
    const club = await this.clubs.findById(clubId);

    if (!club) return null;

    const [primaryOffering, allTrainers, slots, allReviews, confirmed, sports] = await Promise.all([
      this.offerings.findFirst({ ownerType: 'club', ownerId: clubId }),
      this.trainers.findAll(),
      this.schedule.findMany({ ownerType: 'club' }),
      this.reviews.findMany({ clubId }),
      this.links.findMany({ clubId, status: 'confirmed' }),
      this.resolveSports(club.sportIds),
    ]);

    const trainerIds = new Set(confirmed.map((link) => link.trainerId));

    return {
      club,
      primaryOffering,
      sports,
      trainers: allTrainers
        .filter((trainer) => trainerIds.has(trainer.id))
        .sort((left, right) => right.rating - left.rating),
      schedule: slots
        .filter((slot) => slot.clubId === clubId)
        .sort((left, right) =>
          `${left.date}T${left.startTime}`.localeCompare(`${right.date}T${right.startTime}`),
        ),
      // Отзывы «свежие первыми» — общий компаратор с тай-брейкером по id:
      // при равных метках порядок обязан быть детерминированным.
      reviews: allReviews.sort(compareByCreatedAtDesc),
    };
  }

  /** Детальная карточка тренера. Первая услуга считается основной. */
  async getTrainerDetail(trainerId: number): Promise<unknown | null> {
    const trainer = await this.trainers.findById(trainerId);

    if (!trainer) return null;

    const [offerings, slots, allReviews, confirmed, sports] = await Promise.all([
      this.offerings.findMany({ ownerType: 'trainer', ownerId: trainerId }),
      this.schedule.findMany({ ownerType: 'trainer' }),
      this.reviews.findMany({ trainerId }),
      this.links.findMany({ trainerId, status: 'confirmed' }),
      this.resolveSports(trainer.sportIds),
    ]);

    const venueClubId = confirmed[0]?.clubId;
    const affiliatedClub =
      venueClubId === undefined ? null : await this.clubs.findById(venueClubId);

    const trainerSchedule = slots
      .filter((slot) => slot.trainerId === trainerId)
      .sort((left, right) =>
        `${left.date}T${left.startTime}`.localeCompare(`${right.date}T${right.startTime}`),
      );

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
      // Отзывы «свежие первыми» — общий компаратор с тай-брейкером по id:
      // при равных метках порядок обязан быть детерминированным.
      reviews: allReviews.sort(compareByCreatedAtDesc),
    };
  }
}

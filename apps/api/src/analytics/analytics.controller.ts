// Сводка платформы для админского раздела.
//
// Единственный маршрут, который читает все коллекции разом. Порядок фильтров
// важен: город сначала отбирает клубы и тренеров, а записи, слоты и отзывы
// отбираются уже по ним — у них своего города нет.

import { Controller, Get, Inject, Query } from '@nestjs/common';
import { DEFAULT_TIME_ZONE } from '@sporthub/types';
import type { Booking, Club, Schedule, Trainer } from '@sporthub/types';

import type { BookingsRepository } from '../repositories/bookings.repository';
import { BOOKINGS_REPOSITORY } from '../repositories/bookings.repository';
import type {
  LogsRepository,
  ReviewsRepository,
  UsersRepository,
} from '../repositories/crud.repository';
import {
  LOGS_REPOSITORY,
  REVIEWS_REPOSITORY,
  USERS_REPOSITORY,
} from '../repositories/crud.repository';
import type { SimpleDictionaryRepository } from '../dictionaries/dictionaries.repository';
import { SPORTS_REPOSITORY } from '../dictionaries/dictionaries.repository';
import type {
  ClubsRepository,
  ScheduleRepository,
  TrainersRepository,
} from '../repositories/entities.repository';
import { getDateKeyInTimeZone, shiftDateKey } from '@sporthub/domain';

import {
  CLUBS_REPOSITORY,
  SCHEDULE_REPOSITORY,
  TRAINERS_REPOSITORY,
} from '../repositories/entities.repository';

type Period = 'today' | 'week' | 'month' | 'all';

/**
 * Начало периода в часовом поясе проекта.
 *
 * Прежняя версия смешивала три пояса в пяти строках: `new Date('2026-08-20')`
 * разбирается как полночь UTC, `setDate`/`setMonth` работают в поясе процесса,
 * а `toISOString()` возвращает обратно в UTC. Для пояса восточнее UTC граница
 * периода уезжала на сутки. Теперь календарь считается календарём: сегодняшний
 * день берётся по часам проекта, сдвиг — по суткам, без участия пояса процесса.
 */
function getFromDate(period: Period, now: Date = new Date()): string | null {
  if (period === 'all') return null;

  const today = getDateKeyInTimeZone(now, DEFAULT_TIME_ZONE);

  if (period === 'today') return today;
  if (period === 'week') return shiftDateKey(today, -7);

  // Месяц назад — это тот же день предыдущего месяца, а не «минус тридцать суток».
  const [year, month, day] = today.split('-').map(Number);
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;
  // 31 марта минус месяц — это 28 или 29 февраля, а не 3 марта.
  const daysInPreviousMonth = new Date(Date.UTC(previousYear, previousMonth, 0)).getUTCDate();
  const safeDay = Math.min(day, daysInPreviousMonth);

  return `${previousYear}-${String(previousMonth).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

/** Точка входа для тестов: граница периода — единственное, что здесь стоит проверять. */
export const getFromDateForTests = getFromDate;

function extractDate(isoString: string): string {
  return isoString.slice(0, 10);
}

function groupByDate(
  items: { createdAt: string }[],
  fromDate: string | null,
): { date: string; count: number }[] {
  const counts = new Map<string, number>();

  for (const item of items) {
    const date = extractDate(item.createdAt);

    if (fromDate && date < fromDate) continue;

    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

@Controller('analytics')
export class AnalyticsController {
  constructor(
    @Inject(CLUBS_REPOSITORY) private readonly clubs: ClubsRepository,
    @Inject(TRAINERS_REPOSITORY) private readonly trainers: TrainersRepository,
    @Inject(SCHEDULE_REPOSITORY) private readonly schedule: ScheduleRepository,
    @Inject(BOOKINGS_REPOSITORY) private readonly bookings: BookingsRepository,
    @Inject(REVIEWS_REPOSITORY) private readonly reviews: ReviewsRepository,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(LOGS_REPOSITORY) private readonly logs: LogsRepository,
    @Inject(SPORTS_REPOSITORY)
    private readonly sports: SimpleDictionaryRepository<{ id: number; name: string }>,
  ) {}

  @Get()
  async summary(
    @Query('period') rawPeriod?: string,
    @Query('city') rawCity?: string,
    @Query('sportId') rawSportId?: string,
  ): Promise<unknown> {
    const period = (rawPeriod ?? 'all') as Period;
    const city = rawCity ?? '';
    const sportId = rawSportId ? Number(rawSportId) : null;
    const fromDate = getFromDate(period);

    const [users, allClubs, allTrainers, allBookings, allReviews, allSchedule, sports, logs] =
      await Promise.all([
        this.users.findAll(),
        this.clubs.findAll(),
        this.trainers.findAll(),
        this.bookings.findAll(),
        this.reviews.findAll(),
        this.schedule.findMany({ ownerType: 'all' }),
        this.sports.findAll(),
        this.logs.findAll(),
      ]);

    // Скрытые публикации не попадают в сводку — вторая линия защиты поверх
    // фильтра в самих выдачах.
    let clubs = allClubs.filter((club: Club) => club.status !== 'hidden');
    let trainers = allTrainers.filter((trainer: Trainer) => trainer.status !== 'hidden');

    if (city) {
      clubs = clubs.filter((club) => club.city === city);
      // Тренер без города показывается во всех городах.
      trainers = trainers.filter((trainer) => !trainer.city || trainer.city === city);
    }

    if (sportId) {
      clubs = clubs.filter((club) => club.sportIds.includes(sportId));
      trainers = trainers.filter((trainer) => trainer.sportIds.includes(sportId));
    }

    let bookings = allBookings;

    if (fromDate) {
      bookings = bookings.filter((booking) => extractDate(booking.createdAt) >= fromDate);
    }

    if (sportId) {
      bookings = bookings.filter((booking) => booking.sportId === sportId);
    }

    let schedule = allSchedule;

    if (sportId) {
      schedule = schedule.filter((slot) => slot.sportId === sportId);
    }

    let reviews = allReviews;

    if (fromDate) {
      reviews = reviews.filter((review) => extractDate(review.createdAt) >= fromDate);
    }

    if (city) {
      // Записи, слоты и отзывы города не знают — берём их через уже отобранные
      // клубы и тренеров.
      const clubIds = new Set(clubs.map((club) => club.id));
      const trainerIds = new Set(trainers.map((trainer) => trainer.id));

      bookings = bookings.filter(
        (booking) =>
          (booking.clubId !== undefined && clubIds.has(booking.clubId)) ||
          (booking.trainerId !== undefined && trainerIds.has(booking.trainerId)),
      );
      schedule = schedule.filter(
        (slot: Schedule) =>
          (slot.clubId !== undefined && clubIds.has(slot.clubId)) ||
          (slot.trainerId !== undefined && trainerIds.has(slot.trainerId)),
      );
      reviews = reviews.filter(
        (review) =>
          (review.clubId !== undefined && clubIds.has(review.clubId)) ||
          (review.trainerId !== undefined && trainerIds.has(review.trainerId)),
      );
    }

    const withCapacity = schedule.filter((slot) => slot.capacity > 0);
    const totalBooked = withCapacity.reduce((sum, slot) => sum + slot.bookedCount, 0);
    const totalCapacity = withCapacity.reduce((sum, slot) => sum + slot.capacity, 0);

    const kpi = {
      totalUsers: users.length,
      totalAthletes: users.filter((user) => user.role === 'athlete').length,
      totalProviders: users.filter((user) => user.role === 'club_owner' || user.role === 'trainer')
        .length,
      totalClubs: clubs.length,
      totalTrainers: trainers.length,
      totalBookings: bookings.length,
      totalReviews: reviews.length,
      averageSlotLoad: totalCapacity > 0 ? totalBooked / totalCapacity : 0,
    };

    const sportCounts = new Map<number, number>();

    for (const booking of bookings) {
      sportCounts.set(booking.sportId, (sportCounts.get(booking.sportId) ?? 0) + 1);
    }

    const sportPopularity = [...sportCounts.entries()]
      .map(([id, count]) => ({
        sportId: id,
        sportName: sports.find((sport) => sport.id === id)?.name ?? `Sport #${id}`,
        count,
      }))
      .sort((left, right) => right.count - left.count);

    const entityCounts = new Map<string, number>();

    for (const booking of bookings as Booking[]) {
      if (booking.clubId) {
        const key = `club:${booking.clubId}`;
        entityCounts.set(key, (entityCounts.get(key) ?? 0) + 1);
      }

      if (booking.trainerId) {
        const key = `trainer:${booking.trainerId}`;
        entityCounts.set(key, (entityCounts.get(key) ?? 0) + 1);
      }
    }

    // Названия берутся из уже отфильтрованных наборов: иначе при отборе
    // по городу в верхушку попали бы чужие города.
    const topEntities = [...entityCounts.entries()]
      .map(([key, count]) => {
        const [type, rawId] = key.split(':');
        const id = Number(rawId);

        if (type === 'club') {
          const club = clubs.find((candidate) => candidate.id === id);

          return {
            id,
            name: club?.name ?? `Club #${id}`,
            type: 'club' as const,
            bookings: count,
            rating: club?.rating ?? 0,
          };
        }

        const trainer = trainers.find((candidate) => candidate.id === id);

        return {
          id,
          name: trainer?.name ?? `Trainer #${id}`,
          type: 'trainer' as const,
          bookings: count,
          rating: trainer?.rating ?? 0,
        };
      })
      .sort((left, right) => right.bookings - left.bookings || right.rating - left.rating)
      .slice(0, 10);

    return {
      kpi,
      bookingsByDate: groupByDate(bookings, null),
      sportPopularity,
      topEntities,
      platformActivity: groupByDate(logs, fromDate),
    };
  }
}

export const ANALYTICS_CONTROLLERS = [AnalyticsController];

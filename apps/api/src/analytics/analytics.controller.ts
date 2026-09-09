// Сводка платформы для админского раздела.
//
// Порядок фильтров важен: город сначала отбирает клубы и тренеров, а записи, слоты
// и отзывы отбираются уже по ним — своего города у них нет.
//
// Считают здесь ЗАПРОСЫ, а не циклы. Раньше маршрут читал восемь коллекций целиком,
// включая весь журнал платформы и все записи с историей переходов, и складывал
// пятнадцать фильтров, группировок и сортировок в памяти. Сводка ломалась бы не от
// числа пользователей, а от времени работы системы: журнал растёт быстрее всех
// и не чистится. Теперь каждое число — `count` или группировка на стороне хранилища.
//
// Что осталось чтением коллекции и почему:
//
// - Клубы и тренеры читаются целиком, потому что из них же берутся названия и рейтинги
//   верхушки. Скрытые публикации отсекает запрос (`excludeHidden`); отбор по городу
//   и виду спорта остаётся в памяти — методов под него у репозитория публикаций нет.
// - Расписание читается целиком ради средней загрузки слотов: сумма занятых и общей
//   вместимости — тоже группировка, но в репозитории расписания её пока нет.
//
// Обе оставшиеся строки — не «так и надо», а известный незакрытый хвост.

import { Controller, Get, Inject, Query } from '@nestjs/common';
import { DEFAULT_TIME_ZONE } from '@sporthub/types';
import type { Trainer } from '@sporthub/types';

import { Requires } from '../auth/access.decorators';
import type { BookingsCountFilter, BookingsRepository } from '../repositories/bookings.repository';
import { BOOKINGS_REPOSITORY } from '../repositories/bookings.repository';
import type {
  LogsRepository,
  OwnerIdFilter,
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

// Сводка по всей площадке — служебное чтение. До фазы 34 маршрут отдавал
// анонимно число пользователей по ролям, записи, отзывы, загрузку слотов,
// топ публикаций и активность из журнала аудита.
@Requires('view_analytics')
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

    // Первая волна: всё, что не зависит от отобранных публикаций.
    //
    // Скрытые публикации отсекает ЗАПРОС, а не фильтр после чтения: это вторая линия
    // защиты поверх самих выдач, и тянуть скрытое из хранилища ради его выбрасывания
    // незачем.
    // Город и вид спорта уходят в запрос — под пару «город и состояние» индекс есть,
    // вид спорта отбирается соединением по связующей таблице.
    //
    // ⚠️ У ТРЕНЕРОВ город в запрос НЕ уходит, и это не забывчивость: правило другое —
    // «тренер без города показывается во всех городах». Точное совпадение, которое
    // умеет фильтр публикаций, выбросило бы таких тренеров из сводки. Выражать это
    // условие в репозитории ради единственного места — заводить абстракцию без
    // второго потребителя; тренеров в каталоге единицы, и отбор остаётся здесь.
    const [allClubs, allTrainers, roleCounts, platformActivity, sports] = await Promise.all([
      this.clubs.findAll({
        excludeHidden: true,
        ...(city ? { city } : {}),
        ...(sportId ? { sportId } : {}),
      }),
      this.trainers.findAll({ excludeHidden: true, ...(sportId ? { sportId } : {}) }),
      this.users.countByRole(),
      this.logs.countByDate({ fromDate: fromDate ?? undefined }),
      this.sports.findAll(),
    ]);

    const clubs = allClubs;
    const trainers = city
      ? allTrainers.filter((trainer: Trainer) => !trainer.city || trainer.city === city)
      : allTrainers;

    // Записи, слоты и отзывы города не знают — берём их через уже отобранные
    // клубы и тренеров. Ограничение появляется ТОЛЬКО при отборе по городу:
    // без него скрытая публикация со своими записями считалась и раньше.
    const owners: OwnerIdFilter | undefined = city
      ? { clubIds: clubs.map((club) => club.id), trainerIds: trainers.map((trainer) => trainer.id) }
      : undefined;

    const bookingsFilter: BookingsCountFilter = {
      ...(fromDate === null ? {} : { createdFrom: fromDate }),
      ...(sportId ? { sportId } : {}),
      ...(owners === undefined ? {} : { owners }),
    };

    // Вторая волна: шесть чисел и три группировки — все на стороне хранилища.
    const [totalBookings, bookingsByDate, sportCounts, ownerCounts, totalReviews, seats] =
      await Promise.all([
        this.bookings.count(bookingsFilter),
        this.bookings.countByCreatedDay(bookingsFilter),
        this.bookings.countBySport(bookingsFilter),
        this.bookings.countByOwner(bookingsFilter),
        this.reviews.count({
          ...(fromDate === null ? {} : { fromDate }),
          ...(owners === undefined ? {} : { owners }),
        }),
        // ⚠️ Средняя загрузка — две суммы, и ради них поднималось ВСЁ расписание
        // платформы. Расписание растёт со временем работы, а не с числом
        // пользователей, поэтому сводка ломалась бы первой и без всякого роста
        // аудитории. Теперь это агрегат в запросе.
        this.schedule.sumSeats({
          ownerType: 'all',
          ...(sportId ? { sportId } : {}),
          ...(owners === undefined ? {} : { owners }),
        }),
      ]);

    // Роли, которых нет ни у кого, в ответе группировки отсутствуют — отсюда `?? 0`.
    const roleCount = (role: string): number => roleCounts[role] ?? 0;

    const kpi = {
      totalUsers: Object.values(roleCounts).reduce((sum, count) => sum + count, 0),
      totalAthletes: roleCount('athlete'),
      totalProviders: roleCount('club_owner') + roleCount('trainer'),
      totalClubs: clubs.length,
      totalTrainers: trainers.length,
      totalBookings,
      totalReviews,
      averageSlotLoad: seats.capacity > 0 ? seats.booked / seats.capacity : 0,
    };

    // Ранжирование остаётся здесь, и это не недоделка. Сортировка устойчивая:
    // при равном числе записей порядок задаёт выдача группировки (номер первой
    // записи вида спорта), и оба хранилища дают его одинаково.
    const sportPopularity = sportCounts
      .map(({ sportId: id, count }) => ({
        sportId: id,
        sportName: sports.find((sport) => sport.id === id)?.name ?? `Sport #${id}`,
        count,
      }))
      .sort((left, right) => right.count - left.count);

    // Названия и рейтинги берутся из уже отфильтрованных наборов: иначе при отборе
    // по городу в верхушку попали бы чужие города. Поэтому и ранжирование здесь,
    // а не в запросе — рейтинг у публикации вне отбора считается нулевым, и вытащить
    // это правило в группировку по записям нечем.
    //
    // Сортируется набор размером с каталог, а не с таблицей записей: группировка
    // уже свернула миллионы строк в строку на публикацию.
    const topEntities = ownerCounts
      .map(({ type, id, count }) => {
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
      bookingsByDate,
      sportPopularity,
      topEntities,
      platformActivity,
    };
  }
}

export const ANALYTICS_CONTROLLERS = [AnalyticsController];

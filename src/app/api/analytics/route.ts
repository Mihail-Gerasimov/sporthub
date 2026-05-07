/**
 * GET /api/analytics — агрегация аналитических данных платформы.
 * Читает все JSON-коллекции, применяет фильтры (period, city, sportId)
 * и возвращает KPI + данные для графиков.
 * Первый read-only API route — не изменяет данные.
 */
import { NextResponse } from 'next/server';

import {
  getUsers,
  getClubs,
  getTrainers,
  getBookings,
  getReviews,
  getSchedule,
  getSports,
  getLogs,
} from '@/lib/db';
import { DEFAULT_TIME_ZONE } from '@/lib/constants';
import type { Booking, Club, LogEntry, Schedule, Trainer } from '@/types';

/** Типы периодов фильтрации */
type Period = 'today' | 'week' | 'month' | 'all';

/** Вычислить дату начала периода по таймзоне проекта */
function getFromDate(period: Period): string | null {
  if (period === 'all') return null;

  const now = new Date();
  const todayStr = now.toLocaleDateString('sv-SE', { timeZone: DEFAULT_TIME_ZONE });
  const today = new Date(todayStr);

  if (period === 'today') return todayStr;

  if (period === 'week') {
    today.setDate(today.getDate() - 7);
    return today.toISOString().slice(0, 10);
  }

  // month
  today.setMonth(today.getMonth() - 1);
  return today.toISOString().slice(0, 10);
}

/** Извлечь дату из ISO datetime строки */
function extractDate(isoString: string): string {
  return isoString.slice(0, 10);
}

/** Группировка массива по дате с подсчётом */
function groupByDate(
  items: Array<{ createdAt: string }>,
  fromDate: string | null,
): Array<{ date: string; count: number }> {
  const counts = new Map<string, number>();

  for (const item of items) {
    const date = extractDate(item.createdAt);
    if (fromDate && date < fromDate) continue;
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    /* --- Параметры фильтрации --- */
    const period = (searchParams.get('period') ?? 'all') as Period;
    const city = searchParams.get('city') ?? '';
    const sportIdParam = searchParams.get('sportId');
    const sportIdFilter = sportIdParam ? Number(sportIdParam) : null;

    const fromDate = getFromDate(period);

    /* --- Загрузка всех коллекций --- */
    const [users, allClubs, allTrainers, allBookings, reviews, allSchedule, sports, logs] =
      await Promise.all([
        getUsers(),
        getClubs(),
        getTrainers(),
        getBookings(),
        getReviews(),
        getSchedule({ ownerType: 'all' }),
        getSports(),
        getLogs(),
      ]);

    /* --- Фильтрация hidden-сущностей (defense-in-depth для Phase 22) --- */
    // Phase 22 добавит 'hidden' в EntityStatus; пока cast к string для TS strict
    let clubs = allClubs.filter((c: Club) => c.status !== 'hidden');
    let trainers = allTrainers.filter((t: Trainer) => t.status !== 'hidden');

    /* --- Фильтрация по городу --- */
    if (city) {
      clubs = clubs.filter((c: Club) => c.city === city);
      // Тренер без city — показывается во всех городах
      trainers = trainers.filter((t: Trainer) => !t.city || t.city === city);
    }

    /* --- Фильтрация по виду спорта --- */
    if (sportIdFilter) {
      clubs = clubs.filter((c: Club) => c.sportIds.includes(sportIdFilter));
      trainers = trainers.filter((t: Trainer) => t.sportIds.includes(sportIdFilter));
    }

    /* --- Фильтрация букингов по периоду и спорту --- */
    let bookings = allBookings;
    if (fromDate) {
      bookings = bookings.filter((b: Booking) => extractDate(b.createdAt) >= fromDate);
    }
    if (sportIdFilter) {
      bookings = bookings.filter((b: Booking) => b.sportId === sportIdFilter);
    }

    /* --- Фильтрация расписания по спорту --- */
    let schedule = allSchedule;
    if (sportIdFilter) {
      schedule = schedule.filter((s: Schedule) => s.sportId === sportIdFilter);
    }

    /* --- Фильтрация отзывов по периоду --- */
    let filteredReviews = reviews;
    if (fromDate) {
      filteredReviews = reviews.filter((r) => extractDate(r.createdAt) >= fromDate);
    }

    /* --- Phase 30.4: фильтрация bookings/schedule/reviews по городу --- */
    // У этих сущностей нет прямого поля city — резолвим через clubId/trainerId,
    // которые УЖЕ отфильтрованы по city выше. Set даёт O(1) lookup.
    if (city) {
      const ownedClubIds = new Set(clubs.map((c) => c.id));
      const ownedTrainerIds = new Set(trainers.map((t) => t.id));

      bookings = bookings.filter(
        (b: Booking) =>
          (b.clubId !== undefined && ownedClubIds.has(b.clubId)) ||
          (b.trainerId !== undefined && ownedTrainerIds.has(b.trainerId)),
      );

      schedule = schedule.filter(
        (s: Schedule) =>
          (s.clubId !== undefined && ownedClubIds.has(s.clubId)) ||
          (s.trainerId !== undefined && ownedTrainerIds.has(s.trainerId)),
      );

      filteredReviews = filteredReviews.filter(
        (r) =>
          (r.clubId !== undefined && ownedClubIds.has(r.clubId)) ||
          (r.trainerId !== undefined && ownedTrainerIds.has(r.trainerId)),
      );
    }

    /* --- KPI --- */
    const totalAthletes = users.filter((u) => u.role === 'athlete').length;
    const totalProviders = users.filter(
      (u) => u.role === 'club_owner' || u.role === 'trainer',
    ).length;

    // averageSlotLoad: sum(bookedCount) / sum(capacity) для capacity > 0
    const slotsWithCapacity = schedule.filter((s: Schedule) => s.capacity > 0);
    const totalBooked = slotsWithCapacity.reduce(
      (sum: number, s: Schedule) => sum + s.bookedCount,
      0,
    );
    const totalCapacity = slotsWithCapacity.reduce(
      (sum: number, s: Schedule) => sum + s.capacity,
      0,
    );
    const averageSlotLoad = totalCapacity > 0 ? totalBooked / totalCapacity : 0;

    const kpi = {
      totalUsers: users.length,
      totalAthletes,
      totalProviders,
      totalClubs: clubs.length,
      totalTrainers: trainers.length,
      totalBookings: bookings.length,
      totalReviews: filteredReviews.length,
      averageSlotLoad,
    };

    /* --- bookingsByDate: группировка по createdAt --- */
    const bookingsByDate = groupByDate(bookings, null); // уже отфильтровано по fromDate

    /* --- sportPopularity: по количеству букингов --- */
    const sportCounts = new Map<number, number>();
    for (const b of bookings) {
      sportCounts.set(b.sportId, (sportCounts.get(b.sportId) ?? 0) + 1);
    }
    const sportPopularity = Array.from(sportCounts.entries())
      .map(([sportId, count]) => {
        const sport = sports.find((s) => s.id === sportId);
        return { sportId, sportName: sport?.name ?? `Sport #${sportId}`, count };
      })
      .sort((a, b) => b.count - a.count);

    /* --- topEntities: top 10 по booking count --- */
    const entityBookingCounts = new Map<string, number>();
    for (const b of bookings) {
      if (b.clubId) {
        const key = `club:${b.clubId}`;
        entityBookingCounts.set(key, (entityBookingCounts.get(key) ?? 0) + 1);
      }
      if (b.trainerId) {
        const key = `trainer:${b.trainerId}`;
        entityBookingCounts.set(key, (entityBookingCounts.get(key) ?? 0) + 1);
      }
    }
    // Phase 30.4: резолвим через `clubs`/`trainers` (уже отфильтрованы по city/sport),
    // не через `allClubs`/`allTrainers` — иначе при city-фильтре в топ попадут чужие города.
    const topEntities = Array.from(entityBookingCounts.entries())
      .map(([key, bookingCount]) => {
        const [type, idStr] = key.split(':');
        const id = Number(idStr);
        if (type === 'club') {
          const club = clubs.find((c) => c.id === id);
          return {
            id,
            name: club?.name ?? `Club #${id}`,
            type: 'club' as const,
            bookings: bookingCount,
            rating: club?.rating ?? 0,
          };
        }
        const trainer = trainers.find((t) => t.id === id);
        return {
          id,
          name: trainer?.name ?? `Trainer #${id}`,
          type: 'trainer' as const,
          bookings: bookingCount,
          rating: trainer?.rating ?? 0,
        };
      })
      .sort((a, b) => b.bookings - a.bookings || b.rating - a.rating)
      .slice(0, 10);

    /* --- platformActivity: из логов, группировка по дате --- */
    const platformActivity = groupByDate(logs as Array<LogEntry & { createdAt: string }>, fromDate);

    return NextResponse.json({
      success: true,
      data: {
        kpi,
        bookingsByDate,
        sportPopularity,
        topEntities,
        platformActivity,
      },
    });
  } catch (error) {
    console.error('[analytics] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Ошибка при получении аналитики' },
      { status: 500 },
    );
  }
}

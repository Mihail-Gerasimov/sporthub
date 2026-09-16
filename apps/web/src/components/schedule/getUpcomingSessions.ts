/**
 * Отбор занятий клубов для витрины и «Сегодня в фокусе» (шаг 38.81).
 *
 * Логика отбора — решение, названное заказчику; рабочая часть считает в памяти
 * по действующему ограничению (долг Д-15):
 *  1. сегодня (`targetDate`);
 *  2. ещё не началось — `isSlotAhead` из домена, по часам зала: идущее занятие
 *     «не прошло», но записываться на него поздно;
 *  3. есть свободные места — слот без мест ПРЯЧЕТСЯ; освободилось — вернётся при
 *     следующей загрузке, без специального механизма;
 *  4. те же фильтры, что у выдачи (`filterClubs`: вид спорта, город, запрос) —
 *     слоты клубов, оставшихся в выдаче; при выбранном виде — только слоты ЭТОГО вида,
 *     клуб «йога + бокс» под фильтром «йога» бокс не показывает;
 *  5. по времени начала, при равенстве — по названию;
 *  6. первые N — `APP_LIMITS.upcomingSessions`, одна константа рядом с прочими
 *     размерами витрины.
 *
 * Функция чистая: момент `now` и фильтры приходят снаружи, поэтому её зовёт
 * и серверная страница (без фильтров — правая колонка героя), и клиентская секция
 * слотов (с фильтрами из стора — те же, что у карточек рядом).
 */
import { APP_LIMITS } from '@sporthub/types';
import { isSlotAhead } from '@sporthub/domain';

import { filterClubs, type ClubListSport } from '@/components/clubs/filterClubs';
import { getScheduleClubId } from '@/lib/utils';

import type { Club, EntityId, Schedule, Tag } from '@sporthub/types';

export type UpcomingSessionItem = {
  id: EntityId;
  title: string;
  clubId: EntityId;
  clubName: string;
  date: string;
  startTime: string;
  endTime: string;
  price: number;
  room?: string;
  availableSpots: number;
};

/** Фильтры выдачи — те же поля, что читает `ClubList` из стора поиска. */
export type UpcomingSessionFilters = {
  searchQuery: string;
  selectedSportId: EntityId | null;
  selectedCity: string;
  /** Справочники для правила выдачи: названия видов и тегов входят в поиск по тексту. */
  sports: ClubListSport[];
  tags?: Tag[];
};

type GetUpcomingSessionsInput = {
  clubs: Club[];
  schedule: Schedule[];
  targetDate: string;
  /** Момент «сейчас» — явно, чтобы отбор был воспроизводим тестом. */
  now?: Date;
  /** Без фильтров — все занятия дня (правая колонка героя). */
  filters?: UpcomingSessionFilters;
  limit?: number;
};

export function getUpcomingSessions({
  clubs,
  schedule,
  targetDate,
  now = new Date(),
  filters,
  limit = APP_LIMITS.upcomingSessions,
}: GetUpcomingSessionsInput): UpcomingSessionItem[] {
  // Шаг 4: клубы, оставшиеся в выдаче под теми же фильтрами. Без фильтров — все.
  const visibleClubs = filters === undefined ? clubs : filterClubs({ clubs, ...filters });
  const clubById = new Map(visibleClubs.map((club) => [club.id, club]));
  const selectedSportId = filters?.selectedSportId ?? null;

  const upcomingSessions = schedule
    // Шаг 1: сегодня.
    .filter((slot) => slot.date === targetDate)
    // Шаг 2: ещё не началось.
    .filter((slot) => isSlotAhead(slot, now))
    // Шаг 3: есть места.
    .filter((slot) => slot.bookedCount < slot.capacity)
    // Шаг 4, вторая половина: под выбранным видом — слоты только этого вида.
    .filter((slot) => selectedSportId === null || slot.sportId === selectedSportId)
    .flatMap((slot) => {
      const clubId = getScheduleClubId(slot);
      const club = clubId === null ? undefined : clubById.get(clubId);

      // Слот клуба вне выдачи (или без клуба) — не показывается.
      if (clubId === null || club === undefined) return [];

      return [
        {
          id: slot.id,
          title: slot.title,
          clubId,
          clubName: club.name,
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          price: slot.price,
          room: slot.room,
          availableSpots: slot.capacity - slot.bookedCount,
        } satisfies UpcomingSessionItem,
      ];
    });

  return (
    upcomingSessions
      // Шаг 5: по времени начала, ничьи — по названию.
      .sort((left, right) => {
        const byStart = `${left.date}T${left.startTime}`.localeCompare(
          `${right.date}T${right.startTime}`,
        );

        return byStart !== 0 ? byStart : left.title.localeCompare(right.title, 'ru');
      })
      // Шаг 6: первые N.
      .slice(0, limit)
  );
}

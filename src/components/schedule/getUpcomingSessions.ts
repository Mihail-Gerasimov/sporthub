import { APP_LIMITS } from '@sporthub/types';
import { isSlotUpcoming } from '@/lib/slot-time';
import { getScheduleClubId } from '@/lib/utils';
import type { Club, EntityId, Schedule } from '@sporthub/types';

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

type GetUpcomingSessionsInput = {
  clubs: Club[];
  schedule: Schedule[];
  targetDate: string;
  limit?: number;
};

export function getUpcomingSessions({
  clubs,
  schedule,
  targetDate,
  limit = APP_LIMITS.upcomingSessions,
}: GetUpcomingSessionsInput): UpcomingSessionItem[] {
  const clubById = new Map(clubs.map((club) => [club.id, club]));
  const now = new Date();
  const upcomingSessions = schedule
    .filter((slot) => slot.date === targetDate)
    // Phase 30.7: отсекаем сегодняшние слоты, у которых endTime уже прошёл (TZ-safe).
    .filter((slot) => isSlotUpcoming(slot, now))
    .filter((slot) => slot.bookedCount < slot.capacity)
    .flatMap((slot) => {
      const clubId = getScheduleClubId(slot);

      if (clubId === null) {
        return [];
      }

      const club = clubById.get(clubId);

      if (!club) {
        return [];
      }

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

  return upcomingSessions
    .sort((left, right) => {
      const leftTimestamp = `${left.date}T${left.startTime}`;
      const rightTimestamp = `${right.date}T${right.startTime}`;

      if (leftTimestamp !== rightTimestamp) {
        return leftTimestamp.localeCompare(rightTimestamp);
      }

      return left.title.localeCompare(right.title, 'ru');
    })
    .slice(0, limit);
}

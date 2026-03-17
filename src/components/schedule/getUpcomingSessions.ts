import { APP_LIMITS } from '@/lib/constants';
import type { Club, EntityId, Schedule } from '@/types';

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
  const upcomingSessions = schedule
    .filter((slot) => slot.date === targetDate)
    .filter((slot) => slot.bookedCount < slot.capacity)
    .flatMap((slot) => {
      const club = clubById.get(slot.clubId);

      if (!club) {
        return [];
      }

      return [
        {
          id: slot.id,
          title: slot.title,
          clubId: slot.clubId,
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

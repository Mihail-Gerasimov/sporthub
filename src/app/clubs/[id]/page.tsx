import { notFound } from 'next/navigation';

import { ClubDetailPageClient } from '@/components/clubs/ClubDetailPageClient';
import { getClubById, getReviews, getSchedule, getSports, getTrainers, getUsers } from '@/lib/db';

type ClubDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ClubDetailPage({ params }: ClubDetailPageProps) {
  const { id } = await params;
  const clubId = Number(id);

  if (!Number.isInteger(clubId) || clubId <= 0) {
    notFound();
  }

  const club = await getClubById(clubId);

  if (!club) {
    notFound();
  }

  const [sports, trainers, schedule, reviews, users] = await Promise.all([
    getSports(),
    getTrainers(),
    getSchedule(),
    getReviews(),
    getUsers(),
  ]);

  const clubSports = sports.filter((sport) => club.sportIds.includes(sport.id));
  const clubTrainers = trainers
    .filter((trainer) => trainer.clubId === clubId)
    .sort((left, right) => right.rating - left.rating);
  const clubSchedule = schedule
    .filter((slot) => slot.clubId === clubId)
    .sort((left, right) => {
      const leftTimestamp = `${left.date}T${left.startTime}`;
      const rightTimestamp = `${right.date}T${right.startTime}`;

      return leftTimestamp.localeCompare(rightTimestamp);
    });
  const clubReviews = reviews
    .filter((review) => review.clubId === clubId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const reviewAuthors = users.reduce<Record<number, string>>((accumulator, user) => {
    accumulator[user.id] = user.name;
    return accumulator;
  }, {});

  return (
    <ClubDetailPageClient
      club={club}
      reviewAuthors={reviewAuthors}
      reviews={clubReviews}
      schedule={clubSchedule}
      sports={clubSports}
      trainers={clubTrainers}
    />
  );
}

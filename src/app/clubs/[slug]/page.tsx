// Серверная страница клуба должна читать актуальные JSON-данные по slug после изменений публикации.
import { notFound } from 'next/navigation';

import { ClubDetailPageClient } from '@/components/clubs/ClubDetailPageClient';
import { HiddenPublicationNotice } from '@/components/ui/HiddenPublicationNotice';
import {
  getClubBySlug,
  getOfferings,
  getReviews,
  getSchedule,
  getSports,
  getTrainers,
  getUsers,
} from '@/lib/db';

// Явно оставляем страницу динамической, чтобы detail page отражала edit/delete после build.
export const dynamic = 'force-dynamic';

type ClubDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function ClubDetailPage({ params }: ClubDetailPageProps) {
  const { slug } = await params;

  if (slug.trim() === '') {
    notFound();
  }

  const club = await getClubBySlug(slug);

  if (!club) {
    notFound();
  }

  // Скрытая публикация — показываем уведомление вместо контента
  if (club.status === 'hidden') {
    return <HiddenPublicationNotice backHref="/" backLabel="Вернуться в каталог" />;
  }

  const [offerings, sports, trainers, schedule, reviews, users] = await Promise.all([
    getOfferings(),
    getSports(),
    getTrainers(),
    getSchedule(),
    getReviews(),
    getUsers(),
  ]);

  const clubSports = sports.filter((sport) => club.sportIds.includes(sport.id));
  const clubTrainerIds = new Set(
    offerings
      .filter(
        (offering) => offering.ownerType === 'trainer' && offering.affiliatedClubId === club.id,
      )
      .map((offering) => offering.ownerId),
  );
  const clubTrainers = trainers
    .filter((trainer) => clubTrainerIds.has(trainer.id))
    .sort((left, right) => right.rating - left.rating);
  const clubSchedule = schedule
    .filter((slot) => slot.clubId === club.id)
    .sort((left, right) => {
      const leftTimestamp = `${left.date}T${left.startTime}`;
      const rightTimestamp = `${right.date}T${right.startTime}`;

      return leftTimestamp.localeCompare(rightTimestamp);
    });
  const clubReviews = reviews
    .filter((review) => review.clubId === club.id)
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

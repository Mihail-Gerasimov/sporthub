/* Серверная страница детальной карточки тренера /trainers/[slug] */
import { notFound } from 'next/navigation';

import { TrainerDetailPageClient } from '@/components/trainers/TrainerDetailPageClient';
import { HiddenPublicationNotice } from '@/components/ui/HiddenPublicationNotice';
import {
  getBookings,
  getClubById,
  getOfferings,
  getReviews,
  getSchedule,
  getSpecialties,
  getSports,
  getTrainerBySlug,
  getTrainerClubLinks,
  getUsers,
} from '@/lib/server-api';
import { computeTrainerReliability } from '@sporthub/domain';

// Явно оставляем страницу динамической, чтобы detail page отражала edit/delete после build.
export const dynamic = 'force-dynamic';

type TrainerDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function TrainerDetailPage({ params }: TrainerDetailPageProps) {
  const { slug } = await params;

  if (slug.trim() === '') {
    notFound();
  }

  const trainer = await getTrainerBySlug(slug);

  if (!trainer) {
    notFound();
  }

  // Скрытая публикация — показываем уведомление вместо контента
  if (trainer.status === 'hidden') {
    return <HiddenPublicationNotice backHref="/" backLabel="Вернуться в каталог" />;
  }

  /* Параллельная загрузка всех связанных данных */
  const [offerings, specialties, sports, schedule, reviews, users, bookings] = await Promise.all([
    getOfferings(),
    getSpecialties(),
    getSports(),
    getSchedule({ ownerType: 'all' }),
    getReviews(),
    getUsers(),
    getBookings(),
  ]);

  // Phase 25 Step 25.13: публичная симметрия reliability.
  const reliability = computeTrainerReliability(bookings, trainer.id);

  /* Услуги тренера */
  const trainerOfferings = offerings
    .filter((offering) => offering.ownerType === 'trainer' && offering.ownerId === trainer.id)
    .sort((left, right) => left.price - right.price);

  /* Виды спорта тренера */
  const trainerSports = sports.filter((sport) => trainer.sportIds.includes(sport.id));

  /* Расписание тренера — отсортировано по дате и времени */
  const trainerSchedule = schedule
    .filter((slot) => slot.trainerId === trainer.id)
    .sort((left, right) => {
      const leftTimestamp = `${left.date}T${left.startTime}`;
      const rightTimestamp = `${right.date}T${right.startTime}`;

      return leftTimestamp.localeCompare(rightTimestamp);
    });

  /* Отзывы тренера — от новых к старым */
  const trainerReviews = reviews
    .filter((review) => review.trainerId === trainer.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  /* Карта авторов отзывов: userId → name */
  const reviewAuthors = users.reduce<Record<number, string>>((accumulator, user) => {
    accumulator[user.id] = user.name;
    return accumulator;
  }, {});

  /* Phase 24 Step 24.9c: связанный клуб на публичной карточке — ТОЛЬКО через confirmed
   * TrainerClubLink. Legacy-поля trainer.affiliatedClubId/offering.affiliatedClubId на
   * публичных поверхностях не используются. Для новых публикаций createTrainerPublication
   * автоматически создаёт confirmed-link (в MVP owner одной стороны auto-approves). */
  const confirmedLinks = await getTrainerClubLinks({
    trainerId: trainer.id,
    status: 'confirmed',
  });
  const affiliatedClubId = confirmedLinks[0]?.clubId;
  const affiliatedClub =
    affiliatedClubId === undefined ? null : await getClubById(affiliatedClubId);

  return (
    <TrainerDetailPageClient
      affiliatedClub={affiliatedClub}
      offerings={trainerOfferings}
      reviewAuthors={reviewAuthors}
      reviews={trainerReviews}
      schedule={trainerSchedule}
      specialties={specialties}
      sports={trainerSports}
      trainer={trainer}
      reliability={reliability}
    />
  );
}

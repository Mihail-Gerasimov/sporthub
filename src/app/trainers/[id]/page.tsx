/* Серверная страница детальной карточки тренера /trainers/[id] */
import { notFound } from 'next/navigation';

import { TrainerDetailPageClient } from '@/components/trainers/TrainerDetailPageClient';
import {
  getClubById,
  getOfferings,
  getReviews,
  getSchedule,
  getSports,
  getTrainerById,
  getUsers,
} from '@/lib/db';

type TrainerDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function TrainerDetailPage({ params }: TrainerDetailPageProps) {
  const { id } = await params;
  const trainerId = Number(id);

  if (!Number.isInteger(trainerId) || trainerId <= 0) {
    notFound();
  }

  const trainer = await getTrainerById(trainerId);

  if (!trainer) {
    notFound();
  }

  /* Параллельная загрузка всех связанных данных */
  const [offerings, sports, schedule, reviews, users] = await Promise.all([
    getOfferings(),
    getSports(),
    getSchedule({ ownerType: 'all' }),
    getReviews(),
    getUsers(),
  ]);

  /* Услуги тренера */
  const trainerOfferings = offerings
    .filter((offering) => offering.ownerType === 'trainer' && offering.ownerId === trainerId)
    .sort((left, right) => left.price - right.price);

  /* Виды спорта тренера */
  const trainerSports = sports.filter((sport) => trainer.sportIds.includes(sport.id));

  /* Расписание тренера — отсортировано по дате и времени */
  const trainerSchedule = schedule
    .filter((slot) => slot.trainerId === trainerId)
    .sort((left, right) => {
      const leftTimestamp = `${left.date}T${left.startTime}`;
      const rightTimestamp = `${right.date}T${right.startTime}`;

      return leftTimestamp.localeCompare(rightTimestamp);
    });

  /* Отзывы тренера — от новых к старым */
  const trainerReviews = reviews
    .filter((review) => review.trainerId === trainerId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  /* Карта авторов отзывов: userId → name */
  const reviewAuthors = users.reduce<Record<number, string>>((accumulator, user) => {
    accumulator[user.id] = user.name;
    return accumulator;
  }, {});

  /* Связанный клуб (если тренер работает при клубе) */
  const affiliatedClubId = trainerOfferings.find(
    (offering) => offering.affiliatedClubId !== undefined,
  )?.affiliatedClubId;
  const affiliatedClub =
    affiliatedClubId === undefined ? null : await getClubById(affiliatedClubId);

  return (
    <TrainerDetailPageClient
      affiliatedClub={affiliatedClub}
      offerings={trainerOfferings}
      reviewAuthors={reviewAuthors}
      reviews={trainerReviews}
      schedule={trainerSchedule}
      sports={trainerSports}
      trainer={trainer}
    />
  );
}

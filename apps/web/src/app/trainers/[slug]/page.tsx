/* Серверная страница детальной карточки тренера /trainers/[slug] */
import { notFound } from 'next/navigation';

import { TrainerDetailPageClient } from '@/components/trainers/TrainerDetailPageClient';
import { HiddenPublicationNotice } from '@/components/ui/HiddenPublicationNotice';
import {
  getOfferings,
  getPublishedClubById,
  getReviews,
  getSchedule,
  getSpecialties,
  getSports,
  getTrainerBySlug,
  getTrainerClubLinks,
} from '@/lib/server-api';
import { compareByCreatedAtDesc } from '@sporthub/domain';

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

  // Шаг 36.17, симметрично карточке клуба. Владения страница НЕ считает: кому видна
  // скрытая публикация, решил маршрут. Гостю и постороннему он отвечает 404, и это
  // обычное «нет такой страницы». Пришло тело — смотрящий (владелец или модератор)
  // имеет право его видеть: карточка рисуется целиком, состояние объясняет плашка.
  if (!trainer) {
    notFound();
  }

  /* Параллельная загрузка всех связанных данных */
  const [offerings, specialties, sports, schedule, reviews] = await Promise.all([
    getOfferings(),
    getSpecialties(),
    getSports(),
    getSchedule({ ownerType: 'all' }),
    getReviews(),
  ]);

  // Симметрично карточке клуба: надёжность считает бэкенд и отдаёт числом.
  const reliability = trainer.reliability;

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
    .sort(compareByCreatedAtDesc);

  /* Карта авторов отзывов: userId → name */
  // ⚠️ Имя автора приезжает в самом отзыве (фаза 34). Раньше страница поднимала
  // ради подписи СПИСОК ВСЕХ пользователей площадки — с почтами и телефонами,
  // и без всякой проверки: тот маршрут был открыт любому.
  const reviewAuthors = reviews.reduce<Record<number, string>>((accumulator, review) => {
    if (review.authorName !== undefined) accumulator[review.userId] = review.authorName;

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
  // Шаг 36.18: площадка приходит ОДНОЙ строкой и только опубликованная. Раньше сюда
  // поднимался весь каталог со скрытыми, и скрытый клуб оказывался на публичной
  // карточке тренера.
  const affiliatedClub =
    affiliatedClubId === undefined ? null : await getPublishedClubById(affiliatedClubId);

  return (
    <>
      {trainer.status === 'hidden' ? (
        <HiddenPublicationNotice kind={trainer.hiddenKind} reason={trainer.hideReason} />
      ) : null}
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
    </>
  );
}

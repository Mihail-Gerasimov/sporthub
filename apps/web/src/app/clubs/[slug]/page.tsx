// Серверная страница клуба должна читать актуальные JSON-данные по slug после изменений публикации.
import { notFound } from 'next/navigation';

import { ClubDetailPageClient } from '@/components/clubs/ClubDetailPageClient';
import { HiddenPublicationNotice } from '@/components/ui/HiddenPublicationNotice';
import {
  getAmenities,
  getClubBySlug,
  getOfferings,
  getReviews,
  getSchedule,
  getSpecialties,
  getSports,
  getTags,
  getTrainerClubLinks,
  getTrainers,
} from '@/lib/server-api';
import { compareByCreatedAtDesc } from '@sporthub/domain';

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

  const [amenities, offerings, specialties, sports, tags, trainers, schedule, reviews] =
    await Promise.all([
      getAmenities(),
      getOfferings(),
      getSpecialties(),
      getSports(),
      getTags(),
      getTrainers(),
      getSchedule(),
      getReviews(),
    ]);

  // Бейдж надёжности приезжает вместе с карточкой — числом, а не пачкой записей.
  //
  // ⚠️ Раньше страница считала его сама и забирала ради этого записи клуба целиком,
  // без входа. Считать надёжность на бэкенде дешевле на порядок: там это один
  // запрос-агрегат, а не выдача строк, из которых читаются только статусы.
  const reliability = club.reliability;

  const clubSports = sports.filter((sport) => club.sportIds.includes(sport.id));
  // Phase 24 Step 24.9c: публичный список тренеров клуба — ТОЛЬКО через confirmed links.
  const clubLinks = await getTrainerClubLinks({ clubId: club.id, status: 'confirmed' });
  const clubTrainerIds = new Set(clubLinks.map((link) => link.trainerId));
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
    .sort(compareByCreatedAtDesc);
  // ⚠️ Имя автора приезжает в самом отзыве (фаза 34). Раньше страница поднимала
  // ради подписи СПИСОК ВСЕХ пользователей площадки — с почтами и телефонами,
  // и без всякой проверки: тот маршрут был открыт любому.
  const reviewAuthors = reviews.reduce<Record<number, string>>((accumulator, review) => {
    if (review.authorName !== undefined) accumulator[review.userId] = review.authorName;

    return accumulator;
  }, {});

  return (
    <ClubDetailPageClient
      amenities={amenities}
      club={club}
      reviewAuthors={reviewAuthors}
      reviews={clubReviews}
      schedule={clubSchedule}
      specialties={specialties}
      sports={clubSports}
      tags={tags}
      trainers={clubTrainers}
      reliability={reliability}
    />
  );
}

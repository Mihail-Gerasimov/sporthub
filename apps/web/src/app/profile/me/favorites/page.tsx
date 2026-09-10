// Server page избранного атлета (Step 25.6): тянет clubs/trainers/bookings/reviews/users/specialties,
// пропускает в client-обёртку AthleteFavorites, которая применяет access-gate и фильтры.
import { AthleteFavorites } from '@/components/profile/athlete/AthleteFavorites';

import { readSession } from '@/lib/session';
import {
  getBookingsByUser,
  getClubs,
  getReviews,
  getSpecialties,
  getTrainers,
} from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function AthleteFavoritesRoute() {
  // ⚠️ Свой профиль приходит из сессии, и спрашивается он ПЕРВЫМ: от него зависит,
  // чьи записи брать. Раньше страница поднимала список всех пользователей площадки
  // только чтобы найти в нём себя.
  const viewer = await readSession();
  const athleteUserId = viewer?.id ?? null;

  const [bookings, clubs, reviews, specialties, trainers] = await Promise.all([
    athleteUserId === null ? [] : getBookingsByUser(athleteUserId),
    getClubs(),
    getReviews(),
    getSpecialties(),
    getTrainers(),
  ]);

  return (
    <AthleteFavorites
      bookings={bookings}
      clubs={clubs}
      reviews={reviews}
      specialties={specialties}
      trainers={trainers}
      // ⚠️ Передаётся ровно то, что нужно разделу, — список избранных клубов.
      // Раньше здесь стоял профиль, приведённый `as unknown as User`: приведение
      // молча скрывало, что у профиля из сессии нет `favoriteClubIds`, и раздел
      // падал у любого вошедшего. Через `unknown` типу проверять нечего.
      favoriteClubIds={viewer?.favoriteClubIds ?? []}
    />
  );
}

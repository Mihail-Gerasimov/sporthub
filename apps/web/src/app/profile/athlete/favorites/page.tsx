// Server page избранного атлета (Step 25.6): тянет clubs/trainers/bookings/reviews/users/specialties,
// пропускает в client-обёртку AthleteFavorites, которая применяет access-gate и фильтры.
import { AthleteFavorites } from '@/components/profile/athlete/AthleteFavorites';
import { getAuthUserIdFromCookies } from '@/lib/auth-cookie-server';
import {
  getBookingsByUser,
  getClubs,
  getReviews,
  getSpecialties,
  getTrainers,
  getUsers,
} from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function AthleteFavoritesRoute() {
  // Кто смотрит — известно из cookie входа: клиентская часть всё равно отберёт
  // записи по этому же атлету, поэтому спрашивать чужие незачем. У гостя записей
  // нет вовсе — раздел покажет отказ в доступе.
  const athleteUserId = await getAuthUserIdFromCookies();

  const [bookings, clubs, reviews, specialties, trainers, users] = await Promise.all([
    athleteUserId === null ? [] : getBookingsByUser(athleteUserId),
    getClubs(),
    getReviews(),
    getSpecialties(),
    getTrainers(),
    getUsers(),
  ]);

  return (
    <AthleteFavorites
      bookings={bookings}
      clubs={clubs}
      reviews={reviews}
      specialties={specialties}
      trainers={trainers}
      users={users}
    />
  );
}

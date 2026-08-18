// Server page избранного атлета (Step 25.6): тянет clubs/trainers/bookings/reviews/users/specialties,
// пропускает в client-обёртку AthleteFavorites, которая применяет access-gate и фильтры.
import { AthleteFavorites } from '@/components/profile/athlete/AthleteFavorites';
import {
  getBookings,
  getClubs,
  getReviews,
  getSpecialties,
  getTrainers,
  getUsers,
} from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function AthleteFavoritesRoute() {
  const [bookings, clubs, reviews, specialties, trainers, users] = await Promise.all([
    getBookings(),
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

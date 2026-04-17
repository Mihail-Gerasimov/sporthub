// Серверная страница кабинета спортсмена должна читать живые JSON-данные без статической заморозки.
import {
  getBookings,
  getClubs,
  getReviews,
  getSchedule,
  getSpecialties,
  getTrainers,
  getUsers,
} from '@/lib/db';
import { AthleteProfilePage } from '@/components/profile/AthleteProfilePage';

// Отключаем статическую оптимизацию, чтобы бронирования и отзывы обновлялись после изменений.
export const dynamic = 'force-dynamic';

export default async function AthleteProfileRoute() {
  const [bookings, clubs, reviews, schedule, specialties, trainers, users] = await Promise.all([
    getBookings(),
    getClubs(),
    getReviews(),
    getSchedule({ ownerType: 'all' }),
    getSpecialties(),
    getTrainers(),
    getUsers(),
  ]);

  return (
    <AthleteProfilePage
      bookings={bookings}
      clubs={clubs}
      reviews={reviews}
      schedule={schedule}
      specialties={specialties}
      trainers={trainers}
      users={users}
    />
  );
}

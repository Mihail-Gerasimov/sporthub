// Серверная страница кабинета спортсмена должна читать живые JSON-данные без статической заморозки.
// Phase 24 (Step 24.4): перед чтением bookings триггерим ленивые FSM-переходы
// (auto-cancel pending за 1h до слота, auto-unmark confirmed через 48h). Идемпотентно.
import {
  getBookings,
  getClubs,
  getReviews,
  getSchedule,
  getSpecialties,
  getTrainers,
  getUsers,
  runLazyBookingTransitions,
} from '@/lib/db';
import { AthleteProfilePage } from '@/components/profile/AthleteProfilePage';

// Отключаем статическую оптимизацию, чтобы бронирования и отзывы обновлялись после изменений.
export const dynamic = 'force-dynamic';

export default async function AthleteProfileRoute() {
  await runLazyBookingTransitions();

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

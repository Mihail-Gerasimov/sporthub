// Серверная страница кабинета провайдера — загрузка данных и передача в клиентский компонент.
import { getBookings, getClubs, getReviews, getSchedule, getTrainers, getUsers } from '@/lib/db';
import { ProviderProfilePage } from '@/components/profile/ProviderProfilePage';

// Кабинет провайдера должен перечитывать JSON на каждый запрос, иначе router.refresh() вернёт stale-state.
export const dynamic = 'force-dynamic';

export default async function ProviderProfileRoute() {
  const [bookings, clubs, reviews, schedule, trainers, users] = await Promise.all([
    getBookings(),
    getClubs(),
    getReviews(),
    getSchedule({ ownerType: 'all' }),
    getTrainers(),
    getUsers(),
  ]);

  return (
    <ProviderProfilePage
      bookings={bookings}
      clubs={clubs}
      reviews={reviews}
      schedule={schedule}
      trainers={trainers}
      users={users}
    />
  );
}

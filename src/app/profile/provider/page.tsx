// Серверная страница кабинета провайдера — загрузка данных и передача в клиентский компонент.
import { getBookings, getClubs, getReviews, getTrainers } from '@/lib/db';
import { ProviderProfilePage } from '@/components/profile/ProviderProfilePage';

// Кабинет провайдера должен перечитывать JSON на каждый запрос, иначе router.refresh() вернёт stale-state.
export const dynamic = 'force-dynamic';

export default async function ProviderProfileRoute() {
  const [bookings, clubs, reviews, trainers] = await Promise.all([
    getBookings(),
    getClubs(),
    getReviews(),
    getTrainers(),
  ]);

  return (
    <ProviderProfilePage bookings={bookings} clubs={clubs} reviews={reviews} trainers={trainers} />
  );
}

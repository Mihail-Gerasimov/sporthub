// Серверная страница кабинета провайдера — загрузка данных и передача в клиентский компонент.
import { getBookings, getClubs, getReviews, getTrainers } from '@/lib/db';
import { ProviderProfilePage } from '@/components/profile/ProviderProfilePage';

export default async function ProviderProfileRoute() {
  const [bookings, clubs, reviews, trainers] = await Promise.all([
    getBookings(),
    getClubs(),
    getReviews(),
    getTrainers(),
  ]);

  return (
    <ProviderProfilePage
      bookings={bookings}
      clubs={clubs}
      reviews={reviews}
      trainers={trainers}
    />
  );
}

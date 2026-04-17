// Серверная страница кабинета провайдера — загрузка данных и передача в клиентский компонент.
import {
  getAmenities,
  getBookings,
  getClubs,
  getReviews,
  getSchedule,
  getSpecialties,
  getSports,
  getTags,
  getTrainers,
  getUsers,
  getWorkFormats,
} from '@/lib/db';
import { ProviderProfilePage } from '@/components/profile/ProviderProfilePage';

// Кабинет провайдера должен перечитывать JSON на каждый запрос, иначе router.refresh() вернёт stale-state.
export const dynamic = 'force-dynamic';

export default async function ProviderProfileRoute() {
  const [
    amenities,
    bookings,
    clubs,
    reviews,
    schedule,
    specialties,
    sports,
    tags,
    trainers,
    users,
    workFormats,
  ] = await Promise.all([
    getAmenities(),
    getBookings(),
    getClubs(),
    getReviews(),
    getSchedule({ ownerType: 'all' }),
    getSpecialties(),
    getSports(),
    getTags(),
    getTrainers(),
    getUsers(),
    getWorkFormats(),
  ]);

  return (
    <ProviderProfilePage
      amenities={amenities}
      bookings={bookings}
      clubs={clubs}
      reviews={reviews}
      schedule={schedule}
      specialties={specialties}
      sports={sports}
      tags={tags}
      trainers={trainers}
      users={users}
      workFormats={workFormats}
    />
  );
}

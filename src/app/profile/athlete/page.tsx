import { getBookings, getClubs, getReviews, getSchedule, getTrainers, getUsers } from '@/lib/db';
import { AthleteProfilePage } from '@/components/profile/AthleteProfilePage';

export default async function AthleteProfileRoute() {
  const [bookings, clubs, reviews, schedule, trainers, users] = await Promise.all([
    getBookings(),
    getClubs(),
    getReviews(),
    getSchedule({ ownerType: 'all' }),
    getTrainers(),
    getUsers(),
  ]);

  return (
    <AthleteProfilePage
      bookings={bookings}
      clubs={clubs}
      reviews={reviews}
      schedule={schedule}
      trainers={trainers}
      users={users}
    />
  );
}

import { getBookings, getClubs, getReviews, getSchedule, getTrainers } from '@/lib/db';
import { AthleteProfilePage } from '@/components/profile/AthleteProfilePage';

export default async function AthleteProfileRoute() {
  const [bookings, clubs, reviews, schedule, trainers] = await Promise.all([
    getBookings(),
    getClubs(),
    getReviews(),
    getSchedule(),
    getTrainers(),
  ]);

  return (
    <AthleteProfilePage
      bookings={bookings}
      clubs={clubs}
      reviews={reviews}
      schedule={schedule}
      trainers={trainers}
    />
  );
}

import { getBookings, getReviews } from '@/lib/db';
import { AthleteProfilePage } from '@/components/profile/AthleteProfilePage';

export default async function AthleteProfileRoute() {
  const [bookings, reviews] = await Promise.all([getBookings(), getReviews()]);

  return <AthleteProfilePage bookings={bookings} reviews={reviews} />;
}

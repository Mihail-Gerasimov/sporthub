// Server page отзывов атлета (Step 25.6): тянет clubs/trainers/reviews, пропускает в
// client-обёртку AthleteReviews — она применяет access-gate и резолвит targetName.
import { AthleteReviews } from '@/components/profile/athlete/AthleteReviews';
import { getClubs, getReviews, getTrainers } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function AthleteReviewsRoute() {
  const [clubs, reviews, trainers] = await Promise.all([getClubs(), getReviews(), getTrainers()]);

  return <AthleteReviews clubs={clubs} reviews={reviews} trainers={trainers} />;
}

// Phase 25 Step 25.14: server page раздела «Отзывы» провайдера.
import { ProviderReviews } from '@/components/profile/provider/ProviderReviews';
import { getClubs, getReviews, getTrainers } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function ProviderReviewsRoute() {
  const [reviews, clubs, trainers] = await Promise.all([getReviews(), getClubs(), getTrainers()]);
  return <ProviderReviews reviews={reviews} clubs={clubs} trainers={trainers} />;
}

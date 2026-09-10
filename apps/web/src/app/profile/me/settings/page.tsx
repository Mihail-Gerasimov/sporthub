// Server page настроек атлета (Step 25.6): тянет clubs/trainers/reviews для существующего
// AthleteFeedbackSettingsSection (там есть блок «Мои отзывы»). Подсекция Notifications
// per-NotificationType появится в Step 25.14.
import { AthleteSettings } from '@/components/profile/athlete/AthleteSettings';
import { getClubs, getReviews, getTrainers } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function AthleteSettingsRoute() {
  const [clubs, reviews, trainers] = await Promise.all([getClubs(), getReviews(), getTrainers()]);

  return <AthleteSettings clubs={clubs} reviews={reviews} trainers={trainers} />;
}

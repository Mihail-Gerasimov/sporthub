// Server page Dashboard провайдера (Step 25.8). Основной маршрут ЛК после
// Phase 26 Step 26.5 — корневой /profile/provider теперь редиректит сюда.
// Тянет bookings/clubs/trainers/offerings/schedule/links/notifications для
// client-обёртки ProviderDashboard.
import { ProviderDashboard } from '@/components/profile/provider/ProviderDashboard';
import {
  getBookings,
  getClubs,
  getNotifications,
  getOfferings,
  getReviews,
  getSchedule,
  getTrainerClubLinks,
  getTrainers,
  runLazyBookingTransitions,
} from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function ProviderDashboardRoute() {
  await runLazyBookingTransitions();

  const [bookings, clubs, trainers, offerings, schedule, links, notifications, reviews] =
    await Promise.all([
      getBookings(),
      getClubs(),
      getTrainers(),
      getOfferings(),
      getSchedule({ ownerType: 'all' }),
      getTrainerClubLinks(),
      getNotifications(),
      getReviews(),
    ]);

  return (
    <ProviderDashboard
      bookings={bookings}
      clubs={clubs}
      trainers={trainers}
      offerings={offerings}
      schedule={schedule}
      links={links}
      notifications={notifications}
      reviews={reviews}
    />
  );
}

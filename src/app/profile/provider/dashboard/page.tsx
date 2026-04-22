// Server page Dashboard провайдера (Step 25.8): параллельный маршрут с корнем
// /profile/provider. Корневой `ProviderProfilePage` остаётся до Step 25.17 —
// переключение на dashboard финализируется там. Тянет bookings/clubs/trainers/
// offerings/schedule/links/notifications для client-обёртки ProviderDashboard.
import { ProviderDashboard } from '@/components/profile/provider/ProviderDashboard';
import {
  getBookings,
  getClubs,
  getNotifications,
  getOfferings,
  getSchedule,
  getTrainerClubLinks,
  getTrainers,
  runLazyBookingTransitions,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function ProviderDashboardRoute() {
  await runLazyBookingTransitions();

  const [bookings, clubs, trainers, offerings, schedule, links, notifications] = await Promise.all([
    getBookings(),
    getClubs(),
    getTrainers(),
    getOfferings(),
    getSchedule({ ownerType: 'all' }),
    getTrainerClubLinks(),
    getNotifications(),
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
    />
  );
}

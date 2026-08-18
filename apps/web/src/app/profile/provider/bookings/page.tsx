// Server page inbox'а провайдера (Step 25.9): параллельный маршрут с корнем
// /profile/provider. Старый `ProviderBookingsSection` в корне остаётся до Step 25.17.
import { ProviderBookingsInbox } from '@/components/profile/provider/ProviderBookingsInbox';
import {
  getBookings,
  getClubs,
  getOfferings,
  getSchedule,
  getSports,
  getTrainers,
  getUsers,
  runLazyBookingTransitions,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function ProviderBookingsRoute() {
  await runLazyBookingTransitions();

  const [bookings, clubs, trainers, offerings, schedule, sports, users] = await Promise.all([
    getBookings(),
    getClubs(),
    getTrainers(),
    getOfferings(),
    getSchedule({ ownerType: 'all' }),
    getSports(),
    getUsers(),
  ]);

  return (
    <ProviderBookingsInbox
      bookings={bookings}
      clubs={clubs}
      trainers={trainers}
      offerings={offerings}
      schedule={schedule}
      sports={sports}
      users={users}
    />
  );
}

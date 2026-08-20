// Server page inbox'а провайдера (Step 25.9): параллельный маршрут с корнем
// /profile/provider.
//
// Срез берётся с историей клиентов: рядом с каждой входящей записью стоит бейдж
// надёжности атлета, а он считается по всей его истории, не только по нашей части.
import { ProviderBookingsInbox } from '@/components/profile/provider/ProviderBookingsInbox';
import { loadProviderScopeWithClientHistory } from '@/lib/provider-scope';
import { getOfferings, getSchedule, getSports, getUsers } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function ProviderBookingsRoute() {
  const [{ bookings, clubs, trainers }, offerings, schedule, sports, users] = await Promise.all([
    loadProviderScopeWithClientHistory(),
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

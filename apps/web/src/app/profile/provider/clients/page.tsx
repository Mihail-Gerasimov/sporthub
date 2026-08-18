// Server page раздела «Клиенты» провайдера (Step 25.10-B). Параллельный маршрут
// к корню /profile/provider — агрегация уникальных клиентов и CRM-заметок. Финальная
// миграция со старого ProviderProfilePage — Step 25.17.
import { ProviderClients } from '@/components/profile/provider/ProviderClients';
import {
  getAllProviderClientNotes,
  getBookings,
  getClubs,
  getOfferings,
  getSchedule,
  getTrainers,
  getUsers,
  runLazyBookingTransitions,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function ProviderClientsRoute() {
  // Запустим lazy FSM-переходы до чтения — иначе завершённые слоты могут висеть в
  // confirmed и завышать active-счётчики на карточках.
  await runLazyBookingTransitions();

  const [bookings, clubs, trainers, offerings, schedule, users, notes] = await Promise.all([
    getBookings(),
    getClubs(),
    getTrainers(),
    getOfferings(),
    getSchedule({ ownerType: 'all' }),
    getUsers(),
    getAllProviderClientNotes(),
  ]);

  return (
    <ProviderClients
      bookings={bookings}
      clubs={clubs}
      trainers={trainers}
      offerings={offerings}
      schedule={schedule}
      users={users}
      notes={notes}
    />
  );
}

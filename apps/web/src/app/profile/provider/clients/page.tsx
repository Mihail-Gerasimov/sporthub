// Server page раздела «Клиенты» провайдера (Step 25.10-B). Параллельный маршрут
// к корню /profile/provider — агрегация уникальных клиентов и CRM-заметок.
//
// Срез — с историей клиентов: список собирается из записей провайдера, а бейдж
// надёжности рядом с именем обязан отражать всю историю человека.
import { ProviderClients } from '@/components/profile/provider/ProviderClients';
import { loadProviderScopeWithClientHistory } from '@/lib/provider-scope';
import { getAllProviderClientNotes, getOfferings, getSchedule, getUsers } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function ProviderClientsRoute() {
  const [{ bookings, clubs, trainers }, offerings, schedule, users, notes] = await Promise.all([
    loadProviderScopeWithClientHistory(),
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

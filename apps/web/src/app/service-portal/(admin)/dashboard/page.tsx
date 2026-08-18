/**
 * Server page dashboard admin-панели.
 * Загружает данные через Promise.all и передаёт в клиентский DashboardPage.
 */
import { getBookings, getClubs, getTrainers, getUsers } from '@/lib/server-api';
import { DashboardPage } from '@/components/admin/DashboardPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'SportHub — Dashboard',
};

export default async function DashboardRoute() {
  const [users, clubs, trainers, bookings] = await Promise.all([
    getUsers(),
    getClubs(),
    getTrainers(),
    getBookings(),
  ]);

  return <DashboardPage users={users} clubs={clubs} trainers={trainers} bookings={bookings} />;
}

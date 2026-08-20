/**
 * Server page dashboard admin-панели.
 * Загружает данные через Promise.all и передаёт в клиентский DashboardPage.
 *
 * ⚠️ Единственное место, где полный срез записей остаётся сознательно. Сводка строит
 * строку на КАЖДОГО пользователя площадки: активные записи атлета, его надёжность
 * и карантин. Сузить по владельцу или по атлету нечем — здесь нет ни того, ни другого,
 * а по статусам сужать почти нечего: три правила вместе читают пять статусов из восьми.
 * Размен вышел бы плохой — четвёртый набор статусов, который обязан следовать сразу
 * за тремя правилами домена, ради пятой части выдачи.
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

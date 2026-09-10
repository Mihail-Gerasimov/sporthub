/**
 * Server page dashboard admin-панели.
 * Загружает данные через Promise.all и передаёт в клиентский DashboardPage.
 *
 * ⚠️ Единственное место, где полный срез записей остаётся сознательно. Сводка строит
 * строку на КАЖДОГО пользователя площадки: активные записи атлета и его надёжность.
 * Сузить по владельцу или по атлету нечем — здесь нет ни того, ни другого, а по
 * статусам сужать почти нечего: два правила вместе читают пять статусов из восьми.
 * Размен вышел бы плохой — третий набор статусов, который обязан следовать сразу
 * за правилами домена, ради пятой части выдачи.
 *
 * ⚠️ Шаг 35.20a. Каталог здесь больше НЕ читается. Он был нужен ровно затем,
 * чтобы посчитать лица услуг у каждого человека сверкой `managedByUserId`
 * с номером владельца; поле из публичной выдачи ушло, а число лиц приходит
 * ответом `GET /api/users` — его считает база группировкой. Раздел перестал
 * скачивать весь каталог ради двух счётчиков.
 */
import { getBookings, getUsers } from '@/lib/server-api';
import { DashboardPage } from '@/components/admin/DashboardPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'SportHub — Dashboard',
};

export default async function DashboardRoute() {
  const [users, bookings] = await Promise.all([getUsers(), getBookings()]);

  return <DashboardPage users={users} bookings={bookings} />;
}

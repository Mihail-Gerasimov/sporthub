/**
 * Server page логов активности в admin-панели.
 * Логи загружаются клиентским компонентом через fetch к /api/logs.
 */
import { LogsPage } from '@/components/admin/LogsPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'SportHub — Логи',
};

export default function LogsRoute() {
  return <LogsPage />;
}

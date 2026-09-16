/**
 * Server page логов активности в admin-панели.
 * Логи загружаются клиентским компонентом через fetch к /api/logs.
 */
import { LogsPage } from '@/components/admin/LogsPage';
import { BRAND_NAME } from '@sporthub/domain';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `${BRAND_NAME} — Логи`,
};

export default function LogsRoute() {
  return <LogsPage />;
}

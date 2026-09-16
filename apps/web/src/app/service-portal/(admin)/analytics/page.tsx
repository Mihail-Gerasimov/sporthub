/**
 * Страница аналитики admin-панели.
 * Server component: загружает список видов спорта и передаёт в клиентский дашборд.
 */
import { getSports } from '@/lib/server-api';
import { BRAND_NAME } from '@sporthub/domain';

import { AnalyticsDashboard } from '@/components/admin/analytics/AnalyticsDashboard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `${BRAND_NAME} — Аналитика`,
};

export default async function AnalyticsPage() {
  const sports = await getSports();

  return <AnalyticsDashboard sports={sports} />;
}

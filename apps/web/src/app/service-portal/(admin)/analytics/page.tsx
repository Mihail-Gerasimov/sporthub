/**
 * Страница аналитики admin-панели.
 * Server component: загружает список видов спорта и передаёт в клиентский дашборд.
 */
import { getSports } from '@/lib/server-api';

import { AnalyticsDashboard } from '@/components/admin/analytics/AnalyticsDashboard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'SportHub — Аналитика',
};

export default async function AnalyticsPage() {
  const sports = await getSports();

  return <AnalyticsDashboard sports={sports} />;
}

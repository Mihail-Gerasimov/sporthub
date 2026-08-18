/**
 * Страница модерации публикаций в админ-панели.
 * Server component: загружает виды спорта и рендерит клиентский ModerationPage.
 */
import { getSports } from '@/lib/server-api';
import { ModerationPage } from '@/components/admin/ModerationPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'SportHub — Модерация',
};

export default async function ModerationPageRoute() {
  const sports = await getSports();

  return <ModerationPage sports={sports.map((s) => ({ id: s.id, name: s.name }))} />;
}

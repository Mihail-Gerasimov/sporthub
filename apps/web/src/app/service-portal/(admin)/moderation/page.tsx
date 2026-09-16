/**
 * Страница модерации публикаций в админ-панели.
 * Server component: загружает виды спорта и рендерит клиентский ModerationPage.
 *
 * Шаг 37.54: отбор раздела живёт в адресе, и клиентская часть читает его
 * через `useSearchParams()`. Отсюда граница `Suspense`: без неё чтение адреса
 * увело бы в отрисовку на клиенте ВЕСЬ маршрут, а не одну эту ветку.
 */
import { Suspense } from 'react';
import { BRAND_NAME } from '@sporthub/domain';

import { getSports } from '@/lib/server-api';
import { ModerationPage } from '@/components/admin/ModerationPage';
import { Skeleton } from '@/components/ui/Skeleton';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `${BRAND_NAME} — Модерация`,
};

export default async function ModerationPageRoute() {
  const sports = await getSports();

  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-[16px]" />}>
      <ModerationPage sports={sports.map((s) => ({ id: s.id, name: s.name }))} />
    </Suspense>
  );
}

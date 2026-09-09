// Layout кабинета атлета: монтирует ProfileLayoutShell вокруг всех подмаршрутов /profile/athlete/*.
//
// ⚠️ Здесь стоит СЕРВЕРНАЯ проверка входа (фаза 34). До неё кабинет открывался
// кому угодно: страница рисовалась целиком, данные уезжали в поток ответа,
// и уже поверх них показывалась плашка «нет доступа» — то есть данные у гостя
// были, их просто не показывали.
//
// Проверка в лейауте, а не в каждой странице: подмаршрутов у кабинета девять,
// и забыть один из них — вопрос времени.
import type { ReactNode } from 'react';

import { ProfileLayoutShell } from '@/components/profile/ProfileLayoutShell';
import { requireRole } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AthleteProfileLayout({ children }: { children: ReactNode }) {
  await requireRole(['athlete']);

  return <ProfileLayoutShell variant="athlete">{children}</ProfileLayoutShell>;
}

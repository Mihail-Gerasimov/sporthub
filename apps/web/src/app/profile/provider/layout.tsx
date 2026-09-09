// Layout кабинета провайдера: подгружает публикации и записи для data-driven навигации
// и оборачивает все подмаршруты /profile/provider/* в ProfileLayoutShell.
//
// ⚠️ Данные берутся общим срезом `loadProviderScope`, а не отдельным вызовом. Макет и
// страница раздела рендерятся в ОДНОМ запросе, и раньше каждый ходил на бэкенд сам —
// за навигацию выходило два одинаковых похода. Общий срез кэшируется на запрос, поэтому
// поход остаётся один.
import type { ReactNode } from 'react';

import { ProfileLayoutShell } from '@/components/profile/ProfileLayoutShell';
import { loadProviderScope } from '@/lib/provider-scope';
import { redirect } from 'next/navigation';

import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ProviderProfileLayout({ children }: { children: ReactNode }) {
  // ⚠️ Проверка стоит ПЕРЕД загрузкой среза (фаза 34): иначе гость успевал бы
  // получить данные кабинета в потоке ответа, и клиентская плашка «нет доступа»
  // прятала бы то, что ему уже отдали.
  //
  // ⚠️ Шаг 35.20. Ролей больше нет: в кабинет провайдера пускает не имя роли,
  // а наличие хотя бы одного лица услуг. Человек без лиц уходит на главную —
  // и уходит ДО того, как страница сходит за данными.
  const session = await requireSession();

  if (session.faces.length === 0) redirect('/');

  const { bookings, clubs, trainers } = await loadProviderScope();

  return (
    <ProfileLayoutShell variant="provider" clubs={clubs} trainers={trainers} bookings={bookings}>
      {children}
    </ProfileLayoutShell>
  );
}

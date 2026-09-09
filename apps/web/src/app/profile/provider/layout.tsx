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
import { requireRole } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ProviderProfileLayout({ children }: { children: ReactNode }) {
  // ⚠️ Проверка стоит ПЕРЕД загрузкой среза (фаза 34): иначе гость успевал бы
  // получить данные кабинета в потоке ответа, и клиентская плашка «нет доступа»
  // прятала бы то, что ему уже отдали.
  //
  // Обе роли провайдера пускаются в кабинет и после этапа Э8a: кабинет у них
  // общий, разными стали РАЗДЕЛЫ внутри. Что кому показать, решают права
  // вошедшего — они приходят тем же ответом «кто я», и лейаут передаёт их вниз,
  // чтобы навигация не гадала по имени роли.
  const session = await requireRole(['club_owner', 'trainer']);

  const { bookings, clubs, trainers } = await loadProviderScope();

  return (
    <ProfileLayoutShell
      variant="provider"
      clubs={clubs}
      trainers={trainers}
      bookings={bookings}
      capabilities={session.capabilities}
    >
      {children}
    </ProfileLayoutShell>
  );
}

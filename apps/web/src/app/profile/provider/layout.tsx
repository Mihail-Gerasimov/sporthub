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

export const dynamic = 'force-dynamic';

export default async function ProviderProfileLayout({ children }: { children: ReactNode }) {
  const { bookings, clubs, trainers } = await loadProviderScope();

  return (
    <ProfileLayoutShell variant="provider" clubs={clubs} trainers={trainers} bookings={bookings}>
      {children}
    </ProfileLayoutShell>
  );
}

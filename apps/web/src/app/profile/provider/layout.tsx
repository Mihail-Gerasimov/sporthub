// Layout кабинета провайдера: подгружает clubs/trainers/bookings для data-driven навигации
// и оборачивает все подмаршруты /profile/provider/* в ProfileLayoutShell.
import type { ReactNode } from 'react';

import { ProfileLayoutShell } from '@/components/profile/ProfileLayoutShell';
import { getBookings, getClubs, getTrainers, runLazyBookingTransitions } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function ProviderProfileLayout({ children }: { children: ReactNode }) {
  // Ленивые FSM-переходы нужны, чтобы hasProviderBookings учитывал актуальные статусы
  // (auto-cancel, auto-unmark) без двойной загрузки внутри подстраницы.
  await runLazyBookingTransitions();

  const [bookings, clubs, trainers] = await Promise.all([getBookings(), getClubs(), getTrainers()]);

  return (
    <ProfileLayoutShell variant="provider" clubs={clubs} trainers={trainers} bookings={bookings}>
      {children}
    </ProfileLayoutShell>
  );
}

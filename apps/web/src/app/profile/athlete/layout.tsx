// Layout кабинета атлета: монтирует ProfileLayoutShell вокруг всех подмаршрутов /profile/athlete/*.
// Серверный рендер — ничего не fetch'им (athlete-nav статичен по составу).
import type { ReactNode } from 'react';

import { ProfileLayoutShell } from '@/components/profile/ProfileLayoutShell';

export const dynamic = 'force-dynamic';

export default function AthleteProfileLayout({ children }: { children: ReactNode }) {
  return <ProfileLayoutShell variant="athlete">{children}</ProfileLayoutShell>;
}

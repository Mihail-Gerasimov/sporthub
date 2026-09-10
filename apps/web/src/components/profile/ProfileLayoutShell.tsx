// Клиентская обёртка лейаута `/profile/**`: собирает разделы открытого кабинета,
// рисует sidebar (desktop) и mobile-drawer вокруг серверной страницы раздела.
//
// ⚠️ Шаг 35.31. Обёртка больше не гадает, какой кабинет открыт, по типу учётной
// записи или по списку лиц: кабинет приезжает готовым от серверного лейаута,
// который взял лицо из адреса и сверил владение. До этого шага кабинет лица был
// один на все лица человека, разделы считались по всему их списку, а адрес
// не нёс номера — сверять было нечего.
'use client';

import { useEffect, useMemo, type ReactNode } from 'react';

import { faceKey, type CabinetTarget } from '@/lib/service-faces';
import { useAuthStore } from '@/stores/useAuthStore';

import { CabinetProvider } from './cabinet-context';
import { FaceSwitcher } from './FaceSwitcher';
import { ProfileBreadcrumb } from './ProfileBreadcrumb';
import { getCabinetNavItems, type ProfileNavItem } from './profile-nav-items';
import { ProfileMobileNav } from './ProfileMobileNav';
import { ProfileSidebar } from './ProfileSidebar';

interface ProfileLayoutShellProps {
  /** Открытый кабинет: личный человека либо кабинет конкретного лица. */
  cabinet: CabinetTarget;
  /**
   * Есть ли у лица записи. Считает серверный лейаут по своему же срезу —
   * от этого зависит, показывать ли разделы про записи.
   */
  hasBookings?: boolean;
  children: ReactNode;
}

export function ProfileLayoutShell({
  cabinet,
  hasBookings = false,
  children,
}: ProfileLayoutShellProps) {
  const setActiveFace = useAuthStore((state) => state.setActiveFace);
  const face = cabinet.face;

  // ⚠️ Лицо кабинета задаёт АДРЕС, а не переключатель. Стор о нём узнаёт отсюда:
  // по активному лицу шапка решает, куда ведёт аватар, — и без этой строки она
  // вела бы в кабинет другого лица, чем тот, который человек сейчас открыл.
  useEffect(() => {
    if (face === null) return;

    setActiveFace(faceKey(face));
  }, [face, setActiveFace]);

  const items = useMemo<ProfileNavItem[]>(
    () => getCabinetNavItems(cabinet, hasBookings),
    [cabinet, hasBookings],
  );

  const ariaLabel = face === null ? 'Разделы кабинета атлета' : 'Разделы кабинета провайдера';

  return (
    <CabinetProvider cabinet={cabinet}>
      <div className="mx-auto w-full max-w-7xl px-4 py-4 md:py-6">
        {face === null ? null : <FaceSwitcher className="mb-4" />}
        <ProfileMobileNav items={items} ariaLabel={ariaLabel} className="mb-4" />
        <div className="md:grid md:grid-cols-[14rem_minmax(0,1fr)] md:items-start md:gap-6">
          <ProfileSidebar
            items={items}
            ariaLabel={ariaLabel}
            className="hidden md:sticky md:top-28 md:flex md:self-start"
          />
          <div className="min-w-0">
            <ProfileBreadcrumb items={items} cabinetPath={cabinet.href} />
            {children}
          </div>
        </div>
      </div>
    </CabinetProvider>
  );
}

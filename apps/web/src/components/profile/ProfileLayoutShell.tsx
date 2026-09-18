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

import { isFaceArchived, faceKey, type CabinetTarget } from '@/lib/service-faces';
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

  // ⚠️ Убранное из каталога лицо обязано сказать об этом в САМОМ кабинете, а не
  // только в переключателе: у человека с одним лицом переключателя нет вовсе,
  // и без этой полосы кабинет архивированного клуба выглядел ровно как живой.
  // Найдено полным браузерным прогоном (35.44a).
  const archived = face !== null && isFaceArchived(face);
  const cabinetTitle = face?.name ?? 'Личный кабинет';
  const cabinetKind =
    face === null
      ? 'Профиль спортсмена'
      : face.kind === 'club'
        ? 'Кабинет клуба'
        : 'Кабинет тренера';

  return (
    <CabinetProvider cabinet={cabinet}>
      <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 md:py-7">
        {archived ? (
          <p
            data-testid="profile-face-archived-notice"
            className="mb-4 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm font-semibold text-warn"
          >
            Публикация убрана из каталога. Записи, отзывы и связи сохранены — вернуть её можно из
            раздела публикаций.
          </p>
        ) : null}
        <div className="md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:items-start md:gap-7">
          <aside className="hidden md:sticky md:top-24 md:flex md:flex-col md:gap-3">
            <div className="rounded-[18px] border border-line bg-card p-4 shadow-card">
              <div className="flex size-11 items-center justify-center rounded-[12px] bg-accent font-display text-lg font-semibold uppercase text-ink">
                {cabinetTitle.slice(0, 1)}
              </div>
              <p className="mt-3 truncate font-display text-lg font-semibold uppercase text-ink">
                {cabinetTitle}
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
                {cabinetKind}
              </p>
              {face === null ? null : <FaceSwitcher className="mt-4" />}
            </div>
            <ProfileSidebar items={items} ariaLabel={ariaLabel} />
          </aside>
          <div className="min-w-0">
            <div className="mb-4 flex items-center justify-between gap-3 md:hidden">
              {face === null ? (
                <div>
                  <p className="font-display text-xl font-semibold uppercase text-ink">
                    {cabinetTitle}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
                    {cabinetKind}
                  </p>
                </div>
              ) : (
                <FaceSwitcher />
              )}
              <ProfileMobileNav items={items} ariaLabel={ariaLabel} />
            </div>
            <ProfileBreadcrumb items={items} cabinetPath={cabinet.href} />
            {children}
          </div>
        </div>
      </div>
    </CabinetProvider>
  );
}

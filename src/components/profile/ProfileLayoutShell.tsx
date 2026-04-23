// Клиентский wrapper layout'а /profile/*: собирает data-driven nav items, рендерит
// sidebar (desktop) + mobile-drawer + слот под children (серверную страницу раздела).
'use client';

import { useMemo, type ReactNode } from 'react';

import { getProviderClubs, getProviderTrainers } from '@/components/profile/provider-helpers';
import { useAuthStore } from '@/stores/useAuthStore';
import type { Booking, Club, Trainer } from '@/types';

import { ProfileBreadcrumb } from './ProfileBreadcrumb';
import { getAthleteNavItems, getProviderNavItems, type ProfileNavItem } from './profile-nav-items';
import { ProfileMobileNav } from './ProfileMobileNav';
import { ProfileSidebar } from './ProfileSidebar';

type ProfileLayoutVariant = 'athlete' | 'provider';

interface ProfileLayoutShellProps {
  variant: ProfileLayoutVariant;
  /** Данные для условных provider-разделов. Для athlete layout не используются. */
  clubs?: Club[];
  trainers?: Trainer[];
  bookings?: Booking[];
  children: ReactNode;
}

export function ProfileLayoutShell({
  variant,
  clubs = [],
  trainers = [],
  bookings = [],
  children,
}: ProfileLayoutShellProps) {
  const user = useAuthStore((state) => state.user);
  const accountType = useAuthStore((state) => state.accountType);

  const items = useMemo<ProfileNavItem[]>(() => {
    if (!user || user.id === undefined) {
      return [];
    }

    if (variant === 'athlete') {
      // На athlete layout показываем nav только авторизованному атлету.
      return accountType === 'athlete' ? getAthleteNavItems() : [];
    }

    // Provider layout: смотрим, какие сущности управляются текущим провайдером.
    if (accountType !== 'provider') {
      return [];
    }

    const userId = user.id;
    const providerClubs = getProviderClubs(clubs, userId);
    const providerTrainers = getProviderTrainers(trainers, userId);
    const providerClubIds = new Set(providerClubs.map((club) => club.id));
    const providerTrainerIds = new Set(providerTrainers.map((trainer) => trainer.id));
    const hasProviderBookings = bookings.some((booking) => {
      if (booking.ownerId === undefined) {
        return false;
      }

      if (booking.ownerType === 'club') {
        return providerClubIds.has(booking.ownerId);
      }

      if (booking.ownerType === 'trainer') {
        return providerTrainerIds.has(booking.ownerId);
      }

      return false;
    });

    return getProviderNavItems({
      providerClubs,
      providerTrainers,
      hasProviderBookings,
    });
  }, [user, accountType, variant, clubs, trainers, bookings]);

  const ariaLabel =
    variant === 'athlete' ? 'Разделы кабинета атлета' : 'Разделы кабинета провайдера';

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 md:py-6">
      <ProfileMobileNav items={items} ariaLabel={ariaLabel} className="mb-4" />
      <div className="md:grid md:grid-cols-[14rem_minmax(0,1fr)] md:items-start md:gap-6">
        <ProfileSidebar
          items={items}
          ariaLabel={ariaLabel}
          className="hidden md:sticky md:top-28 md:flex md:self-start"
        />
        <div className="min-w-0">
          <ProfileBreadcrumb items={items} variant={variant} />
          {children}
        </div>
      </div>
    </div>
  );
}

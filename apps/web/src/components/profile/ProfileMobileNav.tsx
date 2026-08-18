// Mobile-drawer с разделами кабинета. Виден только < md; параллельно с глобальным MobileNav
// (он для всего сайта, этот — только внутри /profile).
'use client';

import { useState } from 'react';

import { Modal } from '@/components/ui';
import { cn } from '@/lib/utils';

import type { ProfileNavItem } from './profile-nav-items';
import { ProfileSidebar } from './ProfileSidebar';

interface ProfileMobileNavProps {
  items: ProfileNavItem[];
  ariaLabel: string;
  className?: string;
}

export function ProfileMobileNav({ items, ariaLabel, className }: ProfileMobileNavProps) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className={cn('md:hidden', className)}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Открыть меню кабинета"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-sm font-medium text-ink shadow-sm"
      >
        <span aria-hidden="true">☰</span>
        Разделы
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Разделы кабинета">
        <ProfileSidebar items={items} ariaLabel={ariaLabel} onItemClick={() => setOpen(false)} />
      </Modal>
    </div>
  );
}

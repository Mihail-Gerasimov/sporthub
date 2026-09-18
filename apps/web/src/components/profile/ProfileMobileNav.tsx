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
        className="inline-flex min-h-11 items-center gap-2 rounded-[12px] border border-line bg-card px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink shadow-card"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        Разделы
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Разделы кабинета">
        <ProfileSidebar items={items} ariaLabel={ariaLabel} onItemClick={() => setOpen(false)} />
      </Modal>
    </div>
  );
}

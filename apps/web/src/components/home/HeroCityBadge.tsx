/**
 * Бейдж города в герое (шаг 38.78, тупик № 32): прежде город стоял литералом
 * «Samara active city», а `CitySelector` его менял — бейдж не замечал. Теперь
 * бейдж читает `useFilterStore.selectedCity` — ту же запись, что пишет селектор, —
 * и ведёт к блоку поиска каталога, где город меняют (38.79c: рабочая часть на `/catalog`).
 *
 * Клиентский островок в серверном герое: стор — единственная причина `'use client'`,
 * остальной герой остаётся серверным.
 *
 * Почему не `ui/Badge`: это ссылка на тёмной плашке, а `Badge` — статичная метка
 * светлого холста.
 */
'use client';

import Link from 'next/link';

import { catalogSectionHref } from '@/lib/catalog-sections';
import { useFilterStore } from '@/stores/useFilterStore';

/** Булавка — значок места. */
function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5 shrink-0">
      <path
        d="M12 21c-1.6-2-6-7.3-6-11a6 6 0 1 1 12 0c0 3.7-4.4 9-6 11Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="10" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function HeroCityBadge() {
  const selectedCity = useFilterStore((state) => state.selectedCity);

  return (
    <Link
      href={catalogSectionHref('discover')}
      className="inline-flex items-center gap-1.5 rounded-full border border-plate-line py-[5px] pr-3.5 pl-2.5 font-body text-[12px] font-semibold text-plate-muted transition-colors hover:border-lime/40 hover:text-plate-ink"
    >
      <PinIcon />
      <span className="sr-only">Город:</span> {selectedCity}
    </Link>
  );
}

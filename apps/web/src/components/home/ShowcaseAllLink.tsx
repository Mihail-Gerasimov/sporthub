'use client';

// Ссылка «Все клубы» / «Все тренеры» витрины (38.79b): ведёт в выдачу каталога
// и ставит режим стора — стор общий с каталогом, и «Все тренеры» открывают
// именно тренеров, а не последний выбранный режим. Клиентская только ради стора.
// Фон кнопки — контрастен секции, как в макете (`HomePage.tsx:596,647`): у клубов
// секция на холсте — кнопка белая, у тренеров секция белая — кнопка на холсте.

import Link from 'next/link';

import { catalogSectionHref } from '@/lib/catalog-sections';
import { useFilterStore, type DiscoveryMode } from '@/stores/useFilterStore';

type ShowcaseAllLinkProps = {
  mode: DiscoveryMode;
  children: string;
  /** `primary` — зелёная кнопка баннера пробного (`HomePage.tsx:683-688`), без тени. */
  tone?: 'outline' | 'primary';
};

/** Классы по тону: обводка (у клубов на белом, у тренеров на холсте) или зелёная заливка. */
function toneClass(mode: DiscoveryMode, tone: 'outline' | 'primary'): string {
  if (tone === 'primary') {
    return 'gap-[7px] rounded-[10px] bg-lime px-5 py-[9px] font-display text-[13px] font-black tracking-[0.04em] text-ink hover:bg-lime-hov hover:text-plate-ink';
  }

  return `gap-1.5 rounded-[10px] border border-line px-[18px] py-[9px] font-body text-[12px] font-bold text-muted hover:border-lime hover:text-ink ${mode === 'trainers' ? 'bg-bg' : 'bg-card'}`;
}

export function ShowcaseAllLink({ mode, children, tone = 'outline' }: ShowcaseAllLinkProps) {
  const setDiscoveryMode = useFilterStore((state) => state.setDiscoveryMode);

  return (
    <Link
      href={catalogSectionHref('results')}
      onClick={() => setDiscoveryMode(mode)}
      className={`inline-flex items-center whitespace-nowrap no-underline transition-colors ${toneClass(mode, tone)}`}
    >
      {children}
      <span aria-hidden="true">→</span>
    </Link>
  );
}

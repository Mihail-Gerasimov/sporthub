'use client';

import { Input } from '@/components/ui';
import { useFilterStore } from '@/stores/useFilterStore';

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <circle cx="11" cy="11" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="m15.5 15.5 4 4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
      <path
        d="M12 20.2c-1.4-1.8-5.5-7-5.5-10.8a5.5 5.5 0 1 1 11 0c0 3.8-4.1 9-5.5 10.8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="9.5" r="1.8" fill="currentColor" />
    </svg>
  );
}

export function SearchBar() {
  const discoveryMode = useFilterStore((state) => state.discoveryMode);
  const searchQuery = useFilterStore((state) => state.searchQuery);
  const setSearch = useFilterStore((state) => state.setSearch);
  const searchMeta =
    discoveryMode === 'clubs'
      ? {
          ariaLabel: 'Поиск клубов и направлений',
          placeholder: 'Бокс, йога, бассейн...',
        }
      : {
          ariaLabel: 'Поиск тренеров и направлений',
          placeholder: 'Марина, плавание, растяжка...',
        };

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="flex-1">
        <Input
          aria-label={searchMeta.ariaLabel}
          value={searchQuery}
          placeholder={searchMeta.placeholder}
          icon={<SearchIcon />}
          className="text-base"
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
      </div>

      <button
        type="button"
        aria-label="Определить район"
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-card border border-line bg-panel px-4 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent-strong"
      >
        <LocationIcon />
        <span>Рядом</span>
      </button>
    </div>
  );
}

'use client';

// Строка поиска рабочей части главной: поле запроса, пишущее в стор фильтров.
//
// 38.93: кнопка «Рядом» (`aria-label="Определить район"`) снята — у неё не было
// обработчика, а геолокации у площадки нет (тупик разведки № 6). Обещать «рядом»
// нечем: расстояние в каталоге считается от центра города, а не от человека.
// Подпись и подсказка поля — по режиму «клубы / тренеры».

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
  );
}

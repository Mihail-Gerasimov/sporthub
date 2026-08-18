'use client';

/* Phase 29 Step 29.1: Zustand-store темы карты.
 *
 * Хранит выбор пользователя между 'light' и 'dark'-режимами карты Yandex Maps
 * на главной. Default — 'light'. Персистится в localStorage по ключу
 * 'sporthub-map-theme', чтобы выбор сохранялся между сессиями.
 *
 * Тёмный режим реализован не через нативный theme-API Yandex (его в v3 пока
 * нет публично), а через CSS-фильтр `grayscale(1) invert(1)` на map-canvas
 * (см. `src/app/globals.css` + `MainMap.tsx`). Этот стор — единственный
 * источник правды по выбранной теме; читается компонентом `MapThemeToggle`
 * и `MainMap` (для data-attribute на контейнере карты).
 *
 * Изолирован от `useUIStore` и `useFilterStore` — у темы карты собственный
 * жизненный цикл и persist-стратегия. */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type MapTheme = 'light' | 'dark';

type MapThemeState = {
  theme: MapTheme;
  toggleTheme: () => void;
  setTheme: (theme: MapTheme) => void;
};

export const useMapThemeStore = create<MapThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      toggleTheme: () => {
        set({ theme: get().theme === 'light' ? 'dark' : 'light' });
      },
      setTheme: (theme) => {
        set({ theme });
      },
    }),
    {
      // Уникальный ключ — чтобы DevTools и тесты предсказуемо находили запись.
      name: 'sporthub-map-theme',
      storage: createJSONStorage(() => localStorage),
      // Персистим только тему, не функции (по умолчанию Zustand их не сериализует,
      // но фиксируем партиализацию явно для надёжности).
      partialize: (state) => ({ theme: state.theme }),
    },
  ),
);

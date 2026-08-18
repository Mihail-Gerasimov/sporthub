'use client';

/* Phase 29 Step 29.1: переключатель темы карты «светлая / тёмная».
 *
 * Pill 44×44 (40×40 на 480) в правом верхнем углу карты, две иконки
 * sun/moon — активная подсвечивается lime, неактивная остаётся muted.
 * Клик переключает тему через `useMapThemeStore`. Стор persist'ится в
 * localStorage, поэтому выбор сохраняется между сессиями.
 *
 * SSR-mismatch protection: компонент рендерит `null` до mount-флага.
 * Без этого при первой отрисовке на сервере выводится default 'light',
 * а на клиенте Zustand persist подставляет реальное значение из
 * localStorage — что даёт hydration-mismatch warning. После mount
 * безопасно читаем persisted state и рендерим toggle. */

import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import { useMapThemeStore } from '@/stores/useMapThemeStore';

type MapThemeToggleProps = {
  className?: string;
};

export function MapThemeToggle({ className }: MapThemeToggleProps) {
  const [mounted, setMounted] = useState(false);
  const theme = useMapThemeStore((state) => state.theme);
  const toggleTheme = useMapThemeStore((state) => state.toggleTheme);

  useEffect(() => {
    // SSR-safety mount-flag — стандартный приём для компонентов, читающих
    // persist'нутый state из Zustand. До mount возвращаем null, после mount
    // безопасно рендерим toggle. setState в useEffect здесь намеренный.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const isDark = theme === 'dark';
  const label = isDark ? 'Переключить на светлую тему карты' : 'Переключить на тёмную тему карты';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      className={cn(
        'inline-flex size-10 items-center justify-center rounded-full border border-line bg-card text-muted transition-colors hover:border-lime hover:text-lime focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/30 md:size-11',
        className,
      )}
      data-testid="map-theme-toggle"
    >
      {/* Иконка-индикатор активной темы: солнце для light, луна для dark */}
      {isDark ? (
        // Иконка луны — взята из inline SVG, без внешних зависимостей.
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      ) : (
        // Иконка солнца — circle + 8 лучей.
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      )}
    </button>
  );
}

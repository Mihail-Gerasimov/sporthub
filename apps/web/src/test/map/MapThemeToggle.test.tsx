/* Phase 29 Step 29.1: тесты MapThemeToggle. Проверяет mount-flag (SSR-safe),
 * рендер обоих состояний с правильным aria-pressed, переключение по клику. */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { MapThemeToggle } from '@/components/map/MapThemeToggle';
import { useMapThemeStore } from '@/stores/useMapThemeStore';

describe('MapThemeToggle', () => {
  beforeEach(() => {
    useMapThemeStore.setState({ theme: 'light' });
    localStorage.clear();
  });

  it('после mount рендерит toggle с aria-pressed=false для light-темы', async () => {
    render(<MapThemeToggle />);
    const button = await screen.findByTestId('map-theme-toggle');

    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveAccessibleName('Переключить на тёмную тему карты');
  });

  it('для dark-темы aria-pressed=true и label "переключить на светлую"', async () => {
    useMapThemeStore.setState({ theme: 'dark' });
    render(<MapThemeToggle />);
    const button = await screen.findByTestId('map-theme-toggle');

    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAccessibleName('Переключить на светлую тему карты');
  });

  it('клик переключает тему в сторе', async () => {
    render(<MapThemeToggle />);
    const button = await screen.findByTestId('map-theme-toggle');

    expect(useMapThemeStore.getState().theme).toBe('light');

    fireEvent.click(button);
    expect(useMapThemeStore.getState().theme).toBe('dark');

    fireEvent.click(button);
    expect(useMapThemeStore.getState().theme).toBe('light');
  });

  it('принимает className prop и применяет к кнопке', async () => {
    render(<MapThemeToggle className="absolute top-3 right-3" />);
    const button = await screen.findByTestId('map-theme-toggle');

    expect(button.className).toContain('absolute');
    expect(button.className).toContain('top-3');
    expect(button.className).toContain('right-3');
  });
});

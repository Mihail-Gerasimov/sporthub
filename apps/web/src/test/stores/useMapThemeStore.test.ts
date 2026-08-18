/* Phase 29 Step 29.1: тесты Zustand-store useMapThemeStore.
 * Проверяет default 'light', toggleTheme, setTheme и persist-конфигурацию
 * (storage key, partialize). Сам persist-механизм Zustand тестируем поверхностно
 * — деталями persistence занимается middleware, нам важно только название ключа
 * и сериализуемые поля. */
import { beforeEach, describe, expect, it } from 'vitest';

import { useMapThemeStore } from '@/stores/useMapThemeStore';

describe('useMapThemeStore', () => {
  beforeEach(() => {
    // Сброс стора между тестами — иначе остаётся стейт от предыдущего теста.
    useMapThemeStore.setState({ theme: 'light' });
    // Очистка localStorage чтобы persist-middleware не вытаскивал старое значение.
    localStorage.clear();
  });

  it('default theme — light', () => {
    expect(useMapThemeStore.getState().theme).toBe('light');
  });

  it('toggleTheme переключает light → dark', () => {
    useMapThemeStore.getState().toggleTheme();

    expect(useMapThemeStore.getState().theme).toBe('dark');
  });

  it('toggleTheme переключает dark → light', () => {
    useMapThemeStore.setState({ theme: 'dark' });
    useMapThemeStore.getState().toggleTheme();

    expect(useMapThemeStore.getState().theme).toBe('light');
  });

  it('setTheme устанавливает явное значение', () => {
    useMapThemeStore.getState().setTheme('dark');
    expect(useMapThemeStore.getState().theme).toBe('dark');

    useMapThemeStore.getState().setTheme('light');
    expect(useMapThemeStore.getState().theme).toBe('light');
  });

  it('используется правильный ключ localStorage', () => {
    // Persist пишет в localStorage по ключу 'sporthub-map-theme' — это важно
    // чтобы не пересекаться с ключами других сторов и было предсказуемо
    // при отладке через DevTools.
    useMapThemeStore.getState().setTheme('dark');

    const stored = localStorage.getItem('sporthub-map-theme');
    expect(stored).not.toBeNull();
    expect(stored).toContain('"theme":"dark"');
  });
});

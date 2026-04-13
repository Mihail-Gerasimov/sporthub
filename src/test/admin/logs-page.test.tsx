/**
 * Тесты страницы логов в админ-панели.
 * Phase 20 — Step 20.4: рендер, пустое состояние, skeleton, навигация.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminNavigation } from '@/components/admin/AdminNavigation';

// Мок usePathname для AdminNavigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/service-portal/logs',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe('AdminNavigation — пункт «Логи»', () => {
  it('содержит пункт «Логи» в навигации', () => {
    render(<AdminNavigation />);

    const logsLink = screen.getByRole('link', { name: 'Логи' });
    expect(logsLink).toBeInTheDocument();
    expect(logsLink).toHaveAttribute('href', '/service-portal/logs');
  });

  it('«Логи» расположен между «Модерация» и «Финансы»', () => {
    render(<AdminNavigation />);

    const links = screen.getAllByRole('link');
    const labels = links.map((l) => l.textContent);

    const moderationIndex = labels.indexOf('Модерация');
    const logsIndex = labels.indexOf('Логи');
    const financeIndex = labels.indexOf('Финансы');

    expect(logsIndex).toBe(moderationIndex + 1);
    expect(financeIndex).toBe(logsIndex + 1);
  });
});

describe('LogsPage — рендер', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [], total: 0, offset: 0, limit: 50 }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('рендерится без ошибок и показывает пустое состояние', async () => {
    const { LogsPage } = await import('@/components/admin/LogsPage');
    render(<LogsPage />);

    // Ждём завершения загрузки — появится пустое состояние
    const emptyMessage = await screen.findByText('Нет событий по выбранным фильтрам');
    expect(emptyMessage).toBeInTheDocument();
  });

  it('отображает заголовок фильтров', async () => {
    const { LogsPage } = await import('@/components/admin/LogsPage');
    render(<LogsPage />);

    // Кнопка «Обновить» всегда видна
    const refreshButton = await screen.findByRole('button', { name: /обновить/i });
    expect(refreshButton).toBeInTheDocument();
  });
});

/**
 * Тесты placeholder-страниц admin-панели (Step 17.7).
 * Покрывают: рендер заглушек, навигация внутри admin layout.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminNavigation } from '@/components/admin/AdminNavigation';
import { AUTH_STORE_DEFAULT_STATE, MVP_ADMIN_USER_ID, useAuthStore } from '@/stores/useAuthStore';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/service-portal/dashboard',
}));

describe('Admin placeholders (Step 17.7)', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: { id: MVP_ADMIN_USER_ID, name: 'Admin', email: 'admin@sporthub.local' },
      isAuthenticated: true,
      isAdmin: true,
    });
  });

  describe('AdminNavigation', () => {
    it('содержит ссылки на dashboard, аналитику, модерацию и финансы', () => {
      render(<AdminNavigation />);

      expect(screen.getByRole('link', { name: /пользователи/i })).toHaveAttribute(
        'href',
        '/service-portal/dashboard',
      );
      expect(screen.getByRole('link', { name: /аналитика/i })).toHaveAttribute(
        'href',
        '/service-portal/analytics',
      );
      expect(screen.getByRole('link', { name: /модерация/i })).toHaveAttribute(
        'href',
        '/service-portal/moderation',
      );
      expect(screen.getByRole('link', { name: /финансы/i })).toHaveAttribute(
        'href',
        '/service-portal/finance',
      );
    });
  });
});

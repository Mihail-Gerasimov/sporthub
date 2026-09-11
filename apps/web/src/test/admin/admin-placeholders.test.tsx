/**
 * Тесты placeholder-страниц admin-панели (Step 17.7).
 * Покрывают: рендер заглушек, навигация внутри admin layout.
 *
 * ⚠️ Шаг 37.44. Набор проверял ЧЕТЫРЕ адреса из пяти существующих: «Логи»
 * в нём не было вовсе, и заметить это можно было только сверкой со словарём
 * пунктов. Пропущенная ссылка — не мелочь: раздел, который перестал быть
 * в навигации, остаётся доступен по прямому адресу и потому выглядит рабочим,
 * а в панели его больше нет. Здесь дописаны «Логи» и «Надзор», и проверка
 * ведётся ПО СПИСКУ, а не по выписанным вручную четырём именам, — забыть
 * седьмой раздел ей уже нечем.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminNavigation } from '@/components/admin/AdminNavigation';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';

// Номера пользователей стенда. Раньше они приезжали константами из стора —
// фронт знал наперёд, кто атлет, провайдер и администратор. Теперь это просто
// данные теста.
const ADMIN_USER_ID = 3;

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
      user: { id: ADMIN_USER_ID, name: 'Admin', email: 'admin@sporthub.local' },
      isAuthenticated: true,
      isAdmin: true,
    });
  });

  describe('AdminNavigation', () => {
    // Все разделы панели с их адресами. Список объявлен один раз и проверяется
    // целиком: выписанные по одному имена — это место, где раздел забывают.
    const SECTIONS: Array<[RegExp, string]> = [
      [/^пользователи$/i, '/service-portal/dashboard'],
      [/^аналитика$/i, '/service-portal/analytics'],
      [/^модерация$/i, '/service-portal/moderation'],
      [/^надзор$/i, '/service-portal/notifications'],
      [/^логи$/i, '/service-portal/logs'],
      [/^финансы$/i, '/service-portal/finance'],
    ];

    it('содержит ссылки на все шесть разделов панели', () => {
      render(<AdminNavigation />);

      for (const [label, href] of SECTIONS) {
        expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
      }

      // Ровно шесть — лишний пункт заметить так же важно, как пропущенный.
      expect(screen.getAllByRole('link')).toHaveLength(SECTIONS.length);
    });

    it('открытый раздел помечен как текущий, остальные — нет', () => {
      // `usePathname` подменён на `/service-portal/dashboard` выше: активным
      // обязан быть он один, иначе подсветка перестаёт что-либо сообщать.
      render(<AdminNavigation />);

      expect(screen.getByRole('link', { name: /^пользователи$/i })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(screen.getByRole('link', { name: /^надзор$/i })).not.toHaveAttribute('aria-current');
    });
  });
});

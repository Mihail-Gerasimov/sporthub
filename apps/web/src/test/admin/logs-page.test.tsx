/**
 * Тесты страницы логов в админ-панели.
 * Phase 20 — Step 20.4: рендер, пустое состояние, skeleton, навигация.
 * Phase 25 Step 25.15: drawer-wire-up для booking-логов.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithToast } from '@/test/helpers/render-with-toast';

import { AdminNavigation } from '@/components/admin/AdminNavigation';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';

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

  it('«Логи» стоят после «Надзора» и перед «Финансами»', () => {
    // ⚠️ Шаг 37.44. Проверка была написана как «Логи идут сразу за Модерацией»,
    // и шестой раздел панели её уронил, ничего не сломав: между ними встал
    // «Надзор». Смысл проверки — ПОРЯДОК разделов, а не соседство двух из них,
    // поэтому здесь сверяется вся последовательность целиком: так седьмой раздел
    // потребует осознанного решения, куда его ставить, а не молча упадёт.
    render(<AdminNavigation />);

    const labels = screen.getAllByRole('link').map((link) => link.textContent);

    expect(labels).toEqual(['Пользователи', 'Аналитика', 'Модерация', 'Надзор', 'Логи', 'Финансы']);
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

describe('LogsPage — Step 25.15: drawer-wire-up для booking-логов', () => {
  const BOOKING_LOG = {
    id: 101,
    action: 'booking_confirm',
    actorId: 3,
    actorRole: 'admin',
    entityType: 'booking',
    entityId: 42,
    createdAt: '2026-04-22T10:00:00.000Z',
  };

  const PUBLISH_LOG = {
    id: 102,
    action: 'publish_create',
    actorId: 2,
    actorRole: 'club_owner',
    entityType: 'club',
    entityId: 5,
    createdAt: '2026-04-22T11:00:00.000Z',
  };

  const BOOKING_DATA = {
    id: 42,
    scheduleId: 1,
    userId: 1,
    sportId: 3,
    date: '2026-04-20',
    status: 'completed',
    paymentStatus: 'paid',
    totalPrice: 1000,
    createdAt: '2026-04-15T09:00:00.000Z',
    statusHistory: [
      { from: null, to: 'pending', actor: 'athlete', at: '2026-04-15T09:00:00.000Z' },
      { from: 'pending', to: 'confirmed', actor: 'provider', at: '2026-04-18T10:00:00.000Z' },
    ],
  };

  beforeEach(() => {
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: { id: 3, name: 'Admin', email: 'a@a.com', phone: '+7' },
      // Вид учётной записи здесь именно 'admin': журнал открыт только администратору,
      // и остальные наборы админки заводят вход тем же способом. Рядом стоял второй
      // ключ `accountKind: null` — он молча затирал этот и оставлял набор без вида записи.
      accountKind: 'admin',
      isAuthenticated: true,
      isAdmin: true,
      status: 'ready',
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('/api/logs')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              data: [BOOKING_LOG, PUBLISH_LOG],
              total: 2,
              offset: 0,
              limit: 50,
            }),
        });
      }
      if (url.startsWith('/api/bookings/42')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: BOOKING_DATA }),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('кнопка «История FSM» видна для booking-лога и отсутствует для club-лога', async () => {
    const { LogsPage } = await import('@/components/admin/LogsPage');
    renderWithToast(<LogsPage />);

    const button = await screen.findByTestId('logs-open-booking-history-42');
    expect(button).toBeInTheDocument();
    expect(screen.queryByTestId('logs-open-booking-history-5')).not.toBeInTheDocument();
  });

  it('клик по «История FSM» шлёт GET /api/bookings/42 без личности и открывает drawer', async () => {
    const { LogsPage } = await import('@/components/admin/LogsPage');
    renderWithToast(<LogsPage />);

    const button = await screen.findByTestId('logs-open-booking-history-42');
    fireEvent.click(button);

    await waitFor(() => {
      const calls = (global.fetch as unknown as { mock: { calls: Array<[string]> } }).mock.calls;
      // ⚠️ Адрес БЕЗ номера админа. Прежний `?userId=3` был предъявлением личности:
      // права на чтение записи сервер проверяет по сессии, а не по строке запроса.
      expect(calls.some((c) => c[0] === '/api/bookings/42')).toBe(true);
      expect(calls.every((c) => !c[0].includes('userId='))).toBe(true);
    });

    // Drawer рендерит заголовок «История статусов»
    await screen.findByText(/История статусов/i);
  });

  it('закрытие drawer убирает его из DOM', async () => {
    const { LogsPage } = await import('@/components/admin/LogsPage');
    renderWithToast(<LogsPage />);

    const button = await screen.findByTestId('logs-open-booking-history-42');
    fireEvent.click(button);

    const closeButton = await screen.findByRole('button', { name: /закрыть/i });
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText(/История статусов/i)).not.toBeInTheDocument();
    });
  });
});

// ⚠️ Шаг 37.29. Два значения словаря удалены — писателя у них не было ни одного.
// Но СТРОКИ с ними в журнале остались (на живой базе — две от 21.08.2026),
// и удалять их нельзя: журнал тем и ценен, что прошлое в нём не переписывают.
// Значит подпись обязана пережить уборку словаря — отдельным словарём прошлого,
// как `LEGACY_ROLE_LABELS` для удалённых ролей.
describe('LogsPage — подписи действий, которых больше нет', () => {
  const legacyLog = (id: number, action: string) => ({
    id,
    action,
    actorId: 3,
    actorRole: 'admin',
    entityType: 'user',
    entityId: 3,
    createdAt: '2026-08-21T10:00:00.000Z',
  });

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: [legacyLog(1, 'admin_login'), legacyLog(2, 'moderation_auto_restore')],
          total: 2,
          offset: 0,
          limit: 50,
        }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('историческая строка читается по-русски, а не сырым значением', async () => {
    const { LogsPage } = await import('@/components/admin/LogsPage');
    render(<LogsPage />);

    expect(await screen.findByText('Вход администратора')).toBeInTheDocument();
    expect(screen.getByText('Публикация авто-восстановлена')).toBeInTheDocument();
    // Сырого значения на экране быть не должно: именно оно и появилось бы,
    // если словарь прошлого потеряется.
    expect(screen.queryByText('admin_login')).not.toBeInTheDocument();
    expect(screen.queryByText('moderation_auto_restore')).not.toBeInTheDocument();
  });

  it('удалённые действия не предлагаются в фильтре — событий с ними больше нет', async () => {
    const { LogsPage } = await import('@/components/admin/LogsPage');
    render(<LogsPage />);

    await screen.findByText('Вход администратора');

    // Фильтр строится из живого словаря: обещать выбор действия, которого система
    // не производит, — значит отдавать пустую выдачу без объяснения. Бэкенд такое
    // значение и не примет: его нет в `LOG_ACTIONS`.
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).not.toContain('Вход администратора');
    expect(options).not.toContain('Публикация авто-восстановлена');
  });
});

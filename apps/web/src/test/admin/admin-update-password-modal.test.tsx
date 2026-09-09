/**
 * Тесты выдачи пароля администратором (Phase 33, шаг 33.10).
 *
 * Что проверяется:
 *   • генератор выдаёт разные значения нужной длины и без похожих символов;
 *   • кнопка «Сгенерировать» заполняет оба поля и делает значение читаемым;
 *   • выданное значение показывается ПОСЛЕ сохранения и ровно один раз —
 *     повторное открытие модалки его не возвращает;
 *   • «Скопировать» кладёт значение в буфер обмена;
 *   • в карточке пользователя показа чужого пароля больше нет.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Booking, Club, Trainer, User } from '@sporthub/types';

import { renderWithToast, resetToasts } from '@/test/helpers/render-with-toast';

import { AdminUpdatePasswordModal } from '@/components/admin/AdminUpdatePasswordModal';
import { DashboardPage } from '@/components/admin/DashboardPage';
import {
  GENERATED_PASSWORD_LENGTH,
  PASSWORD_ALPHABET,
  generatePassword,
} from '@/lib/generate-password';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';

// Номера пользователей стенда. Раньше они приезжали константами из стора —
// фронт знал наперёд, кто атлет, провайдер и администратор. Теперь это просто
// данные теста.
const ADMIN_USER_ID = 3;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

describe('Генератор паролей', () => {
  it('выдаёт значение не короче 16 символов', () => {
    expect(generatePassword().length).toBe(GENERATED_PASSWORD_LENGTH);
    expect(generatePassword().length).toBeGreaterThanOrEqual(16);
    // Просьба о более коротком пароле игнорируется: 16 — нижняя граница.
    expect(generatePassword(4).length).toBe(GENERATED_PASSWORD_LENGTH);
    expect(generatePassword(24).length).toBe(24);
  });

  it('выдаёт разные значения', () => {
    const issued = new Set(Array.from({ length: 50 }, () => generatePassword()));

    expect(issued.size).toBe(50);
  });

  it('не использует символы, которые путают между собой', () => {
    for (const forbidden of ['l', '1', 'I', '0', 'O']) {
      expect(PASSWORD_ALPHABET).not.toContain(forbidden);
    }

    const generated = Array.from({ length: 30 }, () => generatePassword()).join('');

    for (const symbol of generated) {
      expect(PASSWORD_ALPHABET).toContain(symbol);
    }
  });
});

describe('Модалка выдачи пароля', () => {
  const props = {
    open: true,
    onClose: vi.fn(),
    userId: 1,
    userName: 'Алексей Смирнов',
  };

  beforeEach(() => {
    resetToasts();
    props.onClose.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ success: true }) })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('кнопка «Сгенерировать» заполняет оба поля одним значением и показывает его', () => {
    render(<AdminUpdatePasswordModal {...props} />);

    fireEvent.click(screen.getByTestId('admin-update-password-generate'));

    const created = screen.getByTestId('admin-update-password-new') as HTMLInputElement;
    const confirm = screen.getByTestId('admin-update-password-confirm') as HTMLInputElement;

    expect(created.value).toHaveLength(GENERATED_PASSWORD_LENGTH);
    expect(confirm.value).toBe(created.value);
    // Читаемо: иначе выданное значение нечем прочитать и продиктовать.
    expect(created.type).toBe('text');
  });

  it('два нажатия подряд дают разные пароли', () => {
    render(<AdminUpdatePasswordModal {...props} />);

    const generate = screen.getByTestId('admin-update-password-generate');
    const created = screen.getByTestId('admin-update-password-new') as HTMLInputElement;

    fireEvent.click(generate);
    const first = created.value;
    fireEvent.click(generate);

    expect(created.value).not.toBe(first);
  });

  it('до сохранения выданного значения на экране нет', () => {
    render(<AdminUpdatePasswordModal {...props} />);

    fireEvent.click(screen.getByTestId('admin-update-password-generate'));

    expect(screen.queryByTestId('admin-update-password-issued')).not.toBeInTheDocument();
  });

  it('после сохранения показывает выданное значение ровно один раз', async () => {
    const { rerender } = renderWithToast(<AdminUpdatePasswordModal {...props} />);

    fireEvent.click(screen.getByTestId('admin-update-password-generate'));
    const issued = (screen.getByTestId('admin-update-password-new') as HTMLInputElement).value;

    fireEvent.click(screen.getByTestId('admin-update-password-submit'));

    const shown = await screen.findByTestId('admin-update-password-issued');
    expect(shown).toHaveTextContent(issued);
    // Пароль ушёл на сервер, а не остался только на экране.
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/users/1/password',
      expect.objectContaining({ method: 'POST' }),
    );

    // ⚠️ В теле только новый пароль. Кто его меняет — сервер знает из сессии,
    // и схема тела стала строгой: прежнее поле `adminUserId` он теперь отвергает.
    const [, init] = (fetch as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock
      .calls[0];

    expect(Object.keys(JSON.parse(String(init.body)))).toEqual(['newPassword']);

    // Закрыли окно — значение стёрлось. Повторное открытие его не возвращает.
    fireEvent.click(screen.getByTestId('admin-update-password-done'));
    expect(props.onClose).toHaveBeenCalled();

    rerender(<AdminUpdatePasswordModal {...props} open={false} />);
    rerender(<AdminUpdatePasswordModal {...props} open />);

    expect(screen.queryByTestId('admin-update-password-issued')).not.toBeInTheDocument();
    expect(screen.queryByText(issued)).not.toBeInTheDocument();
    expect((screen.getByTestId('admin-update-password-new') as HTMLInputElement).value).toBe('');
  });

  it('«Скопировать» кладёт выданное значение в буфер обмена', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    renderWithToast(<AdminUpdatePasswordModal {...props} />);

    fireEvent.click(screen.getByTestId('admin-update-password-generate'));
    const issued = (screen.getByTestId('admin-update-password-new') as HTMLInputElement).value;

    fireEvent.click(screen.getByTestId('admin-update-password-submit'));
    await screen.findByTestId('admin-update-password-issued');

    fireEvent.click(screen.getByTestId('admin-update-password-copy'));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(issued));
    expect(await screen.findByText('Пароль скопирован')).toBeInTheDocument();
  });

  it('ошибка сервера оставляет форму открытой и не показывает пароль', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({ error: 'Нет прав' }) })),
    );

    renderWithToast(<AdminUpdatePasswordModal {...props} />);

    fireEvent.click(screen.getByTestId('admin-update-password-generate'));
    fireEvent.click(screen.getByTestId('admin-update-password-submit'));

    expect(await screen.findByTestId('admin-update-password-error')).toHaveTextContent('Нет прав');
    expect(screen.queryByTestId('admin-update-password-issued')).not.toBeInTheDocument();
  });

  it('слишком короткий пароль не уходит на сервер', () => {
    render(<AdminUpdatePasswordModal {...props} />);

    fireEvent.change(screen.getByTestId('admin-update-password-new'), { target: { value: '123' } });
    fireEvent.change(screen.getByTestId('admin-update-password-confirm'), {
      target: { value: '123' },
    });
    fireEvent.click(screen.getByTestId('admin-update-password-submit'));

    expect(screen.getByTestId('admin-update-password-error')).toHaveTextContent('минимум 6');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('Карточка пользователя в админке', () => {
  const users: User[] = [
    {
      id: 1,
      createdAt: '2026-03-17T09:00:00.000Z',
      status: 'active',
      name: 'Алексей Смирнов',
      email: 'alexey@sporthub.local',
      phone: '+7 (927) 000-10-10',
      passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c29sdA$aGFzaA',
      favoriteClubIds: [],
    },
  ];

  beforeEach(() => {
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: { id: ADMIN_USER_ID, name: 'Admin', email: 'admin@sporthub.local' },
      isAuthenticated: true,
      isAdmin: true,
    });
  });

  it('не показывает ни пароль, ни его хеш и не предлагает их раскрыть', () => {
    render(
      <DashboardPage
        users={users}
        clubs={[] as Club[]}
        trainers={[] as Trainer[]}
        bookings={[] as Booking[]}
      />,
    );

    const credentials = screen.getByTestId('user-credentials-1');

    expect(credentials).toHaveTextContent('alexey@sporthub.local');
    expect(credentials.textContent ?? '').not.toContain('$argon2');
    expect(credentials.textContent ?? '').not.toContain('••••');
    expect(screen.queryByTestId('user-credentials-toggle-1')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Показать пароль')).not.toBeInTheDocument();
    // Смена пароля осталась — она и есть замена показу.
    expect(screen.getByTestId('user-credentials-change-1')).toBeInTheDocument();
  });
});

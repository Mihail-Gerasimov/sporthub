// Признак повторной проверки в навигации служебной панели (шаг 36.21).
//
// ⚠️ Этот набор существует из-за дефекта, найденного браузерным прогоном приёмки,
// и дефект был мой.
//
// План фазы обосновывал адресата уведомления так: «колокольчик показывается любому
// вошедшему, включая администратора, — просто сегодня ему никто не пишет». Проверено
// это было по `Header.tsx`, где колокольчик действительно рисуется всем. А сам
// `NotificationBell` для вида учётной записи `admin` возвращает `null` явной строкой;
// лента `/profile/me/notifications` закрыта `requirePerson()`; в служебной панели
// колокольчика нет вовсе.
//
// Итог: строка уведомления создавалась исправно, была покрыта тестами на сервере
// и не была видна НИКОМУ. Ровно тот класс, который фаза 35 назвала своим главным
// выводом, — и на нём же споткнулась эта фаза.
//
// Поэтому проверяется не «есть ли число в вёрстке», а ПОДКЛЮЧЕНИЕ: какой адрес
// навигация дёргает и рисует ли она то, что ответил сервер.

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminNavigation } from '@/components/admin/AdminNavigation';

vi.mock('next/navigation', () => ({
  usePathname: () => '/service-portal/dashboard',
}));

describe('навигация служебной панели: признак повторной проверки', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  const answer = (total: number) =>
    new Response(JSON.stringify({ success: true, data: { items: [], total } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  it('спрашивает СЧЁТЧИК запросом, а не считает выдачу в браузере', async () => {
    fetchMock.mockResolvedValue(answer(3));

    render(<AdminNavigation />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [url] = fetchMock.mock.calls[0];
    const asked = String(url);

    // Отбор — в адресе: под него есть частичный индекс, и отбирать должна база.
    expect(asked).toContain('awaitingRecheck=true');
    // И берётся именно число, а не выборка: тянуть все публикации ради счётчика —
    // это цена, растущая вместе с каталогом.
    expect(asked).toContain('limit=1');
  });

  it('рисует число, которое ответил сервер', async () => {
    fetchMock.mockResolvedValue(answer(3));

    render(<AdminNavigation />);

    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(screen.getByLabelText('Исправлено, ждёт проверки: 3')).toBeInTheDocument();
  });

  it('нечего проверять — признака нет вовсе', async () => {
    // Иначе навигация носила бы вечный ноль и перестала бы что-либо сообщать.
    fetchMock.mockResolvedValue(answer(0));

    render(<AdminNavigation />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('несосчитавшийся признак не ломает навигацию', async () => {
    // Признак — подсказка, а не содержание страницы: упавший запрос не имеет права
    // унести с собой все пять разделов.
    fetchMock.mockRejectedValue(new Error('сеть недоступна'));

    render(<AdminNavigation />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    expect(screen.getByRole('link', { name: 'Модерация' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Пользователи' })).toBeInTheDocument();
  });
});

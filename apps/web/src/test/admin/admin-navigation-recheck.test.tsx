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
// ⚠️ Число приходит СВОЙСТВОМ от серверного лейаута, а не запрашивается навигацией
// из браузера. Первая версия делала запрос в `useEffect` — и набор оказался хрупким:
// по одному файлу зелёный, в общей папке красный, потому что соседний набор снимал
// признак тестовой среды React (`vi.unstubAllGlobals`) и эффекты переставали
// выполняться. Свойство от сервера убирает и лишний круг, и эту хрупкость разом.

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AdminNavigation } from '@/components/admin/AdminNavigation';

vi.mock('next/navigation', () => ({
  usePathname: () => '/service-portal/dashboard',
}));

describe('навигация служебной панели: признак повторной проверки', () => {
  it('рисует число, которое дал сервер', () => {
    render(<AdminNavigation awaitingRecheck={3} />);

    expect(screen.getByText('3')).toBeInTheDocument();
    // Подпись для экранного диктора называет, что это за число: «3» само по себе
    // диктору ничего не сообщает.
    expect(screen.getByLabelText('Исправлено, ждёт проверки: 3')).toBeInTheDocument();
  });

  it('нечего проверять — признака нет вовсе', () => {
    // Иначе навигация носила бы вечный ноль и перестала бы что-либо сообщать.
    render(<AdminNavigation awaitingRecheck={0} />);

    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Исправлено/)).not.toBeInTheDocument();
  });

  it('признак стоит именно у «Модерации», а не у соседнего раздела', () => {
    // Число рядом с «Логами» или «Финансами» сообщало бы неправду, и заметить
    // это можно только проверкой места.
    render(<AdminNavigation awaitingRecheck={2} />);

    expect(screen.getByRole('link', { name: /Модерация/ })).toHaveTextContent('2');
    expect(screen.getByRole('link', { name: 'Логи' })).not.toHaveTextContent('2');
    expect(screen.getByRole('link', { name: 'Пользователи' })).not.toHaveTextContent('2');
  });

  it('без свойства навигация остаётся целой', () => {
    // Признак — подсказка, а не содержание: его отсутствие не имеет права унести
    // с собой пять разделов.
    render(<AdminNavigation />);

    expect(screen.getByRole('link', { name: /Модерация/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Пользователи' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Финансы' })).toBeInTheDocument();
  });
});

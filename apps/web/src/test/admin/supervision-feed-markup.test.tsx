// Разметка и дерево доступности очереди надзора (шаг 37.45).
//
// ⚠️ Почему проверяется дерево доступности, а не только видимый текст. Прогон
// MCP фазы 35 нашёл дефект, который на экране был не виден вовсе: ссылка шапки
// имела подпись «Перейти в личный кабинет», а вела в кабинет последнего открытого
// лица. Видимая надпись рядом была верной — врала подпись для диктора. Поэтому
// вкладки здесь спрашиваются ролями (`tab` / `tablist` / `aria-selected`),
// а не классами.

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AdminNotificationsPage } from '@/components/admin/AdminNotificationsPage';
import { useNotificationsStore } from '@/stores/useNotificationsStore';
import type { Notification } from '@sporthub/types';

/** Строка очереди: владельца-человека у неё нет вовсе. */
function supervisionRow(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 1,
    addresseeKind: 'supervision',
    type: 'oversight_impersonation_started',
    payload: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Notification;
}

const emptyFeed = { items: [], total: 0, unreadCount: 0 };

describe('очередь надзора: разметка раздела', () => {
  it('заголовок раздела — по канону панели', () => {
    render(<AdminNotificationsPage initialFeed={emptyFeed} />);

    // Заголовок первого уровня у раздела ровно один: панель отдаёт странице
    // всю смысловую шапку.
    expect(screen.getByRole('heading', { level: 1, name: /очередь надзора/i })).toBeInTheDocument();
    expect(screen.getByText('Admin · Supervision')).toBeInTheDocument();
  });

  it('подпись показывает счётчики СЕРВЕРА, а не длину выданной страницы', () => {
    // ⚠️ Это тот самый дефект фазы 36: число считалось не оттуда, откуда надо.
    // На экране страница из одной строки, в очереди — сорок одна.
    render(
      <AdminNotificationsPage
        initialFeed={{ items: [supervisionRow()], total: 41, unreadCount: 12 }}
      />,
    );

    expect(screen.getByTestId('supervision-total-count')).toHaveTextContent('41');
    expect(screen.getByTestId('supervision-unread-count')).toHaveTextContent('12');
  });

  it('вкладки тем — настоящие вкладки: tablist, tab и aria-selected', () => {
    render(<AdminNotificationsPage initialFeed={emptyFeed} />);

    const tablist = screen.getByRole('tablist', { name: /тема события/i });
    expect(tablist).toBeInTheDocument();

    const tabs = screen.getAllByRole('tab');
    // «Все» плюс три надзорные темы домена. Числа на вкладках нет намеренно:
    // посчитать его можно только по выданной странице, а она — пятнадцать строк.
    expect(tabs).toHaveLength(4);
    expect(screen.getByRole('tab', { name: /^все$/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /каталог и модерация/i })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('человеческих тем во вкладках нет — их в очереди не бывает', () => {
    render(<AdminNotificationsPage initialFeed={emptyFeed} />);

    expect(screen.queryByRole('tab', { name: /^записи$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^отзывы$/i })).not.toBeInTheDocument();
  });

  it('пустая очередь говорит об этом словами, а не пустым местом', () => {
    render(<AdminNotificationsPage initialFeed={emptyFeed} />);

    expect(screen.getByTestId('supervision-empty')).toBeInTheDocument();
  });

  it('строки разложены по вёдрам дат', () => {
    const today = new Date();
    const longAgo = new Date(today.getTime() - 40 * 24 * 60 * 60 * 1000);

    render(
      <AdminNotificationsPage
        initialFeed={{
          items: [
            supervisionRow({ id: 10, createdAt: today.toISOString() }),
            supervisionRow({ id: 11, createdAt: longAgo.toISOString() }),
          ],
          total: 2,
          unreadCount: 2,
        }}
      />,
    );

    expect(screen.getByTestId('supervision-bucket-today')).toBeInTheDocument();
    expect(screen.getByTestId('supervision-bucket-earlier')).toBeInTheDocument();
    expect(screen.queryByTestId('supervision-empty')).not.toBeInTheDocument();
  });

  it('состояние строки названо словами, включая того, кто занялся', () => {
    render(
      <AdminNotificationsPage
        initialFeed={{
          items: [
            supervisionRow({ id: 20 }),
            supervisionRow({
              id: 21,
              readAt: new Date().toISOString(),
              readByUserId: 12,
            }),
          ],
          total: 2,
          unreadCount: 1,
        }}
      />,
    );

    // В общей очереди вопрос не «читал ли я», а «занялся ли этим кто-то и кто».
    expect(screen.getByTestId('supervision-item-unresolved-20')).toHaveTextContent(/не разобрано/i);
    expect(screen.getByTestId('supervision-item-resolved-21')).toHaveTextContent(/разобрал #12/i);
  });

  it('строки берутся из общего стора — значок и лента считают одно и то же', () => {
    render(
      <AdminNotificationsPage
        initialFeed={{ items: [supervisionRow({ id: 30 })], total: 1, unreadCount: 1 }}
      />,
    );

    expect(screen.getByTestId('supervision-item-30')).toBeInTheDocument();
    expect(useNotificationsStore.getState().notifications).toHaveLength(1);
  });
});

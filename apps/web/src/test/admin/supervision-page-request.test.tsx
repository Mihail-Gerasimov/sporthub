// Тест ПОДКЛЮЧЕНИЯ раздела «Надзор»: какой ящик страница спрашивает на самом деле
// (шаг 37.44).
//
// ⚠️ Почему проверяется вызов, а не картинка. Главный вывод фазы 35 и повтор его
// в фазе 36: серверная часть написана и покрыта тестами, а до браузера разделение
// не доехало — страница спрашивала не тот ящик, и тесты этого не видели, потому
// что смотрели на API. Здесь проверяется ровно стык: что именно страница просит.

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getNotifications = vi.fn();

vi.mock('@/lib/server-api', () => ({ getNotifications }));

const { default: SupervisionRoute } =
  await import('@/app/service-portal/(admin)/notifications/page');
const { SUPERVISION_PAGE_SIZE } = await import('@/components/admin/AdminNotificationsPage');

describe('раздел «Надзор»: что спрашивает страница', () => {
  beforeEach(() => {
    getNotifications.mockReset();
    getNotifications.mockResolvedValue({ items: [], total: 0, unreadCount: 0 });
  });

  it('спрашивает ОЧЕРЕДЬ НАДЗОРА, а не ящик человека', async () => {
    await SupervisionRoute();

    expect(getNotifications).toHaveBeenCalledTimes(1);
    expect(getNotifications.mock.calls[0][0]).toMatchObject({
      mailbox: { scope: 'supervision' },
    });
  });

  it('берёт одну страницу, а не очередь целиком', async () => {
    await SupervisionRoute();

    const asked = getNotifications.mock.calls[0][0];

    // Размер страницы — тот же, которым листает браузер: разъехавшись, первая
    // страница показывала бы не столько строк, сколько все следующие.
    expect(asked.limit).toBe(SUPERVISION_PAGE_SIZE);
    expect(asked.offset).toBe(0);
  });

  it('открывается на НЕРАЗОБРАННОМ — иначе это не очередь', async () => {
    await SupervisionRoute();

    expect(getNotifications.mock.calls[0][0].unreadOnly).toBe(true);
  });

  it('отдаёт полученную страницу ленте', async () => {
    getNotifications.mockResolvedValue({
      items: [
        {
          id: 31,
          addresseeKind: 'supervision',
          type: 'oversight_impersonation_started',
          payload: {},
          createdAt: '2026-09-11T10:00:00.000Z',
        },
      ],
      total: 1,
      unreadCount: 1,
    });

    render(await SupervisionRoute());

    expect(await screen.findByTestId('supervision-item-31')).toBeInTheDocument();
  });
});

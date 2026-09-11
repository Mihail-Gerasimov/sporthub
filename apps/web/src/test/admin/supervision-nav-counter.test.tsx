// Счётчик очереди надзора у пункта меню (шаг 37.49).
//
// ⚠️ Три разных вопроса, и каждый — про свой способ сломаться.
//
// 1. Два счётчика НЕ СКЛАДЫВАЮТСЯ. `awaitingRecheck` считает публикации в очереди
//    модерации, счётчик надзора — письма в очереди надзора. Сумма означала бы
//    «есть N чего-то», и её расхождение с любым из разделов выглядело бы дефектом,
//    оставаясь при этом законным.
// 2. Признак счётчика живёт В СЛОВАРЕ пунктов, а не жёстким сравнением адреса.
//    Со сравнением второй счётчик превращает разметку в лестницу `if`, а третий —
//    в лестницу, которую никто не решится тронуть.
// 3. Числа лейаут берёт ПАРАЛЛЕЛЬНО. Лейаут собирает КАЖДУЮ страницу панели:
//    последовательное ожидание второго числа — задержка на всех шести разделах.

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminNavigation } from '@/components/admin/AdminNavigation';

import { WEB_ROOT } from '../web-root';

vi.mock('next/navigation', () => ({
  usePathname: () => '/service-portal/dashboard',
}));

// ⚠️ Подмены объявляются через `vi.hoisted`: фабрики `vi.mock` поднимаются выше
// обычных объявлений файла, и обычная константа к моменту их выполнения ещё
// не существует.
const { getAwaitingRecheckCount, getUnreadNotificationsCount } = vi.hoisted(() => ({
  getAwaitingRecheckCount: vi.fn(),
  getUnreadNotificationsCount: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ requireAdmin: vi.fn(async () => undefined) }));
vi.mock('@/lib/server-api', () => ({ getAwaitingRecheckCount, getUnreadNotificationsCount }));

describe('навигация панели: счётчик очереди надзора', () => {
  it('число надзора стоит у «Надзора», а не у соседей', () => {
    render(<AdminNavigation supervisionUnread={4} />);

    expect(screen.getByRole('link', { name: /Надзор/ })).toHaveTextContent('4');
    expect(screen.getByRole('link', { name: 'Модерация' })).not.toHaveTextContent('4');
    expect(screen.getByLabelText('Не разобрано в очереди надзора: 4')).toBeInTheDocument();
  });

  it('два счётчика показаны РАЗДЕЛЬНО и не складываются в одно число', () => {
    render(<AdminNavigation awaitingRecheck={2} supervisionUnread={3} />);

    expect(screen.getByRole('link', { name: /Модерация/ })).toHaveTextContent('2');
    expect(screen.getByRole('link', { name: /Надзор/ })).toHaveTextContent('3');
    // Суммы быть не должно нигде: пять — это «есть N чего-то».
    expect(screen.queryByText('5')).not.toBeInTheDocument();
    // И подписи у них разные: диктор обязан различать очереди.
    expect(screen.getByLabelText('Исправлено, ждёт проверки: 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Не разобрано в очереди надзора: 3')).toBeInTheDocument();
  });

  it('разбирать нечего — счётчика нет вовсе', () => {
    // Вечный ноль в навигации перестаёт сообщать что-либо.
    render(<AdminNavigation supervisionUnread={0} />);

    expect(screen.queryByLabelText(/очереди надзора/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Надзор' })).toBeInTheDocument();
  });

  it('без свойств навигация остаётся целой', () => {
    render(<AdminNavigation />);

    expect(screen.getAllByRole('link')).toHaveLength(6);
  });

  it('жёсткого сравнения адреса ради счётчика не осталось', () => {
    // ⚠️ Сторож на исходник, а не на отрисовку: сравнение `item.href === '…'`
    // рисует ТО ЖЕ САМОЕ и потому неотличимо снаружи. Отличие в том, во что
    // превратится файл на третьем счётчике.
    const source = readFileSync(
      path.join(WEB_ROOT, 'src', 'components', 'admin', 'AdminNavigation.tsx'),
      'utf8',
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    expect(code).not.toMatch(/item\.href\s*===/);
    // Признак — поле словаря пунктов.
    expect(code).toMatch(/badge:\s*'supervisionUnread'/);
  });
});

describe('лейаут панели: счётчики берутся параллельно', () => {
  beforeEach(() => {
    getAwaitingRecheckCount.mockReset();
    getUnreadNotificationsCount.mockReset();
  });

  it('второй счётчик не ждёт первого', async () => {
    const { default: AdminLayout } = await import('@/app/service-portal/(admin)/layout');

    let supervisionAsked = false;

    // Первый счётчик отвечает ТОЛЬКО после того, как спросили второй. При
    // последовательном ожидании эта страница не собралась бы никогда — и это
    // ровно то, чем «ещё один запрос в лейауте» платит на каждом разделе.
    getAwaitingRecheckCount.mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          const tick = () => (supervisionAsked ? resolve(4) : setTimeout(tick, 1));
          tick();
        }),
    );
    getUnreadNotificationsCount.mockImplementation(async () => {
      supervisionAsked = true;
      return 7;
    });

    await AdminLayout({ children: null });

    expect(getAwaitingRecheckCount).toHaveBeenCalledTimes(1);
    // И ящик у второго назван: без имени это была бы личная почта администратора.
    expect(getUnreadNotificationsCount).toHaveBeenCalledWith({ scope: 'supervision' });
  });
});

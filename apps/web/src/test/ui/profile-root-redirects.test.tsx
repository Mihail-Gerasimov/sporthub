// Прежние адреса кабинета: `/profile/athlete/*` и `/profile/provider/*`.
//
// ⚠️ Шаг 35.31 переименовал кабинеты, и эти адреса остались жить намеренно:
// они лежат у людей в закладках и разосланы письмами уведомлений. Молчаливый
// 404 на них читался бы как поломка площадки, а не как переезд.
//
// Проверяется не только «уводит», но и КАКИМ ответом — разница здесь смысловая:
//   • личный кабинет — постоянный переезд (308): соответствие одно для всех
//     и навсегда, ответ можно кэшировать у клиента;
//   • кабинет лица — временный (307): назначение зависит от того, КТО открыл
//     ссылку, и закэшированный «навсегда» увёл бы в чужой кабинет.
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// ⚠️ Подмены БРОСАЮТ, как настоящие `redirect` и `permanentRedirect`. Молчаливая
// заглушка врёт: код после увода продолжал бы выполняться, и тест «человека без
// лиц уводит на главную» падал бы на строке, до которой в бою не доходит.
const { redirectMock, permanentRedirectMock, sessionMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
  permanentRedirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
  sessionMock: vi.fn(),
}));

/** Вызвать маршрут: он обязан прерваться уводом, а не вернуть разметку. */
async function expectRedirect(run: Promise<unknown>): Promise<void> {
  await expect(run).rejects.toThrow(/NEXT_REDIRECT/);
}

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
  permanentRedirect: permanentRedirectMock,
  usePathname: () => '/',
}));

vi.mock('@/lib/session', () => ({ requireSession: sessionMock }));

import LegacyAthleteCabinetRoute from '@/app/profile/athlete/[[...rest]]/page';
import LegacyFaceCabinetRoute from '@/app/profile/provider/[[...rest]]/page';
import { MobileNav } from '@/components/layout/MobileNav';

const params = (rest?: string[]) => Promise.resolve({ rest });

describe('Прежние адреса личного кабинета', () => {
  it('корень уводит на обзор личного кабинета — постоянным ответом', async () => {
    permanentRedirectMock.mockClear();

    await expectRedirect(LegacyAthleteCabinetRoute({ params: params() }));

    expect(permanentRedirectMock).toHaveBeenCalledWith('/profile/me/dashboard');
  });

  it('раздел сохраняет имя: /profile/athlete/reviews → /profile/me/reviews', async () => {
    // Разделы личного кабинета имён не меняли, поэтому переезд — это замена
    // начала адреса, а не таблица соответствий, которую пришлось бы вести.
    permanentRedirectMock.mockClear();

    await expectRedirect(LegacyAthleteCabinetRoute({ params: params(['reviews']) }));

    expect(permanentRedirectMock).toHaveBeenCalledWith('/profile/me/reviews');
  });
});

describe('Прежние адреса кабинета лица', () => {
  it('уводит в кабинет первого лица — и ответом ВРЕМЕННЫМ, не постоянным', async () => {
    // ⚠️ Главная проверка этого набора. Постоянный ответ здесь был бы ошибкой:
    // назначение зависит от вошедшего, и браузер закэшировал бы чужой адрес.
    redirectMock.mockClear();
    permanentRedirectMock.mockClear();
    sessionMock.mockResolvedValue({ faces: [{ kind: 'club', id: 3, name: 'Клуб' }] });

    await expectRedirect(LegacyFaceCabinetRoute({ params: params(['publications']) }));

    expect(redirectMock).toHaveBeenCalledWith('/profile/club/3/publications');
    expect(
      permanentRedirectMock,
      'переезд кабинета лица объявлен постоянным',
    ).not.toHaveBeenCalled();
  });

  it('человека без лиц уводит на главную, а не в несуществующий кабинет', async () => {
    redirectMock.mockClear();
    sessionMock.mockResolvedValue({ faces: [] });

    await expectRedirect(LegacyFaceCabinetRoute({ params: params() }));

    expect(redirectMock).toHaveBeenCalledWith('/');
  });
});

describe('Нижняя навигация', () => {
  it('«Профиль» ведёт сразу в личный кабинет, без прохода через прежний адрес', () => {
    const { container } = render(<MobileNav />);
    const profileLink = Array.from(container.querySelectorAll('a')).find(
      (anchor) => anchor.textContent?.trim() === 'Профиль',
    );

    expect(profileLink).toBeDefined();
    expect(profileLink).toHaveAttribute('href', '/profile/me/dashboard');
  });
});

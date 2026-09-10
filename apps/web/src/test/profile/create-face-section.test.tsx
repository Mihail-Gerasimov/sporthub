// Заведение лица услуг — из ЛИЧНОГО кабинета (шаги 36.30 и 36.31).
//
// ⚠️ Зачем этот набор. До фазы 36 первое лицо услуг завести через интерфейс было
// НЕЛЬЗЯ: кнопки «Опубликовать» жили в разделе кабинета лица, а в кабинет лица
// не попасть, не имея лица. Бэкенд при этом был готов — `POST /api/clubs`
// от человека без лиц упирался только в форму. Ровно тот класс, который фаза 35
// назвала своим главным выводом: сделано на сервере, до браузера не дошло.
//
// Поэтому здесь проверка идёт ОТ СТРАНИЦЫ, а не от компонента: рисуется настоящая
// серверная страница `/profile/me/dashboard`, и вопрос к ней тот самый, который
// задаёт человек, — «есть ли на этой странице кнопка завести лицо».
//
// ⚠️ Вторая проверка — про ИСТОЧНИК списка лиц (ловушка 18 файла фазы).
// `useCabinetFaces()` отвечает на вопрос «чей это кабинет» и в личном кабинете
// отдаёт пустой список. Если модалка возьмёт лица оттуда, выбор клуба-площадки
// в форме тренера молча опустеет: заведение лица — вопрос ЧЕЛОВЕКА, и источник
// здесь `useAuthFaces()`.
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

/** Кто вошёл: серверная страница узнаёт это только из сессии. */
const sessionUser = {
  id: 7,
  name: 'Пётр Смирнов',
  email: 'petr@sporthub.local',
  accountKind: 'person' as const,
  capabilities: [],
  faces: [],
};

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'sh-session' ? { name, value: 'session-7' } : undefined),
    toString: () => 'sh-session=session-7',
  }),
}));

vi.mock('@/lib/session', () => ({
  readSession: async () => sessionUser,
  requireSession: async () => sessionUser,
  requirePerson: async () => sessionUser,
}));

import { CreateFaceSection } from '@/components/profile/CreateFaceSection';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { installApiStub, type ApiStub } from '@/test/helpers/api-stub';
import { renderInPersonalCabinet } from '@/test/helpers/cabinet';
import { createFixtureRoutes } from '@/test/helpers/fixture-routes';

describe('Заведение лица услуг из личного кабинета', () => {
  let stub: ApiStub;

  beforeEach(() => {
    vi.resetModules();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    stub = installApiStub(createFixtureRoutes());
  });

  afterEach(() => {
    stub?.restore();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  // --- Шаг 36.30: тест ПОДКЛЮЧЕНИЯ ---

  it('человек без единого лица видит обе кнопки на /profile/me/dashboard', async () => {
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: { id: 7, name: 'Пётр Смирнов', email: 'petr@sporthub.local' },
      accountKind: 'person',
      isAuthenticated: true,
      status: 'ready',
      // Лиц нет вовсе — это и есть человек, которому раньше завести лицо было нечем.
      faces: [],
    });

    const { default: PersonalDashboardRoute } = await import('@/app/profile/me/dashboard/page');

    render(await PersonalDashboardRoute());

    expect(screen.getByRole('button', { name: 'Опубликовать клуб' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Опубликовать карточку тренера' }),
    ).toBeInTheDocument();
  });

  // --- Шаг 36.31: источник списка лиц (ловушка 18, диверсия д-37) ---

  it('в модалке тренера, открытой из личного кабинета, свой клуб предлагается площадкой', () => {
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: { id: 7, name: 'Пётр Смирнов', email: 'petr@sporthub.local' },
      accountKind: 'person',
      isAuthenticated: true,
      status: 'ready',
      // Клуб уже заведён, карточки тренера ещё нет — человек заводит второе лицо.
      faces: [{ kind: 'club', id: 4, name: 'Volna Aquatic Club' }],
    });

    // Раздел живёт в ЛИЧНОМ кабинете: там `useCabinetFaces()` отдаёт пустой список,
    // и подмена источника обязана обрушить именно эту проверку.
    renderInPersonalCabinet(<CreateFaceSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать карточку тренера' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Volna Aquatic Club' })).toBeInTheDocument();
  });

  it('человеку без клубов выбор площадки предлагает только «без привязки»', () => {
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: { id: 7, name: 'Пётр Смирнов', email: 'petr@sporthub.local' },
      accountKind: 'person',
      isAuthenticated: true,
      status: 'ready',
      faces: [],
    });

    renderInPersonalCabinet(<CreateFaceSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать карточку тренера' }));

    // Единственный пункт — «Без привязки к клубу»: своих клубов у человека нет,
    // а чужие в этот список не попадают ни при каких условиях. Считаются пункты
    // ИМЕННО этого выбора: в форме есть и другие выпадающие списки.
    const venueSelect = screen
      .getByRole('option', { name: 'Без привязки к клубу' })
      .closest('select');
    expect(venueSelect?.querySelectorAll('option')).toHaveLength(1);
  });

  it('кнопка «Опубликовать клуб» открывает модалку клуба', () => {
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: { id: 7, name: 'Пётр Смирнов', email: 'petr@sporthub.local' },
      accountKind: 'person',
      isAuthenticated: true,
      status: 'ready',
      faces: [],
    });

    renderInPersonalCabinet(<CreateFaceSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать клуб' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('h2')).toHaveTextContent('Опубликовать клуб');
  });
});

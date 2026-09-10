/**
 * Интеграционные тесты admin-flow (Step 17.8).
 * Полный lifecycle: вход → имперсонизация → навигация → возврат → выход.
 * Guard-сценарии и regression на обычный auth flow.
 *
 * Phase 34 Step 34.48: блок «persistence при перезагрузке» заменён на
 * «перезагрузка спрашивает сервер». Личность больше не лежит в localStorage,
 * и проверять надо не то, что она оттуда поднялась, а то, что она пришла
 * ответом «кто я».
 *
 * ⚠️ Фаза 35, шаг 35.34. Тип учётной записи из стора ушёл, и вместе с ним — блок
 * «роль → кабинет». Он проверял ФУНКЦИЮ маппинга, а не поведение: работа
 * от чужого лица теперь ведёт туда, куда указывает СОСТАВ сессии цели —
 * есть лица услуг, значит кабинет лица; нет — личный кабинет.
 */
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_STORE_DEFAULT_STATE,
  selectBookingActorUserId,
  useAuthStore,
  type AuthSessionUser,
} from '@/stores/useAuthStore';
import type { ServiceFace } from '@/lib/service-faces';

// --- Данные стенда (повторяют общий набор пользователей) ---

const ADMIN_USER_ID = 3;
const ATHLETE_USER_ID = 1;
const PROVIDER_USER_ID = 2;

const adminUser: AuthSessionUser = {
  id: ADMIN_USER_ID,
  name: 'Администратор SportHub',
  email: 'admin@sporthub.local',
};

const athleteUser: AuthSessionUser = {
  id: ATHLETE_USER_ID,
  name: 'Алексей Смирнов',
  email: 'alexey@sporthub.local',
  phone: '+7 (927) 000-10-10',
};

const providerUser: AuthSessionUser = {
  id: PROVIDER_USER_ID,
  name: 'Марина Крылова',
  email: 'marina@studio.local',
  phone: '+7 (927) 000-20-20',
};

/** Лицо услуг владелицы клуба: по нему считается кабинет цели. */
const PROVIDER_FACE: ServiceFace = { kind: 'club', id: 3, name: 'CrossFit Garage' };

/** Ответ «кто я». */
function meResponse(user: AuthSessionUser, accountKind: string, faces: ServiceFace[] = []) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        success: true,
        data: {
          ...user,
          accountKind,
          faces,
          capabilities: [],
        },
      }),
  } as unknown as Response;
}

/** Ответ «кто я» под работой от чужого лица: цель, признак и имя исполнителя. */
function impersonatedMeResponse(
  target: AuthSessionUser,
  accountKind: string,
  actorName: string,
  faces: ServiceFace[] = [],
) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        success: true,
        data: {
          ...target,
          accountKind,
          faces,
          capabilities: [],
          impersonating: true,
          actorName,
        },
      }),
  } as unknown as Response;
}

/** Успешный выход. Отдельная подмена нужна каждому тесту с `logout`. */
function stubLogout() {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);
}

/**
 * Стенд сессии на весь сценарий.
 *
 * Работу от чужого лица начинает и заканчивает сервер, а стор после каждого
 * такого шага перечитывает «кто я». Поэтому стенду нужен не один ответ, а тот,
 * который сервер дал бы ПОСЛЕ очередного шага, — его и задаёт `answers`.
 */
function stubSession(initial: Response) {
  let current = initial;

  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    if (String(input) === '/api/auth/me') return Promise.resolve(current);

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    } as unknown as Response);
  });

  return {
    answers(next: Response) {
      current = next;
    },
  };
}

describe('Admin integration (Step 17.8)', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Полный admin lifecycle ---

  describe('полный admin lifecycle', () => {
    it('вход → имперсонизация athlete → возврат → имперсонизация provider → возврат → выход', async () => {
      const server = stubSession(meResponse(adminUser, 'admin'));

      // 1. Admin входит
      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      expect(useAuthStore.getState().isAdmin).toBe(true);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().accountKind).toBe('admin');

      // 2. Impersonation: athlete
      server.answers(impersonatedMeResponse(athleteUser, 'person', adminUser.name));

      await act(async () => {
        await useAuthStore.getState().startImpersonation(ATHLETE_USER_ID);
      });

      expect(useAuthStore.getState().user?.id).toBe(ATHLETE_USER_ID);
      expect(useAuthStore.getState().faces).toEqual([]);
      expect(useAuthStore.getState().isImpersonating).toBe(true);
      expect(useAuthStore.getState().adminOriginalUser).toEqual(adminUser);

      // 3. Возврат в панель
      server.answers(meResponse(adminUser, 'admin'));

      await act(async () => {
        await useAuthStore.getState().stopImpersonation();
      });

      expect(useAuthStore.getState().user?.id).toBe(ADMIN_USER_ID);
      expect(useAuthStore.getState().accountKind).toBe('admin');
      expect(useAuthStore.getState().isImpersonating).toBe(false);
      expect(useAuthStore.getState().isAdmin).toBe(true);

      // 4. Impersonation: provider
      server.answers(
        impersonatedMeResponse(providerUser, 'person', adminUser.name, [PROVIDER_FACE]),
      );

      await act(async () => {
        await useAuthStore.getState().startImpersonation(PROVIDER_USER_ID);
      });

      expect(useAuthStore.getState().user?.id).toBe(PROVIDER_USER_ID);
      expect(useAuthStore.getState().faces).toEqual([PROVIDER_FACE]);
      expect(useAuthStore.getState().isImpersonating).toBe(true);
      expect(useAuthStore.getState().adminOriginalUser?.id).toBe(ADMIN_USER_ID);

      // 5. Возврат и logout
      server.answers(meResponse(adminUser, 'admin'));

      await act(async () => {
        await useAuthStore.getState().stopImpersonation();
      });

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      const finalState = useAuthStore.getState();

      expect(finalState.user).toBeNull();
      expect(finalState.isAuthenticated).toBe(false);
      expect(finalState.isAdmin).toBe(false);
      expect(finalState.isImpersonating).toBe(false);
      expect(finalState.adminOriginalUser).toBeNull();
      expect(finalState.accountKind).toBeNull();
    });
  });

  // --- кто действует под работой от чужого лица ---

  describe('право записываться под работой от чужого лица', () => {
    it('возвращает номер ЦЕЛИ, а не администратора', async () => {
      stubSession(impersonatedMeResponse(athleteUser, 'person', adminUser.name));

      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      await act(async () => {
        await useAuthStore.getState().startImpersonation(ATHLETE_USER_ID);
      });

      const state = useAuthStore.getState();
      const userId = selectBookingActorUserId(state);

      expect(userId).toBe(ATHLETE_USER_ID);
    });

    it('возвращает null для администратора без работы от чужого лица', () => {
      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      const state = useAuthStore.getState();
      const userId = selectBookingActorUserId(state);

      expect(userId).toBeNull();
    });

    it('владелец клуба под работой от чужого лица записывается как человек', async () => {
      // ⚠️ Шаг 35.34. Прежде здесь ожидался `null`: «тип учётной записи —
      // провайдер, значит записываться нельзя». Владелец клуба — такой же
      // человек, и его записи существуют. Роль этого никогда не решала.
      stubSession(impersonatedMeResponse(providerUser, 'person', adminUser.name, [PROVIDER_FACE]));

      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      await act(async () => {
        await useAuthStore.getState().startImpersonation(PROVIDER_USER_ID);
      });

      const state = useAuthStore.getState();

      expect(selectBookingActorUserId(state)).toBe(PROVIDER_USER_ID);
    });
  });

  // --- Повторный impersonation без возврата ---

  describe('повторный impersonation', () => {
    it('переключение между пользователями через stop → start сохраняет admin-контекст', async () => {
      const server = stubSession(meResponse(adminUser, 'admin'));

      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      // Первый impersonation — athlete
      server.answers(impersonatedMeResponse(athleteUser, 'person', adminUser.name));

      await act(async () => {
        await useAuthStore.getState().startImpersonation(ATHLETE_USER_ID);
      });

      expect(useAuthStore.getState().user?.id).toBe(ATHLETE_USER_ID);

      // Возврат
      server.answers(meResponse(adminUser, 'admin'));

      await act(async () => {
        await useAuthStore.getState().stopImpersonation();
      });

      // Второй impersonation — provider (без logout между ними)
      server.answers(
        impersonatedMeResponse(providerUser, 'person', adminUser.name, [PROVIDER_FACE]),
      );

      await act(async () => {
        await useAuthStore.getState().startImpersonation(PROVIDER_USER_ID);
      });

      expect(useAuthStore.getState().user?.id).toBe(PROVIDER_USER_ID);
      expect(useAuthStore.getState().faces).toEqual([PROVIDER_FACE]);
      expect(useAuthStore.getState().isAdmin).toBe(true);
      expect(useAuthStore.getState().adminOriginalUser?.id).toBe(ADMIN_USER_ID);
    });
  });

  // --- Logout во время impersonation ---

  describe('logout во время impersonation', () => {
    it('полностью очищает все поля — admin не застревает под чужим аккаунтом', async () => {
      stubLogout();

      // Состояние «работаю от чужого лица» задаётся напрямую: здесь проверяется
      // выход из него, а не то, как оно возникло.
      useAuthStore.setState({
        ...AUTH_STORE_DEFAULT_STATE,
        user: athleteUser,
        accountKind: 'person',
        isAuthenticated: true,
        isAdmin: true,
        isImpersonating: true,
        adminOriginalUser: adminUser,
      });

      // Выход прямо во время имперсонизации
      await act(async () => {
        await useAuthStore.getState().logout();
      });

      const state = useAuthStore.getState();

      expect(state.user).toBeNull();
      expect(state.accountKind).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isAdmin).toBe(false);
      expect(state.isImpersonating).toBe(false);
      expect(state.adminOriginalUser).toBeNull();
    });
  });

  // --- Перезагрузка страницы ---

  describe('перезагрузка спрашивает сервер', () => {
    it('admin-сессия восстанавливается ответом «кто я»', async () => {
      // Полная перезагрузка: стор пуст, восстановить его неоткуда, кроме сервера.
      useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(meResponse(adminUser, 'admin'));

      await act(async () => {
        await useAuthStore.getState().loadSession();
      });

      const state = useAuthStore.getState();

      expect(state.isAdmin).toBe(true);
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.id).toBe(ADMIN_USER_ID);
      expect(state.accountKind).toBe('admin');
      expect(state.isImpersonating).toBe(false);
    });

    it('имперсонизация перезагрузку ПЕРЕЖИВАЕТ: её помнит сессия', async () => {
      // Полная перезагрузка во время работы от чужого лица: стор пуст, а сессия
      // на сервере всё ещё подменённая. Пока стор снимал признак сам, плашка
      // исчезала, а подмена оставалась — администратор действовал от чужого лица
      // без единого признака на экране.
      useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        impersonatedMeResponse(athleteUser, 'person', adminUser.name),
      );

      await act(async () => {
        await useAuthStore.getState().loadSession();
      });

      const state = useAuthStore.getState();

      expect(state.isImpersonating).toBe(true);
      expect(state.adminOriginalUser?.name).toBe(adminUser.name);
      expect(state.user?.id).toBe(ATHLETE_USER_ID);
      expect(state.accountKind).toBe('person');
      expect(state.isAdmin).toBe(true);
    });
  });

  // --- куда ведёт работа от чужого лица ---

  describe('адрес кабинета цели', () => {
    it('у цели без лиц услуг — личный кабинет', async () => {
      // Адрес называет стор, а не вызывающая страница: иначе он жил бы в двух
      // местах и разъехался бы на первом же переименовании маршрута.
      stubSession(impersonatedMeResponse(athleteUser, 'person', adminUser.name));

      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      await act(async () => {
        expect(await useAuthStore.getState().startImpersonation(ATHLETE_USER_ID)).toBe(
          '/profile/me',
        );
      });

      expect(useAuthStore.getState().user?.id).toBe(ATHLETE_USER_ID);
    });

    it('у цели с лицом услуг — кабинет лица', async () => {
      stubSession(impersonatedMeResponse(providerUser, 'person', adminUser.name, [PROVIDER_FACE]));

      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      await act(async () => {
        expect(await useAuthStore.getState().startImpersonation(PROVIDER_USER_ID)).toBe(
          '/profile/club/3',
        );
      });
    });
  });

  // --- Regression: стандартный auth flow не затронут ---

  describe('regression: стандартный auth flow', () => {
    it('обычный вход → выход не затрагивает admin-поля', async () => {
      stubLogout();

      // Обычный вход как athlete
      act(() => {
        useAuthStore.getState().login({ user: athleteUser });
      });

      expect(useAuthStore.getState().isAdmin).toBe(false);
      expect(useAuthStore.getState().isImpersonating).toBe(false);
      expect(useAuthStore.getState().adminOriginalUser).toBeNull();

      // Выход
      await act(async () => {
        await useAuthStore.getState().logout();
      });

      expect(useAuthStore.getState().isAdmin).toBe(false);
      expect(useAuthStore.getState().isImpersonating).toBe(false);
    });

    it('обычная регистрация сразу даёт право записываться', () => {
      act(() => {
        useAuthStore.getState().register({ user: athleteUser });
      });

      expect(selectBookingActorUserId(useAuthStore.getState())).toBe(ATHLETE_USER_ID);
    });

    it('вход владельца клуба тоже даёт право записываться', () => {
      // ⚠️ Прежде здесь ожидался `null`. Право записываться не отбирается
      // за то, что у человека есть свой зал.
      act(() => {
        useAuthStore.getState().login({ user: providerUser });
      });

      expect(selectBookingActorUserId(useAuthStore.getState())).toBe(PROVIDER_USER_ID);
    });

    it('admin-поля не «заражают» обычный вход после выхода из admin-сессии', async () => {
      stubLogout();

      // Сначала admin-сессия с работой от чужого лица
      useAuthStore.setState({
        ...AUTH_STORE_DEFAULT_STATE,
        user: athleteUser,
        accountKind: 'person',
        isAuthenticated: true,
        isAdmin: true,
        isImpersonating: true,
        adminOriginalUser: adminUser,
      });

      // Выход
      await act(async () => {
        await useAuthStore.getState().logout();
      });

      // Теперь обычный вход
      act(() => {
        useAuthStore.getState().login({ user: athleteUser });
      });

      const state = useAuthStore.getState();

      expect(state.isAdmin).toBe(false);
      expect(state.isImpersonating).toBe(false);
      expect(state.adminOriginalUser).toBeNull();
      expect(state.accountKind).toBe('person');
      expect(state.user).toEqual(athleteUser);
    });
  });
});

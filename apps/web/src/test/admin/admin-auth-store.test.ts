/**
 * Тесты admin-расширения auth store (Step 17.2).
 * Покрывают: adminLogin, startImpersonation, stopImpersonation,
 * выход при имперсонизации, восстановление личности с сервера,
 * адрес кабинета цели.
 *
 * ⚠️ Фаза 35, шаг 35.34. Блок про `userRoleToAccountType` снят целиком: функции
 * нет, потому что нет и типа кабинета. Её работу — «куда вести администратора,
 * начавшего работу от чужого лица» — теперь делает состав сессии цели: есть
 * лица услуг → кабинет лица, нет → личный кабинет. Проверяется это ниже, в
 * `startImpersonation`, и проверяется по РЕЗУЛЬТАТУ, а не по имени роли.
 *
 * Phase 34 Step 34.48: личность больше не хранится в localStorage — она
 * приходит ответом `GET /api/auth/me`. Прежний тест «поля переживают
 * перезагрузку через localStorage» заменён на «после перезагрузки личность
 * восстанавливается с сервера», потому что проверять надо именно это.
 */
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_STORE_DEFAULT_STATE,
  useAuthStore,
  type AuthSessionUser,
} from '@/stores/useAuthStore';
import type { ServiceFace } from '@/lib/service-faces';

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

/** Клуб владелицы: на нём видно, что кабинет цели считается от ЛИЦА, а не от роли. */
const PROVIDER_FACE: ServiceFace = { kind: 'club', id: 3, name: 'CrossFit Garage' };

/** Ответ «кто я» — ровно та форма, что приходит с сервера. */
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

/**
 * Стенд сервера для работы от чужого лица.
 *
 * Маршруты имперсонизации отвечают одним «принято», а личность стор всё равно
 * перечитывает через «кто я» — источник правды один, и подменяется он тоже один.
 */
function stubImpersonationServer(me: Response, accepted = true) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    if (String(input) === '/api/auth/me') return Promise.resolve(me);

    return Promise.resolve({
      ok: accepted,
      status: accepted ? 200 : 400,
      json: () => Promise.resolve({ success: accepted }),
    } as unknown as Response);
  });
}

/** Ответ «вошедшего нет». */
function guestResponse() {
  return { ok: false, status: 401, json: () => Promise.resolve({}) } as unknown as Response;
}

describe('Admin auth store (Step 17.2)', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- adminLogin ---

  describe('adminLogin', () => {
    it('устанавливает admin-сессию: isAdmin, вид записи «служебная», лиц нет', () => {
      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      const state = useAuthStore.getState();

      expect(state.user).toEqual(adminUser);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isAdmin).toBe(true);
      expect(state.accountKind).toBe('admin');
      expect(state.faces).toEqual([]);
      expect(state.isImpersonating).toBe(false);
      expect(state.adminOriginalUser).toBeNull();
    });
  });

  // --- startImpersonation ---

  describe('startImpersonation', () => {
    it('начинает работу от чужого лица НА СЕРВЕРЕ, а личность берёт из ответа', async () => {
      // ⚠️ Раньше подмена жила целиком в браузере: сервер продолжал видеть
      // администратора, то есть экран и настоящие права расходились.
      const fetchSpy = stubImpersonationServer(
        impersonatedMeResponse(athleteUser, 'person', adminUser.name),
      );

      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      await act(async () => {
        await useAuthStore.getState().startImpersonation(ATHLETE_USER_ID);
      });

      const state = useAuthStore.getState();

      expect(fetchSpy).toHaveBeenCalledWith(`/api/auth/impersonate/${ATHLETE_USER_ID}`, {
        method: 'POST',
      });
      expect(state.user?.id).toBe(ATHLETE_USER_ID);
      expect(state.faces).toEqual([]);
      expect(state.isAdmin).toBe(true);
      expect(state.isImpersonating).toBe(true);
      expect(state.adminOriginalUser).toEqual(adminUser);
    });

    it('у цели с лицом услуг уводит в кабинет ЛИЦА, у цели без лиц — в личный', async () => {
      // ⚠️ Шаг 35.34. Прежде адрес собирался из типа учётной записи прямо
      // в админской странице, и адрес кабинета жил в двух местах сразу.
      // Теперь его называет сам стор — по составу сессии цели.
      stubImpersonationServer(
        impersonatedMeResponse(providerUser, 'person', adminUser.name, [PROVIDER_FACE]),
      );

      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      await act(async () => {
        expect(await useAuthStore.getState().startImpersonation(PROVIDER_USER_ID)).toBe(
          '/profile/club/3',
        );
      });

      const state = useAuthStore.getState();

      expect(state.user?.id).toBe(PROVIDER_USER_ID);
      expect(state.faces).toEqual([PROVIDER_FACE]);
      expect(state.isImpersonating).toBe(true);
      expect(state.adminOriginalUser).toEqual(adminUser);
    });

    it('цель без лиц услуг уводит в личный кабинет', async () => {
      stubImpersonationServer(impersonatedMeResponse(athleteUser, 'person', adminUser.name));

      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      await act(async () => {
        expect(await useAuthStore.getState().startImpersonation(ATHLETE_USER_ID)).toBe(
          '/profile/me',
        );
      });
    });

    it('не работает если isAdmin !== true — сервер даже не спрашивается', async () => {
      // Обычный пользователь — не admin
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      act(() => {
        useAuthStore.getState().login({ user: athleteUser });
      });

      await act(async () => {
        await useAuthStore.getState().startImpersonation(PROVIDER_USER_ID);
      });

      const state = useAuthStore.getState();

      // Состояние не изменилось — impersonation не прошёл
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(state.user).toEqual(athleteUser);
      expect(state.accountKind).toBe('person');
      expect(state.isImpersonating).toBe(false);
      expect(state.adminOriginalUser).toBeNull();
    });

    it('отказ сервера не подменяет личность в браузере', async () => {
      // Иначе экран показывал бы чужой кабинет, которого сервер не отдаст.
      stubImpersonationServer(meResponse(adminUser, 'admin'), false);

      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      await act(async () => {
        expect(await useAuthStore.getState().startImpersonation(ATHLETE_USER_ID)).toBeNull();
      });

      const state = useAuthStore.getState();

      expect(state.user).toEqual(adminUser);
      expect(state.isImpersonating).toBe(false);
      expect(state.adminOriginalUser).toBeNull();
    });
  });

  // --- stopImpersonation ---

  describe('stopImpersonation', () => {
    it('заканчивает работу от чужого лица НА СЕРВЕРЕ и возвращает администратора', async () => {
      // Очистить только стор мало: сессия с подменённой личностью осталась бы
      // жить, и «возврат в панель» ничего бы не вернул.
      const fetchSpy = stubImpersonationServer(meResponse(adminUser, 'admin'));

      useAuthStore.setState({
        ...AUTH_STORE_DEFAULT_STATE,
        user: athleteUser,
        accountKind: 'person',
        isAuthenticated: true,
        isAdmin: true,
        isImpersonating: true,
        adminOriginalUser: adminUser,
      });

      await act(async () => {
        expect(await useAuthStore.getState().stopImpersonation()).toBe(true);
      });

      const state = useAuthStore.getState();

      expect(fetchSpy).toHaveBeenCalledWith('/api/auth/impersonate/stop', { method: 'POST' });
      expect(state.user).toEqual(adminUser);
      expect(state.accountKind).toBe('admin');
      expect(state.isAdmin).toBe(true);
      expect(state.isImpersonating).toBe(false);
      expect(state.adminOriginalUser).toBeNull();
      expect(state.isAuthenticated).toBe(true);
    });

    it('недоступный сервер оставляет плашку на месте', async () => {
      // Признак работы от чужого лица снимает только сервер. Снять его самому —
      // значит спрятать плашку, оставив саму подмену живой.
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('сеть недоступна'));

      useAuthStore.setState({
        ...AUTH_STORE_DEFAULT_STATE,
        user: athleteUser,
        accountKind: 'person',
        isAuthenticated: true,
        isAdmin: true,
        isImpersonating: true,
        adminOriginalUser: adminUser,
      });

      await act(async () => {
        expect(await useAuthStore.getState().stopImpersonation()).toBe(false);
      });

      expect(useAuthStore.getState().isImpersonating).toBe(true);
      expect(useAuthStore.getState().user).toEqual(athleteUser);
    });
  });

  // --- logout при impersonation ---

  describe('logout', () => {
    it('полностью очищает все поля включая admin/impersonation', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue({ ok: true, status: 200 } as Response);

      useAuthStore.setState({
        ...AUTH_STORE_DEFAULT_STATE,
        user: athleteUser,
        accountKind: 'person',
        isAuthenticated: true,
        isAdmin: true,
        isImpersonating: true,
        adminOriginalUser: adminUser,
      });

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      const state = useAuthStore.getState();

      expect(fetchSpy).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
      expect(state.user).toBeNull();
      expect(state.accountKind).toBeNull();
      expect(state.faces).toEqual([]);
      expect(state.isAuthenticated).toBe(false);
      expect(state.isAdmin).toBe(false);
      expect(state.isImpersonating).toBe(false);
      expect(state.adminOriginalUser).toBeNull();
    });

    it('очищает состояние даже если сервер недоступен', async () => {
      // Иначе сбой сети оставлял бы человека внутри интерфейса: кнопка нажата,
      // а на экране по-прежнему его кабинет.
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('сеть недоступна'));

      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().user).toBeNull();
    });
  });

  // --- восстановление личности с сервера ---

  describe('loadSession', () => {
    it('восстанавливает admin-сессию ответом «кто я», без localStorage', async () => {
      // Полная перезагрузка страницы: стор пуст, localStorage не при делах.
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(meResponse(adminUser, 'admin'));

      await act(async () => {
        await useAuthStore.getState().loadSession();
      });

      const state = useAuthStore.getState();

      expect(state.isAuthenticated).toBe(true);
      expect(state.isAdmin).toBe(true);
      expect(state.accountKind).toBe('admin');
      expect(state.user?.id).toBe(ADMIN_USER_ID);
      expect(state.status).toBe('ready');
    });

    it('имперсонизация ПЕРЕЖИВАЕТ перезагрузку: признак и исполнитель — из ответа сервера', async () => {
      // ⚠️ Найдено прогоном через браузер. Стор ставил признак работы от чужого
      // лица в `false` жёстко — «сервер о ней не знает». После фазы 34 знает:
      // обе личности лежат в сессии. Из-за затирания плашка исчезала после любой
      // полной перезагрузки, а администратор продолжал действовать от чужого лица
      // без единого признака на экране — то есть хуже, чем если бы её не было.
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        impersonatedMeResponse(athleteUser, 'person', adminUser.name),
      );

      await act(async () => {
        await useAuthStore.getState().loadSession();
      });

      const state = useAuthStore.getState();

      expect(state.isImpersonating).toBe(true);
      // На экране — тот, ОТ ЧЬЕГО лица работают.
      expect(state.user?.id).toBe(ATHLETE_USER_ID);
      expect(state.accountKind).toBe('person');
      // А знать, кто работает на самом деле, нужно для возврата в панель.
      expect(state.adminOriginalUser?.name).toBe(adminUser.name);
      expect(state.isAdmin).toBe(true);
    });

    it('сервер сообщил, что работы от чужого лица нет — признак снимается', async () => {
      // Обратная сторона: возврат к себе мог случиться в другой вкладке.
      // Источник правды один — ответ «кто я».
      useAuthStore.setState({
        ...AUTH_STORE_DEFAULT_STATE,
        user: athleteUser,
        accountKind: 'person',
        isAuthenticated: true,
        isAdmin: true,
        isImpersonating: true,
        adminOriginalUser: adminUser,
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(meResponse(adminUser, 'admin'));

      await act(async () => {
        await useAuthStore.getState().loadSession();
      });

      const state = useAuthStore.getState();

      expect(state.isImpersonating).toBe(false);
      expect(state.adminOriginalUser).toBeNull();
      expect(state.user?.id).toBe(ADMIN_USER_ID);
    });

    it('отказ сессии обнуляет стор — вход не «прилипает» к браузеру', async () => {
      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(guestResponse());

      await act(async () => {
        await useAuthStore.getState().loadSession();
      });

      const state = useAuthStore.getState();

      expect(state.isAuthenticated).toBe(false);
      expect(state.isAdmin).toBe(false);
      expect(state.user).toBeNull();
      expect(state.status).toBe('ready');
    });

    it('недоступный сервер не выкидывает вошедшего, но снимает ожидание', async () => {
      // Разница принципиальная: «сессии нет» и «спросить не удалось» — не одно
      // и то же. Второе не должно выглядеть как выход из системы.
      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('сеть недоступна'));

      await act(async () => {
        await useAuthStore.getState().loadSession();
      });

      const state = useAuthStore.getState();

      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.id).toBe(ADMIN_USER_ID);
      expect(state.status).toBe('ready');
    });

    it('кабинет определяют ЛИЦА из ответа, а не роль', async () => {
      // ⚠️ Прежде здесь проверялось «роль club_owner → кабинет провайдера».
      // Роль и владение расходятся уже сейчас (раздел 4.6 плана фазы), поэтому
      // ответ считается по лицам: они и есть факт, а роль — надпись.
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        meResponse(providerUser, 'person', [PROVIDER_FACE]),
      );

      await act(async () => {
        await useAuthStore.getState().loadSession();
      });

      expect(useAuthStore.getState().faces).toEqual([PROVIDER_FACE]);
      expect(useAuthStore.getState().activeFaceKey).toBe('club:3');
      expect(useAuthStore.getState().isAdmin).toBe(false);
    });
  });

  // --- regression: обычный login/register ---

  describe('regression: обычный auth flow', () => {
    it('login по-прежнему работает и не затрагивает admin-поля', () => {
      act(() => {
        useAuthStore.getState().login({ user: athleteUser });
      });

      const state = useAuthStore.getState();

      expect(state.user).toEqual(athleteUser);
      expect(state.accountKind).toBe('person');
      expect(state.isAuthenticated).toBe(true);
      expect(state.isAdmin).toBe(false);
      expect(state.isImpersonating).toBe(false);
      expect(state.adminOriginalUser).toBeNull();
    });

    it('register по-прежнему работает и не затрагивает admin-поля', () => {
      act(() => {
        useAuthStore.getState().register({ user: providerUser });
      });

      const state = useAuthStore.getState();

      expect(state.user).toEqual(providerUser);
      expect(state.accountKind).toBe('person');
      expect(state.isAuthenticated).toBe(true);
      expect(state.isAdmin).toBe(false);
    });
  });
});

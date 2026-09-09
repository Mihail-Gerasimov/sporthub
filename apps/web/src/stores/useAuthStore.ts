'use client';

// Кто вошёл — с точки зрения браузера.
//
// ⚠️ Главное изменение фазы 34: стор больше НЕ ИСТОЧНИК личности, а её отражение.
// До неё браузер хранил «кто я» в localStorage, сам себе это назначал и сам же
// сообщал серверу номером в теле запроса. Отредактировать localStorage может кто
// угодно — то есть личности не было вовсе, была строка в браузере.
//
// Теперь личность живёт в серверной сессии (httpOnly cookie, браузеру недоступна),
// а сюда попадает единственным путём — ответом `GET /api/auth/me`. Отсюда три
// следствия, и каждое видно в коде ниже:
//
//   1. Сохранения в localStorage нет. Восстанавливать состояние из браузера
//      нечем и незачем: спросить сервер и дешевле, и честнее.
//   2. `status` показывает, спросили уже или ещё нет. Без него нельзя отличить
//      гостя от «ответ ещё не пришёл», и защита в браузере выкидывала бы
//      вошедшего на первой же перезагрузке страницы.
//   3. Выход ходит на сервер. Очистить стор мало: сессия живёт на сервере,
//      и украденный идентификатор продолжал бы работать после «выхода».
//
// То же правило распространено на работу от чужого лица: она тоже живёт в сессии
// (две личности в одной), и стор её не назначает, а отражает. Начало и конец —
// маршруты `POST /api/auth/impersonate/:id` и `POST /api/auth/impersonate/stop`,
// а признак и имя настоящего исполнителя приезжают в ответе «кто я».
//
// Что стор по-прежнему решает сам: мелочи отображения вроде обновления телефона
// в шапке.

import { create } from 'zustand';

import type { AuthAccountType, UserRole } from '@sporthub/types';

export type AuthSessionUser = {
  id?: number;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  city?: string;
};

/**
 * Ответ «кто я». Повторяет форму, которую отдаёт бэкенд, — включая роль
 * и список прав: по ним интерфейс решает, какой кабинет открывать и какие
 * действия рисовать, а не угадывает это по адресу страницы.
 */
export type SessionProfile = AuthSessionUser & {
  id: number;
  role: UserRole;
  capabilities: string[];
  quarantineLiftedAt?: string;
  /** Работа идёт от чужого лица. Приходит только под ней. */
  impersonating?: boolean;
  /** Имя того, кто вошёл на самом деле, — под имперсонизацией это администратор. */
  actorName?: string;
};

/**
 * Кто работает на самом деле, пока идёт работа от чужого лица.
 *
 * После полной перезагрузки страницы сервер сообщает только имя — карточка
 * целиком известна лишь тогда, когда работа началась в этой же вкладке. Поэтому
 * обязательно здесь одно имя: его достаточно, чтобы показать на экране, кто
 * действует, а всё остальное необязательно и появляется, когда известно.
 */
export type AuthImpersonationActor = { name: string } & Partial<AuthSessionUser>;

/**
 * Спросили ли уже сервер, кто вошёл.
 *
 * `unknown` — ещё не спрашивали или ответ в пути; `ready` — ответ получен
 * (в том числе «никто»). Разница важна ровно одному потребителю — проверкам
 * доступа в браузере: до ответа они обязаны ждать, а не считать человека гостем.
 */
export type AuthSessionStatus = 'unknown' | 'ready';

export type PersonalCabinetConfig = {
  accountType: AuthAccountType;
  profilePath: '/profile/provider' | '/profile/athlete';
  title: string;
};

type AuthSessionPayload = {
  accountType: AuthAccountType;
  user: AuthSessionUser;
};

type AuthState = {
  user: AuthSessionUser | null;
  accountType: AuthAccountType | null;
  isAuthenticated: boolean;
  /** Роль из сессии. `null` — гость либо ответ ещё не пришёл. */
  role: UserRole | null;
  /** Права роли из сессии: интерфейс рисует действия по списку, а не по догадке. */
  capabilities: string[];
  status: AuthSessionStatus;
  login: (payload: AuthSessionPayload) => void;
  register: (payload: AuthSessionPayload) => void;
  logout: () => Promise<void>;
  /**
   * Спросить сервер, кто вошёл, и привести стор к ответу.
   *
   * Вызывается один раз на загрузку страницы (`SessionBootstrap`) и повторно
   * там, где личность могла поменяться. Ошибки наружу не выпускает: интерфейс
   * не должен падать из-за недоступной сети.
   */
  loadSession: () => Promise<void>;
  /**
   * Точечное обновление полей текущего пользователя — после успешного
   * `PATCH /api/users/:id`. Шортхэнд вместо полного `login()`: тип кабинета
   * и признак входа не трогаются. Если пользователя нет — ничего не делает.
   */
  updateUser: (patch: Partial<AuthSessionUser>) => void;

  // --- Админский трек и имперсонизация ---
  isAdmin: boolean;
  isImpersonating: boolean;
  /** Настоящий исполнитель, пока работа идёт от чужого лица. */
  adminOriginalUser: AuthImpersonationActor | null;
  adminLogin: (user: AuthSessionUser) => void;
  /**
   * Начать работу от лица пользователя.
   *
   * Возвращает тип кабинета цели — по нему вызывающий решает, куда переходить, —
   * или `null`, если сервер не разрешил. Личность после согласия перечитывается
   * ответом «кто я»: назначать её себе браузер не вправе.
   */
  startImpersonation: (targetUserId: number) => Promise<AuthAccountType | null>;
  /**
   * Вернуться к себе. `true` — работа от чужого лица закончена.
   *
   * Признак снимает только сервер: снять его самому — значит спрятать плашку,
   * оставив саму подмену живой.
   */
  stopImpersonation: () => Promise<boolean>;
};

export const AUTH_STORE_DEFAULT_STATE = {
  user: null,
  accountType: null,
  isAuthenticated: false,
  role: null,
  capabilities: [],
  status: 'unknown',
  isAdmin: false,
  isImpersonating: false,
  adminOriginalUser: null,
} satisfies Pick<
  AuthState,
  | 'user'
  | 'accountType'
  | 'isAuthenticated'
  | 'role'
  | 'capabilities'
  | 'status'
  | 'isAdmin'
  | 'isImpersonating'
  | 'adminOriginalUser'
>;

function createAuthenticatedState(payload: AuthSessionPayload) {
  return {
    user: payload.user,
    accountType: payload.accountType,
    isAuthenticated: true,
  } satisfies Pick<AuthState, 'user' | 'accountType' | 'isAuthenticated'>;
}

/**
 * Роль из базы → тип кабинета на фронте.
 * `athlete` → 'athlete', `club_owner`/`trainer` → 'provider', `admin` → null:
 * у администратора личного кабинета нет, у него сервисная панель.
 */
export function userRoleToAccountType(role: UserRole): AuthAccountType | null {
  if (role === 'athlete') return 'athlete';
  if (role === 'club_owner' || role === 'trainer') return 'provider';
  return null;
}

export const PERSONAL_CABINET_CONFIG: Record<AuthAccountType, PersonalCabinetConfig> = {
  provider: {
    accountType: 'provider',
    profilePath: '/profile/provider',
    title: 'Кабинет представителя спортивных услуг',
  },
  athlete: {
    accountType: 'athlete',
    profilePath: '/profile/athlete',
    title: 'Кабинет спортсмена',
  },
};

export function selectAuthAccountType(state: Pick<AuthState, 'accountType'>) {
  return state.accountType;
}

export function selectAthleteActionUserId(state: Pick<AuthState, 'accountType' | 'user'>) {
  return state.accountType === 'athlete' ? (state.user?.id ?? null) : null;
}

export function getPersonalCabinetConfig(accountType: AuthAccountType | null) {
  return accountType ? PERSONAL_CABINET_CONFIG[accountType] : null;
}

/**
 * Спросить бэкенд «кто я».
 *
 * `undefined` — спросить не удалось (сеть, бэкенд лежит). Это НЕ то же самое,
 * что `null` (спросили, вошедшего нет): по первому состояние стора трогать
 * нельзя, иначе моргание сети выглядело бы как выход из системы.
 */
async function fetchSessionProfile(): Promise<SessionProfile | null | undefined> {
  try {
    const response = await fetch('/api/auth/me', {
      // Сессию могут отозвать в любой момент, и ответ из кэша это скрыл бы.
      cache: 'no-store',
    });

    if (response.status === 401 || response.status === 403) return null;

    if (!response.ok) return undefined;

    const body = (await response.json()) as { success?: boolean; data?: SessionProfile };

    return body.success && body.data !== undefined ? body.data : null;
  } catch {
    return undefined;
  }
}

/**
 * Сходить на маршрут, меняющий сессию. Наружу — только «принято или нет».
 *
 * Тело ответа не разбирается намеренно: что стало с личностью, стор всё равно
 * узнаёт одним способом — перечитав «кто я». Иначе появился бы второй источник
 * правды, и они бы разошлись.
 */
async function postSessionChange(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'POST' });

    return response.ok;
  } catch {
    return false;
  }
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  ...AUTH_STORE_DEFAULT_STATE,

  loadSession: async () => {
    const profile = await fetchSessionProfile();

    // Спросить не удалось: состояние оставляем как есть, но ждать перестаём —
    // иначе проверки в браузере зависли бы в «ещё не знаю» навсегда.
    if (profile === undefined) {
      set({ status: 'ready' });
      return;
    }

    if (profile === null) {
      set({ ...AUTH_STORE_DEFAULT_STATE, status: 'ready' });
      return;
    }

    const { role, capabilities, impersonating, actorName, ...user } = profile;

    // ⚠️ Работа от чужого лица приезжает ОТВЕТОМ СЕРВЕРА, а не хранится здесь.
    // Пока стор ставил признак в `false` сам, плашка исчезала после каждой полной
    // перезагрузки, хотя сессия оставалась подменённой: администратор продолжал
    // действовать от чужого лица без единого признака на экране.
    const isImpersonating = impersonating === true;
    // Полную карточку администратора знаем, только если работа началась в этой
    // же вкладке. После перезагрузки от неё остаётся имя — его и хватает.
    const knownActor = get().adminOriginalUser;

    set({
      user,
      role,
      capabilities,
      accountType: userRoleToAccountType(role),
      isAuthenticated: true,
      // Роль в ответе — роль ТОГО, ОТ ЧЬЕГО ЛИЦА работают. Сама возможность
      // работать от чужого лица есть только у администратора, поэтому под ней
      // вошедший — администратор, кем бы он сейчас ни выглядел.
      isAdmin: role === 'admin' || isImpersonating,
      status: 'ready',
      isImpersonating,
      adminOriginalUser: isImpersonating
        ? (knownActor ?? (actorName === undefined ? null : { name: actorName }))
        : null,
    });
  },

  login: (payload) => {
    set({ ...createAuthenticatedState(payload), status: 'ready' });
  },

  register: (payload) => {
    set({ ...createAuthenticatedState(payload), status: 'ready' });
  },

  logout: async () => {
    // ⚠️ Сначала сервер, потом стор. Очистить только стор — значит оставить
    // сессию живой: у того, кто увёл идентификатор, «выход» ничего не отнимает.
    // Сбой сети не повод оставлять человека внутри — состояние чистим в любом
    // случае, и это единственная причина глотать ошибку.
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Молча: результат для интерфейса один и тот же.
    }

    set({ ...AUTH_STORE_DEFAULT_STATE, status: 'ready' });
  },

  updateUser: (patch) => {
    const current = get().user;
    if (!current) return;
    set({ user: { ...current, ...patch } });
  },

  // --- Админский трек ---

  adminLogin: (user) => {
    set({
      user,
      isAuthenticated: true,
      isAdmin: true,
      role: 'admin',
      accountType: null,
      status: 'ready',
      isImpersonating: false,
      adminOriginalUser: null,
    });
  },

  startImpersonation: async (targetUserId) => {
    const actor = get().user;

    // Имперсонизация — только для администратора. Проверка здесь не защита
    // (её делает сервер), а способ не тревожить его заведомо чужой просьбой.
    if (!get().isAdmin || actor === null) return null;

    const accepted = await postSessionChange(`/api/auth/impersonate/${targetUserId}`);

    // Отказ не подменяет ничего: экран показывал бы кабинет, которого сервер
    // всё равно не отдаст.
    if (!accepted) return null;

    // Карточку администратора запоминаем ДО перечитывания: в ответе «кто я»
    // от него останется только имя, а здесь он известен целиком.
    set({ adminOriginalUser: actor });
    await get().loadSession();

    return get().isImpersonating ? get().accountType : null;
  },

  stopImpersonation: async () => {
    await postSessionChange('/api/auth/impersonate/stop');

    // Сессию перечитываем в любом случае. Отказ означает, что представление
    // браузера о ней разошлось с сервером, — а лечится это тем же самым.
    await get().loadSession();

    return !get().isImpersonating;
  },
}));

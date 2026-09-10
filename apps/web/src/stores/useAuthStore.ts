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

import { useMemo } from 'react';
import { create } from 'zustand';

import {
  faceCabinet,
  faceKey,
  findFace,
  PERSONAL_CABINET,
  type CabinetTarget,
  type ServiceFace,
} from '@/lib/service-faces';
import type { AccountKind } from '@sporthub/types';

export type AuthSessionUser = {
  id?: number;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  city?: string;
};

/**
 * Ответ «кто я». Повторяет форму, которую отдаёт бэкенд.
 *
 * ⚠️ Фаза 35: кабинет выбирается по ЛИЦАМ услуг, а не по типу учётной записи.
 * Тип отвечал на вопрос «кем человек является», а человек не является кем-то
 * одним: он и на йогу ходит, и свой зал держит. `faces` — список фактов
 * («вот этими лицами он управляет»), и по нему кабинеты считаются без догадок.
 */
export type SessionProfile = AuthSessionUser & {
  id: number;
  /**
   * Вид учётной записи: человек или служебная запись.
   *
   * ⚠️ Роли в ответе нет с шага 35.24. «Кем человек является» больше не свойство
   * человека: что он умеет — `capabilities`, чем управляет — `faces`.
   */
  accountKind?: AccountKind;
  /** Лица услуг человека: карточка тренера и клубы. */
  faces?: ServiceFace[];
  capabilities: string[];
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

/**
 * Что кладут в стор формы входа и регистрации.
 *
 * ⚠️ Тип учётной записи отсюда ушёл (шаг 35.35): регистрация заводит человека,
 * выбирать нечего. Лица услуг формы не знают и знать не могут — их привозит
 * ответ «кто я», за которым формы идут сразу после успеха.
 */
type AuthSessionPayload = {
  user: AuthSessionUser;
};

type AuthState = {
  user: AuthSessionUser | null;
  isAuthenticated: boolean;
  /**
   * Вид учётной записи: `person` — человек, `admin` — служебная запись.
   * `null` — гость либо ответ «кто я» ещё не пришёл.
   */
  accountKind: AccountKind | null;
  /** Лица услуг вошедшего. Пустой список — человек без своих клубов и карточки. */
  faces: ServiceFace[];
  /**
   * Ключ лица, чей кабинет человек открывал последним. `null` — кабинет человека.
   *
   * ⚠️ Шаг 35.31. Это НЕ «лицо, от чьего имени человек действует», и не источник
   * правды о том, чей кабинет открыт: чей кабинет — говорит АДРЕС, и внутри
   * кабинета спрашивают его (`useCabinet`). Здесь лежит память для шапки: аватар
   * есть на каждой странице, включая публичный каталог, где адреса кабинета нет
   * вовсе, — и вести он должен туда, откуда человек ушёл.
   *
   * Хранится ключом, а не объектом: список лиц перечитывается ответом «кто я»,
   * и ссылка на прежний объект указывала бы на лицо, которого может уже не быть.
   */
  activeFaceKey: string | null;
  /** Права из сессии: интерфейс рисует действия по списку, а не по догадке. */
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
  /**
   * Сменить лицо, в контексте которого открыт кабинет.
   *
   * Чужое лицо не назначается: ключа, которого нет в списке лиц, стор не примет.
   * Это не защита (её делает сервер), а способ не рисовать кабинет, данных
   * для которого всё равно не отдадут.
   */
  setActiveFace: (key: string) => void;

  // --- Админский трек и имперсонизация ---
  isAdmin: boolean;
  isImpersonating: boolean;
  /** Настоящий исполнитель, пока работа идёт от чужого лица. */
  adminOriginalUser: AuthImpersonationActor | null;
  adminLogin: (user: AuthSessionUser) => void;
  /**
   * Начать работу от лица пользователя.
   *
   * Возвращает АДРЕС кабинета цели — по нему вызывающий решает, куда
   * переходить, — или `null`, если сервер не разрешил. Личность после согласия
   * перечитывается ответом «кто я»: назначать её себе браузер не вправе.
   */
  startImpersonation: (targetUserId: number) => Promise<string | null>;
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
  isAuthenticated: false,
  accountKind: null,
  faces: [],
  activeFaceKey: null,
  capabilities: [],
  status: 'unknown',
  isAdmin: false,
  isImpersonating: false,
  adminOriginalUser: null,
} satisfies Pick<
  AuthState,
  | 'user'
  | 'isAuthenticated'
  | 'accountKind'
  | 'faces'
  | 'activeFaceKey'
  | 'capabilities'
  | 'status'
  | 'isAdmin'
  | 'isImpersonating'
  | 'adminOriginalUser'
>;

/**
 * Что известно сразу после успешной формы входа или регистрации.
 *
 * ⚠️ Лиц услуг здесь нет и быть не может: ответ формы их не привозит. Формы
 * следом спрашивают «кто я» — до этого момента человек считается человеком
 * без лиц, и это честнее, чем угадать.
 */
function createAuthenticatedState(payload: AuthSessionPayload) {
  return {
    user: payload.user,
    accountKind: 'person',
    isAuthenticated: true,
  } satisfies Pick<AuthState, 'user' | 'accountKind' | 'isAuthenticated'>;
}

/** Срез стора, которого хватает, чтобы посчитать лица и кабинеты. */
type FacesSlice = Pick<AuthState, 'accountKind' | 'faces' | 'activeFaceKey'>;

/**
 * Может ли вошедший записываться, писать отзывы и складывать в избранное.
 *
 * ⚠️ Шаг 35.34. Раньше на каждой точке записи стояло «тип кабинета — спортсмен»,
 * и это была ошибка модели: владелец зала на йогу записаться не мог, хотя он
 * такой же человек. Правило осталось ровно одно — «вошёл и не служебная запись»
 * (решение 5.2), — и объявлено оно ровно здесь, в одном экземпляре на пять
 * прежних.
 */
export function selectCanBook(state: Pick<AuthState, 'isAuthenticated' | 'accountKind'>) {
  return state.isAuthenticated && state.accountKind !== 'admin';
}

/** Номер того, кто действует. `null` — записываться некому. */
export function selectBookingActorUserId(
  state: Pick<AuthState, 'isAuthenticated' | 'accountKind' | 'user'>,
) {
  return selectCanBook(state) ? (state.user?.id ?? null) : null;
}

/** Лицо, в контексте которого открыт кабинет. `null` — кабинет человека. */
export function selectActiveFace(state: FacesSlice): ServiceFace | null {
  return findFace(state.faces, state.activeFaceKey);
}

/**
 * Кабинет «по умолчанию» — тот, в который ведёт аватар в шапке.
 *
 * У кого есть лица услуг, тому нужен кабинет текущего лица: за ним записи,
 * публикации и деньги. У кого лиц нет — свой личный. У служебной записи
 * кабинета нет ни одного, и ссылки в шапке тоже (`null`).
 */
export function selectPrimaryCabinet(state: FacesSlice): CabinetTarget | null {
  if (state.accountKind === 'admin') return null;

  const active = selectActiveFace(state);

  return active === null ? PERSONAL_CABINET : faceCabinet(active);
}

/**
 * Лица и кабинеты одним куском — для компонентов.
 *
 * ⚠️ Обёртка не «для красоты». Селектор, собирающий объект, отдавал бы zustand
 * новую ссылку на каждый вызов, и React 19 срывался бы в бесконечную
 * перерисовку. Поэтому из стора берутся только сами поля, а объекты собираются
 * памятью компонента.
 */
export function useAuthFaces() {
  const accountKind = useAuthStore((state) => state.accountKind);
  const faces = useAuthStore((state) => state.faces);
  const activeFaceKey = useAuthStore((state) => state.activeFaceKey);

  return useMemo(() => {
    const slice: FacesSlice = { accountKind, faces, activeFaceKey };

    return {
      accountKind,
      faces,
      activeFace: selectActiveFace(slice),
      primaryCabinet: selectPrimaryCabinet(slice),
    };
  }, [accountKind, faces, activeFaceKey]);
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

    const { accountKind, faces, capabilities, impersonating, actorName, ...user } = profile;
    const sessionFaces = faces ?? [];

    // ⚠️ Работа от чужого лица приезжает ОТВЕТОМ СЕРВЕРА, а не хранится здесь.
    // Пока стор ставил признак в `false` сам, плашка исчезала после каждой полной
    // перезагрузки, хотя сессия оставалась подменённой: администратор продолжал
    // действовать от чужого лица без единого признака на экране.
    const isImpersonating = impersonating === true;
    // Полную карточку администратора знаем, только если работа началась в этой
    // же вкладке. После перезагрузки от неё остаётся имя — его и хватает.
    const knownActor = get().adminOriginalUser;

    // Лицо кабинета переживает перечитывание сессии: страницы спрашивают «кто я»
    // повторно, и сброс возвращал бы человека на первое лицо посреди работы.
    // Но ключ лица, которого в ответе больше нет, не сохраняется — кабинет
    // рисовался бы для лица, данных по которому уже не отдадут. Умолчание —
    // первое лицо: у большинства оно единственное, и выбирать там нечего.
    const activeFace = findFace(sessionFaces, get().activeFaceKey) ?? sessionFaces[0] ?? null;

    set({
      user,
      capabilities,
      accountKind: accountKind ?? 'person',
      faces: sessionFaces,
      activeFaceKey: activeFace === null ? null : faceKey(activeFace),
      isAuthenticated: true,
      // Вид учётной записи в ответе — вид ТОГО, ОТ ЧЬЕГО ЛИЦА работают. Сама
      // возможность работать от чужого лица есть только у администратора,
      // поэтому под ней вошедший — администратор, кем бы он сейчас ни выглядел.
      isAdmin: accountKind === 'admin' || isImpersonating,
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

  setActiveFace: (key) => {
    if (findFace(get().faces, key) === null) return;

    set({ activeFaceKey: key });
  },

  // --- Админский трек ---

  adminLogin: (user) => {
    set({
      user,
      isAuthenticated: true,
      isAdmin: true,
      accountKind: 'admin',
      faces: [],
      activeFaceKey: null,
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

    // Куда идти, решает состав сессии цели: есть лица — кабинет лица, нет —
    // личный кабинет. Прежде здесь возвращался тип учётной записи, которого
    // больше не существует.
    return get().isImpersonating ? (selectPrimaryCabinet(get())?.href ?? null) : null;
  },

  stopImpersonation: async () => {
    await postSessionChange('/api/auth/impersonate/stop');

    // Сессию перечитываем в любом случае. Отказ означает, что представление
    // браузера о ней разошлось с сервером, — а лечится это тем же самым.
    await get().loadSession();

    return !get().isImpersonating;
  },
}));

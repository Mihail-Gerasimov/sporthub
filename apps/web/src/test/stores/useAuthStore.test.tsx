// Стор личности.
//
// Phase 34 Step 34.48: источник — ответ `GET /api/auth/me`, а не localStorage.
//
// ⚠️ Фаза 35, шаги 35.34–35.36. Из стора ушёл ТИП УЧЁТНОЙ ЗАПИСИ, а вместе с ним
// и всё, что от него считалось: адрес кабинета, право записываться, бейдж роли.
// Прежний набор проверял ровно его («login сохраняет тип», «selector отдаёт тип»,
// «конфиг кабинета по типу») — то есть проверял модель, которой больше нет.
// Здесь те же вопросы заданы к новой модели: вид учётной записи (человек или
// служебная запись) и ЛИЦА УСЛУГ, из которых считаются кабинеты.
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PERSONAL_CABINET_PATH, type ServiceFace } from '@/lib/service-faces';
import {
  AUTH_STORE_DEFAULT_STATE,
  selectBookingActorUserId,
  selectPrimaryCabinet,
  useAuthStore,
  type AuthSessionUser,
} from '@/stores/useAuthStore';

const PERSON_ID = 1;

const person: AuthSessionUser = {
  name: 'Алексей Смирнов',
  email: 'alexey@sporthub.local',
  phone: '+7 (927) 000-10-10',
};

const providerPerson: AuthSessionUser = {
  name: 'Марина Крылова',
  email: 'marina@studio.local',
  phone: '+7 (927) 000-20-20',
};

/** Два лица одного человека — тот самый случай «свой зал плюс персоналки». */
const CLUB_FACE: ServiceFace = { kind: 'club', id: 3, name: 'CrossFit Garage' };
const TRAINER_FACE: ServiceFace = { kind: 'trainer', id: 7, name: 'Марина Крылова' };

/** Ответ «кто я» — единственный путь, которым личность попадает в стор. */
function stubSessionResponse(data: Record<string, unknown> | null) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, data }),
  } as unknown as Response);
}

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('login и register заводят ЧЕЛОВЕКА — выбора типа учётной записи нет', () => {
    act(() => {
      useAuthStore.getState().login({ user: person });
    });

    expect(useAuthStore.getState().user).toEqual(person);
    expect(useAuthStore.getState().accountKind).toBe('person');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    act(() => {
      useAuthStore.getState().register({ user: providerPerson });
    });

    expect(useAuthStore.getState().user).toEqual(providerPerson);
    expect(useAuthStore.getState().accountKind).toBe('person');
  });

  it('выход гасит сессию на сервере, а не только чистит стор', async () => {
    // ⚠️ Главное здесь — обращение к серверу. Очистить стор мало: сессия живёт
    // на сервере, и после «выхода» украденный идентификатор продолжал бы
    // работать до собственного срока.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response);

    act(() => {
      useAuthStore.getState().login({ user: providerPerson });
    });

    await act(async () => {
      await useAuthStore.getState().logout();
    });

    expect(fetchSpy).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accountKind).toBeNull();
    expect(useAuthStore.getState().faces).toEqual([]);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('берёт личность и лица услуг из ответа «кто я», а не из localStorage', async () => {
    stubSessionResponse({
      ...providerPerson,
      id: PERSON_ID,
      role: 'club_owner',
      accountKind: 'person',
      faces: [CLUB_FACE, TRAINER_FACE],
      capabilities: [],
    });

    await act(async () => {
      await useAuthStore.getState().loadSession();
    });

    const state = useAuthStore.getState();

    expect(state.isAuthenticated).toBe(true);
    expect(state.accountKind).toBe('person');
    expect(state.faces).toEqual([CLUB_FACE, TRAINER_FACE]);
    expect(state.user?.id).toBe(PERSON_ID);
    expect(state.status).toBe('ready');
  });

  it('умолчание контекста — первое лицо: у кого оно единственное, выбирать нечего', async () => {
    stubSessionResponse({
      ...providerPerson,
      id: PERSON_ID,
      role: 'club_owner',
      accountKind: 'person',
      faces: [CLUB_FACE, TRAINER_FACE],
      capabilities: [],
    });

    await act(async () => {
      await useAuthStore.getState().loadSession();
    });

    expect(useAuthStore.getState().activeFaceKey).toBe('club:3');
  });

  it('выбранное лицо переживает перечитывание сессии', async () => {
    stubSessionResponse({
      ...providerPerson,
      id: PERSON_ID,
      role: 'club_owner',
      accountKind: 'person',
      faces: [CLUB_FACE, TRAINER_FACE],
      capabilities: [],
    });

    await act(async () => {
      await useAuthStore.getState().loadSession();
    });

    act(() => {
      useAuthStore.getState().setActiveFace('trainer:7');
    });

    // Страницы спрашивают «кто я» повторно; сброс выкидывал бы человека
    // на первое лицо посреди работы.
    await act(async () => {
      await useAuthStore.getState().loadSession();
    });

    expect(useAuthStore.getState().activeFaceKey).toBe('trainer:7');
  });

  it('лицо, которого в ответе больше нет, не остаётся контекстом кабинета', async () => {
    // Иначе кабинет рисовался бы для лица, данных по которому уже не отдадут.
    stubSessionResponse({
      ...providerPerson,
      id: PERSON_ID,
      role: 'club_owner',
      accountKind: 'person',
      faces: [CLUB_FACE, TRAINER_FACE],
      capabilities: [],
    });

    await act(async () => {
      await useAuthStore.getState().loadSession();
    });

    act(() => {
      useAuthStore.getState().setActiveFace('trainer:7');
    });

    vi.restoreAllMocks();
    stubSessionResponse({
      ...providerPerson,
      id: PERSON_ID,
      role: 'club_owner',
      accountKind: 'person',
      faces: [CLUB_FACE],
      capabilities: [],
    });

    await act(async () => {
      await useAuthStore.getState().loadSession();
    });

    expect(useAuthStore.getState().activeFaceKey).toBe('club:3');
  });

  it('чужое лицо контекстом не становится', () => {
    useAuthStore.setState({ faces: [CLUB_FACE], activeFaceKey: 'club:3' });

    act(() => {
      useAuthStore.getState().setActiveFace('club:999');
    });

    expect(useAuthStore.getState().activeFaceKey).toBe('club:3');
  });

  it('не хранит личность в localStorage', () => {
    // Пока личность лежала в браузере, кабинет открывался правкой одной строки
    // в инструментах разработчика.
    act(() => {
      useAuthStore.getState().login({ user: person });
    });

    const stored = Object.keys(localStorage).map((key) => localStorage.getItem(key) ?? '');

    expect(stored.some((value) => value.includes(person.email))).toBe(false);
  });

  it('записывается любой вошедший человек — и тот, у кого есть свой зал', () => {
    // ⚠️ Прежнее правило звучало «тип учётной записи — спортсмен», и владелец
    // зала записаться не мог. Он такой же человек и ходит на йогу как все.
    useAuthStore.setState({
      user: { ...providerPerson, id: PERSON_ID },
      isAuthenticated: true,
      accountKind: 'person',
      faces: [CLUB_FACE],
    });

    expect(selectBookingActorUserId(useAuthStore.getState())).toBe(PERSON_ID);
  });

  it('служебная запись не записывается: базового набора человека у неё нет', () => {
    useAuthStore.setState({
      user: { name: 'Админ', email: 'admin@sporthub.local', id: 99 },
      isAuthenticated: true,
      accountKind: 'admin',
      faces: [],
    });

    expect(selectBookingActorUserId(useAuthStore.getState())).toBeNull();
  });

  it('гость не записывается', () => {
    expect(selectBookingActorUserId(useAuthStore.getState())).toBeNull();
  });

  it('человека без лиц услуг аватар ведёт в его личный кабинет', () => {
    useAuthStore.setState({ accountKind: 'person', faces: [], activeFaceKey: null });

    expect(selectPrimaryCabinet(useAuthStore.getState())?.href).toBe(PERSONAL_CABINET_PATH);
  });

  it('человека с лицами аватар ведёт в кабинет ТЕКУЩЕГО лица и подписан его именем', () => {
    useAuthStore.setState({
      accountKind: 'person',
      faces: [CLUB_FACE, TRAINER_FACE],
      activeFaceKey: 'club:3',
    });

    expect(selectPrimaryCabinet(useAuthStore.getState())).toMatchObject({
      key: 'club:3',
      title: 'CrossFit Garage',
      href: '/profile/provider',
    });
  });

  it('у служебной записи кабинета нет ни одного — и ссылки в шапке тоже', () => {
    // Решение 5.2: администратор не получает базового набора человека.
    useAuthStore.setState({ accountKind: 'admin', faces: [], activeFaceKey: null });

    expect(selectPrimaryCabinet(useAuthStore.getState())).toBeNull();
  });
});

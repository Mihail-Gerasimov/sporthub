// Phase 26 Step 26.3: тесты для UserNotificationPreferencesEditor.
// Компонент выводит group-секции (booking/links/reviews) с чекбоксами
// per NotificationType, REQUIRED-типы disabled + плашка «Нельзя отключить»,
// клик по non-required → debounced (500ms) PATCH /api/users/[id]/notification-preferences
// + toast success/error.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CabinetProvider } from '@/components/profile/cabinet-context';
import { ProviderSettings } from '@/components/profile/provider/ProviderSettings';
import { UserNotificationPreferencesEditor } from '@/components/profile/UserNotificationPreferencesEditor';
import { PERSONAL_CABINET, faceCabinet, type ServiceFace } from '@/lib/service-faces';
import { renderInFaceCabinet } from '@/test/helpers/cabinet';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useToastStore } from '@/stores/useToastStore';
import type { User } from '@sporthub/types';

const user: User = {
  id: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Алексей',
  email: 'alexey@test',
  phone: '',
  passwordHash: 'secret',
  favoriteClubIds: [],
};

describe('UserNotificationPreferencesEditor (Step 26.3)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    useToastStore.getState().clearToasts();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('подпись раздела называет каждый заблокированный переключатель (37.72)', () => {
    // ⚠️ Правка 37.72, которую нашёл MCP-прогон и которую нечем было закрыть.
    // Подпись перечисляет, что отключить нельзя. Когда фаза 37 добавила два типа
    // решений по публикации, подпись про них смолчала: человек видел заблокированный
    // переключатель без объяснения, почему он заблокирован.
    //
    // Тест связывает ДВА факта, которые иначе живут порознь: какие переключатели
    // отрисованы заблокированными и что о них сказано в подписи. Пятый такой тип
    // покраснит первую половину, правка подписи — вторую.
    const EXPLAINED: Record<string, string> = {
      booking_confirmed: 'подтверждения',
      booking_cancelled_by_provider: 'отмены провайдером',
      publication_hidden_for_owner: 'решения по вашей публикации',
      publication_unhidden_for_owner: 'решения по вашей публикации',
      // Шаг 38.55: подтверждение проверки и его отзыв названы в подписи ПОИМЁННО,
      // а не спрятаны под общим «решения по публикации»: у них другая цена —
      // знак «проверено» появился или снят, а не публикация убрана из каталога.
      publication_verified_for_owner: 'подтверждение проверки',
      publication_verification_revoked_for_owner: 'его отзыв',
    };

    render(<UserNotificationPreferencesEditor userId={user.id} notificationPreferences={{}} />);

    const intro = screen.getByTestId('notification-preferences-editor').textContent ?? '';
    const locked = screen
      .getAllByRole('checkbox')
      .filter((box) => (box as HTMLInputElement).disabled)
      .map((box) =>
        box.getAttribute('data-testid')?.replace('notification-preferences-toggle-', ''),
      )
      .filter((type): type is string => type !== undefined);

    // Сторож самого теста: без него «все объяснены» означало бы «заблокированных
    // не нашлось» — ровно та форма ложной зелени, на которой этот проект уже горел.
    expect(locked.length).toBeGreaterThanOrEqual(4);

    for (const type of locked) {
      const phrase = EXPLAINED[type];

      expect(phrase, `переключатель «${type}» заблокирован, а подпись о нём молчит`).toBeDefined();
      expect(intro, `подпись не называет «${phrase}» (тип ${type})`).toContain(phrase);
    }
  });

  it('рендерит группы (booking / links / reviews) для provider', () => {
    render(<UserNotificationPreferencesEditor userId={user.id} notificationPreferences={{}} />);

    expect(screen.getByTestId('notification-preferences-editor')).toBeInTheDocument();
    expect(screen.getByTestId('notification-preferences-group-booking')).toBeInTheDocument();
    expect(screen.getByTestId('notification-preferences-group-links')).toBeInTheDocument();
    expect(screen.getByTestId('notification-preferences-group-reviews')).toBeInTheDocument();
  });

  // ⚠️ Шаг 35.28a. Здесь было два теста, закреплявших прежнюю модель: у атлета
  // прятались «провайдерские» переключатели, у провайдера — «атлетские».
  // Модель «тип → роль» удалена вместе с ролями: настройки принадлежат ЧЕЛОВЕКУ,
  // а человек с клубом и сам ходит на занятия. Спрятанный переключатель означал бы
  // уведомление, которое приходит и которое нечем выключить.
  it('переключатели показываются целиком — и «свои», и «провайдерские»', () => {
    render(<UserNotificationPreferencesEditor userId={user.id} notificationPreferences={{}} />);

    // Обе оси группы «Записи» на месте: заявка провайдеру и подтверждение атлету.
    expect(
      screen.getByTestId('notification-preferences-toggle-booking_requested'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('notification-preferences-toggle-booking_confirmed'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(
        'notification-preferences-toggle-booking_cancelled_by_athlete_to_provider',
      ),
    ).toBeInTheDocument();

    // И все три группы: прятать «Связи» больше не от чего.
    expect(screen.getByTestId('notification-preferences-group-booking')).toBeInTheDocument();
    expect(screen.getByTestId('notification-preferences-group-links')).toBeInTheDocument();
    expect(screen.getByTestId('notification-preferences-group-reviews')).toBeInTheDocument();
  });

  it('REQUIRED-типы имеют disabled input (нельзя отключить)', () => {
    render(<UserNotificationPreferencesEditor userId={user.id} notificationPreferences={{}} />);

    // REQUIRED_NOTIFICATION_TYPES: booking_confirmed и booking_cancelled_by_provider.
    // Phase 27 Step 27.3: оба адресованы athlete, рендерятся только в athlete-виде.
    expect(screen.getByTestId('notification-preferences-toggle-booking_confirmed')).toBeDisabled();
    expect(
      screen.getByTestId('notification-preferences-toggle-booking_cancelled_by_provider'),
    ).toBeDisabled();

    // А non-required (например booking_completed) — не disabled
    expect(
      screen.getByTestId('notification-preferences-toggle-booking_completed'),
    ).not.toBeDisabled();
  });

  it('клик по non-required toggle обновляет checked и запускает debounced PATCH', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    // Phase 27 Step 27.3: booking_completed адресован athlete, рендерится только
    // в athlete-виде. Проверяем именно этот путь для клика по non-required.
    render(<UserNotificationPreferencesEditor userId={user.id} notificationPreferences={{}} />);
    const checkbox = screen.getByTestId(
      'notification-preferences-toggle-booking_completed',
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);

    // До 500мс fetch не вызывается
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/users/1/notification-preferences');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string);
    // ⚠️ В теле только настройки. Номер уходит лишь в АДРЕС маршрута, и сервер
    // сверяет его с сессией; схема тела строгая — прежнее `userId` она отвергает.
    expect(Object.keys(body)).toEqual(['preferences']);
    expect(body.preferences.booking_completed).toBe(false);
  });

  it('success: PATCH 200 → toast success', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    render(<UserNotificationPreferencesEditor userId={user.id} notificationPreferences={{}} />);
    fireEvent.click(screen.getByTestId('notification-preferences-toggle-booking_completed'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    // После advanceTimersByTimeAsync microtask'и из savePrefs должны flushнуться.
    // Для надёжности ещё раз даём event loop'у завершить промисы.
    await act(async () => {
      await Promise.resolve();
    });

    expect(useToastStore.getState().toasts.some((t) => t.tone === 'success')).toBe(true);
  });

  it('error: PATCH 403 → toast error', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'denied' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );

    render(<UserNotificationPreferencesEditor userId={user.id} notificationPreferences={{}} />);
    fireEvent.click(screen.getByTestId('notification-preferences-toggle-booking_completed'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(useToastStore.getState().toasts.some((t) => t.tone === 'error')).toBe(true);
  });

  it('клик по REQUIRED toggle не вызывает fetch (disabled-ветка)', async () => {
    render(<UserNotificationPreferencesEditor userId={user.id} notificationPreferences={{}} />);
    // jsdom физически позволяет fireEvent.click на disabled input, но onChange
    // handler должен быть защищён от REQUIRED-типов через canDisableNotificationType.
    // booking_confirmed — athlete-адресованный REQUIRED-тип.
    fireEvent.click(screen.getByTestId('notification-preferences-toggle-booking_confirmed'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Настройки правятся в ящике ОТКРЫТОГО кабинета', () => {
  // ⚠️ Найдено браузерным прогоном 10.09.2026. Настройки на лицо появились
  // шагом 35.29, а редактор о лицах не знал: в кабинете КЛУБА он правил ЛИЧНЫЙ
  // ящик человека. Владелец трёх клубов не мог заглушить один — галочка внутри
  // кабинета клуба гасила тип у всех лиц сразу.
  //
  // Проверяется ПОДКЛЮЧЕНИЕ: какой адрес и какое тело редактор на самом деле шлёт.
  const CLUB: ServiceFace = { kind: 'club', id: 3, name: 'CrossFit Garage' };

  let calls: { url: string; body: unknown }[] = [];

  beforeEach(() => {
    // ⚠️ Отправка настроек отложена на полсекунды, чтобы не слать запрос
    // на каждый клик. Без подменённых часов тест ждал бы её по-настоящему.
    vi.useFakeTimers();
    calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({
          url: String(url),
          body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
        });

        return {
          ok: true,
          json: async () => ({ success: true, data: { notificationPreferences: {} } }),
        } as unknown as Response;
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const renderIn = (cabinet: Parameters<typeof CabinetProvider>[0]['cabinet']) =>
    render(
      <CabinetProvider cabinet={cabinet}>
        <UserNotificationPreferencesEditor userId={2} />
      </CabinetProvider>,
    );

  it('в кабинете лица настройки читаются У ЭТОГО ЛИЦА', async () => {
    renderIn(faceCabinet(CLUB));

    await act(async () => {
      await Promise.resolve();
    });

    const read = calls.find((call) => call.body === undefined);

    expect(read, 'редактор не сходил за настройками').toBeDefined();
    expect(read?.url, `ящик лица не назван: ${read?.url}`).toContain('faceType=club');
    expect(read?.url).toContain('faceId=3');
  });

  it('в личном кабинете ящик не называется вовсе', async () => {
    // Обратная половина: личные настройки — это отсутствие лица, а не отдельное имя.
    renderIn(PERSONAL_CABINET);

    await act(async () => {
      await Promise.resolve();
    });

    const read = calls.find((call) => call.body === undefined);

    expect(read?.url, `в личном кабинете назван ящик лица: ${read?.url}`).not.toContain('faceType');
  });

  it('сохранение в кабинете лица называет пару «вид + номер» целиком', async () => {
    // Половина пары отвергается разбором — назвать надо обе или ни одной.
    renderIn(faceCabinet(CLUB));

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByTestId('notification-preferences-toggle-booking_requested'));

    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    const saved = calls.find((call) => call.body !== undefined);

    expect(saved, 'редактор не сохранил настройку').toBeDefined();
    expect(saved?.body).toMatchObject({ faceType: 'club', faceId: 3 });
  });
});

describe('Настройка названа обещанием на будущее (шаг 36.52)', () => {
  // ⚠️ Решение заказчика 22: настройки применяются при ОТПРАВКЕ, а не при чтении.
  // Выключенный тип больше не создаёт строки вовсе — значит галочка означает
  // «больше мне такое не присылать», а не «спрятать в том числе старое».
  // Цена названа и принята: пропущенное не вернётся, даже если включить обратно.
  // Человек обязан узнать это со страницы, а не из отчёта о фазе.
  beforeEach(() => {
    // Редактор при монтировании сам идёт за настройками — ответ подменяем,
    // иначе в тесте висел бы настоящий запрос.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ success: true, data: { notificationPreferences: {} } }),
      })),
    );
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: { id: 2, name: 'Марина', email: 'marina@test.local' },
      accountKind: 'person',
      isAuthenticated: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('пояснение говорит, что настройка действует на НОВЫЕ уведомления', () => {
    render(<UserNotificationPreferencesEditor userId={2} notificationPreferences={{}} />);

    const text = screen.getByTestId('notification-preferences-editor').textContent ?? '';

    expect(text, `пояснение не говорит про новые уведомления: «${text}»`).toMatch(
      /действует на новые уведомления/i,
    );
  });

  it('пояснение говорит, что уже пришедшее остаётся в ленте', () => {
    // Обратная половина обещания: без неё человек решит, что галочка чистит ленту.
    render(<UserNotificationPreferencesEditor userId={2} notificationPreferences={{}} />);

    const text = screen.getByTestId('notification-preferences-editor').textContent ?? '';

    expect(text, `про уже пришедшее не сказано: «${text}»`).toMatch(/останутся в ленте/i);
  });

  it('англицизма «bell» на русской странице нет', () => {
    render(<UserNotificationPreferencesEditor userId={2} notificationPreferences={{}} />);

    const text = screen.getByTestId('notification-preferences-editor').textContent ?? '';

    expect(text, `англицизм остался: «${text}»`).not.toMatch(/bell/i);
    expect(text).toMatch(/колокольчик/i);
  });

  // ⚠️ ТЕСТ ПОДКЛЮЧЕНИЯ. Главный вывод фазы 35: сделано на сервере, покрыто
  // тестами, до браузера не дошло. Проверка компонента в одиночку этого класса
  // не ловит — поэтому раздел настроек отрисовывается ЦЕЛИКОМ, тем же путём,
  // каким его видит человек: /profile/<вид>/<номер>/settings.
  it('текст виден на экране раздела настроек кабинета, а не только в компоненте', () => {
    renderInFaceCabinet(<ProviderSettings />);

    const screenText = screen.getByTestId('provider-settings').textContent ?? '';

    expect(screenText, 'раздел настроек не показал пояснение про новые уведомления').toMatch(
      /действует на новые уведомления/i,
    );
    expect(screenText).toMatch(/останутся в ленте/i);
  });
});

// --- Довесок к фазе 37: тема «Публикации» ----------------------------------------

describe('тема «Публикации» в настройках человека', () => {
  it('секция есть, и все четыре её переключателя ВЫКЛЮЧИТЬ НЕЛЬЗЯ', () => {
    // ⚠️ Скрытие публикации — не новость площадки, а факт, меняющий работу человека:
    // публикации нет в каталоге, записи не идут. Показать галочку и дать её снять
    // значило бы пообещать то, чего страница не делает. Шаг 38.55: подтверждение
    // проверки и его отзыв — того же рода: знак меняет то, как публикацию видят люди.
    render(<UserNotificationPreferencesEditor userId={1} />);

    expect(screen.getByText('Публикации')).toBeInTheDocument();

    const publications = screen.getByTestId('notification-preferences-group-publications');
    const toggles = within(publications).getAllByRole('checkbox');

    expect(toggles).toHaveLength(4);

    for (const type of [
      'publication_hidden_for_owner',
      'publication_unhidden_for_owner',
      'publication_verified_for_owner',
      'publication_verification_revoked_for_owner',
    ]) {
      expect(screen.getByTestId(`notification-preferences-toggle-${type}`)).toBeDisabled();
    }
  });

  it('подпись называет цену отзыва проверки: знак «проверено» снят', () => {
    render(<UserNotificationPreferencesEditor userId={1} />);

    const intro = screen.getByTestId('notification-preferences-editor').textContent ?? '';

    expect(intro).toMatch(/знак «проверено»/);
  });

  it('надзорных тем в настройках человека по-прежнему нет', () => {
    // Обратная сторона: «Публикации» — тема ЧЕЛОВЕЧЕСКАЯ, письмо приходит в ящик
    // лица услуг. Надзорные темы адресованы общей очереди администраторов,
    // и человеку в неё не попасть ни при каких настройках.
    render(<UserNotificationPreferencesEditor userId={1} />);

    expect(screen.queryByText('Действия администраторов')).not.toBeInTheDocument();
    expect(screen.queryByText('Доступ и вход')).not.toBeInTheDocument();
  });
});

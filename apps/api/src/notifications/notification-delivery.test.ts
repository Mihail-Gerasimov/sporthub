// Настройка уведомлений решает при ОТПРАВКЕ, а не при чтении (шаг 36.49, решение 22).
//
// ⚠️ Почему место поменяли. За две фазы в уведомлениях нашлось три ошибки, и все три —
// про фильтр при чтении:
//
//   фаза 35 — «в колокольчике 3, в списке 0»: счётчик и лента фильтровали по-разному;
//   фаза 35 — настройки на лицо сохранялись, возвращались при открытии и НЕ применялись;
//   фаза 36 — колокольчик применял ЛИЧНЫЕ настройки к строкам всех лиц человека.
//
// Три раза подряд ломалась не логика, а место, где она стоит: решение принимали трое
// читателей, и каждый решал чуть иначе. Теперь решает один — тот, кто отправляет.
// Расходиться становится нечему: выключенного типа нет в базе вовсе.
//
// ⚠️ Обещание при этом не поменялось, а наконец выполняется. На странице настроек
// написано «выберите, какие события вы хотите ПОЛУЧАТЬ» — это про будущее.
// Отбор при чтении реализовывал обещание, которого никто не давал.
//
// ⚠️ Названная цена: выключил — пропущенное не вернётся, даже если включить обратно.
// Проверяется отдельно, ниже: цена обязана быть видна в наборе, а не подразумеваться.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureDictionaryCollections } from '@sporthub/fixtures';

import type { NotificationsRepository } from '../repositories/catalog.repository';
import { NOTIFICATIONS_REPOSITORY } from '../repositories/catalog.repository';
import type { UsersRepository } from '../repositories/crud.repository';
import { USERS_REPOSITORY } from '../repositories/crud.repository';
import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from '../test/harness';
import { NotificationService, personRecipient } from './notification.service';

/** Человек с двумя лицами: клуб 1 и карточка тренера 1. */
const OWNER_ID = 2;

const user = (id: number) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  accountKind: 'person',
  status: 'active',
  name: `Пользователь ${id}`,
  email: `u${id}@delivery.test`,
  phone: '+7 (900) 000-00-00',
  passwordHash: DEMO_PASSWORD_HASH,
  favoriteClubIds: [],
});

describe('настройка уведомлений применяется при отправке', () => {
  let harness: TestHarness;
  let service: NotificationService;
  let notifications: NotificationsRepository;
  let users: UsersRepository;

  beforeAll(async () => {
    harness = await createTestHarness('notification-delivery');
    service = harness.app.get(NotificationService);
    notifications = harness.app.get(NOTIFICATIONS_REPOSITORY);
    users = harness.app.get(USERS_REPOSITORY);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    // ⚠️ Лица засеиваются по-настоящему: у колонок адресата есть внешние ключи,
    // и уведомление несуществующему клубу база просто не примет.
    await harness.writeMany({
      ...fixtureDictionaryCollections,
      users: [user(1), user(OWNER_ID)],
      clubs: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Клуб владельца',
          slug: 'klub-vladeltsa',
          description: 'Описание',
          shortDescription: 'Кратко',
          city: 'Самара',
          address: 'ул. Ленина, 1',
          phone: '+7 (846) 000-00-00',
          coordinates: { lat: 53.2, lng: 50.1 },
          sportIds: [1],
          imageUrls: [],
          amenityIds: [],
          tagIds: [],
          rating: 0,
          reviewCount: 0,
          priceFrom: 1000,
          distanceKm: 0,
          managedByUserId: OWNER_ID,
          status: 'published',
        },
      ],
      trainers: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Карточка владельца',
          slug: 'kartochka-vladeltsa',
          bio: 'Описание',
          avatarUrl: '',
          experienceYears: 5,
          specialtyIds: [1],
          sportIds: [1],
          workFormatIds: [1],
          rating: 0,
          reviewCount: 0,
          priceFrom: 1000,
          city: 'Самара',
          address: 'ул. Ленина, 2',
          phone: '+7 (900) 000-00-02',
          coordinates: { lat: 53.2, lng: 50.1 },
          managedByUserId: OWNER_ID,
          status: 'published',
        },
      ],
      notifications: [],
    });
  });

  const personal = personRecipient(OWNER_ID);
  const club = {
    to: 'face' as const,
    addresseeType: 'club',
    addresseeId: 1,
    managedByUserId: OWNER_ID,
  } as const;
  const trainer = {
    to: 'face' as const,
    addresseeType: 'trainer',
    addresseeId: 1,
    managedByUserId: OWNER_ID,
  } as const;

  const stored = async () => notifications.findMany({ userId: OWNER_ID });

  it('включённый тип создаёт строку', async () => {
    // Контрольная группа. Без неё «выключенный не создаёт» было бы зелено и тогда,
    // когда не создаётся ничего и никогда.
    await service.notify(personal, 'booking_requested', {});

    expect(await stored()).toHaveLength(1);
  });

  it('ВЫКЛЮЧЕННЫЙ тип не создаёт строки вовсе', async () => {
    // ⚠️ Проверяется отсутствие СТРОКИ, а не то, что её спрятали при чтении.
    // Прежде строка создавалась всегда, и вся разница была в том, какой читатель
    // её покажет.
    await users.setNotificationPreferences(OWNER_ID, { booking_requested: false });

    await service.notify(personal, 'booking_requested', {});

    expect(await stored()).toHaveLength(0);
  });

  it('обязательный тип создаётся, даже если его попытались выключить', async () => {
    // Правило `canDisableNotificationType` одно на оба места: запись настроек такой
    // ключ игнорирует, и отправка обязана вести себя так же. Две проверки нужны
    // именно потому, что обойти запись настроек можно запросом в обход интерфейса.
    await users.setNotificationPreferences(OWNER_ID, { booking_confirmed: false });

    await service.notify(personal, 'booking_confirmed', {});

    expect(await stored()).toHaveLength(1);
  });

  it('настройка ЛИЦА применяется к строке этого лица', async () => {
    await users.setNotificationPreferences(
      OWNER_ID,
      { booking_requested: false },
      { type: 'club', id: 1 },
    );

    await service.notify(club, 'booking_requested', {});

    expect(await stored()).toHaveLength(0);
  });

  it('настройка одного лица не глушит ДРУГОЕ лицо того же человека', async () => {
    // ⚠️ Тот самый дефект, ради которого этап и затевался, только с другой стороны:
    // колокольчик применял личные настройки ко всем лицам. Здесь проверяется обратное
    // смешение — настройка клуба не имеет права трогать карточку тренера.
    await users.setNotificationPreferences(
      OWNER_ID,
      { booking_requested: false },
      { type: 'club', id: 1 },
    );

    await service.notify(trainer, 'booking_requested', {});

    expect(await stored()).toHaveLength(1);
  });

  it('ЛИЧНАЯ настройка не глушит строку, адресованную лицу', async () => {
    // Обратное смешение: личный ящик и ящик лица — разные ящики, и решать за лицо
    // личной галочкой нельзя.
    await users.setNotificationPreferences(OWNER_ID, { booking_requested: false });

    await service.notify(club, 'booking_requested', {});

    expect(await stored()).toHaveLength(1);
  });

  it('настройка лица не глушит ЛИЧНУЮ строку', async () => {
    await users.setNotificationPreferences(
      OWNER_ID,
      { booking_requested: false },
      { type: 'club', id: 1 },
    );

    await service.notify(personal, 'booking_requested', {});

    expect(await stored()).toHaveLength(1);
  });

  it('включённая обратно галочка НЕ возвращает пропущенное', async () => {
    // ⚠️ Названная цена решения 22, и она проверяется, а не подразумевается.
    // Человеку об этом сказано прямо на странице настроек: «выключите — такие
    // больше не придут, а пришедшие раньше останутся в ленте».
    await users.setNotificationPreferences(OWNER_ID, { booking_requested: false });
    await service.notify(personal, 'booking_requested', {});

    await users.setNotificationPreferences(OWNER_ID, { booking_requested: true });

    // Пропущенное не появилось задним числом...
    expect(await stored()).toHaveLength(0);

    // ...а новое приходит.
    await service.notify(personal, 'booking_requested', {});
    expect(await stored()).toHaveLength(1);
  });

  it('сбой чтения настроек не гасит уведомление молча', async () => {
    // Осторожная сторона: если настройки прочитать не удалось, лучше прислать
    // лишнее, чем потерять нужное. Потерянное уведомление не восстановить,
    // а лишнее человек просто прочтёт.
    await users.setNotificationPreferences(OWNER_ID, { booking_requested: false });

    // Уведомление человеку, которого нет: настроек у него быть не может.
    const created = await service.notify(personRecipient(9999), 'booking_requested', {});

    expect(created).toBeNull();
  });
});

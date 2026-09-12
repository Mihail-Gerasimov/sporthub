// Отправка уведомлений не знает про хранилище (шаг 37.20, условие приёмки 5).
//
// ⚠️ Обещание было названо, а теста под ним не было (найдено ревизией 37.73).
// «Подмена репозитория не задевает отправителя» — это и есть главное правило
// проекта в своей проверяемой форме: реализация прячется за интерфейсом
// с токеном внедрения, и бизнес-код не знает, кто за ним стоит. Пока такой
// проверки нет, граница держится на честном слове: первое же обращение
// к Prisma прямо из сервиса пройдёт незамеченным — все наборы гоняются
// на настоящей базе, и разницы между «через репозиторий» и «мимо него» в них
// не видно.
//
// Здесь за токеном `NOTIFICATIONS_REPOSITORY` стоит ЗАГЛУШКА, которая ничего
// не хранит и просто записывает, о чём её попросили. Если отправитель работает
// с ней так же, как с настоящим репозиторием, — граница есть.
//
// ⚠️ Второе обещание того же шага: у очереди надзора ОДНА строка на событие,
// сколько бы администраторов ни было. Здесь оно проверяется в самом чистом виде:
// заглушка считает обращения, и три администратора в базе не превращают одно
// событие в три записи.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { NewNotification, Notification } from '@sporthub/types';

import type { NotificationsRepository } from '../repositories/catalog.repository';
import { NOTIFICATIONS_REPOSITORY } from '../repositories/catalog.repository';
import type { UsersRepository } from '../repositories/crud.repository';
import { USERS_REPOSITORY } from '../repositories/crud.repository';
import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from '../test/harness';
import { NotificationService, personRecipient, supervisionRecipient } from './notification.service';

/** Номер, которого база не выдаёт: по нему видно, что ответ пришёл ИЗ ЗАГЛУШКИ. */
const STUB_FIRST_ID = 4242;

/**
 * Заглушка хранилища: ничего не хранит, всё записывает.
 *
 * Методы чтения отвечают пустотой, методы правки — падают: отправитель не имеет
 * права их звать, и если позовёт, это обязано быть видно, а не притвориться
 * работой. Нормальный отказ здесь полезнее вежливого `return`.
 */
class RecordingNotificationsRepository implements NotificationsRepository {
  /** Всё, что отправитель попросил записать, — в порядке обращений. */
  readonly inserted: NewNotification[] = [];

  private nextId = STUB_FIRST_ID;

  async findMany(): Promise<Notification[]> {
    return [];
  }

  async count(): Promise<number> {
    return 0;
  }

  async insert(notification: NewNotification): Promise<Notification> {
    this.inserted.push(notification);

    return {
      id: this.nextId++,
      createdAt: '2026-09-12T00:00:00.000Z',
      ...notification,
    } as Notification;
  }

  async markRead(): Promise<Notification> {
    throw new Error('Отправитель не имеет права разбирать очередь');
  }

  async markUnread(): Promise<Notification> {
    throw new Error('Отправитель не имеет права возвращать строки в очередь');
  }

  async markAllRead(): Promise<number> {
    throw new Error('Отправитель не имеет права гасить ящик');
  }

  async removeMany(): Promise<number> {
    throw new Error('Отправитель не имеет права убирать строки');
  }

  /**
   * Забыть всё между проверками.
   *
   * ⚠️ Номер тоже сбрасывается: заглушка живёт на весь набор, и без сброса
   * «ответ пришёл из заглушки» зависело бы от ПОРЯДКА проверок — то есть
   * краснело бы от перестановки, ничего про код не говоря.
   */
  reset(): void {
    this.inserted.length = 0;
    this.nextId = STUB_FIRST_ID;
  }
}

/** Человек среза: 1 — обычный, 2–4 — администраторы. */
const user = (id: number, accountKind: string) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  accountKind,
  status: 'active',
  name: `Пользователь ${id}`,
  email: `u${id}@storage-boundary.test`,
  phone: '+7 (900) 000-00-00',
  passwordHash: DEMO_PASSWORD_HASH,
  favoriteClubIds: [],
});

describe('Отправка уведомлений не знает про хранилище (37.20)', () => {
  let harness: TestHarness;
  let service: NotificationService;
  let users: UsersRepository;
  const storage = new RecordingNotificationsRepository();

  beforeAll(async () => {
    // ⚠️ Подмена идёт ЧЕРЕЗ ТОТ ЖЕ ТОКЕН, что и в бою, и накладывается на целиком
    // собранное приложение. Ровно это и проверяет обещание границы: если
    // реализацию нельзя заменить снаружи, значит её смена потребует правки
    // бизнес-кода — и весь смысл токена теряется.
    harness = await createTestHarness('notification-storage-boundary', [
      { token: NOTIFICATIONS_REPOSITORY, useValue: storage },
    ]);
    service = harness.app.get(NotificationService);
    users = harness.app.get<UsersRepository>(USERS_REPOSITORY);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    // ⚠️ Администраторов ТРОЕ. Это и есть предмет проверки: одно событие надзора
    // обязано дать одну строку, а не по строке на каждого. Копии по числу
    // администраторов сломали бы разбор — «этим занялись» стало бы личным,
    // и второй не увидел бы, что первый уже взялся.
    await harness.writeMany({
      users: [user(1, 'person'), user(2, 'admin'), user(3, 'admin'), user(4, 'admin')],
      notifications: [],
    });

    storage.reset();
  });

  it('надзорное событие даёт ОДНУ запись при трёх администраторах', async () => {
    await service.notify(supervisionRecipient, 'oversight_publication_created', {
      subjectType: 'club',
      subjectId: 1,
    });

    expect(storage.inserted, 'событие надзора размножилось по администраторам').toHaveLength(1);
    expect(storage.inserted[0].addresseeKind).toBe('supervision');
    // У очереди владельца-человека нет вовсе — это и отличает её от личного ящика.
    expect(
      (storage.inserted[0] as { userId?: number }).userId,
      'надзорная строка приехала человеку в личный ящик',
    ).toBeUndefined();
  });

  it('число администраторов на число записей не влияет', async () => {
    // ⚠️ «Независимо от числа администраторов» проверяется сравнением, а не одним
    // замером: одна строка при трёх и одна же при пяти. Один замер зелен и у кода,
    // который просто взял ПЕРВОГО администратора и написал ему лично.
    await service.notify(supervisionRecipient, 'oversight_publication_created', {
      subjectType: 'club',
      subjectId: 1,
    });

    const atThree = storage.inserted.length;

    await harness.writeMany({
      users: [
        user(1, 'person'),
        user(2, 'admin'),
        user(3, 'admin'),
        user(4, 'admin'),
        user(5, 'admin'),
        user(6, 'admin'),
      ],
    });

    await service.notify(supervisionRecipient, 'oversight_publication_created', {
      subjectType: 'club',
      subjectId: 2,
    });

    expect(atThree).toBe(1);
    expect(storage.inserted).toHaveLength(2);
  });

  it('отправитель возвращает то, что отдало ХРАНИЛИЩЕ, а не собирает строку сам', async () => {
    // Заглушка выдаёт номер, которого база не выдаёт никогда. Приехал он —
    // значит ответ пришёл из-за токена, а не из обхода репозитория напрямую
    // в Prisma: такой обход выглядел бы ровно так же на настоящей базе.
    const created = await service.notify(supervisionRecipient, 'oversight_login_blocked', {
      subjectType: 'user',
      subjectId: 1,
      accountExists: true,
    });

    expect(created?.id).toBe(STUB_FIRST_ID);
    expect(created?.type).toBe('oversight_login_blocked');
  });

  it('личная строка проходит через ту же границу', async () => {
    // Контрольная группа. Без неё «надзор работает на заглушке» было бы зелено
    // и у отправителя, который для людей ходит в базу мимо репозитория.
    await service.notify(personRecipient(1), 'booking_requested', {
      subjectType: 'booking',
      subjectId: 1,
    });

    expect(storage.inserted).toHaveLength(1);
    expect(storage.inserted[0].addresseeKind).toBe('personal');
    expect((storage.inserted[0] as { userId?: number }).userId).toBe(1);
  });

  it('выключенный человеком тип до хранилища НЕ доходит', async () => {
    // Вторая контрольная группа, и она же — доказательство, что заглушка
    // действительно подключена: решение «слать или нет» принимает отправитель
    // (шаг 36.49), и хранилище о выключенном типе не узнаёт вовсе.
    await users.setNotificationPreferences(1, { booking_requested: false });

    await service.notify(personRecipient(1), 'booking_requested', {
      subjectType: 'booking',
      subjectId: 1,
    });

    expect(storage.inserted).toHaveLength(0);
  });

  it('надзорный тип выключить нельзя даже настройкой', async () => {
    // Очередь одна на всех: личная галочка одного администратора погасила бы
    // событие для ВСЕХ коллег. Поэтому надзорные типы неотключаемы, и проверка
    // стоит в отправителе, а не только в записи настроек.
    await users.setNotificationPreferences(2, { oversight_publication_created: false });

    await service.notify(supervisionRecipient, 'oversight_publication_created', {
      subjectType: 'club',
      subjectId: 1,
    });

    expect(storage.inserted).toHaveLength(1);
  });
});

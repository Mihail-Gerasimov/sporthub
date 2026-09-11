// Сторож: отбор уведомлений БЕЗ адресата не должен собираться (шаг 37.14).
//
// ⚠️ Зачем сторож, если тип и так union. Затем, что тип легко ослабить обратно
// одним `?`, и последствие этого не видно в тестах поведения: в Prisma
// `undefined` — это ОТСУТСТВИЕ УСЛОВИЯ, поэтому `markAllRead({})` означает
// «погасить ленту всей площадки» и отвечает 200. До фазы 37 от этого защищал
// только комментарий рядом с полем.
//
// ⚠️ Сторож работает на СБОРКЕ, а не в прогоне. `@ts-expect-error` требует, чтобы
// строка ниже действительно была ошибкой типов: как только пустой отбор снова
// станет допустимым, ожидание окажется лишним — и `tsc` покраснеет на самом
// сторожe. Проверка в рантайме такого не поймала бы вовсе.

import { describe, expect, it } from 'vitest';

import type {
  NotificationsAudience,
  NotificationsCountFilter,
  NotificationsFilter,
  NotificationsScope,
} from '../repositories/catalog.repository';

describe('отбор уведомлений без адресата не выражается (37.14)', () => {
  it('пустой отбор не проходит проверку типов', () => {
    // @ts-expect-error — отбор обязан назвать адресата: человека либо очередь надзора
    const noAudience: NotificationsFilter = {};
    // @ts-expect-error — то же для счётчика: «сколько всего на площадке» никому не нужно
    const noCountAudience: NotificationsCountFilter = {};
    // @ts-expect-error — и для массовой пометки: без адресата она гасит всё подряд
    const noScope: NotificationsScope = {};

    void noAudience;
    void noCountAudience;
    void noScope;

    expect(true).toBe(true);
  });

  it('очередь надзора и владелец не смешиваются', () => {
    // @ts-expect-error — у очереди надзора владельца-человека нет и быть не может
    const mixed: NotificationsAudience = { supervision: true, userId: 1 };
    // ⚠️ Литерал В ОДНУ СТРОКУ намеренно: `@ts-expect-error` подавляет ошибку только
    // на следующей строке, а в многострочном объекте она встаёт на строке поля —
    // и директива оказывается «неиспользованной», то есть сторож краснеет сам собой.
    // @ts-expect-error — и ящика лица у очереди надзора тоже нет
    const withMailbox: NotificationsAudience = { supervision: true, mailbox: { kind: 'personal' } };

    void mixed;
    void withMailbox;

    expect(true).toBe(true);
  });

  it('законные формы отбора собираются', () => {
    // Контрольная группа. Без неё сторож зеленел бы и тогда, когда не собирается
    // вообще ничего, — а это выглядело бы как «защита работает».
    const person: NotificationsAudience = { userId: 1 };
    const mailbox: NotificationsAudience = { userId: 1, mailbox: { kind: 'club', id: 2 } };
    const supervision: NotificationsAudience = { supervision: true };

    expect([person, mailbox, supervision]).toHaveLength(3);
  });
});

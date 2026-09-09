// Сессии входа: выдача, проверка, продление, отзыв.
//
// Наружу идентификатор уходит один раз — в cookie при входе; в базе лежит только
// его хеш, поэтому утёкший дамп войти не даёт. Тот же принцип, что у паролей (фаза 33).
//
// Само устройство секрета (длина, кодировка, алгоритм хеша) живёт в
// `common/secret-token.ts`: со ссылками восстановления (34.69) потребителей стало
// двое, и держать по копии значило бы дать им разъехаться молча.
//
// Чего здесь намеренно НЕТ:
//
// - знания про HTTP и cookie — их ставит слой, который отвечает за ответ;
// - знания про роли: политику сроков держит `@sporthub/domain`, сервис только
//   спрашивает у неё, живо ли ещё.

import { Inject, Injectable } from '@nestjs/common';
import {
  SESSION_POLICY,
  SESSION_TOUCH_INTERVAL_MS,
  accountKindOf,
  isSessionExpired,
} from '@sporthub/domain';
import type { Session, User } from '@sporthub/types';

import { createSecretToken, hashSecretToken } from '../common/secret-token';
import type { SessionsRepository, UsersRepository } from '../repositories/crud.repository';
import { SESSIONS_REPOSITORY, USERS_REPOSITORY } from '../repositories/crud.repository';

/** Что известно о вызывающем после проверки сессии. */
export type SessionContext = {
  session: Session;
  /** Кем действуем: под имперсонизацией — тот, от чьего лица работают. */
  user: User;
  /**
   * Кто на самом деле вошёл. Совпадает с `user`, кроме имперсонизации: тогда здесь
   * администратор. Журнал пишется ПО НЕМУ — иначе след действия теряется.
   */
  actor: User;
};

@Injectable()
export class SessionService {
  constructor(
    @Inject(SESSIONS_REPOSITORY) private readonly sessions: SessionsRepository,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
  ) {}

  /**
   * Выдать сессию. Возвращает сам идентификатор — единственный момент, когда он
   * существует в открытом виде; вызывающий обязан положить его в cookie и забыть.
   */
  async issue(input: {
    user: Pick<User, 'id' | 'accountKind'>;
    now: Date;
    impersonatedUserId?: number;
    userAgent?: string;
    ip?: string;
  }): Promise<{ token: string; session: Session }> {
    const token = createSecretToken();
    // Срок берётся по виду учётной записи (шаг 35.24): у администратора окно
    // бездействия короче суток, у человека равно предельному сроку.
    const policy = SESSION_POLICY[accountKindOf(input.user)];
    const nowIso = input.now.toISOString();

    const session = await this.sessions.insert({
      tokenHash: hashSecretToken(token),
      userId: input.user.id,
      impersonatedUserId: input.impersonatedUserId,
      lastSeenAt: nowIso,
      expiresAt: new Date(input.now.getTime() + policy.absoluteMs).toISOString(),
      userAgent: input.userAgent,
      ip: input.ip,
    });

    return { token, session };
  }

  /**
   * Найти сессию по идентификатору из cookie: не отозвана и не просрочена
   * по предельному сроку. Срок бездействия здесь НЕ проверяется — для него нужен
   * вид учётной записи, а его знает только `resolve`.
   */
  async findLiveByToken(token: string, now: Date): Promise<Session | null> {
    return this.sessions.findLiveByTokenHash(hashSecretToken(token), now.toISOString());
  }

  /**
   * Полный разбор личности по идентификатору из cookie.
   *
   * Возвращает `null` на любую негодность: нет такой сессии, отозвана, вышел
   * предельный срок или срок бездействия, пользователь исчез или заблокирован.
   * Разные причины наружу не различаются — снаружи это всё «войдите заново».
   *
   * ⚠️ Состояние пользователя проверяется здесь, а не только при входе: бан обязан
   * действовать немедленно, а не после того, как истечёт выданная ранее сессия.
   */
  async resolve(token: string, now: Date): Promise<SessionContext | null> {
    const session = await this.findLiveByToken(token, now);

    if (session === null) return null;

    const actor = await this.users.findById(session.userId);

    if (actor === null || actor.status !== 'active') return null;

    // Срок бездействия зависит от вида учётной записи ТОГО, КТО ВОШЁЛ, а не того,
    // под кем работают: короткий срок админа не должен удлиняться имперсонизацией.
    if (isSessionExpired({ ...session, accountKind: accountKindOf(actor) }, now)) return null;

    const user =
      session.impersonatedUserId === undefined
        ? actor
        : await this.users.findById(session.impersonatedUserId);

    // Тот, от чьего лица работали, мог исчезнуть или попасть в бан. Сессия при этом
    // остаётся живой, но действовать от его имени больше нельзя.
    if (user === null || user.status !== 'active') return null;

    await this.touchIfDue(session, now);

    return { session, user, actor };
  }

  /**
   * Продлить сессию, но НЕ чаще раза в окно.
   *
   * ⚠️ Без этого условия запись в таблицу сессий случалась бы на каждом запросе
   * к любому закрытому маршруту, и самая горячая по записи таблица платформы
   * обслуживала бы не пользователей, а саму себя.
   */
  async touchIfDue(session: Session, now: Date): Promise<void> {
    const seenAt = new Date(session.lastSeenAt).getTime();

    if (now.getTime() - seenAt < SESSION_TOUCH_INTERVAL_MS) return;

    await this.sessions.touch(session.id, now.toISOString());
  }

  /** Выход: сессия отзывается, а не удаляется — след остаётся для разбора. */
  async revoke(sessionId: number, now: Date): Promise<void> {
    await this.sessions.revoke(sessionId, now.toISOString());
  }

  /**
   * Погасить все сессии пользователя, кроме текущей.
   *
   * Зовётся при смене пароля: сессия, открытая тем, кто пароль подсмотрел, обязана
   * умереть в тот же момент. Текущая остаётся, иначе смена пароля выкидывала бы
   * из системы того, кто его меняет.
   */
  async revokeOthers(userId: number, keepSessionId: number, now: Date): Promise<number> {
    return this.sessions.revokeAllForUser(userId, now.toISOString(), keepSessionId);
  }

  /** Погасить все сессии пользователя без исключений: бан, выход отовсюду. */
  async revokeAll(userId: number, now: Date): Promise<number> {
    return this.sessions.revokeAllForUser(userId, now.toISOString());
  }

  /** Убрать просроченные строки. Зовётся отдельной командой, а не запросом пользователя. */
  async removeExpired(now: Date): Promise<number> {
    return this.sessions.removeExpired(now.toISOString());
  }
}

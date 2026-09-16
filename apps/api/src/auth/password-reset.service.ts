// Восстановление пароля: выдача одноразовой ссылки и сам сброс.
//
// Два правила, без которых маршрут вредит вместо того, чтобы помогать:
//
// 1. **Заявка ничего не сообщает о том, заведена ли почта.** Ответ один и тот же,
//    и решение об этом принимается ЗДЕСЬ, а не в контроллере: сервис молча ничего
//    не делает для неизвестного адреса. Иначе восстановление превратилось бы
//    в перечислитель учётных записей — ровно ту дыру, которую фаза закрывает
//    на входе (`auth.controller.ts`, правило 1).
// 2. **Сброс гасит ВСЕ сессии пользователя.** Пароль меняют в том числе тогда,
//    когда доступ уже увели; оставить чужую сессию живой — значит сделать смену
//    бессмысленной. Здесь, в отличие от смены пароля из кабинета, не остаётся
//    даже текущая: человек приходит по ссылке из письма, вошедшим он тут не
//    считается, и «своей» сессии у него в этот момент нет.
//
// Само значение ссылки существует ровно один раз — в письме. В базе лежит его хеш,
// поэтому утёкший дамп сброса не даёт.

import { Inject, Injectable } from '@nestjs/common';
import { BRAND_NAME, PASSWORD_RESET_TTL_MINUTES, passwordResetExpiryFor } from '@sporthub/domain';
import type { User } from '@sporthub/types';

import { ValidationError } from '../common/domain-error';
import { hashPassword } from '../common/password';
import { createSecretToken, hashSecretToken } from '../common/secret-token';
import { MAILER, type Mailer } from '../mail/mailer';
import type {
  PasswordResetTokensRepository,
  UsersRepository,
} from '../repositories/crud.repository';
import {
  PASSWORD_RESET_TOKENS_REPOSITORY,
  USERS_REPOSITORY,
} from '../repositories/crud.repository';
import { TRANSACTION_RUNNER, type TransactionRunner } from '../storage/transaction-runner';
import { SessionService } from './session.service';

/**
 * Отказ по ссылке — один текст на все причины: такой ссылки нет, срок вышел,
 * ею уже воспользовались.
 *
 * Различать их наружу незачем и вредно: человеку во всех трёх случаях нужно одно
 * и то же — попросить новую ссылку, — а подробность «такая ссылка была, но истекла»
 * подтверждала бы подобравшему, что он угадал значение.
 */
export const RESET_LINK_INVALID = 'Ссылка восстановления недействительна или устарела';

/**
 * Адрес площадки, от которого собирается ссылка в письме.
 *
 * Берётся из окружения, а не из заголовков запроса: заголовок `Host` подделывается
 * тем же, кто просит письмо, и ссылка ушла бы человеку на чужой сайт — вместе
 * с рабочим значением ссылки. Это известная дыра (host header injection), и цена
 * ей здесь — угон учётной записи.
 */
const PUBLIC_ORIGIN_ENV = 'SPORT_HUB_PUBLIC_ORIGIN';

/** Умолчание для разработки: там фронт всегда на этом адресе. */
const DEFAULT_PUBLIC_ORIGIN = 'http://localhost:3000';

/** Путь страницы, которая принимает ссылку и спрашивает новый пароль. */
const RESET_PATH = '/reset-password';

@Injectable()
export class PasswordResetService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(PASSWORD_RESET_TOKENS_REPOSITORY)
    private readonly tokens: PasswordResetTokensRepository,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Заявка на восстановление.
   *
   * Возвращает `void` намеренно: у вызывающего не должно быть возможности узнать,
   * ушло письмо или нет, — иначе однажды кто-нибудь превратит это знание в разные
   * ответы. Признак «такой почты нет» просто не покидает этот метод.
   */
  async request(input: { email: string; now: Date }): Promise<void> {
    const user = await this.users.findByEmail(input.email);

    // Заблокированному восстановление не выдаётся: иначе бан снимался бы
    // письмом на ту же почту.
    if (user === null || user.status !== 'active') return;

    const token = createSecretToken();

    await this.tokens.insert({
      tokenHash: hashSecretToken(token),
      userId: user.id,
      expiresAt: passwordResetExpiryFor(input.now).toISOString(),
    });

    await this.mailer.send({
      to: user.email,
      subject: `Восстановление пароля в ${BRAND_NAME}`,
      text: PasswordResetService.letterFor(user, token),
    });
  }

  /**
   * Сброс пароля по ссылке.
   *
   * Порядок шагов важен, и каждый стоит там, где стоит, по своей причине:
   *
   * 1. Дешёвая проверка ссылки — чтобы негодная не стоила расчёта argon2id
   *    (19 МБ памяти и заметное время на каждый запрос).
   * 2. Хеширование ПЕРЕД транзакцией: держать соединение с базой открытым
   *    на время расчёта хеша — значит занять его на порядок дольше самой записи.
   * 3. Внутри транзакции ссылка сначала ЗАБИРАЕТСЯ обновлением с условием,
   *    и только потом меняется пароль. Два одновременных перехода по одной ссылке
   *    иначе прошли бы проверку оба.
   */
  async reset(input: { token: string; password: string; now: Date }): Promise<void> {
    const tokenHash = hashSecretToken(input.token);
    const nowIso = input.now.toISOString();

    if ((await this.tokens.findUsableByTokenHash(tokenHash, nowIso)) === null) {
      throw new ValidationError(RESET_LINK_INVALID);
    }

    const passwordHash = await hashPassword(input.password);

    await this.transactions.runInTransaction(async () => {
      const claimed = await this.tokens.claim(tokenHash, nowIso);

      // Проиграли гонку (или ссылка истекла между двумя запросами) — отказ такой же,
      // как у любой негодной ссылки.
      if (claimed === null) {
        throw new ValidationError(RESET_LINK_INVALID);
      }

      await this.users.update(claimed.userId, { passwordHash });

      // Все сессии, без исключений: см. правило 2 в шапке файла.
      await this.sessions.revokeAll(claimed.userId, input.now);

      // Остальные выданные ссылки гаснут вместе с этой: второе письмо не должно
      // остаться рабочим ключом от уже восстановленной учётки.
      await this.tokens.markAllUsedForUser(claimed.userId, nowIso, claimed.id);
    });
  }

  /** Текст письма. Ровно то, что человеку нужно решить: переходить или нет. */
  private static letterFor(user: User, token: string): string {
    const origin = (process.env[PUBLIC_ORIGIN_ENV] || DEFAULT_PUBLIC_ORIGIN).replace(/\/+$/, '');
    // Значение уже в `base64url` — ни одного символа, который пришлось бы кодировать
    // в адресе. Кодирование всё равно ставим: молчаливая зависимость от формата
    // значения сломалась бы при первой же его смене.
    const link = `${origin}${RESET_PATH}?token=${encodeURIComponent(token)}`;

    return [
      `Здравствуйте, ${user.name}!`,
      '',
      `Кто-то запросил восстановление пароля для этого адреса на ${BRAND_NAME}.`,
      `Ссылка действует ${PASSWORD_RESET_TTL_MINUTES} минут и сработает один раз:`,
      '',
      link,
      '',
      'Если вы не просили восстановление — просто не переходите по ссылке.',
      'Пароль останется прежним.',
    ].join('\n');
  }

  /** Убрать протухшие ссылки. Зовётся отдельной командой, а не запросом пользователя. */
  async removeExpired(now: Date): Promise<number> {
    return this.tokens.removeExpired(now.toISOString());
  }
}

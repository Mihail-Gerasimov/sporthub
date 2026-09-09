// Вход, выход, регистрация и «кто я».
//
// Фаза 34: вход сверяет пароль и выдаёт сессию. До неё маршрут пускал по одному
// лишь адресу почты — клиент пароль даже не отправлял.
//
// Два правила ответа, без которых вход превращается в перечислитель аккаунтов:
//
// 1. **Ответ один на все случаи** — неизвестная почта, неверный пароль и
//    заблокированная учётка отвечают одинаково. Разные ответы позволяли бы
//    узнать, какие почты заведены, не зная ни одного пароля.
// 2. **Сверка выполняется всегда**, даже когда пользователя нет: по фиктивному
//    хешу. Иначе несуществующая почта отвечала бы заметно быстрее существующей,
//    и перечисление шло бы по времени ответа.
//
// Проверка типа кабинета осталась, но переехала ПОСЛЕ пароля: это удобство
// интерфейса, а не защита, и до предъявления пароля она ничего не должна сообщать.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { AuthAccountType, User, UserRole } from '@sporthub/types';
import type { Request, Response } from 'express';
import { z } from 'zod';

import {
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from '../common/domain-error';
import { hashPassword, verifyPassword } from '../common/password';
import type { UsersRepository } from '../repositories/crud.repository';
import { USERS_REPOSITORY } from '../repositories/crud.repository';
import { EMPTY_RESULT, type EmptyResult } from '../common/api-response';
import { clearSessionCookie, readSessionCookie, setSessionCookie } from './session-cookie';
import { SessionService } from './session.service';

/**
 * Ответ на неудачный вход — один на все случаи: нет такой почты, неверный пароль,
 * учётка заблокирована. См. правило 1 в шапке файла.
 */
const LOGIN_FAILED = 'Неверная почта или пароль';

/**
 * Фиктивный хеш для сверки, когда пользователя нет.
 *
 * Значение неважно — важно, что сверка занимает столько же времени, сколько
 * настоящая. Без неё ответ на несуществующую почту приходил бы заметно раньше,
 * и это само по себе выдавало бы, заведена почта или нет.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$eYbdOe7bqbLJvE1sBSFVI+2WYq6JgO+q3vcnFrGN1lE';

const loginSchema = z
  .object({
    email: z.string().email('Некорректный email'),
    accountType: z.enum(['athlete', 'provider']),
    password: z.string().min(1, 'Пароль обязателен'),
  })
  .strict();

const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Имя минимум 2 символа'),
    email: z.string().email('Некорректный email'),
    password: z.string().min(6, 'Пароль минимум 6 символов'),
    phone: z.string().optional(),
    city: z.string().optional(),
    accountType: z.enum(['athlete', 'provider']),
  })
  .strict();

/** Публичная карточка пользователя — ровно те поля, что отдавались раньше. */
export type AuthUser = {
  id: number;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  city?: string;
};

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Публичная карточка: наружу уходят только эти поля, хеш пароля — никогда.
   *
   * Пустые необязательные поля не отдаются вовсе. Это не косметика: прежний ответ
   * регистрации их не содержал, и лишний ключ разошёлся бы с эталоном контрактов.
   * Телефон отдаётся всегда, даже пустой, — так было и так закреплено эталоном.
   */
  private static toAuthUser(user: User): AuthUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
      ...(user.city ? { city: user.city } : {}),
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() rawBody: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUser> {
    const parsed = loginSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные запроса');
    }

    const { email, accountType, password } = parsed.data;
    // Запрос по уникальному индексу почты, а не перебор таблицы: цена входа
    // не должна расти вместе с числом зарегистрированных.
    const user = await this.users.findByEmail(email);

    // Сверка идёт ВСЕГДА, даже когда пользователя нет: см. правило 2 в шапке.
    const passwordMatches = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, password);

    if (!user || user.status !== 'active' || !passwordMatches) {
      throw new UnauthorizedError(LOGIN_FAILED);
    }

    // Обе проверки ниже — подсказки интерфейсу, а не защита: они говорят уже тому,
    // кто предъявил верный пароль, и потому стоят ПОСЛЕ сверки.
    //
    // Порядок между ними важен. Роль администратора не совпадает ни с одним типом
    // кабинета, поэтому проверка типа перехватила бы админа первой, и сообщение
    // про отдельный вход стало бы недостижимым — админ читал бы «неверный тип
    // кабинета» и не понимал, куда идти.
    if (user.role === 'admin') {
      throw new ForbiddenError('Администраторы входят через /service-portal');
    }

    if (!matchesAccountType(user.role, accountType)) {
      throw new ForbiddenError('Неверный тип кабинета для этого email');
    }

    await this.openSession(user, request, response);

    return AuthController.toAuthUser(user);
  }

  /**
   * Выход: сессия отзывается на сервере, cookie убирается.
   *
   * Одной очистки cookie мало — украденный идентификатор продолжал бы работать.
   * Поэтому маршрут молча проходит и без сессии: результат один и тот же, а
   * сообщать «такой сессии нет» некому и незачем.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EmptyResult> {
    const token = readSessionCookie(request);

    if (token !== null) {
      const now = new Date();
      const session = await this.sessions.findLiveByToken(token, now);

      if (session !== null) await this.sessions.revoke(session.id, now);
    }

    clearSessionCookie(response);

    return EMPTY_RESULT;
  }

  /**
   * Кто вошёл. Заменяет клиентское хранение личности: до фазы 34 браузер сам
   * помнил, кто он, и сам это сообщал серверу.
   */
  @Get('me')
  async me(@Req() request: Request): Promise<AuthUser> {
    const token = readSessionCookie(request);

    if (token === null) throw new UnauthorizedError('Требуется вход');

    const context = await this.sessions.resolve(token, new Date());

    if (context === null) throw new UnauthorizedError('Требуется вход');

    return AuthController.toAuthUser(context.user);
  }

  /** Выдать сессию и положить её идентификатор в ответ. */
  private async openSession(user: User, request: Request, response: Response): Promise<void> {
    const { token, session } = await this.sessions.issue({
      user,
      now: new Date(),
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });

    setSessionCookie(response, token, new Date(session.expiresAt));
  }

  @Post('register')
  async register(
    @Body() rawBody: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUser> {
    const parsed = registerSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные регистрации');
    }

    const { name, email, password, phone, city, accountType } = parsed.data;
    const existing = await this.users.findByEmail(email);

    if (existing) {
      throw new ConflictError('Email уже зарегистрирован');
    }

    // Регистрация провайдера всегда создаёт владельца клуба:
    // тренер как роль появляется только в исходных данных.
    const role: UserRole = accountType === 'athlete' ? 'athlete' : 'club_owner';

    const created = await this.users.insert({
      role,
      status: 'active',
      name,
      email,
      phone: phone ?? '',
      // Хеш считается до вставки: открытый пароль дальше этой строки не идёт.
      passwordHash: await hashPassword(password),
      avatarUrl: '',
      favoriteClubIds: [],
      city,
    } as Omit<User, 'id' | 'createdAt'>);

    // Зарегистрировался — значит вошёл: отдельный вход сразу после регистрации
    // ничего не проверял бы заново.
    await this.openSession(created, request, response);

    return AuthController.toAuthUser(created);
  }
}

/** Совпадает ли доменная роль с типом кабинета, выбранным в форме. */
function matchesAccountType(role: UserRole, accountType: AuthAccountType): boolean {
  return accountType === 'athlete'
    ? role === 'athlete'
    : role === 'club_owner' || role === 'trainer';
}

export const AUTH_CONTROLLERS = [AuthController];

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
//
// Шаг 34.51a добавил к входу нарастающую блокировку неудачных попыток, а к
// регистрации — предел частоты обращений. Оба счёта живут в своих модулях
// (`login-attempts.service.ts` и `common/rate-limit.ts`): контроллер только
// спрашивает разрешение и сообщает исход попытки.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { accountKindOf, capabilitiesOf } from '@sporthub/domain';
import type { AccountKind } from '@sporthub/types';
import type { AuthAccountType, User, UserRole } from '@sporthub/types';
import type { Request, Response } from 'express';
import { z } from 'zod';

import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../common/domain-error';
import { hashPassword, verifyPassword } from '../common/password';
import type { UsersRepository } from '../repositories/crud.repository';
import { CLUBS_REPOSITORY, TRAINERS_REPOSITORY } from '../repositories/entities.repository';
import type { ClubsRepository, TrainersRepository } from '../repositories/entities.repository';
import { USERS_REPOSITORY } from '../repositories/crud.repository';
import { EMPTY_RESULT, type EmptyResult } from '../common/api-response';
import { RateLimit } from '../common/rate-limit';
import { CurrentUser, Public, Requires } from './access.decorators';
import { LoginAttemptsService } from './login-attempts.service';
import { clearSessionCookie, readSessionCookie, setSessionCookie } from './session-cookie';
import { SessionService, type SessionContext } from './session.service';

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
    /**
     * Тип кабинета — ПОДСКАЗКА интерфейса, а не часть входа.
     *
     * Необязателен с фазы 34: вход администратора идёт тем же маршрутом, а кабинета
     * у него нет ни одного из двух. Раньше поле было обязательным, и админу
     * пришлось бы притворяться спортсменом, чтобы предъявить пароль.
     */
    accountType: z.enum(['athlete', 'provider']).optional(),
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

/**
 * Профиль вошедшего — ответ «кто я».
 *
 * Шире публичной карточки на два поля, и каждое нужно по делу: по роли страницы
 * решают, какой кабинет показывать; по списку прав интерфейс рисует действия,
 * а не угадывает их по роли во второй раз. Раньше всё это браузер знал сам —
 * он же сам себе и назначал.
 *
 * Расширять `AuthUser` нельзя: его форма закреплена сверкой контрактов у входа
 * и регистрации, а лишнее поле там означало бы изменение обещания без нужды.
 */
/** Лицо услуг: карточка тренера или клуб, которым человек управляет. */
export type ServiceFace = {
  kind: 'club' | 'trainer';
  id: number;
  name: string;
};

export type SessionProfile = AuthUser & {
  role: UserRole;
  /** Вид учётной записи: человек или администратор (шаг 35.18). */
  accountKind: AccountKind;
  capabilities: string[];
  /**
   * Лица услуг человека — клубы и карточки тренера, которыми он управляет
   * (шаг 35.21).
   *
   * ⚠️ Едут ОТВЕТОМ, а не вычисляются фронтом из каталога. Две причины.
   * Первая: `managedByUserId` уходит из публичной выдачи (шаг 35.20a), и считать
   * свои публикации фронту станет нечем. Вторая важнее — проверка «пускать ли
   * в кабинет лица» обязана укладываться в тот же единственный запрос, что и
   * «кто я»: иначе лейаут либо сходит за каталогом до проверки, либо отдаст
   * данные в поток раньше отказа. Ровно тот дефект, который ловит сторож порядка.
   */
  faces: ServiceFace[];
  /** Работа идёт от чужого лица. Интерфейс показывает плашку возврата. */
  impersonating?: boolean;
  /** Кто на самом деле вошёл — под имперсонизацией это администратор. */
  actorName?: string;
};

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
    // Лица услуг для ответа «кто я»: отбор по индексам владельца.
    @Inject(CLUBS_REPOSITORY) private readonly clubs: ClubsRepository,
    @Inject(TRAINERS_REPOSITORY) private readonly trainers: TrainersRepository,
    private readonly sessions: SessionService,
    private readonly loginAttempts: LoginAttemptsService,
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

  @Public()
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
    const attemptKeys = { email, ip: request.ip };

    // Проверка блокировки стоит ДО обращения к базе и до сверки пароля: подбор
    // не должен ни ходить в базу, ни заставлять сервер считать argon2 (19 МБ
    // памяти на каждый расчёт). Отказ одинаков для существующей и несуществующей
    // почты, поэтому перечислителем аккаунтов он не становится.
    this.loginAttempts.assertAllowed(attemptKeys);

    // Запрос по уникальному индексу почты, а не перебор таблицы: цена входа
    // не должна расти вместе с числом зарегистрированных.
    const user = await this.users.findByEmail(email);

    // Сверка идёт ВСЕГДА, даже когда пользователя нет: см. правило 2 в шапке.
    const passwordMatches = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, password);

    if (!user || user.status !== 'active' || !passwordMatches) {
      this.loginAttempts.registerFailure(attemptKeys);

      throw new UnauthorizedError(LOGIN_FAILED);
    }

    // Пароль верен — счёт обнуляется ЗДЕСЬ, до проверок роли и типа кабинета:
    // отказы ниже получает тот, кто пароль уже предъявил, и подбором они не являются.
    this.loginAttempts.registerSuccess(attemptKeys);

    // Обе проверки ниже — подсказки интерфейсу, а не защита: они говорят уже тому,
    // кто предъявил верный пароль, и потому стоят ПОСЛЕ сверки.
    //
    // Порядок между ними важен. Роль администратора не совпадает ни с одним типом
    // кабинета, поэтому проверка типа перехватила бы админа первой, и сообщение
    // про отдельный вход стало бы недостижимым — админ читал бы «неверный тип
    // кабинета» и не понимал, куда идти.
    // Обе проверки ниже — подсказки интерфейсу, а не защита: они говорят уже тому,
    // кто предъявил верный пароль.
    //
    // Порядок важен. Администратор не совпадает НИ С ОДНИМ типом кабинета, поэтому
    // проверка типа перехватила бы его первой, и сообщение про служебный вход стало
    // бы недостижимым — админ читал бы «неверный тип кабинета» и не понимал, куда идти.
    if (user.role === 'admin' && accountType !== undefined) {
      throw new ForbiddenError('Администраторы входят через /service-portal');
    }

    // Тип сверяется, только если его назвали. Служебная форма его не шлёт вовсе:
    // кабинета у администратора нет ни одного.
    if (accountType !== undefined && !matchesAccountType(user.role, accountType)) {
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
  // Публичный намеренно: выход обязан работать и с протухшей сессией, иначе
  // человек с негодной cookie не смог бы даже выйти.
  @Public()
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
  async me(@CurrentUser() context: SessionContext): Promise<SessionProfile> {
    // Своей проверки здесь нет: маршрут не помечен публичным, значит без годной
    // сессии до него не доходят вовсе — это работа глобального guard'а.
    return {
      ...(await this.toProfile(context.user)),
      // Признак работы от чужого лица нужен интерфейсу: под ним показывается
      // плашка возврата, а часть действий закрыта.
      ...(context.session.impersonatedUserId === undefined
        ? {}
        : { impersonating: true, actorName: context.actor.name }),
    };
  }

  /** Профиль вошедшего: карточка, вид учётной записи, полномочия и лица услуг. */
  private async toProfile(user: User): Promise<SessionProfile> {
    const kind = accountKindOf(user);

    return {
      ...AuthController.toAuthUser(user),
      role: user.role,
      accountKind: kind,
      // Полномочия считаются по ТОМУ, ОТ ЧЬЕГО ЛИЦА действуют: под имперсонизацией
      // администратор видит площадку глазами пользователя, а не своими.
      capabilities: capabilitiesOf(kind),
      faces: await this.facesOf(user.id),
    };
  }

  /**
   * Лица услуг человека — одним ответом.
   *
   * Читает только имя и номер: полные карточки со связями кабинету на этом шаге
   * не нужны, а ответ «кто я» спрашивают на каждой странице кабинета.
   */
  private async facesOf(userId: number): Promise<ServiceFace[]> {
    const [clubs, trainers] = await Promise.all([
      this.clubs.findAll({ managedByUserId: userId }),
      this.trainers.findAll({ managedByUserId: userId }),
    ]);

    return [
      ...clubs.map((club) => ({ kind: 'club' as const, id: club.id, name: club.name })),
      ...trainers.map((trainer) => ({
        kind: 'trainer' as const,
        id: trainer.id,
        name: trainer.name,
      })),
    ];
  }

  /**
   * Вернуться к себе. Заканчивает работу от чужого лица.
   *
   * ⚠️ Объявлен РАНЬШЕ маршрута с параметром: иначе «stop» разбирается как
   * номер пользователя, и возврат уходит в начало работы от лица несуществующего
   * человека. Ошибка при этом получается правдоподобная — 400 «некорректный id», —
   * и ищется она долго.
   */
  @Post('impersonate/stop')
  @HttpCode(HttpStatus.OK)
  async stopImpersonation(
    @CurrentUser() context: SessionContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionProfile> {
    if (context.session.impersonatedUserId === undefined) {
      throw new ValidationError('Работа от чужого лица не начиналась');
    }

    await this.sessions.revoke(context.session.id, new Date());

    const { token, session } = await this.sessions.issue({
      user: context.actor,
      now: new Date(),
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });

    setSessionCookie(response, token, new Date(session.expiresAt));

    return await this.toProfile(context.actor);
  }

  /**
   * Начать работу от лица другого пользователя.
   *
   * ⚠️ До фазы 34 имперсонизация жила целиком в браузере: он подменял себе номер
   * пользователя и продолжал слать его в теле запросов. Значит и след в журнале
   * зависел от добросовестности клиента — а именно журнал и нужен, чтобы потом
   * понять, кто на самом деле совершил действие.
   *
   * Теперь обе личности лежат в СЕССИИ: права проверяются по тому, от чьего лица
   * работают, а журнал пишется по настоящему администратору.
   */
  @Requires('impersonate')
  @Post('impersonate/:id')
  @HttpCode(HttpStatus.OK)
  async startImpersonation(
    @Param('id') rawId: string,
    @CurrentUser() context: SessionContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionProfile> {
    const targetId = Number(rawId);

    if (!Number.isInteger(targetId) || targetId <= 0) {
      throw new ValidationError('Некорректный id пользователя');
    }

    const target = await this.users.findById(targetId);

    if (!target || target.status !== 'active') {
      throw new NotFoundError('Пользователь не найден');
    }

    // ⚠️ Шаг 35.14, точка 11. От лица самого себя работать нельзя.
    // Сегодня это отбивается случайно — проверкой «цель не администратор», —
    // и держится ровно до тех пор, пока имперсонизация есть только у админа.
    // Проверка по номеру не зависит ни от какой роли и переживёт фазу 35.
    if (targetId === context.actor.id) {
      throw new ForbiddenError('Нельзя работать от лица самого себя');
    }

    // Администратором под чужим именем работать нельзя: это не даёт увидеть
    // площадку глазами пользователя, зато прячет, кто именно действовал.
    if (target.role === 'admin') {
      throw new ForbiddenError('Нельзя работать от лица администратора');
    }

    // Прежняя сессия отзывается: две живые сессии одного администратора —
    // это два следа в журнале, и разобрать потом, какой из них настоящий, нечем.
    await this.sessions.revoke(context.session.id, new Date());

    const { token, session } = await this.sessions.issue({
      user: context.actor,
      now: new Date(),
      impersonatedUserId: targetId,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });

    setSessionCookie(response, token, new Date(session.expiresAt));

    return await this.toProfile(target);
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

  // Регистрация открыта по назначению, но считается по адресу обращения: каждая
  // заводит запись в базе и считает argon2, то есть без предела маршрут становится
  // способом и засорить таблицу пользователей, и выесть память процесса.
  @Public()
  @RateLimit('register')
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

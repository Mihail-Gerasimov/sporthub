// Ограничение частоты обращений (шаг 34.51).
//
// ЗАЧЕМ. Открытые маршруты стоят денег и памяти: регистрация считает argon2 (19 МБ
// на расчёт), гео-прокси тратит платную квоту чужого ключа. Без предела один скрипт
// выедает и то, и другое, не имея ни одной учётной записи.
//
// ЧТО ЗДЕСЬ ЛЕЖИТ. Словарь пределов — одно объявление на весь бэкенд. Добавить
// четвёртый предел = дописать строку в `RATE_LIMITS` и повесить `@RateLimit('имя')`
// на маршрут; ни guard, ни модуль при этом не трогаются.
//
// ⚠️ ХРАНИЛИЩЕ СЧЁТЧИКОВ — В ПАМЯТИ ПРОЦЕССА. Это стандартное хранилище
// `@nestjs/throttler`, и выбрано оно сознательно: один процесс бэкенда, счётчику
// негде разъезжаться. Хранилище подменяемое — у библиотеки оно за интерфейсом
// `ThrottlerStorage`, и переезд на общее (Redis) — это провайдер в `AppModule`,
// без правки маршрутов. Сделать это придётся, как только процессов станет больше
// одного: сейчас два процесса дадут два независимых счётчика, то есть удвоенный
// предел, а перезапуск процесса обнулит счёт.
//
// ⚠️ ЧЕМ СЧИТАТЬ — ЧАСТЬ ОПИСАНИЯ ПРЕДЕЛА, а не общая настройка (шаг 36.26).
// У открытых маршрутов ключ счёта — адрес обращения, и поэтому `trust proxy`
// в `configure-app.ts` обязателен: без него все запросы за nginx приходят с одного
// адреса. Но у ЗАКРЫТЫХ маршрутов адрес не годится вовсе: страницы зовут их
// из процесса Next, браузерные обращения к `/api/*` идут через переадресацию Next,
// и за обратным прокси бэкенд видит один адрес на всю площадку — потолок по нему
// запер бы всех разом. Там ключ счёта — сессия.

import { UseGuards, applyDecorators, Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type {
  ThrottlerGetTrackerFunction,
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
} from '@nestjs/throttler';
import type { Request } from 'express';

import { readSessionCookie } from '../auth/session-cookie';
import { TooManyRequestsError } from './domain-error';
import { hashSecretToken } from './secret-token';

/** Ответ на превышение частоты. Срок ожидания уходит заголовком `Retry-After`. */
export const RATE_LIMIT_MESSAGE = 'Слишком много запросов. Повторите позже.';

/**
 * Чем считаются обращения.
 *
 * `address` — адрес обращения: годится там, где вошедшего ещё нет (регистрация,
 * гео-прокси, восстановление пароля). `session` — идентификатор сессии из cookie:
 * единственно возможный ключ на закрытых маршрутах, см. оговорку в шапке.
 */
type RateLimitTracker = 'address' | 'session';

/** Описание одного предела: сколько обращений за какое окно, чем считать и чем править. */
type RateLimitDefinition = {
  /** Обращений за окно с одного ключа счёта. */
  readonly limit: number;
  /** Длина окна в миллисекундах. */
  readonly windowMs: number;
  /** Имя переменной окружения для числа обращений. */
  readonly limitEnv: string;
  /** Имя переменной окружения для длины окна. */
  readonly windowEnv: string;
  /** Ключ счёта. Часть описания предела: у разных маршрутов он разный по существу. */
  readonly trackBy: RateLimitTracker;
};

/**
 * Словарь пределов — единственное место, где они объявлены.
 *
 * Числа выбраны от живого сценария, а не «на глаз»:
 * - `register` — регистраций с одного адреса за час. Десять покрывает и семью,
 *   и общий выход в сеть у офиса, но не оставляет места для потока учёток.
 * - `geo` — обращений к картам с одного адреса за минуту. Подсказки адреса
 *   спрашивают по мере ввода (с задержкой), поэтому предел заметно выше:
 *   шестьдесят — это заполнение нескольких форм подряд, но не выкачивание квоты.
 *
 * Счёт ведётся отдельно по КАЖДОМУ маршруту: ключ библиотеки включает имя
 * обработчика. Поэтому перебор координат не гасит подсказки, и наоборот.
 */
export const RATE_LIMITS = {
  register: {
    limit: 10,
    windowMs: 60 * 60 * 1000,
    limitEnv: 'SPORT_HUB_RATE_LIMIT_REGISTER',
    windowEnv: 'SPORT_HUB_RATE_LIMIT_REGISTER_WINDOW_MS',
    trackBy: 'address',
  },
  geo: {
    limit: 60,
    windowMs: 60 * 1000,
    limitEnv: 'SPORT_HUB_RATE_LIMIT_GEO',
    windowEnv: 'SPORT_HUB_RATE_LIMIT_GEO_WINDOW_MS',
    trackBy: 'address',
  },
  // Восстановление пароля (шаги 34.71–34.72). Оба маршрута публичны, и оба стоят
  // денег: заявка шлёт письмо, сброс считает argon2id. Пять за десять минут —
  // это «не пришло, попробую ещё раз» пару раз подряд, но не рассылка писем
  // на чужой адрес и не поток расчётов хеша.
  //
  // Счёт у каждого маршрута свой (ключ библиотеки включает имя обработчика),
  // поэтому заявки не съедают попытки сброса и наоборот.
  passwordReset: {
    limit: 5,
    windowMs: 10 * 60 * 1000,
    limitEnv: 'SPORT_HUB_RATE_LIMIT_PASSWORD_RESET',
    windowEnv: 'SPORT_HUB_RATE_LIMIT_PASSWORD_RESET_WINDOW_MS',
    trackBy: 'address',
  },
  // «Кто я» (шаг 36.26). Самый частый закрытый маршрут площадки: его зовёт КАЖДАЯ
  // отрисовка закрытой страницы — лейаут, иногда ещё и сама страница, — а сверх того
  // Next предзагружает соседние ссылки, и каждая предзагрузка тоже отрисовка.
  //
  // Число посчитано от живой навигации, а не назначено на глаз: одна отрисовка стоит
  // двух-трёх обращений, десяток вкладок разом — до тридцати, минута напряжённой
  // навигации с предзагрузкой ссылок — сотня-полторы. Триста за минуту оставляет
  // двукратный запас человеку и упирает скрипт в пять обращений в секунду вместо
  // тысяч. Потолок мягкий намеренно: цена ложного срабатывания здесь — отказ
  // вошедшему на его собственном кабинете.
  authMe: {
    limit: 300,
    windowMs: 60 * 1000,
    limitEnv: 'SPORT_HUB_RATE_LIMIT_AUTH_ME',
    windowEnv: 'SPORT_HUB_RATE_LIMIT_AUTH_ME_WINDOW_MS',
    trackBy: 'session',
  },
} as const satisfies Record<string, RateLimitDefinition>;

/** Имя предела из словаря. */
export type RateLimitName = keyof typeof RATE_LIMITS;

const RATE_LIMIT_NAMES = Object.keys(RATE_LIMITS) as RateLimitName[];

/**
 * Разобрать значение из окружения. Всё, что не целое положительное число,
 * считается не заданным: опечатка в переменной не должна тихо снимать защиту
 * (`0` означал бы «не пускать никого», `-1` — «пускать всех»).
 */
function readPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < 1) return fallback;

  return parsed;
}

/**
 * Ключ счёта по сессии: sha256 идентификатора из cookie.
 *
 * Хеш, а не само значение: счётчики живут в памяти процесса, и держать там
 * действующие идентификаторы сессий незачем — в базе лежит ровно такой же хеш.
 *
 * Запрос без cookie до закрытого маршрута не доходит (его отбивает `SessionGuard`
 * раньше ограничителя), но ключ на этот случай всё равно нужен свой: общая строка
 * на всех безымянных означала бы один счётчик на них всех.
 */
const trackBySession: ThrottlerGetTrackerFunction = (request) => {
  const token = readSessionCookie(request as Request);

  if (token === null) return `address:${(request as Request).ip ?? 'unknown'}`;

  return `session:${hashSecretToken(token)}`;
};

/**
 * Настройки ограничителя из окружения. Читаются один раз, когда собирается модуль:
 * пределы — решение выкатки, а не запроса.
 *
 * Ключ счёта берётся из описания предела. Для `address` он не задаётся вовсе —
 * это умолчание библиотеки, и переписывать его своими руками значило бы завести
 * вторую копию правила «адрес за обратным прокси».
 */
export function readRateLimits(env: NodeJS.ProcessEnv = process.env): ThrottlerModuleOptions {
  return {
    throttlers: RATE_LIMIT_NAMES.map((name) => {
      const definition: RateLimitDefinition = RATE_LIMITS[name];

      return {
        name,
        limit: readPositiveInt(env[definition.limitEnv], definition.limit),
        ttl: readPositiveInt(env[definition.windowEnv], definition.windowMs),
        ...(definition.trackBy === 'session' ? { getTracker: trackBySession } : {}),
      };
    }),
  };
}

/**
 * Guard ограничителя. От библиотечного отличается одним: наружу уходит ДОМЕННАЯ
 * ошибка, а не исключение Nest.
 *
 * Без этого 429 отвечал бы английским `ThrottlerException: Too Many Requests` —
 * то есть единственный ответ бэкенда, который клиент не смог бы показать человеку.
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected async throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    // Ноль секунд ожидания смысла не имеет: заголовок `Retry-After` с нулём
    // читается клиентом как «можно сразу».
    throw new TooManyRequestsError(RATE_LIMIT_MESSAGE, Math.max(1, detail.timeToBlockExpire));
  }
}

/**
 * Повесить на маршрут ОДИН предел из словаря.
 *
 * Пределы в библиотеке считаются все разом, поэтому чужие здесь же и снимаются:
 * иначе маршрут регистрации считался бы заодно и гео-счётчиком. Список чужих
 * берётся из словаря, а не выписывается руками, — новый предел не потребует
 * обходить все маршруты и дописывать в них своё имя.
 */
export const RateLimit = (name: RateLimitName): MethodDecorator & ClassDecorator =>
  applyDecorators(
    UseGuards(RateLimitGuard),
    SkipThrottle(
      Object.fromEntries(RATE_LIMIT_NAMES.filter((other) => other !== name).map((o) => [o, true])),
    ),
  );

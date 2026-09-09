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
// ⚠️ Счёт идёт по адресу обращения, поэтому `trust proxy` в `configure-app.ts`
// обязателен: без него все запросы за nginx приходят с одного адреса.

import { UseGuards, applyDecorators, Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerLimitDetail, ThrottlerModuleOptions } from '@nestjs/throttler';

import { TooManyRequestsError } from './domain-error';

/** Ответ на превышение частоты. Срок ожидания уходит заголовком `Retry-After`. */
export const RATE_LIMIT_MESSAGE = 'Слишком много запросов. Повторите позже.';

/** Описание одного предела: сколько обращений за какое окно и чем это правится. */
type RateLimitDefinition = {
  /** Обращений за окно с одного адреса. */
  readonly limit: number;
  /** Длина окна в миллисекундах. */
  readonly windowMs: number;
  /** Имя переменной окружения для числа обращений. */
  readonly limitEnv: string;
  /** Имя переменной окружения для длины окна. */
  readonly windowEnv: string;
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
  },
  geo: {
    limit: 60,
    windowMs: 60 * 1000,
    limitEnv: 'SPORT_HUB_RATE_LIMIT_GEO',
    windowEnv: 'SPORT_HUB_RATE_LIMIT_GEO_WINDOW_MS',
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
 * Настройки ограничителя из окружения. Читаются один раз, когда собирается модуль:
 * пределы — решение выкатки, а не запроса.
 */
export function readRateLimits(env: NodeJS.ProcessEnv = process.env): ThrottlerModuleOptions {
  return {
    throttlers: RATE_LIMIT_NAMES.map((name) => {
      const definition: RateLimitDefinition = RATE_LIMITS[name];

      return {
        name,
        limit: readPositiveInt(env[definition.limitEnv], definition.limit),
        ttl: readPositiveInt(env[definition.windowEnv], definition.windowMs),
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

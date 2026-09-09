// Декораторы доступа: чем маршрут объявляет свои требования.
//
// Смысл в том, что требование стоит РЯДОМ с маршрутом и читается вместе с ним.
// Проверка, спрятанная в теле метода, теряется среди разбора параметров, и понять
// «а этот маршрут вообще закрыт?» можно только прочитав его целиком.

import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Capability } from '@sporthub/domain';

import type { SessionContext } from './session.service';

export const IS_PUBLIC = Symbol('IS_PUBLIC');
export const REQUIRED_CAPABILITY = Symbol('REQUIRED_CAPABILITY');

/**
 * Маршрут доступен без входа.
 *
 * ⚠️ Пометка нужна именно потому, что по умолчанию всё закрыто. Обратный порядок —
 * «по умолчанию открыто, закрываем помеченное» — и привёл к тому, что 28 маршрутов
 * из 64 отдавали данные кому угодно: их просто забыли закрыть, и ничто об этом
 * не напомнило.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

/**
 * Маршрут требует конкретного права, а не просто входа.
 *
 * Право — это «что роли положено вообще». Принадлежность конкретной вещи проверяет
 * сервис: для неё нужно загрузить сущность, и в декоратор это не поместится.
 */
export const Requires = (capability: Capability): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_CAPABILITY, capability);

/**
 * Личность вызывающего — из сессии и только из неё.
 *
 * До фазы 34 контроллеры брали её из тела запроса, то есть верили клиенту на слово.
 * Здесь взять неоткуда, кроме как из проверенной сессии, — подставить чужой номер
 * больше негде.
 */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<{ sessionContext?: SessionContext }>();

  return request.sessionContext;
});

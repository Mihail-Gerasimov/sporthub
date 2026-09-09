// Глобальный guard: закрыто по умолчанию.
//
// Главный смысл фазы 34 не в том, чтобы заткнуть 28 открытых маршрутов — их можно
// закрыть и руками. Смысл в том, что маршрут, который напишут через год, будет
// закрыт САМ, а открыть его придётся сознательно, пометкой `@Public`.
//
// ⚠️ Guard бросает ДОМЕННЫЕ ошибки, а не исключения Nest. Ошибка из guard'а минует
// перехватчик формы ответа, и только доменная пройдёт через `DomainErrorFilter`
// и сохранит контракт `{ success: false, error }`. С исключением Nest форма ответа
// у 401 отличалась бы от всех остальных ошибок — и фронт разбирал бы её иначе.

import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { roleCan, type Capability } from '@sporthub/domain';
import type { Request } from 'express';

import { ForbiddenError, UnauthorizedError } from '../common/domain-error';
import { IS_PUBLIC, REQUIRED_CAPABILITY } from './access.decorators';
import { readSessionCookie } from './session-cookie';
import { SessionService, type SessionContext } from './session.service';

/** Запрос с разобранной личностью: контроллеры читают её через `@CurrentUser`. */
export type RequestWithSession = Request & { sessionContext?: SessionContext };

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Пометки читаются и с метода, и с класса: `@Public` на контроллере открывает
    // все его маршруты — так помечены справочники, где открыт каждый.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<RequestWithSession>();
    const token = readSessionCookie(request);

    // Публичный маршрут личность НЕ требует, но если сессия есть — разбирает её.
    // Это не любезность: публичная выдача каталога скрывает чужие черновики, а для
    // этого нужно знать, кто спрашивает. Негодная сессия на публичном маршруте
    // не мешает: гость и есть гость.
    if (isPublic) {
      if (token !== null) {
        request.sessionContext = (await this.sessions.resolve(token, new Date())) ?? undefined;
      }

      return true;
    }

    if (token === null) {
      throw new UnauthorizedError('Требуется вход');
    }

    const sessionContext = await this.sessions.resolve(token, new Date());

    // Причина негодности наружу не различается: истёкшая, отозванная и поддельная
    // сессии отвечают одинаково. Разные ответы рассказывали бы о чужих сессиях.
    if (sessionContext === null) {
      throw new UnauthorizedError('Требуется вход');
    }

    request.sessionContext = sessionContext;

    const capabilities = this.reflector.getAllAndOverride<Capability[]>(REQUIRED_CAPABILITY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (capabilities === undefined) return true;

    // Право проверяется по роли ТОГО, ОТ ЧЬЕГО ЛИЦА действуют. Под имперсонизацией
    // это цель, а не администратор: смысл имперсонизации в том, чтобы увидеть
    // площадку глазами пользователя, а не пройти его маршрутами с админскими правами.
    //
    // Перечисленных прав хватает ЛЮБОГО: маршрут, к которому ведут две разные
    // причины (своё владение или модерация), иначе пришлось бы либо открывать
    // без права вовсе, либо заводить третье право-синоним.
    if (!capabilities.some((capability) => roleCan(sessionContext.user.role, capability))) {
      throw new ForbiddenError('Недостаточно прав');
    }

    return true;
  }
}

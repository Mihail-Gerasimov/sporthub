/**
 * Таблица маршрутов работающего приложения — одно объявление на все сторожа.
 *
 * ⚠️ Почему это вынесено. Сторожа, обходящие ВСЕ маршруты, — самая сильная защита
 * проекта: маршрут, написанный завтра, попадает под них сам, без ревью. Но сбор
 * таблицы был скопирован в трёх файлах, и копии уже начали расходиться. Ошибка
 * в одной из них тихо сузила бы обход, и сторож остался бы зелёным, проверяя
 * половину площадки.
 *
 * Читается внутренняя таблица Express — другого способа спросить приложение
 * «какие у тебя маршруты» у Nest нет. Имя поля менялось между версиями
 * (`_router` → `router`), поэтому спрашиваются оба.
 */

import type { INestApplication } from '@nestjs/common';

/** Один маршрут: метод и путь с параметрами, как их видит приложение. */
export type RouteRecord = {
  readonly method: 'get' | 'post' | 'patch' | 'delete';
  readonly path: string;
};

/** Ключ маршрута для словарей исключений: `post /api/clubs/:id`. */
export function routeKey(route: RouteRecord): string {
  return `${route.method} ${route.path}`;
}

/** Все маршруты приложения. */
export function collectRoutes(app: INestApplication): RouteRecord[] {
  const instance = app.getHttpAdapter().getInstance() as unknown as {
    router?: { stack?: unknown[] };
    _router?: { stack?: unknown[] };
  };
  const stack = (instance.router ?? instance._router)?.stack ?? [];
  const routes: RouteRecord[] = [];

  for (const layer of stack as { route?: { path: string; methods: Record<string, boolean> } }[]) {
    if (!layer.route) continue;

    for (const [method, enabled] of Object.entries(layer.route.methods)) {
      if (!enabled) continue;
      if (method !== 'get' && method !== 'post' && method !== 'patch' && method !== 'delete') {
        continue;
      }

      routes.push({ method, path: layer.route.path });
    }
  }

  return routes;
}

/**
 * Изменяющие маршруты, действующие над КОНКРЕТНОЙ вещью, — те, в пути которых
 * есть параметр.
 *
 * Именно они и есть предмет вопроса «а твоя ли это вещь»: маршрут без параметра
 * действует над тем, что создаёт сам, и владельца у предмета ещё нет.
 */
export function mutatingRoutesWithParam(app: INestApplication): RouteRecord[] {
  return collectRoutes(app).filter((route) => route.method !== 'get' && route.path.includes(':'));
}

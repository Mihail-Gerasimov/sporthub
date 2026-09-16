// Маршруты приложения по файлам `src/app/**/page.tsx` — помощник для сторожей.
//
// Шаг 38.72: вынесено из `design/menu-routes-exist.test.ts`, потому что тот же
// вопрос — «существует ли у адреса страница» — задают и плитки «Возможности»
// (`home/home-features.test.tsx`). Импортировать один тест из другого значило бы
// гонять его наборы дважды; копия логики разошлась бы с первой при первой правке.

import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { WEB_ROOT } from '../web-root';

const APP_DIR = path.join(WEB_ROOT, 'src', 'app');

/** Маршруты приложения из файлов `page.tsx`: сегменты без групп, параметры как `[x]`. */
export async function collectRoutes(directory = APP_DIR, prefix = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const routes: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      // Группа `(admin)` в адрес не входит; catch-all за маршрут не считается.
      const isGroup = /^\(.*\)$/.test(entry.name);
      const isCatchAll = /^\[\.\.\..*\]$/.test(entry.name) || /^\[\[\.\.\..*\]\]$/.test(entry.name);

      if (isCatchAll) continue;

      routes.push(
        ...(await collectRoutes(
          path.join(directory, entry.name),
          isGroup ? prefix : `${prefix}/${entry.name}`,
        )),
      );
      continue;
    }

    if (entry.name === 'page.tsx') routes.push(prefix === '' ? '/' : prefix);
  }

  return routes;
}

/** Есть ли у адреса файл страницы; `[slug]` подходит под любой сегмент. */
export function routeExists(href: string, routes: string[]): boolean {
  const target = href.split('#')[0].split('?')[0];
  const parts = target.split('/').filter(Boolean);

  return routes.some((route) => {
    const segments = route.split('/').filter(Boolean);

    if (segments.length !== parts.length) return false;

    return segments.every((segment, index) => /^\[.*\]$/.test(segment) || segment === parts[index]);
  });
}

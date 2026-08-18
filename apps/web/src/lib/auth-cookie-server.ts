// Server-side helper для чтения `sh-auth-user-id` cookie в Server Components.
// Отдельный файл от `auth-cookie.ts`, потому что `next/headers` недоступен в
// клиентском бандле — если импортировать server-helpers из client-компонента,
// Next.js выдаст ошибку сборки. Здесь живёт только то, что можно импортировать
// из server-code (server pages, server actions, API-роутов).

import { cookies } from 'next/headers';

import { AUTH_USER_ID_COOKIE_NAME } from './auth-cookie';

/**
 * Прочитать userId из auth-cookie на сервере.
 * Возвращает null, если cookie не установлена или значение — не число.
 */
export async function getAuthUserIdFromCookies(): Promise<number | null> {
  const store = await cookies();
  const value = store.get(AUTH_USER_ID_COOKIE_NAME)?.value;
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

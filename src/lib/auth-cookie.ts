// Client-side helpers для auth-cookie `sh-auth-user-id`.
// Server-side чтение — в `auth-cookie-server.ts` (импортирует `next/headers`,
// который недоступен в клиентском бандле). Константу имени cookie держим здесь,
// чтобы server-файл переиспользовал её.
//
// Назначение cookie: позволить Server Components узнать, какой юзер сейчас
// залогинен (до этого server page hardcode'ил MVP_ATHLETE_USER_ID / MVP_PROVIDER_USER_ID,
// что ломалось для id=4-7 после расширения seed'а в Phase 26.6).
//
// Безопасность MVP: cookie не HttpOnly, не подписан — пишется и читается клиентом.
// Это адекватно fake-auth. При переходе на реальный auth заменим implementation,
// не трогая call-sites.

/** Имя cookie. Экспортируется, чтобы тесты и server-файл на него ссылались. */
export const AUTH_USER_ID_COOKIE_NAME = 'sh-auth-user-id';

/** Max-age 30 дней — synced с длиной зустенд-persist. */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Записать userId в document.cookie. SSR-safe: в non-browser окружении no-op. */
export function setAuthUserIdCookie(userId: number): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${AUTH_USER_ID_COOKIE_NAME}=${userId}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

/** Стереть auth-cookie (max-age=0). SSR-safe. */
export function clearAuthUserIdCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${AUTH_USER_ID_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}

/** Синхронно прочитать userId из document.cookie. Null при отсутствии или NaN. */
export function readAuthUserIdCookie(): number | null {
  if (typeof document === 'undefined') return null;
  const row = document.cookie.split('; ').find((c) => c.startsWith(`${AUTH_USER_ID_COOKIE_NAME}=`));
  if (!row) return null;
  const value = row.slice(AUTH_USER_ID_COOKIE_NAME.length + 1);
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

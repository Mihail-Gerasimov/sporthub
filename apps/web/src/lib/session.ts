// Сессия на стороне страниц: кто вошёл и пускать ли его сюда.
//
// ⚠️ Настоящее решение принимает бэкенд — он единственный, кто видит таблицу
// сессий. Здесь только два дела: спросить его «кто я» и увести гостя, чтобы
// страница не начинала грузить данные, которых ему не отдадут.
//
// До фазы 34 проверка жила в браузере: страница рисовалась целиком, данные
// уезжали в поток ответа, а поверх них показывалась плашка «нет доступа».
// Данные при этом уже были у того, кому их показывать не собирались.

import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import type { UserRole } from '@sporthub/types';

/** Внутренний адрес бэкенда: тот же, что у слоя доступа к данным. */
const API_ORIGIN = process.env.SPORT_HUB_API_ORIGIN ?? 'http://localhost:3001';

/** Профиль вошедшего — ровно то, что отдаёт «кто я». */
export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  avatarUrl?: string;
  city?: string;
};

/**
 * Кто вошёл. `null` — гость: ни cookie, ни живой сессии.
 *
 * Ответ не кэшируется: сессию можно отозвать в любой момент, и страница обязана
 * это заметить сразу, а не через минуту.
 */
export async function readSession(): Promise<SessionUser | null> {
  let header: string;

  try {
    header = (await cookies()).toString();
  } catch {
    // Отрисовка вне запроса: сессии нет и быть не может.
    return null;
  }

  if (header === '') return null;

  try {
    const response = await fetch(`${API_ORIGIN}/api/auth/me`, {
      cache: 'no-store',
      headers: { cookie: header },
    });

    if (!response.ok) return null;

    const body = (await response.json()) as { success: boolean; data?: SessionUser };

    return body.success && body.data !== undefined ? body.data : null;
  } catch {
    // Бэкенд не ответил. Считать это входом нельзя — иначе недоступность
    // сервиса открывала бы закрытые страницы.
    return null;
  }
}

/**
 * Пустить только вошедшего. Гостя уводит на главную.
 *
 * Возвращает профиль, чтобы страница не спрашивала «кто я» второй раз.
 */
export async function requireSession(): Promise<SessionUser> {
  const user = await readSession();

  if (user === null) redirect('/');

  return user;
}

/**
 * Пустить только того, чья роль в списке.
 *
 * Список ролей, а не право: страницы делятся по кабинетам, а кабинет — это роль.
 * Права проверяет бэкенд на каждом обращении к данным; здесь решается только,
 * какую страницу показывать.
 */
export async function requireRole(roles: readonly UserRole[]): Promise<SessionUser> {
  const user = await requireSession();

  if (!roles.includes(user.role)) redirect('/');

  return user;
}

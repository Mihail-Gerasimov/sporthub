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

import type { ServiceFace } from '@/lib/service-faces';
import type { AccountKind, UserRole } from '@sporthub/types';

/** Внутренний адрес бэкенда: тот же, что у слоя доступа к данным. */
const API_ORIGIN = process.env.SPORT_HUB_API_ORIGIN ?? 'http://localhost:3001';

/**
 * Профиль вошедшего — ровно то, что отдаёт «кто я».
 *
 * ⚠️ `ServiceFace` объявлен в `@/lib/service-faces`, а не здесь: этим типом
 * пользуется и браузерный стор, а сюда ему хода нет — файл серверный.
 */
export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  /** Вид учётной записи: человек или администратор (фаза 35). */
  accountKind: AccountKind;
  /** Что положено этому виду. Интерфейс рисует по списку, а не угадывает. */
  capabilities: string[];
  /**
   * Лица услуг человека. Приезжают тем же ответом «кто я», а не вычисляются
   * из каталога: проверка «пускать ли в кабинет лица» обязана уложиться
   * в единственный запрос — иначе лейаут сходит за данными до проверки.
   */
  faces: ServiceFace[];
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
 * Проверки страницы — каждая про своё.
 *
 * ⚠️ Шаги 35.20 и 35.34. Фаза 35 убрала роли, и вместо одного `requireRole`
 * проверок стало три: «это человек», «это владелец вот этого лица», «это
 * служебная запись». Одной их не выразить — человек больше не бывает кем-то
 * одним: у владельца клуба есть и свой кабинет лица, и свои записи как у всех.
 *
 * Права проверяет бэкенд на каждом обращении к данным; здесь решается только,
 * какую страницу показывать. Но решается ДО того, как страница пойдёт за данными:
 * иначе гость получит их в потоке ответа, а плашка нарисуется поверх.
 */

/**
 * Личный кабинет человека: пускает любого вошедшего, кроме служебной записи.
 *
 * ⚠️ Решение 5.2: администратор базового набора человека не получает. Он
 * не записывается и не пишет отзывов — показывать ему кабинет с чужими
 * разделами не только незачем, но и вредно: половина из них пуста навсегда.
 * Наличие лиц услуг тут ни при чём — владелец клуба тоже ходит на йогу.
 */
export async function requirePerson(): Promise<SessionUser> {
  const user = await requireSession();

  if (user.accountKind === 'admin') redirect('/');

  return user;
}

/** Кабинет лица услуг: пускает того, кто этим лицом управляет. */
export async function requireOwner(kind: 'club' | 'trainer', id: number): Promise<SessionUser> {
  const user = await requireSession();

  if (!user.faces.some((face) => face.kind === kind && face.id === id)) redirect('/');

  return user;
}

/**
 * Служебная панель: пускает администратора.
 *
 * ⚠️ Серверная защита админки сохраняется — меняется только источник признака.
 * Прежде это была роль, теперь вид учётной записи. Убрать проверку целиком
 * значило бы вернуть дыру, закрытую фазой 34.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireSession();

  if (user.accountKind !== 'admin') redirect('/');

  return user;
}

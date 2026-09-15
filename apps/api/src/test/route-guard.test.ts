// Сторож доступа: у каждого маршрута есть решение, а не умолчание.
//
// Приём тот же, что у сторожа утечки паролей: таблица маршрутов берётся у САМОГО
// приложения, а не выписывается руками. Новый маршрут попадает под проверку
// автоматически — забыть добавить его сюда невозможно.
//
// Правило простое: анонимный вызов любого маршрута обязан дать 401, кроме тех,
// что перечислены публичными ниже. Список публичных — это и есть место, где
// решение принимается сознательно: чтобы открыть маршрут, его придётся дописать
// сюда руками и объяснить, зачем.
//
// ⚠️ Почему сторож нужен, хотя есть глобальный guard. Guard легко обойти случайно:
// достаточно поставить `@Public()` «чтобы заработало» и забыть снять. Сторож ловит
// именно это — расхождение между тем, что открыто, и тем, что решили открыть.

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fixtureCollections } from '@sporthub/fixtures';

import { createTestHarness, type TestHarness } from './harness';

import { collectRoutes, type RouteRecord } from './app-routes';

/**
 * Маршруты, открытые для гостя. Каждый — с причиной.
 *
 * Ключ — «метод путь» ровно в том виде, в каком маршрут зарегистрирован.
 */
const PUBLIC_ROUTES: Record<string, string> = {
  'get /api/health': 'Проверка живости: её спрашивает контейнер, у него сессии нет.',
  'get /api/stats/overview': 'Четыре числа героя главной: главная открывается до входа (38.30).',

  'get /api/sports': 'Справочники — витрина площадки, гость обязан видеть каталог.',
  'get /api/cities': 'Справочники — витрина площадки.',
  'get /api/tags': 'Справочники — витрина площадки.',
  'get /api/amenities': 'Справочники — витрина площадки.',
  'get /api/work-formats': 'Справочники — витрина площадки.',
  'get /api/specialties': 'Справочники — витрина площадки.',

  'get /api/offerings': 'Услуги показываются в карточках клубов и тренеров.',
  'get /api/clubs': 'Каталог клубов — главная страница сайта.',
  'get /api/clubs/by-slug/:slug': 'Карточка клуба по адресу-ссылке.',
  'get /api/clubs/:id': 'Карточка клуба.',
  'get /api/trainers': 'Каталог тренеров.',
  'get /api/trainers/by-slug/:slug': 'Карточка тренера по адресу-ссылке.',
  'get /api/trainers/:id': 'Карточка тренера.',
  'get /api/schedule': 'Расписание видно до входа: иначе не понять, стоит ли регистрироваться.',
  'get /api/schedule/:id/context': 'Страница записи открывается гостю и предлагает войти.',
  'get /api/reviews': 'Отзывы — часть витрины.',
  'get /api/trainer-club-links':
    'Подтверждённые связи публичны: карточка клуба показывает своих тренеров, ' +
    'карточка тренера — свой клуб. Заявки, отказы и их причины гостю не видны. ' +
    'Закрыв маршрут целиком, фаза уронила главную страницу пятисоткой.',

  'post /api/auth/login': 'Вход.',
  'post /api/auth/register': 'Регистрация.',
  'post /api/auth/logout':
    'Выход обязан работать и с протухшей сессией — иначе с негодной cookie не выйти.',

  // Шаги 34.71–34.72: восстановление пароля. Оба открыты по определению —
  // сюда приходит тот, кто войти НЕ может. Плата за открытость — предел частоты
  // (`common/rate-limit.ts`, имя `passwordReset`) и одинаковый ответ заявки
  // для заведённой и незаведённой почты.
  'post /api/auth/forgot-password': 'Заявка на восстановление: её подаёт тот, кто не вошёл.',
  'post /api/auth/reset-password': 'Смена пароля по ссылке из письма: сессии у человека нет.',

  // Шаг 34.54: остаются открытыми сознательно — карта рисуется на публичных
  // страницах, а адрес в форме набирают до отправки. Плата за открытость —
  // предел частоты по адресу обращения (`common/rate-limit.ts`).
  'post /api/geocode': 'Карта на публичных страницах; открыт под пределом частоты.',
  'post /api/suggest': 'Подсказки адреса до входа; открыт под пределом частоты.',
};

/** Подставить в путь любые значения параметров: до данных вызов дойти не должен. */
function fillParams(path: string): string {
  return path.replace(/:[A-Za-z]+/g, '1');
}

describe('Сторож доступа', () => {
  let harness: TestHarness;
  let routes: RouteRecord[];

  beforeAll(async () => {
    harness = await createTestHarness('route-guard');
    routes = collectRoutes(harness.app);
    await harness.writeMany(fixtureCollections);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('таблица маршрутов не пуста', () => {
    // Санити: если таблица вдруг окажется пустой, сторож станет зелёной пустышкой.
    expect(routes.length).toBeGreaterThan(50);
  });

  it('каждый непубличный маршрут отвечает гостю 401', async () => {
    const offenders: string[] = [];

    for (const route of routes) {
      const key = `${route.method} ${route.path}`;

      if (key in PUBLIC_ROUTES) continue;

      const response = await request(harness.app.getHttpServer())
        [route.method](fillParams(route.path))
        .send({});

      // Именно 401, а не «любая ошибка»: 400 означало бы, что разбор тела случился
      // РАНЬШЕ проверки доступа, то есть маршрут успел что-то сделать с чужим вводом.
      if (response.status !== 401) {
        offenders.push(`${key} — ответил ${response.status} вместо 401`);
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('каждый публичный маршрут открывается гостю', async () => {
    // Обратная сторона: список публичных не должен разъезжаться с кодом. Маршрут,
    // помеченный здесь, но закрытый в коде, — такая же ошибка, как и наоборот.
    const offenders: string[] = [];

    for (const key of Object.keys(PUBLIC_ROUTES)) {
      const [method, path] = key.split(' ') as [RouteRecord['method'], string];
      const exists = routes.some((route) => route.method === method && route.path === path);

      if (!exists) {
        offenders.push(`${key} — объявлен публичным, но такого маршрута нет`);
        continue;
      }

      const response = await request(harness.app.getHttpServer())
        [method](fillParams(path))
        .send({});

      if (response.status === 401) {
        offenders.push(`${key} — объявлен публичным, но отвечает 401`);
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

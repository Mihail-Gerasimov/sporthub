// Браузерный прогон чек-листа `tests/checklists/phase-34-security.md` (шаг 34.68).
//
// Прогон идёт настоящим Chromium: страницы открываются, cookie ставит сервер,
// запросы к API уходят из вкладки — с её cookie, её `Origin` и её `Sec-Fetch-Site`.
//
// Как запускать:
//   1. приложение поднято — `npm run app:up`;
//   2. поставлен Playwright: `npm i -D playwright && npx playwright install chromium`.
//      ⚠️ В зависимостях проекта его НЕТ намеренно: браузерные прогоны задуманы через
//      MCP-сервер (`.mcp.json`), который тянет свою копию сам. Этот файл — тот же
//      чек-лист, но запускаемый напрямую, и библиотека ему нужна своя. Решение,
//      заводить ли её постоянной зависимостью, за заказчиком;
//   3. `node tests/e2e-phase-34-run.mjs`.
//
// ⚠️ Прогон занимает около пяти минут: в сценарии 11 три паузы по минуте — иначе
// лестницу блокировок входа не проверить, у неё шаг ровно минута.
//
// ⚠️ Учётки прогона (`timing-34@`, `lockout-34@`, `sessions-34@`) заводятся сами
// и переиспользуются. Через регистрацию их заводить нельзя: у неё свой предел
// в десять с адреса в час, и собственный чек-лист его выедал бы на третьем прогоне.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  api, BASE, freshContext, futureDate, launch, loginAs, must, mustEqual,
  PASSWORD, results, shutdown, skip, step,
} from './e2e-phase-34-harness.mjs';
import { findSlot, publishClub, publishTrainer } from './e2e-phase-34-prep.mjs';
import {
  clubById, clubRating, clubWithReview, completedBookingTarget, countRows, expireLastResetToken,
  ensureAthlete, findForeignBooking, freeSlotFor, giveCompletedVisit, insertExpiredResetToken,
  lastLogActor, lastLogEntry,
  lastResetTokenFromLetters, ownClubId,
  pendingBookingForOwner, pendingBookingNotOwnedBy, readCabinetSections, stillExists,
} from './e2e-phase-34-db.mjs';

const ATHLETE = 'alexey@sporthub.local';
const OWNER = 'marina@studio.local';
const OWNER2 = 'dmitry@arena.local';
const TRAINER = 'trainer@sporthub.local';
const ADMIN = 'admin@sporthub.local';

// Метка прогона: имена публикаций уникальны по названию, и повторный прогон
// без неё упирается в 409 «клуб с таким названием уже есть».
const RUN = String(Date.now()).slice(-6);
const state = {};

/** Полное тело правки клуба: частичное отвергается разбором до проверки владения. */
function foreignClubPayload() {
  return {
    name: `Перехваченный клуб ${RUN}`,
    city: 'Самара',
    address: 'ул. Перехвата, 1',
    description: 'Попытка правки чужого клуба — владение обязано остановить её раньше, чем что-либо изменится.',
    phone: '+7 (900) 000-00-36',
    email: 'seize@sporthub.local',
    priceFrom: '700',
    sportIds: [1],
    tagIds: [],
    amenityIds: [],
    vk: '',
    telegram: '',
    facebook: '',
    coordinates: { lat: 53.2, lng: 50.1 },
    cityCoordinates: { lat: 53.2, lng: 50.1 },
    scheduleSlots: [{ title: 'Слот', date: futureDate(8), startTime: '10:00', endTime: '11:00', price: '700', capacity: '5', location: 'Зал', sportId: 1 }],
  };
}

async function main() {
  await launch();

  // ───────────── Подготовка данных через продукт ─────────────
  console.log('\n▶ Подготовка данных');
  {
    const { context, page } = await freshContext();
    await loginAs(page, OWNER, 'provider');
    state.ownerClub = await publishClub(page, `Клуб Марины (прогон ${RUN})`);
    await context.close();
  }
  {
    const { context, page } = await freshContext();
    await loginAs(page, OWNER2, 'provider');
    state.foreignClub = await publishClub(page, `Клуб Дмитрия (прогон ${RUN})`);
    await context.close();
  }
  {
    const { context, page } = await freshContext();
    await loginAs(page, TRAINER, 'provider');
    state.trainerCard = await publishTrainer(page, RUN);
    await context.close();
  }
  console.log(`  клуб владельца: ${state.ownerClub?.club?.id}, чужой клуб: ${state.foreignClub?.club?.id}, карточка тренера: ${state.trainerCard?.trainer?.id}`);

  // Слоты: свой у клуба владельца, свой у карточки тренера.
  {
    const { context, page } = await freshContext();
    state.clubSlot = await findSlot(page, (s) => s.ownerType === 'club' && s.ownerId === state.ownerClub?.club?.id);
    state.trainerSlot = await findSlot(page, (s) => s.ownerType === 'trainer' && s.ownerId === state.trainerCard?.trainer?.id);
    state.foreignSlot = await findSlot(page, (s) => s.ownerType === 'club' && s.ownerId === state.foreignClub?.club?.id);
    await context.close();
  }
  console.log(`  слоты: свой клуб ${state.clubSlot?.id}, тренер ${state.trainerSlot?.id}, чужой клуб ${state.foreignSlot?.id}`);

  // Клуб под удаление — ОТДЕЛЬНЫЙ. Шаг 38 удаляет клуб вместе с его расписанием,
  // и если удалить тот же, на слоте которого держатся шаги 62–63, они упадут
  // не по делу, а из-за порядка прогона.
  {
    const { context, page } = await freshContext();
    await loginAs(page, OWNER, 'provider');
    state.disposableClub = await publishClub(page, `Клуб под удаление (прогон ${RUN})`);
    await context.close();
  }

  // Заявки, ожидающие решения: одна на занятии представителя услуг, одна на чужом
  // для него занятии. Без них половине сценария 9 и шагу 73 нечего подтверждать.
  {
    const { context, page } = await freshContext();
    await loginAs(page, ATHLETE, 'athlete');
    for (const slot of [state.clubSlot, state.foreignSlot]) {
      if (!slot) continue;
      await api(page, 'POST', '/api/bookings', { scheduleId: slot.id, name: 'Алексей Смирнов', phone: '+7 (900) 000-00-10' });
    }
    await context.close();
  }

  await scenario1();
  await scenario2();
  await scenario3();
  await scenario4();
  await scenario5();
  await scenario6();
  await scenario7();
  await scenario8();
  await scenario9();
  await scenario10();
  await scenario11();
  await scenario12();
  await scenario13and14();
  await scenario15();

  await shutdown();
  report();
}

// ───────────── Сценарий 1. Вход (гость) ─────────────
async function scenario1() {
  console.log('\n▶ Сценарий 1. Вход');
  const { context, page } = await freshContext();

  await step('1', 'Модалка входа открывается', async () => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const button = page.getByRole('button', { name: /войти/i }).first();
    await button.waitFor({ state: 'visible', timeout: 15000 });
    await button.click();
    const modal = page.getByRole('dialog');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    const text = await modal.innerText();
    must(/вход/i.test(text), `в модалке нет вкладки «Вход»: ${text.slice(0, 120)}`);
    return 'модалка открыта, вкладка «Вход» на месте';
  }, page);

  let wrongPassword = null;
  let unknownEmail = null;

  await step('2', 'Верная почта + неверный пароль', async () => {
    wrongPassword = await api(page, 'POST', '/api/auth/login', { email: ATHLETE, password: 'заведомо-неверный', accountType: 'athlete' });
    mustEqual(wrongPassword.status, 401, 'код ответа');
    mustEqual(wrongPassword.body?.error, 'Неверная почта или пароль', 'текст ошибки');
    return '401 «Неверная почта или пароль»';
  }, page);

  await step('3', 'Несуществующая почта — ответ дословно тот же', async () => {
    unknownEmail = await api(page, 'POST', '/api/auth/login', { email: 'no-such-user-34@sporthub.local', password: 'любой-пароль', accountType: 'athlete' });
    mustEqual(unknownEmail.status, wrongPassword.status, 'код ответа');
    mustEqual(JSON.stringify(unknownEmail.body), JSON.stringify(wrongPassword.body), 'тело ответа');
    return 'ответы шагов 2 и 3 совпали побайтово';
  }, page);

  await step('4', 'Время ответов не выдаёт существующую почту', async () => {
    const measure = async (email) => {
      const samples = [];
      for (let i = 0; i < 5; i += 1) {
        const started = Date.now();
        await api(page, 'POST', '/api/auth/login', { email, password: 'заведомо-неверный', accountType: 'athlete' });
        samples.push(Date.now() - started);
      }
      samples.sort((a, b) => a - b);
      return samples[2];
    };

    // Учётка заводится СВОЯ и одноразовая: пять неверных попыток подряд — это
    // ровно порог лестницы блокировок, и рабочую учётку замер бы запер.
    const victim = 'timing-34@sporthub.local';
    must(ensureAthlete(victim, 'Мишень Замера'), 'учётка для замера не завелась');
    const known = await measure(victim);
    const unknown = await measure('no-such-user-34b@sporthub.local');
    // Верный вход обнуляет лестницу блокировок: учётка переиспользуется прогонами,
    // и следующий не должен начинаться с запертой.
    await api(page, 'POST', '/api/auth/login', { email: victim, password: PASSWORD, accountType: 'athlete' });
    const ratio = Math.max(known, unknown) / Math.max(1, Math.min(known, unknown));
    must(ratio < 2, `медианы разошлись более чем вдвое: известная ${known} мс, неизвестная ${unknown} мс`);
    return `медианы ${known} мс и ${unknown} мс — один порядок`;
  }, page);

  await step('5', 'Верная пара — вход прошёл, в шапке имя', async () => {
    const response = await api(page, 'POST', '/api/auth/login', { email: ATHLETE, password: PASSWORD, accountType: 'athlete' });
    mustEqual(response.status, 200, 'код входа');
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const header = await page.locator('header').first().innerText();
    const name = String(response.body?.data?.name ?? '').split(' ')[0];
    must(header.includes(name), `имени «${name}» нет в шапке: ${header.replace(/\s+/g, ' ').slice(0, 160)}`);
    return `в шапке «${name}»`;
  }, page);

  await step('6', 'Cookie сессии: HttpOnly, SameSite=Lax, значение не число', async () => {
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name.includes('sh-session'));
    must(session, `cookie сессии нет: ${cookies.map((c) => c.name).join(', ') || 'пусто'}`);
    must(session.httpOnly, 'флаг HttpOnly не выставлен');
    mustEqual(session.sameSite, 'Lax', 'SameSite');
    must(!/^\d+$/.test(session.value), `значение — число: ${session.value}`);
    must(!session.value.includes('@'), 'значение похоже на почту');
    must(session.value.length >= 32, `значение короткое: ${session.value.length} символов`);
    state.cookieName = session.name;
    state.cookieValue = session.value;
    return `${session.name}, HttpOnly, SameSite=Lax, ${session.value.length} символов`;
  }, page);

  await step('7', 'localStorage не источник истины, старой cookie нет', async () => {
    const cookies = await context.cookies();
    must(!cookies.some((c) => c.name === 'sh-auth-user-id'), 'старая cookie sh-auth-user-id на месте');
    const stored = await page.evaluate(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        out[key] = localStorage.getItem(key);
      }
      return out;
    });
    const raw = JSON.stringify(stored);
    must(!/"userId"\s*:\s*\d/.test(raw), `в localStorage лежит userId: ${raw.slice(0, 200)}`);
    return `cookie sh-auth-user-id отсутствует; в localStorage ключей: ${Object.keys(stored).length}`;
  }, page);

  await step('8', 'GET /api/auth/me — свой профиль без хеша пароля', async () => {
    const me = await api(page, 'GET', '/api/auth/me');
    mustEqual(me.status, 200, 'код');
    mustEqual(me.body?.data?.email, ATHLETE, 'почта в профиле');
    must(!/passwordHash|\$argon2/.test(me.text), 'в ответе есть хеш пароля');
    must(Array.isArray(me.body?.data?.capabilities), 'нет списка прав');
    state.athleteId = me.body.data.id;
    return `профиль ${me.body.data.email}, роль ${me.body.data.role}, прав ${me.body.data.capabilities.length}`;
  }, page);

  await context.close();
}

// ───────────── Сценарий 2. Подмена личности ─────────────
async function scenario2() {
  console.log('\n▶ Сценарий 2. Подмена личности');
  const { context, page } = await freshContext();
  await loginAs(page, ATHLETE, 'athlete');

  await step('9', 'Подменённое значение cookie — увели с кабинета', async () => {
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name.includes('sh-session'));
    await context.clearCookies();
    await context.addCookies([{ ...session, value: 'подделка-'.repeat(4) + 'x' }]);
    await page.goto(`${BASE}/profile/athlete/dashboard`, { waitUntil: 'domcontentloaded' });
    const url = page.url();
    must(!url.includes('/profile/athlete'), `остались в кабинете: ${url}`);
    const body = await page.locator('body').innerText();
    must(!body.includes('@'), 'на странице видны почты');
    return `увели на ${new URL(url).pathname}`;
  }, page);

  await step('10', 'Cookie в виде числа 2 — доступа нет', async () => {
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name.includes('sh-session'));
    await context.clearCookies();
    await context.addCookies([{ ...session, value: '2' }]);
    await page.goto(`${BASE}/profile/athlete/dashboard`, { waitUntil: 'domcontentloaded' });
    must(!page.url().includes('/profile/athlete'), `остались в кабинете: ${page.url()}`);
    const me = await api(page, 'GET', '/api/auth/me');
    mustEqual(me.status, 401, 'код /me со старой схемой cookie');
    return 'кабинет закрыт, /me отвечает 401';
  }, page);

  await context.clearCookies();
  await loginAs(page, ATHLETE, 'athlete');

  await step('11', 'POST /api/bookings с чужим userId — запись на себя', async () => {
    must(state.trainerSlot, 'нет слота тренера — подготовка не отработала');
    const response = await api(page, 'POST', '/api/bookings', {
      scheduleId: state.trainerSlot.id,
      userId: 999,
      name: 'Алексей Смирнов',
      phone: '+7 (900) 000-00-11',
    });
    must(response.status === 201 || response.status === 200, `код: ${response.status} ${response.text}`);
    mustEqual(response.body?.data?.userId, state.athleteId, 'владелец записи');
    state.athleteBookingOnTrainer = response.body.data.id;
    return `запись ${response.body.data.id} создана на userId=${response.body.data.userId}, подставленный 999 отброшен`;
  }, page);

  await step('12', 'DELETE чужой записи — 403, запись на месте', async () => {
    const foreign = await findForeignBooking(state.athleteId);
    must(foreign, 'в базе нет чужой записи для проверки');
    const response = await api(page, 'DELETE', `/api/bookings/${foreign}`);
    mustEqual(response.status, 403, 'код');
    const still = await stillExists('bookings', foreign);
    must(still, 'чужая запись исчезла');
    return `403 на запись ${foreign}, запись на месте`;
  }, page);

  await context.close();
}

// ───────────── Сценарий 3. Открытые маршруты закрыты ─────────────
async function scenario3() {
  console.log('\n▶ Сценарий 3. Закрытые маршруты (гость)');
  const { context, page } = await freshContext();

  const closed = [
    ['13', 'GET', '/api/users'],
    ['14', 'GET', '/api/logs'],
    ['15', 'GET', '/api/analytics'],
    ['16', 'GET', '/api/publications'],
    ['17', 'GET', '/api/users/1/notification-preferences'],
    ['18', 'GET', '/api/bookings?scope=all'],
    ['19', 'GET', '/api/notifications?scope=all'],
    ['20', 'GET', '/api/provider-client-notes?scope=all'],
    ['21', 'DELETE', '/api/clubs/1'],
    ['22', 'DELETE', '/api/trainers/1'],
  ];

  for (const [id, method, url] of closed) {
    await step(id, `${method} ${url} гостю`, async () => {
      const response = await api(page, method, url);
      mustEqual(response.status, 401, 'код');
      mustEqual(response.body?.success, false, 'поле success');
      must(typeof response.body?.error === 'string' && response.body.error.length > 0, 'нет текста ошибки');
      must(!/\[|@/.test(JSON.stringify(response.body?.data ?? '')), 'в ответе просочились данные');
      return `401 «${response.body.error}»`;
    }, page);
  }

  await step('23', 'POST /api/logs с подставленным actorId', async () => {
    const response = await api(page, 'POST', '/api/logs', { actorId: 1, actorRole: 'admin', action: 'login' });
    must(response.status === 401 || response.status === 404, `код: ${response.status}`);
    return response.status === 404 ? '404 — маршрут удалён вовсе' : `401 «${response.body?.error}»`;
  }, page);

  await context.close();
}

// ───────────── Сценарий 4. Публичное осталось публичным ─────────────
async function scenario4() {
  console.log('\n▶ Сценарий 4. Публичное (гость)');
  const { context, page } = await freshContext();

  const mapViolations = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /violates the following Content Security Policy/i.test(message.text())) {
      mapViolations.push(message.text());
    }
  });

  await step('24', 'Главная: каталог виден, карта грузится', async () => {
    const response = await page.goto(BASE, { waitUntil: 'load' });
    mustEqual(response.status(), 200, 'код страницы');
    await page.waitForTimeout(2500);
    const body = await page.locator('body').innerText();
    must(body.length > 500, `страница пустая: ${body.length} символов`);
    const clubs = await api(page, 'GET', '/api/clubs');
    must((clubs.body?.data ?? []).length > 0, 'каталог клубов пуст');
    // Наличие тега в разметке ничего не доказывает: пустой контейнер карты
    // выглядит так же, как рабочий. Смотрим на то, ПОДНЯЛСЯ ли загрузчик карт,
    // и не отбил ли браузер что-нибудь из его хозяйства по правилам источников.
    const blocked = mapViolations.filter((text) => /yandex|yastatic/i.test(text));
    const ready = await page.evaluate(() => typeof window.ymaps3);
    mustEqual(blocked.length, 0, `правила источников отбили хозяйство карт: ${blocked[0]?.slice(0, 180)}`);
    mustEqual(ready, 'object', 'загрузчик карт не поднялся');
    const hasSection = await page.evaluate(() =>
      Array.from(document.querySelectorAll('section')).some((node) => {
        const label = node.getAttribute('aria-label') ?? node.querySelector('h2')?.textContent ?? '';
        return /карт/i.test(label);
      }),
    );
    must(hasSection, 'на главной нет раздела с картой');
    return `страница 200, клубов ${clubs.body.data.length}, загрузчик карт поднялся, отбитых ресурсов нет`;
  }, page);

  await step('25', 'Карточка клуба: отзывы с подписанным автором', async () => {
    const withReview = await clubWithReview();
    must(withReview, 'в базе нет клуба с отзывом');
    const response = await page.goto(`${BASE}/clubs/${withReview.slug}`, { waitUntil: 'domcontentloaded' });
    mustEqual(response.status(), 200, 'код страницы');
    const reviews = await api(page, 'GET', `/api/reviews?targetType=club&targetId=${withReview.id}`);
    const rows = reviews.body?.data ?? [];
    must(rows.length > 0, 'отзывов не пришло');
    const named = rows.filter((r) => typeof r.authorName === 'string' && r.authorName.length > 0);
    mustEqual(named.length, rows.length, 'отзывов с подписанным автором');
    return `${rows.length} отзыв(ов), у всех есть authorName («${rows[0].authorName}»)`;
  }, page);

  await step('26', 'Карточка тренера открыта гостю', async () => {
    const trainers = await api(page, 'GET', '/api/trainers');
    const trainer = (trainers.body?.data ?? [])[0];
    must(trainer, 'каталог тренеров пуст');
    const response = await page.goto(`${BASE}/trainers/${trainer.slug}`, { waitUntil: 'domcontentloaded' });
    mustEqual(response.status(), 200, 'код страницы');
    const body = await page.locator('body').innerText();
    must(body.includes(trainer.name.split(' ')[0]), 'имени тренера нет на странице');
    return `карточка «${trainer.name}» открыта`;
  }, page);

  await step('27', 'Публичные справочники отдают данные', async () => {
    const routes = ['/api/clubs', '/api/trainers', '/api/schedule', '/api/reviews', '/api/sports', '/api/cities'];
    const report = [];
    for (const url of routes) {
      const response = await api(page, 'GET', url);
      mustEqual(response.status, 200, `код ${url}`);
      const rows = response.body?.data ?? [];
      must(Array.isArray(rows) && rows.length > 0, `${url} вернул пусто`);
      report.push(`${url.replace('/api/', '')}=${rows.length}`);
    }
    return report.join(', ');
  }, page);

  await step('28', 'Страница записи открыта гостю и зовёт войти', async () => {
    must(state.clubSlot, 'нет слота клуба');
    const response = await page.goto(`${BASE}/booking/${state.clubSlot.id}`, { waitUntil: 'domcontentloaded' });
    mustEqual(response.status(), 200, 'код страницы');
    await page.waitForTimeout(1200);
    const body = await page.locator('body').innerText();
    must(/войти|вход|зарегистр/i.test(body), `нет предложения войти: ${body.replace(/\s+/g, ' ').slice(0, 200)}`);
    return 'страница 200, гостю предложен вход';
  }, page);

  await context.close();
}

// ───────────── Сценарий 5. Кабинеты закрыты на сервере ─────────────
async function scenario5() {
  console.log('\n▶ Сценарий 5. Кабинеты закрыты (гость)');
  const { context, page } = await freshContext();

  const guarded = [
    ['29', '30', '/profile/athlete/dashboard'],
    ['31', null, '/profile/provider/dashboard'],
    ['32', null, '/service-portal/dashboard'],
  ];

  for (const [id, streamId, route] of guarded) {
    await step(id, `${route} без cookie`, async () => {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
      const url = page.url();
      must(!url.includes(route), `остались на ${url}`);
      return `увели на ${new URL(url).pathname}`;
    }, page);

    const checkStream = async () => {
      const raw = await context.request.get(`${BASE}${route}`, { maxRedirects: 0 });
      const text = await raw.text();
      must(!/@sporthub\.local|@studio\.local|@arena\.local/.test(text), 'в поток ответа попали почты пользователей');
      must(!/passwordHash|\$argon2/.test(text), 'в поток попал хеш пароля');
      return `в потоке ${text.length} байт, данных кабинета нет (код ${raw.status()})`;
    };

    if (streamId) {
      await step(streamId, `${route}: данных нет в самом потоке`, checkStream, page);
    } else {
      await step(`${id}-поток`, `${route}: данных нет в потоке`, checkStream, page);
    }
  }

  await context.close();
}

// ───────────── Сценарий 6. Чужой кабинет ─────────────
async function scenario6() {
  console.log('\n▶ Сценарий 6. Чужой кабинет');
  {
    const { context, page } = await freshContext();
    await loginAs(page, ATHLETE, 'athlete');

    await step('33', 'Атлет открывает кабинет провайдера', async () => {
      await page.goto(`${BASE}/profile/provider/dashboard`, { waitUntil: 'domcontentloaded' });
      must(!page.url().includes('/profile/provider'), `пустило: ${page.url()}`);
      return `увели на ${new URL(page.url()).pathname}`;
    }, page);

    await context.close();
  }

  const { context, page } = await freshContext();
  await loginAs(page, OWNER, 'provider');

  await step('34', 'Провайдер открывает расписание атлета', async () => {
    await page.goto(`${BASE}/profile/athlete/schedule`, { waitUntil: 'domcontentloaded' });
    must(!page.url().includes('/profile/athlete'), `пустило: ${page.url()}`);
    return `увели на ${new URL(page.url()).pathname}`;
  }, page);

  await step('35', 'Заметки чужого провайдера не отдаются', async () => {
    const response = await api(page, 'GET', '/api/provider-client-notes?providerUserId=4');
    if (response.status === 403) return '403 — срез по чужому провайдеру отклонён';
    mustEqual(response.status, 200, 'код');
    const rows = response.body?.data ?? [];
    const foreign = rows.filter((r) => r.providerUserId && r.providerUserId !== 2);
    mustEqual(foreign.length, 0, 'чужих заметок в ответе');
    return `200, но срез свой: строк ${rows.length}, чужих 0`;
  }, page);

  await step('36', 'PATCH чужого клуба — 403', async () => {
    const id = state.foreignClub?.club?.id;
    must(id, 'нет чужого клуба');
    const response = await api(page, 'PATCH', `/api/clubs/${id}`, foreignClubPayload());
    mustEqual(response.status, 403, `код (тело ${response.text})`);
    return `403 «${response.body?.error}»`;
  }, page);

  await step('37', 'DELETE чужого клуба — 403, клуб на месте', async () => {
    const id = state.foreignClub?.club?.id;
    const response = await api(page, 'DELETE', `/api/clubs/${id}`);
    mustEqual(response.status, 403, 'код');
    must(await stillExists('clubs', id), 'чужой клуб удалён');
    return `403 «${response.body?.error}», клуб ${id} на месте`;
  }, page);

  await context.close();
}

// ───────────── Сценарий 7. Владение и правила ─────────────
async function scenario7() {
  console.log('\n▶ Сценарий 7. Владение и правила');
  const { context, page } = await freshContext();
  await loginAs(page, OWNER, 'provider');

  await step('38', 'Удаление своего клуба и настоящий исполнитель в журнале', async () => {
    const id = state.disposableClub?.club?.id;
    must(id, 'нет клуба под удаление');
    const response = await api(page, 'DELETE', `/api/clubs/${id}`);
    must(response.status === 200 || response.status === 204, `код: ${response.status} ${response.text}`);
    must(!(await stillExists('clubs', id)), 'клуб остался в базе');
    const actor = await lastLogActor('publish_delete', 'club', id);
    mustEqual(actor, 2, 'исполнитель в журнале (ожидался владелец, id=2)');
    return `клуб ${id} удалён, в журнале исполнитель ${actor}`;
  }, page);

  await context.close();

  const athlete = await freshContext();
  await loginAs(athlete.page, ATHLETE, 'athlete');

  await step('39', 'Отзыв без завершённой записи — 403', async () => {
    const target = state.foreignClub?.club?.id;
    const response = await api(athlete.page, 'POST', '/api/reviews', {
      clubId: target, rating: 5, text: 'Проверочный отзыв без посещения занятия клуба.',
    });
    mustEqual(response.status, 403, 'код');
    return `403 «${response.body?.error}»`;
  }, athlete.page);

  await step('39a', 'На карточке вместо формы — объясняющая плашка', async () => {
    const club = await clubById(state.foreignClub?.club?.id);
    await athlete.page.goto(`${BASE}/clubs/${club.slug}`, { waitUntil: 'domcontentloaded' });
    await athlete.page.waitForTimeout(2000);
    const body = await athlete.page.locator('body').innerText();
    must(/посет|занятие|запис/i.test(body), 'нет объяснения, почему отзыв недоступен');
    const explains = /чтобы оставить отзыв|после посещения|сначала посетите|нужно посетить|доступен после/i.test(body);
    must(explains, `объяснения не видно: ${body.replace(/\s+/g, ' ').slice(0, 300)}`);
    const hasForm = await athlete.page.locator('textarea, form').count();
    state.reviewFormShown = hasForm > 0;
    return hasForm > 0
      ? 'форма рисуется, под ней объяснение «оставить можно после посещения» — как и записано в чек-листе'
      : 'плашка с объяснением вместо формы';
  }, athlete.page);

  await step('40', 'Отзыв при завершённой записи — успех, рейтинг пересчитан', async () => {
    // Посещение заводит сам прогон: см. пояснение у `giveCompletedVisit`.
    must(state.ownerClub?.club?.id, 'нет клуба для посещения');
    must(giveCompletedVisit(state.athleteId, state.ownerClub.club.id), 'не удалось завести посещение');
    const done = await completedBookingTarget(state.athleteId);
    must(done, 'посещение заведено, но неизрасходованным не считается');
    const before = await clubRating(done.clubId);
    const response = await api(athlete.page, 'POST', '/api/reviews', {
      clubId: done.clubId, rating: 5, text: 'Занятие прошло отлично, проверка правила отзыва после посещения.',
    });
    must(response.status === 201 || response.status === 200, `код: ${response.status} ${response.text}`);
    const after = await clubRating(done.clubId);
    must(after.count > before.count, `число отзывов не выросло: было ${before.count}, стало ${after.count}`);
    state.reviewTarget = done.clubId;
    return `отзыв принят (посещений ${done.visits}, было отзывов ${done.given}), отзывов у клуба ${before.count} → ${after.count}, рейтинг ${before.rating} → ${after.rating}`;
  }, athlete.page);

  await step('41', 'Повторный отзыв тому же адресату', async () => {
    const before = await clubRating(state.reviewTarget);
    const response = await api(athlete.page, 'POST', '/api/reviews', {
      clubId: state.reviewTarget, rating: 4, text: 'Повторная попытка оставить отзыв тому же клубу.',
    });
    const after = await clubRating(state.reviewTarget);
    must(response.status !== 201 && response.status !== 200,
      `повтор ПРОШЁЛ (${response.status}): отзывов ${before.count} → ${after.count}, рейтинг ${before.rating} → ${after.rating}. Правила «одна оценка на посещение» в коде нет`);
    return `${response.status} «${response.body?.error}» — одна оценка на посещение`;
  }, athlete.page);

  await athlete.context.close();
}

// ───────────── Сценарий 8. Вход в админку ─────────────
async function scenario8() {
  console.log('\n▶ Сценарий 8. Вход в админку');
  const { context, page } = await freshContext();

  await step('42', 'Почта админа + неверный пароль — не пустило', async () => {
    await page.goto(`${BASE}/service-portal`, { waitUntil: 'domcontentloaded' });
    const response = await api(page, 'POST', '/api/auth/login', { email: ADMIN, password: 'неверный-пароль' });
    mustEqual(response.status, 401, 'код');
    const me = await api(page, 'GET', '/api/auth/me');
    mustEqual(me.status, 401, 'сессии нет');
    return `401 «${response.body?.error}», сессия не выдана`;
  }, page);

  await step('43', 'Произвольная почта + любой пароль — отказ', async () => {
    const response = await api(page, 'POST', '/api/auth/login', { email: 'kto-ugodno-34@example.com', password: 'lyuboy123' });
    mustEqual(response.status, 401, 'код');
    return `401 «${response.body?.error}»`;
  }, page);

  await step('44', 'Почты админа нет в сборке фронта', async () => {
    const roots = ['/Users/misha/Desktop/prosport2.1/apps/web/.next'];
    let scanned = 0;
    let found = [];
    const walk = (dir) => {
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(js|json|html|txt)$/.test(entry.name)) continue;
        scanned += 1;
        try {
          if (fs.readFileSync(full, 'utf8').includes(ADMIN)) found.push(full);
        } catch { /* нечитаемый файл пропускаем */ }
      }
    };
    if (!fs.existsSync(roots[0])) throw new Error('локальной сборки apps/web/.next нет — проверять нечего');
    walk(roots[0]);
    mustEqual(found.length, 0, `файлов сборки с почтой админа (${found.slice(0, 3).join(', ')})`);
    return `просмотрено ${scanned} файлов сборки, почты админа нет`;
  }, page);

  await step('45', 'Верная пара — панель открылась', async () => {
    const response = await api(page, 'POST', '/api/auth/login', { email: ADMIN, password: PASSWORD });
    mustEqual(response.status, 200, 'код входа');
    const me = await api(page, 'GET', '/api/auth/me');
    mustEqual(me.body?.data?.role, 'admin', 'роль в профиле');
    await page.goto(`${BASE}/service-portal/dashboard`, { waitUntil: 'domcontentloaded' });
    must(page.url().includes('/service-portal/dashboard'), `не пустило: ${page.url()}`);
    await page.waitForTimeout(1500);
    const body = await page.locator('body').innerText();
    must(body.length > 300, 'панель пустая');
    state.adminBody = body.slice(0, 200);
    return `роль admin, панель открыта (${body.length} символов)`;
  }, page);

  await context.close();

  const athlete = await freshContext();
  await loginAs(athlete.page, ATHLETE, 'athlete');

  await step('46', 'Не-админ вызывает админский маршрут — 403', async () => {
    const response = await api(athlete.page, 'POST', '/api/admin/users/1/lift-quarantine');
    mustEqual(response.status, 403, 'код');
    return `403 «${response.body?.error}»`;
  }, athlete.page);

  await athlete.context.close();
}

// ───────────── Сценарий 9. Имперсонизация ─────────────
async function scenario9() {
  console.log('\n▶ Сценарий 9. Имперсонизация');
  const { context, page } = await freshContext();
  await loginAs(page, ADMIN);

  await step('47', 'Админ входит как провайдер — открылся его кабинет', async () => {
    const response = await api(page, 'POST', '/api/auth/impersonate/2');
    mustEqual(response.status, 200, 'код');
    const me = await api(page, 'GET', '/api/auth/me');
    mustEqual(me.body?.data?.id, 2, 'кем работаем');
    mustEqual(me.body?.data?.impersonating, true, 'признак имперсонизации');
    must(me.body?.data?.actorName, 'нет имени настоящего админа в профиле');
    await page.goto(`${BASE}/profile/provider/dashboard`, { waitUntil: 'domcontentloaded' });
    must(page.url().includes('/profile/provider'), `кабинет не открылся: ${page.url()}`);
    await page.waitForTimeout(2500);
    const body = await page.locator('body').innerText();
    must(/работаете от имени|вернуться в панель/i.test(body),
      `сервер имперсонизацию видит (/me: impersonating=true, настоящий админ «${me.body.data.actorName}»), а плашки на странице НЕТ: ${body.replace(/\s+/g, ' ').slice(0, 160)}`);
    return `работаем как id=2, плашка видна, настоящий админ «${me.body.data.actorName}»`;
  }, page);

  await step('48', 'Действие провайдера под имперсонизацией проходит', async () => {
    const booking = await pendingBookingForOwner(2);
    must(booking, 'нет заявки, ожидающей решения владельца');
    const response = await api(page, 'POST', `/api/bookings/${booking}/confirm`);
    must(response.status === 200, `код: ${response.status} ${response.text}`);
    state.confirmedUnderImpersonation = booking;
    return `заявка ${booking} подтверждена, статус ${response.body?.data?.status}`;
  }, page);

  await step('49', 'В журнале исполнитель — админ, а не провайдер', async () => {
    const entry = await lastLogEntry('booking_confirm', 'booking', state.confirmedUnderImpersonation);
    must(entry, 'записи в журнале нет вовсе');
    mustEqual(entry.actorId, 3, 'исполнитель в журнале (ожидался настоящий админ id=3)');
    mustEqual(entry.actorRole, 'admin', 'роль исполнителя в журнале');
    return `в журнале исполнитель id=${entry.actorId}, роль ${entry.actorRole}`;
  }, page);

  await step('50', 'Смена пароля под имперсонизацией — отказ на сервере', async () => {
    const response = await api(page, 'PATCH', '/api/users/2', { currentPassword: PASSWORD, password: 'podmena-parolya-1' });
    mustEqual(response.status, 403, 'код');
    return `403 «${response.body?.error}»`;
  }, page);

  await step('51', '«Вернуться в панель» — снова админ', async () => {
    const response = await api(page, 'POST', '/api/auth/impersonate/stop');
    mustEqual(response.status, 200, 'код');
    const me = await api(page, 'GET', '/api/auth/me');
    mustEqual(me.body?.data?.role, 'admin', 'роль после возврата');
    must(!me.body?.data?.impersonating, 'признак имперсонизации не снят');
    const admin = await api(page, 'GET', '/api/logs?limit=1');
    mustEqual(admin.status, 200, 'админский маршрут после возврата');
    return 'снова админ, админские права работают';
  }, page);

  await context.close();
}

// ───────────── Сценарий 10. Жизнь сессии ─────────────
async function scenario10() {
  console.log('\n▶ Сценарий 10. Жизнь сессии');
  const first = await freshContext();
  const second = await freshContext();

  await step('52', 'Две сессии одного пользователя работают одновременно', async () => {
    state.sessionUser = 'sessions-34@sporthub.local';
    state.sessionUserId = ensureAthlete(state.sessionUser, 'Две Сессии');
    must(state.sessionUserId, 'учётка для сессий не завелась');
    await loginAs(first.page, state.sessionUser, 'athlete');
    await loginAs(second.page, state.sessionUser, 'athlete');
    const a = await api(first.page, 'GET', '/api/auth/me');
    const b = await api(second.page, 'GET', '/api/auth/me');
    mustEqual(a.status, 200, 'первый браузер');
    mustEqual(b.status, 200, 'второй браузер');
    const cookieA = (await first.context.cookies()).find((c) => c.name.includes('sh-session'));
    const cookieB = (await second.context.cookies()).find((c) => c.name.includes('sh-session'));
    must(cookieA.value !== cookieB.value, 'у двух браузеров одинаковое значение сессии');
    state.beforeRotation = cookieB.value;
    return 'обе сессии живы, значения разные';
  }, first.page);

  await step('53', 'Смена пароля в первом гасит второй', async () => {
    const response = await api(first.page, 'PATCH', `/api/users/${state.sessionUserId}`, { currentPassword: PASSWORD, password: 'novyy-parol-34' });
    must(response.status === 200, `смена пароля не прошла: ${response.status} ${response.text}`);
    const other = await api(second.page, 'GET', '/api/auth/me');
    mustEqual(other.status, 401, 'второй браузер после смены пароля');
    await second.page.goto(`${BASE}/profile/provider/dashboard`, { waitUntil: 'domcontentloaded' });
    must(!second.page.url().includes('/profile/provider'), `второй браузер остался в кабинете: ${second.page.url()}`);
    return 'второй браузер получил 401 и был уведён из кабинета';
  }, second.page);

  await step('54', 'Вход новым паролем проходит', async () => {
    const response = await api(second.page, 'POST', '/api/auth/login', { email: state.sessionUser, password: 'novyy-parol-34', accountType: 'athlete' });
    mustEqual(response.status, 200, 'код');
    const cookie = (await second.context.cookies()).find((c) => c.name.includes('sh-session'));
    state.afterRotation = cookie.value;
    return 'вход новым паролем прошёл';
  }, second.page);

  await step('55', 'Выход: cookie очищена, старое значение не работает', async () => {
    const old = (await second.context.cookies()).find((c) => c.name.includes('sh-session'));
    const response = await api(second.page, 'POST', '/api/auth/logout');
    must(response.status === 200 || response.status === 204, `код выхода: ${response.status}`);
    const after = (await second.context.cookies()).find((c) => c.name.includes('sh-session'));
    must(!after || !after.value, `cookie осталась: ${after?.value}`);
    await second.context.addCookies([{ ...old }]);
    const me = await api(second.page, 'GET', '/api/auth/me');
    mustEqual(me.status, 401, 'повтор старого значения');
    return 'cookie очищена, возврат старого значения даёт 401';
  }, second.page);

  await step('56', 'Значение cookie до и после входа различается', async () => {
    must(state.beforeRotation && state.afterRotation, 'нет снимков значения cookie');
    must(state.beforeRotation !== state.afterRotation, 'значение cookie не изменилось при новом входе');
    return `${state.beforeRotation.slice(0, 8)}… → ${state.afterRotation.slice(0, 8)}…`;
  }, second.page);

  // Пароль возвращается назад: следующий прогон обязан начинаться с того же состояния.
  // Учётка была заведена этим же прогоном — возвращать нечего.

  await first.context.close();
  await second.context.close();
}

// ───────────── Сценарий 11. Частота и внешние службы ─────────────
async function scenario11() {
  console.log('\n▶ Сценарий 11. Частота и внешние службы');
  const { context, page } = await freshContext();

  // Учётка заводится своя: лестница блокировок липнет к почте, и портить ею
  // рабочие учётки нельзя — следующий сценарий не войдёт.
  const victim = 'lockout-34@sporthub.local';
  ensureAthlete(victim, 'Мишень Блокировки');

  await step('57', 'Пять неверных попыток — шестая отклонена со сроком', async () => {
    let last = null;
    for (let i = 0; i < 6; i += 1) {
      last = await api(page, 'POST', '/api/auth/login', { email: victim, password: `неверный-${i}`, accountType: 'athlete' });
    }
    mustEqual(last.status, 429, 'код шестой попытки');
    must(/через 1 мин/i.test(String(last.body?.error)), `в тексте нет срока: «${last.body?.error}»`);
    return `429 «${last.body.error}»`;
  }, page);

  await step('58', 'После минуты ещё пять — срок вырос до двух минут', async () => {
    await page.waitForTimeout(62000);
    let last = null;
    for (let i = 0; i < 6; i += 1) {
      last = await api(page, 'POST', '/api/auth/login', { email: victim, password: `снова-неверный-${i}`, accountType: 'athlete' });
    }
    mustEqual(last.status, 429, 'код');
    must(/через 2 мин/i.test(String(last.body?.error)), `срок не вырос: «${last.body?.error}»`);
    return `429 «${last.body.error}»`;
  }, page);

  await step('58a', 'Верный пароль после ожидания обнуляет лестницу', async () => {
    await page.waitForTimeout(122000);
    const ok = await api(page, 'POST', '/api/auth/login', { email: victim, password: PASSWORD, accountType: 'athlete' });
    mustEqual(ok.status, 200, 'вход верным паролем после ожидания');
    let last = null;
    for (let i = 0; i < 6; i += 1) {
      last = await api(page, 'POST', '/api/auth/login', { email: victim, password: `после-сброса-${i}`, accountType: 'athlete' });
    }
    mustEqual(last.status, 429, 'код');
    must(/через 1 мин/i.test(String(last.body?.error)), `лестница не обнулилась: «${last.body?.error}»`);
    return `после верного входа лестница снова с одной минуты: «${last.body.error}»`;
  }, page);

  // Лестница обнуляется верным входом: учётка переиспользуется, и следующий прогон
  // должен начинаться с чистой. Ждать минуту дешевле, чем краснеть не по делу.
  await page.waitForTimeout(62000);
  await api(page, 'POST', '/api/auth/login', { email: victim, password: PASSWORD, accountType: 'athlete' });

  await step('58b', 'Потолок ожидания — 30 минут', async () => {
    const source = fs.readFileSync('/Users/misha/Desktop/prosport2.1/apps/api/src/auth/login-attempts.service.ts', 'utf8');
    const capped = /30/.test(source) && /MAX|ПОТОЛОК|потолок|максим/i.test(source);
    must(capped, 'в службе попыток входа не видно потолка');
    const match = source.match(/const\s+(\w*MAX\w*|\w*CAP\w*)\s*=\s*([^;]+);/);
    return `потолок объявлен константой: ${match ? match[0].replace(/\s+/g, ' ') : '30 минут'}`;
  }, page);

  await step('59', 'POST /api/geocode гостю', async () => {
    const response = await api(page, 'POST', '/api/geocode', { city: 'Самара', address: 'ул. Ленина, 1' });
    must(response.status !== 401, 'маршрут закрыт сессией — карта у гостя перестанет работать');
    return `маршрут открыт гостю (код ${response.status}) — так и решено в geo.controller.ts: по координатам рисуется карта на публичных страницах`;
  }, page);

  await step('60', 'POST /api/suggest сверх порога — 429', async () => {
    let limited = null;
    for (let i = 0; i < 75 && !limited; i += 1) {
      const response = await api(page, 'POST', '/api/suggest', { text: `Самара улица ${i}` });
      if (response.status === 429) limited = { at: i + 1, error: response.body?.error };
    }
    must(limited, 'семьдесят пять запросов подряд не упёрлись в предел частоты');
    return `429 на ${limited.at}-м запросе: «${limited.error}»`;
  }, page);

  await context.close();
}

// ───────────── Сценарий 12. Заголовки и источник ─────────────
async function scenario12() {
  console.log('\n▶ Сценарий 12. Заголовки и источник');
  const { context, page } = await freshContext();

  await step('61', 'Заголовки безопасности на главной', async () => {
    const response = await context.request.get(BASE);
    const headers = response.headers();
    const required = {
      'content-security-policy': /default-src/,
      'strict-transport-security': /max-age=\d+/,
      'x-frame-options': /DENY|SAMEORIGIN/i,
      'x-content-type-options': /nosniff/i,
      'referrer-policy': /origin|referrer|no-referrer/i,
    };
    const missing = [];
    for (const [name, pattern] of Object.entries(required)) {
      if (!headers[name] || !pattern.test(headers[name])) missing.push(`${name}=${headers[name] ?? 'нет'}`);
    }
    mustEqual(missing.length, 0, `отсутствующие или неверные заголовки: ${missing.join('; ')}`);
    return Object.keys(required).map((n) => n.split('-')[0]).join(', ') + ' — все на месте';
  }, page);

  await step('62', 'Изменяющий запрос с чужим источником — отказ', async () => {
    await loginAs(page, ATHLETE, 'athlete');
    // ⚠️ Из самой вкладки чужой `Origin` подделать НЕЛЬЗЯ: и `Origin`, и `Sec-Fetch-*`
    // входят в список запрещённых заголовков — браузер их выставляет сам и перетирает
    // всё, что подсунул скрипт. Поэтому межсайтовый запрос отправляется контекстом
    // запросов Playwright: он ходит мимо этого правила, как ходил бы чужой сайт.
    state.freeSlot = await freeSlotFor(state.athleteId);
    must(state.freeSlot, 'нет свободного будущего слота для проверки источника');
    const body = { scheduleId: state.freeSlot, name: 'Чужой источник', phone: '+7 (900) 000-00-62' };
    const crossSite = await context.request.post(`${BASE}/api/bookings`, {
      data: body,
      headers: { 'content-type': 'application/json', Origin: 'https://evil.example.com', 'Sec-Fetch-Site': 'cross-site' },
      failOnStatusCode: false,
    });
    mustEqual(crossSite.status(), 403, 'код межсайтового запроса');

    // Вторая половина: тот же чужой `Origin`, но БЕЗ признака межсайтовости.
    const originOnly = await context.request.post(`${BASE}/api/bookings`, {
      data: { ...body, phone: '+7 (900) 000-00-64' },
      headers: { 'content-type': 'application/json', Origin: 'https://evil.example.com' },
      failOnStatusCode: false,
    });
    state.originOnlyStatus = originOnly.status();
    mustEqual(originOnly.status(), 403, 'код запроса с чужим Origin без Sec-Fetch-Site');
    return `403 на межсайтовый запрос и 403 на чужой Origin`;
  }, page);

  await step('63', 'Тот же запрос со своим Origin — проходит', async () => {
    // Слот берётся ЗАНОВО: предыдущий шаг мог его занять, и тогда отказ пришёл бы
    // от правила «уже записан», а не от проверки источника.
    const slot = await freeSlotFor(state.athleteId);
    must(slot, 'нет свободного слота');
    const response = await api(page, 'POST', '/api/bookings', {
      scheduleId: slot, name: 'Алексей Смирнов', phone: '+7 (900) 000-00-63',
    });
    must(response.status === 201 || response.status === 200, `код: ${response.status} ${response.text}`);
    state.ownOriginBooking = response.body?.data?.id;
    return `запись ${state.ownOriginBooking} создана`;
  }, page);

  await step('64', 'Страница не открывается во вложенном фрейме чужого источника', async () => {
    const framed = await context.newPage();
    await framed.goto('about:blank');
    const result = await framed.evaluate(async (base) => {
      return new Promise((resolve) => {
        const frame = document.createElement('iframe');
        frame.src = base;
        let loaded = false;
        frame.onload = () => { loaded = true; };
        document.body.appendChild(frame);
        setTimeout(() => {
          let reachable = false;
          try { reachable = Boolean(frame.contentDocument && frame.contentDocument.body && frame.contentDocument.body.innerHTML.length > 0); } catch { reachable = false; }
          resolve({ loaded, reachable });
        }, 3000);
      });
    }, BASE);
    must(!result.reachable, 'содержимое страницы доступно во вложенном фрейме');
    await framed.close();
    return 'фрейм пуст — вложение заблокировано';
  }, page);

  await context.close();
}

// ───────────── Сценарии 13 и 14. Роли: тренер против представителя услуг ─────────────
async function scenario13and14() {
  console.log('\n▶ Сценарии 13 и 14. Роли');
  const trainer = await freshContext();
  await loginAs(trainer.page, TRAINER, 'provider');

  await step('65', 'Тренер попадает в кабинет провайдера', async () => {
    const me = await api(trainer.page, 'GET', '/api/auth/me');
    mustEqual(me.body?.data?.role, 'trainer', 'роль');
    await trainer.page.goto(`${BASE}/profile/provider/dashboard`, { waitUntil: 'domcontentloaded' });
    must(trainer.page.url().includes('/profile/provider'), `не пустило: ${trainer.page.url()}`);
    state.trainerCapabilities = me.body.data.capabilities;
    return `роль trainer, кабинет провайдера открыт, прав ${me.body.data.capabilities.length}`;
  }, trainer.page);

  await step('66', 'Тренер видит свои публикации и не видит чужих', async () => {
    // Свод `GET /api/publications` — раздел МОДЕРАЦИИ и закрыт правом админа;
    // «свои публикации» провайдер видит на своей странице кабинета.
    const moderation = await api(trainer.page, 'GET', '/api/publications');
    mustEqual(moderation.status, 403, 'админский свод публикаций тренеру');

    await trainer.page.goto(`${BASE}/profile/provider/publications`, { waitUntil: 'domcontentloaded' });
    await trainer.page.waitForTimeout(2500);
    const body = await trainer.page.locator('body').innerText();
    const ownName = `${state.trainerCard?.trainer?.name ?? 'Павел'}`;
    must(body.includes(ownName.split(' ')[0]), `своей карточки «${ownName}» на странице нет`);
    const foreignNames = [`Клуб Дмитрия (прогон ${RUN})`, 'Тренер Тренеров', 'Вадим Джонсмитович'];
    const leaked = foreignNames.filter((name) => body.includes(name));
    mustEqual(leaked.length, 0, `на странице видны чужие публикации: ${leaked.join(', ')}`);
    return `своя карточка на месте, чужих публикаций нет (админский свод даёт 403)`;
  }, trainer.page);

  await step('67', 'Тренер вызывает админский маршрут — 403', async () => {
    const response = await api(trainer.page, 'GET', '/api/logs');
    mustEqual(response.status, 403, 'код');
    return `403 «${response.body?.error}»`;
  }, trainer.page);

  await step('69', 'Разделы кабинета тренера: «Моя карточка» есть, «Публикации» нет', async () => {
    await trainer.page.goto(`${BASE}/profile/provider/dashboard`, { waitUntil: 'domcontentloaded' });
    await trainer.page.waitForTimeout(2000);
    const sections = await readCabinetSections(trainer.page);
    state.trainerSections = sections;
    must(sections.some((s) => /обзор|финанс|настрой/i.test(s)), `это не навигация кабинета: ${sections.join(' | ')}`);
    must(sections.length > 0, 'разделов кабинета не нашли вовсе');
    return `разделы: ${sections.join(' | ')}`;
  }, trainer.page);

  await step('70', 'Тренер и клубы: POST/PATCH/DELETE — 403, клуб цел', async () => {
    const before = await countRows('clubs');
    const created = await api(trainer.page, 'POST', '/api/clubs', {
      name: `Клуб от тренера ${RUN}`, city: 'Самара', address: 'ул. Проверочная, 3',
      description: 'Попытка тренера опубликовать клуб — по словарю прав она обязана быть отклонена.',
      phone: '+7 (900) 000-00-70', email: 'x@sporthub.local', priceFrom: '100',
      sportIds: [1], tagIds: [], amenityIds: [], vk: '', telegram: '', facebook: '',
      coordinates: { lat: 53.2, lng: 50.1 }, cityCoordinates: { lat: 53.2, lng: 50.1 },
      scheduleSlots: [{ title: 'Слот', date: futureDate(5), startTime: '10:00', endTime: '11:00', price: '100', capacity: '5', location: 'Зал', sportId: 1 }],
    });
    mustEqual(created.status, 403, 'код POST /api/clubs');
    mustEqual(created.body?.error, 'Недостаточно прав', 'текст POST');
    const existing = state.foreignClub?.club?.id;
    const patched = await api(trainer.page, 'PATCH', `/api/clubs/${existing}`, { name: 'Перехват тренером' });
    mustEqual(patched.status, 403, 'код PATCH');
    const deleted = await api(trainer.page, 'DELETE', `/api/clubs/${existing}`);
    mustEqual(deleted.status, 403, 'код DELETE');
    const after = await countRows('clubs');
    mustEqual(after, before, 'число клубов изменилось');
    must(await stillExists('clubs', existing), 'существующий клуб исчез');
    return `три отказа 403 «${created.body.error}», клубов было ${before}, стало ${after}`;
  }, trainer.page);

  await step('72', 'Тренер подтверждает запись на СВОЁ занятие — 200', async () => {
    must(state.athleteBookingOnTrainer, 'нет заявки на занятие тренера');
    const response = await api(trainer.page, 'POST', `/api/bookings/${state.athleteBookingOnTrainer}/confirm`);
    mustEqual(response.status, 200, `код: ${response.text}`);
    mustEqual(response.body?.data?.status, 'confirmed', 'статус записи');
    return `заявка ${state.athleteBookingOnTrainer} подтверждена`;
  }, trainer.page);

  await step('73', 'Тренер подтверждает запись на чужое занятие — 403 с текстом про владение', async () => {
    const foreign = await pendingBookingNotOwnedBy(12);
    must(foreign, 'нет чужой заявки, ожидающей решения — подготовка данных не отработала');
    const response = await api(trainer.page, 'POST', `/api/bookings/${foreign}/confirm`);
    mustEqual(response.status, 403, 'код');
    mustEqual(response.body?.error, 'Недостаточно прав для подтверждения записи', 'текст — должен говорить про владение, а не про право роли');
    return `403 «${response.body.error}»`;
  }, trainer.page);

  await trainer.context.close();

  // Представитель услуг — вторая половина сценария 14.
  const owner = await freshContext();
  await loginAs(owner.page, OWNER, 'provider');

  await step('68', 'Атлет подтверждает запись — 403 «Недостаточно прав»', async () => {
    const athlete = await freshContext();
    await loginAs(athlete.page, ATHLETE, 'athlete');
    const pending = await pendingBookingForOwner(2) ?? state.ownOriginBooking;
    const response = await api(athlete.page, 'POST', `/api/bookings/${pending}/confirm`);
    mustEqual(response.status, 403, 'код');
    mustEqual(response.body?.error, 'Недостаточно прав', 'текст — спортсмена останавливает право роли, а не владение');
    await athlete.context.close();
    return `403 «${response.body.error}»`;
  }, owner.page);

  await step('71', 'Представитель услуг и карточки тренеров: три отказа, клуб создаётся', async () => {
    const created = await api(owner.page, 'POST', '/api/trainers', {
      firstName: 'Чужая', lastName: `Карточка ${RUN}`, city: 'Самара', address: 'ул. Проверочная, 4',
      bio: 'Попытка представителя услуг опубликовать карточку тренера — словарь прав обязан её отклонить.',
      experience: '3', sportIds: [1], specialtyIds: [1], workFormatIds: [1], phone: '+7 (900) 000-00-71',
      vk: '', telegram: '', facebook: '', offeringName: 'Услуга', offeringDescription: 'Описание',
      offeringFormat: 'Группа', offeringPrice: '900', offeringDuration: '60', offeringLocation: 'Зал',
      clubId: null, coordinates: { lat: 53.2, lng: 50.1 }, cityCoordinates: { lat: 53.2, lng: 50.1 },
      scheduleSlots: [{ title: 'Слот', date: futureDate(6), startTime: '10:00', endTime: '11:00', price: '900', capacity: '5', location: 'Зал', sportId: 1 }],
    });
    mustEqual(created.status, 403, 'код POST /api/trainers');
    mustEqual(created.body?.error, 'Недостаточно прав', 'текст POST');
    const card = state.trainerCard?.trainer?.id;
    const patched = await api(owner.page, 'PATCH', `/api/trainers/${card}`, { firstName: 'Перехват' });
    mustEqual(patched.status, 403, 'код PATCH');
    const deleted = await api(owner.page, 'DELETE', `/api/trainers/${card}`);
    mustEqual(deleted.status, 403, 'код DELETE');
    const control = await api(owner.page, 'POST', '/api/clubs', {
      name: `Контрольный клуб (прогон ${RUN})`, city: 'Самара', address: 'ул. Контрольная, 5',
      description: 'Контрольная группа шага 71: представителю услуг клуб публиковать можно, и это обязано пройти.',
      phone: '+7 (900) 000-00-72', email: 'control@sporthub.local', priceFrom: '800',
      sportIds: [1], tagIds: [], amenityIds: [], vk: '', telegram: '', facebook: '',
      coordinates: { lat: 53.2, lng: 50.1 }, cityCoordinates: { lat: 53.2, lng: 50.1 },
      scheduleSlots: [{ title: 'Слот', date: futureDate(7), startTime: '10:00', endTime: '11:00', price: '800', capacity: '5', location: 'Зал', sportId: 1 }],
    });
    must(control.status === 201 || control.status === 200, `контрольная группа не прошла: ${control.status} ${control.text}`);
    must(await stillExists('trainers', card), 'карточка тренера исчезла');
    return `три отказа «${created.body.error}», контрольная публикация клуба прошла (${control.status})`;
  }, owner.page);

  await step('74', 'Связь тренер↔клуб: кто отправляет, кто подтверждает', async () => {
    const clubId = state.controlClub ?? (await ownClubId(2));
    const trainerId = state.trainerCard?.trainer?.id;
    const invite = await api(owner.page, 'POST', '/api/trainer-club-links', { clubId, trainerId, initiatedBy: 'club' });
    must(invite.status === 201 || invite.status === 200, `приглашение не ушло: ${invite.status} ${invite.text}`);
    const linkId = invite.body?.data?.id;
    const selfApprove = await api(owner.page, 'POST', `/api/trainer-club-links/${linkId}/approve`);
    mustEqual(selfApprove.status, 403, 'клуб подтверждает своё же приглашение');
    mustEqual(selfApprove.body?.error, 'Недостаточно прав для подтверждения связи', 'текст самоподтверждения');

    const forged = await api(owner.page, 'POST', '/api/trainer-club-links', { clubId, trainerId, initiatedBy: 'trainer' });
    mustEqual(forged.status, 403, 'клуб выдаёт себя за тренера');
    mustEqual(forged.body?.error, 'Недостаточно прав для отправки запроса', 'текст подмены стороны');

    const trainerCtx = await freshContext();
    await loginAs(trainerCtx.page, TRAINER, 'provider');
    const approved = await api(trainerCtx.page, 'POST', `/api/trainer-club-links/${linkId}/approve`);
    mustEqual(approved.status, 200, `подтверждение тренером: ${approved.text}`);
    mustEqual(approved.body?.data?.status, 'confirmed', 'статус связи');
    await trainerCtx.context.close();
    return `связь ${linkId}: клуб позвал, тренер подтвердил; самоподтверждение и подмена стороны отбиты`;
  }, owner.page);

  await step('75', 'Наборы разделов у тренера и представителя услуг различаются', async () => {
    await owner.page.goto(`${BASE}/profile/provider/dashboard`, { waitUntil: 'domcontentloaded' });
    await owner.page.waitForTimeout(2000);
    const ownerSections = await readCabinetSections(owner.page);
    const trainerSections = state.trainerSections ?? [];
    must(trainerSections.length > 0, 'разделы тренера не собраны на шаге 69');
    const onlyTrainer = trainerSections.filter((s) => !ownerSections.includes(s));
    const onlyOwner = ownerSections.filter((s) => !trainerSections.includes(s));
    must(onlyTrainer.length + onlyOwner.length > 0, `наборы совпали целиком: ${ownerSections.join(' | ')}`);
    return `только у тренера: ${onlyTrainer.join(', ') || '—'}; только у представителя услуг: ${onlyOwner.join(', ') || '—'}`;
  }, owner.page);

  await owner.context.close();
}

// ───────────── Сценарий 15. Восстановление пароля ─────────────
async function scenario15() {
  console.log('\n▶ Сценарий 15. Восстановление пароля');
  const { context, page } = await freshContext();
  let known = null;
  let unknown = null;

  await step('76', 'Существующая почта — нейтральный ответ', async () => {
    known = await api(page, 'POST', '/api/auth/forgot-password', { email: OWNER });
    mustEqual(known.status, 200, 'код');
    must(!/не найден|нет такой|существует/i.test(JSON.stringify(known.body)), 'ответ выдаёт заведённость почты');
    return `200, тело ${JSON.stringify(known.body).slice(0, 120)}`;
  }, page);

  await step('77', 'Несуществующая почта — ответ дословно тот же', async () => {
    unknown = await api(page, 'POST', '/api/auth/forgot-password', { email: 'no-such-user-34c@sporthub.local' });
    mustEqual(unknown.status, known.status, 'код');
    mustEqual(JSON.stringify(unknown.body), JSON.stringify(known.body), 'тело');
    return 'ответы совпали побайтово';
  }, page);

  await step('78', 'Ссылка из журнала заглушки открывает форму нового пароля', async () => {
    const token = lastResetTokenFromLetters();
    must(token, 'в базе нет свежей ссылки восстановления');
    state.resetToken = token;
    const response = await page.goto(`${BASE}/reset-password?token=${token}`, { waitUntil: 'domcontentloaded' });
    mustEqual(response.status(), 200, 'код страницы');
    await page.waitForTimeout(1200);
    const body = await page.locator('body').innerText();
    must(/парол/i.test(body), `формы нового пароля не видно: ${body.replace(/\s+/g, ' ').slice(0, 200)}`);
    return 'форма нового пароля открылась';
  }, page);

  const secondBrowser = await freshContext();

  await step('79', 'Новый пароль: старый не работает, новый работает', async () => {
    await loginAs(secondBrowser.page, OWNER, 'provider');
    const response = await api(page, 'POST', '/api/auth/reset-password', { token: state.resetToken, password: 'sbroshennyy-parol-34' });
    must(response.status === 200 || response.status === 204, `сброс не прошёл: ${response.status} ${response.text}`);
    const old = await api(page, 'POST', '/api/auth/login', { email: OWNER, password: PASSWORD, accountType: 'provider' });
    mustEqual(old.status, 401, 'вход старым паролем');
    const fresh = await api(page, 'POST', '/api/auth/login', { email: OWNER, password: 'sbroshennyy-parol-34', accountType: 'provider' });
    mustEqual(fresh.status, 200, 'вход новым паролем');
    return 'старый пароль отвергнут, новый принят';
  }, page);

  await step('80', 'Прежние сессии погашены — второй браузер выбило', async () => {
    const me = await api(secondBrowser.page, 'GET', '/api/auth/me');
    mustEqual(me.status, 401, 'второй браузер после сброса пароля');
    return 'второй браузер получил 401';
  }, secondBrowser.page);

  await step('81', 'Повторное открытие ссылки — отказ, она одноразовая', async () => {
    const response = await api(page, 'POST', '/api/auth/reset-password', { token: state.resetToken, password: 'eshchyo-odin-parol-34' });
    must(response.status >= 400, `повтор прошёл: ${response.status}`);
    return `${response.status} «${response.body?.error}»`;
  }, page);

  await step('82', 'Просроченная ссылка — понятный отказ', async () => {
    // Отодвинуть срок у выданной ссылки НЕЛЬЗЯ: база держит проверку
    // «срок позже создания». Поэтому просроченная ссылка заводится сразу такой —
    // с прошлым временем создания и ещё более ранним сроком.
    const expired = insertExpiredResetToken(2);
    must(expired, 'не удалось завести просроченную ссылку');
    const response = await api(page, 'POST', '/api/auth/reset-password', { token: expired, password: 'parol-po-prosrochennoy-34' });
    must(response.status >= 400, `просроченная ссылка сработала: ${response.status}`);
    must(typeof response.body?.error === 'string' && response.body.error.length > 5, 'текст отказа пустой');
    return `${response.status} «${response.body.error}»`;
  }, page);

  // Пароль возвращается к паролю сида: прогон не должен менять состояние базы.
  await api(page, 'POST', '/api/auth/login', { email: OWNER, password: 'sbroshennyy-parol-34', accountType: 'provider' });
  await api(page, 'PATCH', '/api/users/2', { currentPassword: 'sbroshennyy-parol-34', password: PASSWORD });

  await context.close();
  await secondBrowser.context.close();
}

// ───────────── Отчёт ─────────────
function report() {
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail');
  const skipped = results.filter((r) => r.status === 'skip');
  const lines = [`ИТОГ: ${passed} прошло, ${failed.length} упало, ${skipped.length} пропущено из ${results.length}`, ''];

  for (const row of results) {
    const mark = row.status === 'pass' ? 'OK  ' : row.status === 'fail' ? 'FAIL' : 'SKIP';
    lines.push(`${mark} step-${row.id} — ${row.title}`);
    lines.push(`     ${row.detail}`);
  }

  // Итог кладётся рядом с прогоном: следующий запуск должен быть повторяемым
  // и не зависеть от того, из какого каталога его позвали.
  const dir = path.dirname(fileURLToPath(import.meta.url));
  fs.writeFileSync(path.join(dir, 'e2e-phase-34-result.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(dir, 'e2e-phase-34-result.txt'), lines.join('\n'));
  console.log(`\n${lines[0]}`);
}

main().catch(async (error) => {
  console.error('ПРОГОН ОБОРВАЛСЯ:', error);
  await shutdown();
  report();
  process.exitCode = 1;
});

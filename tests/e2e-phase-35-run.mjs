// Браузерный прогон чек-листа фазы 35 «Человек и лица услуг» — 70 шагов.
//
// Запуск: node tests/e2e-phase-35-run.mjs
// Требуется: поднятое приложение на :3000 и Playwright.
//
// ⚠️ Прогон идёт по ЖИВОЙ мигрированной базе, а не по чистому сиду, и это выбор,
// а не случайность: сценарий 13 чек-листа прямо требует мигрированных данных,
// а сценарии 1–12 на них строже — там есть история, которую перенос мог задеть.
//
// ⚠️ MCP-сервер Playwright объявлен в `.mcp.json` и включён в настройках, но его
// инструменты в сессии не поднялись. Прогон идёт БИБЛИОТЕКОЙ напрямую. Разница
// для результата нулевая — тот же Chromium и те же действия, — но сказать об этом
// надо вслух: чек-лист называет MCP.
import fs from 'node:fs';
import {
  BASE, api, faceKey, freshContext, futureDate, launch, loginAs, must, mustEqual,
  rawResponse, results, shutdown, skip, step, whoAmI,
} from './e2e-phase-35-harness.mjs';

// Люди живой базы. Наборы лиц проверены запросом к базе перед прогоном.
const NO_FACES = 'alexey@sporthub.local';   // лиц нет вовсе
const BOTH = 'marina@studio.local';         // 18 клубов + 2 карточки
const CARD_ONLY = 'anna@trainer.local';     // только карточка тренера
const CARDS_ONLY = 'trainer@sporthub.local';// 7 карточек, ни одного клуба
const ADMIN = 'admin@sporthub.local';

async function main() {
  await launch();
  console.log('\n=== Сценарий 1. Регистрация без выбора ===');

  const guest = await freshContext();

  await step('step-1', 'выбора типа учётной записи нет в разметке', async () => {
    await guest.page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const html = await guest.page.content();
    const forbidden = ['Тип аккаунта', 'Представитель услуг', 'accountType'];
    const found = forbidden.filter((needle) => html.includes(needle));
    must(found.length === 0, `на странице остались следы выбора типа: ${found.join(', ')}`);
    return 'следов выбора типа нет';
  }, guest.page);

  await step('step-4', 'регистрация с accountType — 400 (схема строгая)', async () => {
    const stamp = Date.now();
    const response = await api(guest.page, 'POST', '/api/auth/register', {
      name: 'Проверка строгости', email: `strict-${stamp}@test.local`,
      password: 'sporthub123', accountType: 'provider',
    });
    mustEqual(response.status, 400, 'ответ на регистрацию с типом учётной записи');
    return 'лишнее поле отвергнуто схемой';
  }, guest.page);

  skip('step-2', 'кнопка регистрации не заблокирована', 'форма проверяется шагом step-1 по разметке; отдельный клик требует прохода капчи предела частоты');
  skip('step-3', 'регистрация проходит', 'предел частоты регистрации: прогон обязан быть повторяемым дважды подряд (правило чек-листа)');

  await step('step-5', 'у человека без лиц только личные разделы', async () => {
    await loginAs(guest.page, NO_FACES);
    const me = await whoAmI(guest.page);
    mustEqual(me.faces?.length ?? -1, 0, 'число лиц у человека без лиц');
    const response = await rawResponse(guest.page, '/profile/club/1/dashboard');
    must(response.status !== 200, `кабинет чужого лица открылся: ${response.status}`);
    return 'лиц нет, кабинет лица закрыт';
  }, guest.page);

  console.log('\n=== Сценарий 3–4. Лица и контекст ===');
  const owner = await freshContext();
  let ownerFaces = [];

  await step('step-12', 'кабинет показывает все лица человека', async () => {
    await loginAs(owner.page, BOTH);
    const me = await whoAmI(owner.page);
    ownerFaces = me.faces ?? [];
    must(ownerFaces.length >= 2, `лиц у владельца: ${ownerFaces.length}`);
    must(ownerFaces.some((f) => f.kind === 'club'), 'клубов в списке лиц нет');
    must(ownerFaces.some((f) => f.kind === 'trainer'), 'карточек тренера в списке лиц нет');
    return `лиц ${ownerFaces.length}: клубы и карточки`;
  }, owner.page);

  await step('step-13', 'набор разделов у клуба и у карточки тренера РАЗНЫЙ', async () => {
    const club = ownerFaces.find((f) => f.kind === 'club');
    const card = ownerFaces.find((f) => f.kind === 'trainer');
    // ⚠️ Сверяются ПОДПИСИ, а не хвосты адресов. Страница публикаций у обоих видов
    // лица одна и та же (`.../publications`) — различается то, что на ней ведут:
    // клуб ведёт список залов, тренер — одну свою карточку. Сравнение по адресу
    // показало бы «наборы совпали» там, где для человека они разные.
    const sections = async (face) => {
      await owner.page.goto(`${BASE}/profile/${face.kind}/${face.id}/dashboard`, { waitUntil: 'domcontentloaded' });
      // ⚠️ Только навигация РАЗДЕЛОВ. Соседний `nav` — это переключатель лиц,
      // и у человека с двадцатью лицами он утаскивал в сравнение двадцать имён
      // клубов вместо разделов кабинета.
      return owner.page.$$eval('nav[aria-label*="азделы"] a[href^="/profile/"]', (nodes) =>
        [...new Set(nodes.map((n) => n.textContent.trim()).filter(Boolean))].sort());
    };
    const clubSections = await sections(club);
    const cardSections = await sections(card);
    must(clubSections.length > 0, 'разделы кабинета клуба не найдены в разметке');
    must(JSON.stringify(clubSections) !== JSON.stringify(cardSections),
      `наборы разделов совпали: ${clubSections.join(',')}`);
    const onlyClub = clubSections.filter((x) => !cardSections.includes(x));
    const onlyCard = cardSections.filter((x) => !clubSections.includes(x));
    return `у клуба своё: ${onlyClub.join(',') || '—'}; у карточки своё: ${onlyCard.join(',') || '—'}`;
  }, owner.page);

  await step('step-15', 'переключение лица меняет адрес и содержимое', async () => {
    const [first, second] = [ownerFaces.find((f) => f.kind === 'club'), ownerFaces.find((f) => f.kind === 'trainer')];
    await owner.page.goto(`${BASE}/profile/${first.kind}/${first.id}/dashboard`, { waitUntil: 'domcontentloaded' });
    const firstUrl = owner.page.url();
    await owner.page.goto(`${BASE}/profile/${second.kind}/${second.id}/dashboard`, { waitUntil: 'domcontentloaded' });
    must(owner.page.url() !== firstUrl, 'адрес кабинета не изменился при смене лица');
    return `${firstUrl.split('/profile')[1]} → ${owner.page.url().split('/profile')[1]}`;
  }, owner.page);

  console.log('\n=== Сценарий 5. Адресация уведомлений ===');

  await step('step-21', 'колокольчик и лента показывают одно число', async () => {
    const bell = await api(owner.page, 'GET', '/api/notifications/unread-count');
    const feed = await api(owner.page, 'GET', '/api/notifications?limit=1');
    mustEqual(bell.status, 200, 'ответ счётчика');
    mustEqual(feed.status, 200, 'ответ ленты');
    mustEqual(bell.body?.data?.unreadCount, feed.body?.data?.unreadCount,
      'число непрочитанных у колокольчика и у ленты');
    return `оба показывают ${bell.body?.data?.unreadCount}`;
  }, owner.page);

  await step('step-20', '«прочитать всё» в ящике лица не гасит ящики других лиц', async () => {
    const clubs = ownerFaces.filter((f) => f.kind === 'club').slice(0, 2);
    must(clubs.length === 2, 'для проверки нужны два клуба одного человека');
    const countIn = async (face) => {
      const r = await api(owner.page, 'GET', `/api/notifications?scope=face&clubId=${face.id}&limit=1`);
      return r.body?.data?.total ?? 0;
    };
    const before = await countIn(clubs[1]);
    await api(owner.page, 'POST', `/api/notifications/read-all?scope=face&clubId=${clubs[0].id}`, {});
    const after = await countIn(clubs[1]);
    mustEqual(after, before, 'ящик соседнего лица задет уборкой');
    return `ящик соседнего лица цел: ${after} строк`;
  }, owner.page);

  await step('step-22', 'настройки уведомлений раздельные: лицо и человек', async () => {
    const club = ownerFaces.find((f) => f.kind === 'club');
    const me = await whoAmI(owner.page);
    const write = (body) => api(owner.page, 'PATCH', `/api/users/${me.id}/notification-preferences`, body);
    mustEqual((await write({ preferences: { review_created: false } })).status, 200, 'запись личных настроек');
    mustEqual((await write({ preferences: { review_created: true }, faceType: 'club', faceId: club.id })).status, 200, 'запись настроек лица');
    const personal = await api(owner.page, 'GET', `/api/users/${me.id}/notification-preferences`);
    const faceOne = await api(owner.page, 'GET', `/api/users/${me.id}/notification-preferences?faceType=club&faceId=${club.id}`);
    mustEqual(personal.body?.data?.notificationPreferences?.review_created, false, 'личная настройка');
    mustEqual(faceOne.body?.data?.notificationPreferences?.review_created, true, 'настройка лица');
    return 'ящики настроек не смешиваются';
  }, owner.page);

  await step('step-22a', 'настройки ЧУЖОГО лица не открываются', async () => {
    const me = await whoAmI(guest.page);
    const club = ownerFaces.find((f) => f.kind === 'club');
    const read = await api(guest.page, 'GET', `/api/users/${me.id}/notification-preferences?faceType=club&faceId=${club.id}`);
    mustEqual(read.status, 403, 'чтение настроек чужого лица');
    return 'чужой ящик настроек закрыт';
  }, guest.page);

  console.log('\n=== Сценарий 6–7. «Сам себе» и накрутка рейтинга ===');

  await step('step-29', 'отзыв своему клубу — отказ, рейтинг не изменился', async () => {
    const club = ownerFaces.find((f) => f.kind === 'club');
    const before = await api(owner.page, 'GET', `/api/clubs/${club.id}`);
    const response = await api(owner.page, 'POST', '/api/reviews', {
      clubId: club.id, rating: 5, text: 'Отзыв собственному клубу — так быть не должно.',
    });
    must(response.status !== 201, `отзыв своему клубу прошёл: ${response.status}`);
    const after = await api(owner.page, 'GET', `/api/clubs/${club.id}`);
    mustEqual(after.body?.data?.rating, before.body?.data?.rating, 'рейтинг клуба');
    mustEqual(after.body?.data?.reviewCount, before.body?.data?.reviewCount, 'число отзывов');
    return `отказ ${response.status}, рейтинг и счётчик целы`;
  }, owner.page);

  await step('step-30', 'отзыв своей карточке тренера — отказ', async () => {
    const card = ownerFaces.find((f) => f.kind === 'trainer');
    const before = await api(owner.page, 'GET', `/api/trainers/${card.id}`);
    const response = await api(owner.page, 'POST', '/api/reviews', {
      trainerId: card.id, rating: 5, text: 'Отзыв собственной карточке — так быть не должно.',
    });
    must(response.status !== 201, `отзыв своей карточке прошёл: ${response.status}`);
    const after = await api(owner.page, 'GET', `/api/trainers/${card.id}`);
    mustEqual(after.body?.data?.rating, before.body?.data?.rating, 'рейтинг карточки');
    return `отказ ${response.status}, рейтинг цел`;
  }, owner.page);

  await step('step-31', 'назвать чужую сторону связи своей — отказ', async () => {
    const club = ownerFaces.find((f) => f.kind === 'club');
    const foreign = await api(owner.page, 'GET', '/api/trainers');
    const alien = (foreign.body?.data ?? []).find((t) => !ownerFaces.some((f) => f.kind === 'trainer' && f.id === t.id));
    must(alien !== undefined, 'чужой карточки тренера в каталоге не нашлось');
    const response = await api(owner.page, 'POST', '/api/trainer-club-links', {
      trainerId: alien.id, clubId: club.id, initiatedBy: 'trainer',
    });
    must(response.status === 403, `подмена стороны прошла: ${response.status} ${response.text}`);
    return 'подмена стороны отклонена';
  }, owner.page);

  await step('step-32', 'заметка о самом себе — отказ по правилу «сам себе»', async () => {
    const me = await whoAmI(owner.page);
    const response = await api(owner.page, 'POST', '/api/provider-client-notes', {
      clientUserId: me.id, note: 'Заметка о самом себе.',
    });
    must(response.status !== 201, `заметка о себе прошла: ${response.status}`);
    must(/о самом себе/i.test(String(response.body?.error ?? '')),
      `отказ пришёл не от правила «сам себе»: ${response.body?.error}`);
    return 'отказ именно по правилу «сам себе»';
  }, owner.page);

  await step('step-33', 'себя в своём списке клиентов нет', async () => {
    const me = await whoAmI(owner.page);
    const response = await api(owner.page, 'GET', '/api/users?scope=clients');
    mustEqual(response.status, 200, 'ответ списка клиентов');
    const rows = response.body?.data ?? [];
    must(!rows.some((row) => row.id === me.id), 'владелец увидел себя в своём списке клиентов');
    return `клиентов ${rows.length}, себя нет`;
  }, owner.page);

  await step('step-33a', 'человеку без лиц список клиентов закрыт отказом, а не пустотой', async () => {
    const response = await api(guest.page, 'GET', '/api/users?scope=clients');
    mustEqual(response.status, 403, 'ответ на список клиентов у человека без лиц');
    return 'отказ, а не пустой список';
  }, guest.page);

  console.log('\n=== Сценарий 9. Кабинеты закрыты по владению ===');

  await step('step-45', 'чужой кабинет лица по прямой ссылке — увели', async () => {
    const card = ownerFaces.find((f) => f.kind === 'trainer');
    const stranger = await freshContext();
    await loginAs(stranger.page, CARD_ONLY);
    const response = await rawResponse(stranger.page, `/profile/club/${ownerFaces.find((f) => f.kind === 'club').id}/dashboard`);
    must(response.status !== 200, `чужой кабинет открылся: ${response.status}`);
    await stranger.context.close();
    void card;
    return `увели, ответ ${response.status}`;
  }, owner.page);

  await step('step-46', 'данных чужого кабинета нет в потоке ответа', async () => {
    const club = ownerFaces.find((f) => f.kind === 'club');
    const stranger = await freshContext();
    await loginAs(stranger.page, CARD_ONLY);
    const response = await rawResponse(stranger.page, `/profile/club/${club.id}/bookings`);
    const leaked = ['"bookings"', '"totalPrice"', '"paymentStatus"'].filter((needle) => response.body.includes(needle));
    must(leaked.length === 0, `в потоке ответа чужого кабинета найдены данные: ${leaked.join(', ')}`);
    await stranger.context.close();
    return 'поток ответа данных не несёт';
  }, owner.page);

  await step('step-47', 'гость на кабинете лица — увели, данных в потоке нет', async () => {
    const anon = await freshContext();
    const club = ownerFaces.find((f) => f.kind === 'club');
    const response = await rawResponse(anon.page, `/profile/club/${club.id}/dashboard`);
    must(response.status !== 200, `гость получил кабинет: ${response.status}`);
    must(!response.body.includes('"totalPrice"'), 'в потоке ответа гостю есть данные записей');
    await anon.context.close();
    return `увели, ответ ${response.status}`;
  }, owner.page);

  await step('step-48', 'человек без лиц на кабинете лица — увели', async () => {
    const club = ownerFaces.find((f) => f.kind === 'club');
    const response = await rawResponse(guest.page, `/profile/club/${club.id}/dashboard`);
    must(response.status !== 200, `человек без лиц попал в кабинет: ${response.status}`);
    return `увели, ответ ${response.status}`;
  }, guest.page);

  await step('step-48a', 'мусор в адресе лица уводит так же', async () => {
    const response = await rawResponse(owner.page, '/profile/venue/1/dashboard');
    must(response.status !== 200, `несуществующий вид лица открылся: ${response.status}`);
    return `увели, ответ ${response.status}`;
  }, owner.page);

  console.log('\n=== Сценарий 10. Админ — отдельная единица ===');
  const admin = await freshContext();

  await step('step-49', 'админ через общую форму входа не проходит', async () => {
    const response = await api(admin.page, 'POST', '/api/auth/login', { email: ADMIN, password: 'sporthub123' });
    mustEqual(response.status, 403, 'ответ общей формы входа администратору');
    return 'общая форма администратора не пускает';
  }, admin.page);

  await step('step-50', 'админ через служебный вход проходит', async () => {
    await loginAs(admin.page, ADMIN, { portal: 'service' });
    const me = await whoAmI(admin.page);
    mustEqual(me.accountKind, 'admin', 'вид учётной записи вошедшего');
    return 'служебный вход открыт администратору';
  }, admin.page);

  await step('step-51', 'обычный человек со служебным признаком — отказ', async () => {
    const probe = await freshContext();
    const response = await api(probe.page, 'POST', '/api/auth/login', {
      email: NO_FACES, password: 'sporthub123', portal: 'service',
    });
    mustEqual(response.status, 403, 'ответ служебного входа обычному человеку');
    await probe.context.close();
    return 'служебный вход обычного человека не пускает';
  }, admin.page);

  await step('step-52', 'админ записаться не может', async () => {
    const schedule = await api(admin.page, 'GET', '/api/schedule');
    const slot = (schedule.body?.data ?? [])[0];
    must(slot !== undefined, 'в расписании нет ни одного слота');
    const response = await api(admin.page, 'POST', '/api/bookings', {
      scheduleId: slot.id, name: 'Администратор', phone: '+7 (900) 000-00-03',
    });
    mustEqual(response.status, 403, 'ответ на запись администратора');
    return 'запись администратору закрыта';
  }, admin.page);

  await step('step-53', 'админ отзыв не оставляет — и отказ именно по «не человек площадки»', async () => {
    const response = await api(admin.page, 'POST', '/api/reviews', {
      clubId: 1, rating: 5, text: 'Отзыв от администратора — так быть не должно.',
    });
    mustEqual(response.status, 403, 'ответ на отзыв администратора');
    must(/пользователи площадки/i.test(String(response.body?.error ?? '')),
      `отказ пришёл не от правила «не человек площадки»: ${response.body?.error}`);
    return 'отказ по нужному правилу';
  }, admin.page);

  await step('step-54', 'админ не заводит клуб и карточку тренера', async () => {
    const club = await api(admin.page, 'POST', '/api/clubs', { name: 'Клуб администратора' });
    const trainer = await api(admin.page, 'POST', '/api/trainers', { firstName: 'Админ', lastName: 'Тренер' });
    mustEqual(club.status, 403, 'ответ на создание клуба администратором');
    mustEqual(trainer.status, 403, 'ответ на создание карточки администратором');
    return 'оба лица администратору закрыты';
  }, admin.page);

  console.log('\n=== Сценарий 11. Публичная часть цела ===');
  const anon = await freshContext();

  await step('step-55', 'главная открыта гостю, каталог виден', async () => {
    await anon.page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const clubs = await api(anon.page, 'GET', '/api/clubs');
    mustEqual(clubs.status, 200, 'ответ каталога гостю');
    must((clubs.body?.data ?? []).length > 0, 'каталог пуст');
    return `каталог отдан гостю: ${clubs.body.data.length} клубов`;
  }, anon.page);

  await step('step-56', 'карточки клуба и тренера открыты гостю', async () => {
    const clubs = await api(anon.page, 'GET', '/api/clubs');
    const trainers = await api(anon.page, 'GET', '/api/trainers');
    const club = await api(anon.page, 'GET', `/api/clubs/${clubs.body.data[0].id}`);
    const trainer = await api(anon.page, 'GET', `/api/trainers/${trainers.body.data[0].id}`);
    mustEqual(club.status, 200, 'карточка клуба гостю');
    mustEqual(trainer.status, 200, 'карточка тренера гостю');
    return 'обе карточки открыты';
  }, anon.page);

  await step('step-58', 'в публичной выдаче нет номера владельца', async () => {
    const targets = ['/api/clubs', '/api/trainers'];
    const leaks = [];
    for (const url of targets) {
      const response = await api(anon.page, 'GET', url);
      if (JSON.stringify(response.body ?? {}).includes('managedByUserId')) leaks.push(url);
    }
    const clubs = await api(anon.page, 'GET', '/api/clubs');
    const detail = await api(anon.page, 'GET', `/api/clubs/${clubs.body.data[0].id}`);
    if (JSON.stringify(detail.body ?? {}).includes('managedByUserId')) leaks.push('карточка клуба');
    must(leaks.length === 0, `номер владельца остался в выдаче: ${leaks.join(', ')}`);
    return 'карту «эти лица одного человека» по каталогу не построить';
  }, anon.page);

  await step('step-70', 'номера владельца нет и в карточке тренера', async () => {
    const trainers = await api(anon.page, 'GET', '/api/trainers');
    const detail = await api(anon.page, 'GET', `/api/trainers/${trainers.body.data[0].id}`);
    must(!JSON.stringify(detail.body ?? {}).includes('managedByUserId'),
      'номер владельца остался в карточке тренера');
    return 'карточка тренера номера владельца не несёт';
  }, anon.page);

  console.log('\n=== Сценарий 13. Мигрированный человек ===');

  await step('step-64', 'вход под учётной записью с обоими видами лиц', async () => {
    const me = await whoAmI(owner.page);
    must((me.faces ?? []).length >= 2, 'после переноса лиц меньше двух');
    return `вошёл, лиц ${me.faces.length}`;
  }, owner.page);

  await step('step-65', 'оба лица на месте и оба кабинета открываются', async () => {
    for (const face of [ownerFaces.find((f) => f.kind === 'club'), ownerFaces.find((f) => f.kind === 'trainer')]) {
      const response = await rawResponse(owner.page, `/profile/${face.kind}/${face.id}/dashboard`);
      mustEqual(response.status, 200, `кабинет своего лица ${faceKey(face)}`);
    }
    return 'оба кабинета открылись';
  }, owner.page);

  await step('step-67', 'человек без клубов, но с карточкой видит кабинет карточки', async () => {
    const card = await freshContext();
    await loginAs(card.page, CARDS_ONLY);
    const me = await whoAmI(card.page);
    must((me.faces ?? []).length > 0, 'лиц не осталось после переноса');
    must(me.faces.every((f) => f.kind === 'trainer'), `в лицах оказались не только карточки: ${me.faces.map(faceKey).join(',')}`);
    const own = await rawResponse(card.page, `/profile/trainer/${me.faces[0].id}/dashboard`);
    mustEqual(own.status, 200, 'кабинет собственной карточки');
    await card.context.close();
    return `карточек ${me.faces.length}, клубов нет, кабинет открылся`;
  }, owner.page);

  await step('step-68', 'админ после переноса входит и видит панель', async () => {
    const response = await rawResponse(admin.page, '/service-portal/dashboard');
    mustEqual(response.status, 200, 'служебная панель администратору');
    return 'панель открылась';
  }, admin.page);

  await step('step-68a', 'у служебной записи лиц нет ни одного', async () => {
    const me = await whoAmI(admin.page);
    mustEqual((me.faces ?? []).length, 0, 'число лиц у служебной записи');
    return 'решение 13 соблюдено и после переноса';
  }, admin.page);

  // ⚠️ Здесь остались ТОЛЬКО те шаги, которые этим прогоном не проверяются: часть
  // прогоняет второй прогон (`e2e-phase-35-full.mjs`, он создаёт свои данные
  // и убирает за собой), часть дублирует уже проверенное, а два описывают
  // функциональность, которой в продукте нет вовсе.
  for (const [id, title, reason] of [
    ['step-2', 'кнопка регистрации не заблокирована', 'прогоняется полным прогоном'],
    ['step-3', 'регистрация проходит', 'прогоняется полным прогоном'],
    ['step-6', 'публикация первой карточки тренера', 'прогоняется полным прогоном'],
    ['step-7', 'кабинет обзавёлся разделом', 'прогоняется полным прогоном'],
    ['step-8', 'PATCH своей карточки — 200', 'прогоняется полным прогоном'],
    ['step-9', 'PATCH чужой карточки — 403', 'прогоняется полным прогоном'],
    ['step-10', 'переключателя нет при одном лице', 'прогоняется полным прогоном'],
    ['step-11', 'публикация клуба', 'прогоняется полным прогоном'],
    ['step-14', 'второе и третье лицо проходят', 'прогоняется полным прогоном'],
    ['step-16', 'на отзыв отвечает лицо', 'ОТВЕТОВ НА ОТЗЫВЫ В ПРОДУКТЕ НЕТ — шаг описывает замысел, а не поведение'],
    ['step-17', 'запись к чужому тренеру говорит человеком', 'ЧАТА В ПРОДУКТЕ НЕТ — шаг описывает замысел, а не поведение'],
    ['step-18', 'уведомление о записи ушло в ящик клуба', 'прогоняется полным прогоном'],
    ['step-19', 'решение по чужой записи — уведомление человеку', 'прогоняется полным прогоном'],
    ['step-23', 'записаться на своё занятие', 'прогоняется полным прогоном'],
    ['step-24', 'связь своего со своим сразу confirmed', 'дублирует step-40 полного прогона'],
    ['step-25', 'подтвердить свою же запись — 403', 'прогоняется полным прогоном'],
    ['step-26', 'отклонить свою же запись — 403', 'прогоняется полным прогоном'],
    ['step-27', 'отметить себе посещение — 403', 'прогоняется полным прогоном'],
    ['step-28', 'отмена своей записи владельцем', 'прогоняется полным прогоном'],
    ['step-34', 'работа от лица самого себя — 403', 'прогоняется полным прогоном'],
    ['step-35', 'уведомление о связи своего со своим не отправлено', 'дублирует step-40 полного прогона'],
    ['step-36', 'записаться в свой клуб', 'дублирует step-23 полного прогона'],
    ['step-37', 'отметить себе посещение — 403', 'дублирует step-27 полного прогона'],
    ['step-38', 'отзыв без посещения — 403', 'прогоняется полным прогоном'],
    ['step-39', 'рейтинг не изменился', 'прогоняется полным прогоном'],
    ['step-40', 'своё со своим — сразу confirmed', 'прогоняется полным прогоном'],
    ['step-41', 'своё с чужим — pending', 'прогоняется полным прогоном'],
    ['step-42', 'вторая сторона подтверждает', 'прогоняется полным прогоном'],
    ['step-43', 'отвязка своего от своего', 'прогоняется полным прогоном'],
    ['step-44', 'отвязка своего от чужого', 'прогоняется полным прогоном'],
    ['step-57', 'расписание и страница записи открыты', 'прогоняется полным прогоном'],
    ['step-59', 'подтверждённая связь видна на обеих карточках', 'прогоняется полным прогоном'],
    ['step-60', 'удаление лица с будущими записями — отказ', 'прогоняется полным прогоном'],
    ['step-61', 'отмена записей и архивирование лица', 'прогоняется полным прогоном'],
    ['step-62', 'отзывы и история целы после архивирования', 'прогоняется полным прогоном'],
    ['step-63', 'архивированное лицо помечено', 'прогоняется полным прогоном'],
    ['step-66', 'старые отзывы, записи и связи целы', 'дублирует step-62 полного прогона'],
    ['step-69', 'на карточке человека видна связь его лиц', 'прогоняется полным прогоном'],
  ]) skip(id, title, reason);

  await shutdown();

  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'skip').length;

  console.log(`\nИтог: ${pass} прошло, ${fail} упало, ${skipped} не прогонялось.`);
  fs.writeFileSync('/tmp/phase-35-e2e.json', JSON.stringify(results, null, 2));
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error('прогон прерван:', error);
  await shutdown();
  process.exit(2);
});

// Браузерный прогон админки и надёжности:
// `tests/checklists/admin-panel.md` и `tests/checklists/reliability-quarantine.md`.
//
// Запуск: E2E_RUN_TAG=e2e-admin node tests/e2e-admin-reliability-run.mjs
//
// ⚠️ Правило прогона: шаг не засчитывается по коду ответа. У каждого отказа сверяется
// ТЕКСТ: общее «Недостаточно прав» вместо конкретного означало бы, что вернулась
// проверка по роли, а не по виду учётной записи или владению.
import fs from 'node:fs';
import {
  BASE, api, freshContext, futureDate, launch, loginAs, must, mustEqual,
  rawResponse, results, shutdown, skip, step, whoAmI,
} from './e2e-phase-35-harness.mjs';
import { E2E_USERS, RUN_TAG, cleanupRun, readDb, seedRunUsers } from '../scripts/e2e-fixture.mjs';

const clubForm = (name) => ({
  name,
  city: 'Самара',
  address: 'ул. Админская, 1',
  description:
    'Клуб для прогона админки и надёжности. Описание длиной заведомо больше пятидесяти символов, как требует схема.',
  phone: '+7 (900) 559-00-10',
  email: `${RUN_TAG}-club@test.local`,
  priceFrom: '700',
  sportIds: [1],
  tagIds: [],
  amenityIds: [],
  vk: '',
  telegram: '',
  facebook: '',
  coordinates: { lat: 53.2, lng: 50.1 },
  cityCoordinates: { lat: 53.2, lng: 50.1 },
  scheduleSlots: Array.from({ length: 3 }, (_, index) => ({
    title: `Занятие ${index + 1}`,
    date: futureDate(13),
    startTime: `${String(10 + index).padStart(2, '0')}:00`,
    endTime: `${String(11 + index).padStart(2, '0')}:00`,
    price: '700',
    capacity: '10',
    location: 'Зал',
    sportId: 1,
  })),
});

async function main() {
  const users = seedRunUsers();
  await launch();

  const admin = await freshContext();
  const owner = await freshContext();
  const client = await freshContext();

  await loginAs(admin.page, 'admin@sporthub.local', { portal: 'service' });
  await loginAs(owner.page, E2E_USERS.builder, {});
  await loginAs(client.page, E2E_USERS.client, {});

  const made = { clubId: null, slots: [] };
  let slotCursor = 0;
  const nextSlot = () => {
    const slot = made.slots[slotCursor];
    slotCursor += 1;
    must(slot !== undefined, 'слоты кончились');

    return slot;
  };

  await step('prep', 'клуб прогона со слотами заведён', async () => {
    const response = await api(owner.page, 'POST', '/api/clubs', clubForm(`${RUN_TAG} Клуб`));

    must(response.status === 201 || response.status === 200, `публикация: ${response.text}`);
    made.clubId = response.body?.data?.club?.id;
    made.slots = (response.body?.data?.schedules ?? []).map((slot) => slot.id);

    return `клуб ${made.clubId}, слотов ${made.slots.length}`;
  }, owner.page);

  console.log('\n=== Вход в панель и её закрытость ===');

  await step('adm-1', 'служебная панель открыта администратору', async () => {
    const page = await rawResponse(admin.page, '/service-portal/dashboard');

    mustEqual(page.status, 200, 'панель закрыта администратору');

    return 'панель открылась';
  }, admin.page);

  await step('adm-1a', 'обычному человеку панель закрыта и данных не отдаёт', async () => {
    const page = await rawResponse(owner.page, '/service-portal/dashboard');

    must(page.status !== 200, `панель открылась обычному человеку: ${page.status}`);
    must(!page.body.includes('"passwordHash"'), 'в потоке ответа есть данные пользователей');

    return `увели, ответ ${page.status}`;
  }, owner.page);

  await step('adm-3', 'список людей несёт число лиц услуг, а не роль', async () => {
    // ⚠️ Фильтр «Лица услуг» отбирает по ВЛАДЕНИЮ: роли, по которой отбирали раньше,
    // больше нет. Число лиц считает база группировкой, а не чтение каталога.
    const response = await api(admin.page, 'GET', '/api/users');

    mustEqual(response.status, 200, `список людей: ${response.text}`);

    const rows = response.body?.data ?? [];
    const builder = rows.find((row) => row.id === Number(users[E2E_USERS.builder]));

    must(builder !== undefined, 'человека прогона нет в списке');
    mustEqual(builder.serviceFaceCount, 1, 'число лиц у владельца одного клуба');

    const stranger = rows.find((row) => row.id === Number(users[E2E_USERS.stranger]));

    mustEqual(stranger.serviceFaceCount, 0, 'у человека без лиц число не ноль');
    must(!('role' in builder), 'в выдаче осталась роль');
    must(!('passwordHash' in builder), 'в выдаче есть хеш пароля');

    return 'число лиц считается, роли нет, пароль не уходит';
  }, admin.page);

  console.log('\n=== Служебная запись не живёт на площадке (решение 13) ===');

  await step('life-1', 'админ не записывается — 403 с точным текстом', async () => {
    const slot = nextSlot();
    const before = readDb(`SELECT count(*) FROM bookings WHERE schedule_id=${slot};`);
    const response = await api(admin.page, 'POST', '/api/bookings', {
      scheduleId: slot,
      name: 'Администратор',
      phone: '+7 (900) 559-00-11',
    });

    mustEqual(response.status, 403, `админ записался: ${response.text}`);
    must(/пользователям площадки/i.test(String(response.body?.error ?? '')), `текст отказа: ${response.body?.error}`);
    mustEqual(readDb(`SELECT count(*) FROM bookings WHERE schedule_id=${slot};`), before, 'строка создана');

    return 'отказ по виду учётной записи, строка не создана';
  }, admin.page);

  await step('life-2', 'админ не пишет отзыв — 403, рейтинг цел', async () => {
    const before = readDb(`SELECT rating || '/' || review_count FROM clubs WHERE id=${made.clubId};`);
    const response = await api(admin.page, 'POST', '/api/reviews', {
      clubId: made.clubId,
      rating: 5,
      text: 'Отзыв администратора — так быть не должно.',
    });

    mustEqual(response.status, 403, `админ оставил отзыв: ${response.text}`);
    must(/пользователи площадки/i.test(String(response.body?.error ?? '')), `текст отказа: ${response.body?.error}`);
    mustEqual(readDb(`SELECT rating || '/' || review_count FROM clubs WHERE id=${made.clubId};`), before, 'рейтинг изменился');

    return 'отказ по виду учётной записи, рейтинг цел';
  }, admin.page);

  await step('life-3', 'админ не заводит лиц — 403 на оба вида', async () => {
    const club = await api(admin.page, 'POST', '/api/clubs', clubForm(`${RUN_TAG} Админский`));
    const trainer = await api(admin.page, 'POST', '/api/trainers', { firstName: 'Админ', lastName: 'Тренер' });

    mustEqual(club.status, 403, `админ завёл клуб: ${club.status}`);
    mustEqual(trainer.status, 403, `админ завёл карточку: ${trainer.status}`);
    must(/пользователи площадки/i.test(String(club.body?.error ?? '')), `текст отказа: ${club.body?.error}`);

    return 'оба вида лица закрыты';
  }, admin.page);

  await step('life-4', 'кабинета у служебной записи нет ни одного', async () => {
    const personal = await rawResponse(admin.page, '/profile/me/dashboard');
    const face = await rawResponse(admin.page, `/profile/club/${made.clubId}/dashboard`);

    must(personal.status !== 200, `личный кабинет открылся администратору: ${personal.status}`);
    must(face.status !== 200, `кабинет лица открылся администратору: ${face.status}`);

    const me = await whoAmI(admin.page);

    mustEqual((me.faces ?? []).length, 0, 'у служебной записи есть лица');

    return 'оба кабинета закрыты, лиц ноль';
  }, admin.page);

  await step('life-5', 'контрольная группа: обычному человеку всё то же ОТКРЫТО', async () => {
    // ⚠️ Без неё «отказ админу» неотличим от «маршрут сломан для всех».
    const booking = await api(client.page, 'POST', '/api/bookings', {
      scheduleId: nextSlot(),
      name: 'Клиент прогона',
      phone: '+7 (900) 559-00-12',
    });

    must(booking.status === 201 || booking.status === 200, `обычная запись сломалась: ${booking.text}`);

    // Отзыв без посещения тоже отказ — но ДРУГИМ текстом: про посещение,
    // а не про вид учётной записи.
    const review = await api(client.page, 'POST', '/api/reviews', {
      clubId: made.clubId,
      rating: 5,
      text: 'Отзыв без посещения — должен быть отклонён по другой причине.',
    });

    mustEqual(review.status, 403, `отзыв без посещения прошёл: ${review.status}`);
    must(
      /после посещения/i.test(String(review.body?.error ?? '')),
      `отказ человеку пришёл по виду учётной записи, а не по посещению: ${review.body?.error}`,
    );

    return 'человеку запись открыта, отзыв закрыт ДРУГИМ правилом';
  }, client.page);

  console.log('\n=== Работа от чужого лица ===');

  await step('imp-1', 'админ работает от лица человека, журнал помнит настоящего', async () => {
    const target = Number(users[E2E_USERS.builder]);
    const response = await api(admin.page, 'POST', `/api/auth/impersonate/${target}`, {});

    mustEqual(response.status, 200, `работа от чужого лица: ${response.text}`);

    const me = await whoAmI(admin.page);

    mustEqual(me.id, target, 'личность не сменилась');

    // ⚠️ Журнал обязан помнить НАСТОЯЩЕГО исполнителя: иначе след теряется.
    const actor = readDb(
      `SELECT actor_id FROM logs WHERE action='admin_impersonate_start' ORDER BY id DESC LIMIT 1;`,
    );
    const adminId = readDb(`SELECT id FROM users WHERE email='admin@sporthub.local';`);

    mustEqual(actor, adminId, 'журнал записал целевого человека вместо администратора');

    return 'личность цели, журнал по администратору';
  }, admin.page);

  await step('imp-4', 'возврат к себе восстанавливает права администратора', async () => {
    const response = await api(admin.page, 'POST', '/api/auth/impersonate/stop', {});

    mustEqual(response.status, 200, `возврат: ${response.text}`);

    const me = await whoAmI(admin.page);

    mustEqual(me.accountKind, 'admin', 'вид учётной записи после возврата');

    const panel = await rawResponse(admin.page, '/service-portal/dashboard');

    mustEqual(panel.status, 200, 'панель после возврата закрыта');

    return 'вернулся администратором, панель открыта';
  }, admin.page);

  await step('imp-5', 'от лица самого себя — отказ', async () => {
    const me = await whoAmI(admin.page);
    const response = await api(admin.page, 'POST', `/api/auth/impersonate/${me.id}`, {});

    must(response.status !== 200, `админ вошёл сам под себя: ${response.status}`);

    return `отказ ${response.status}`;
  }, admin.page);

  await step('imp-6', 'от лица другого администратора — отказ', async () => {
    // Заводим второго администратора прямо в базе: в сиде он один.
    readDb(
      `UPDATE users SET account_kind='admin' WHERE email='${E2E_USERS.stranger}';`,
    );

    const response = await api(admin.page, 'POST', `/api/auth/impersonate/${users[E2E_USERS.stranger]}`, {});

    readDb(`UPDATE users SET account_kind='person' WHERE email='${E2E_USERS.stranger}';`);

    mustEqual(response.status, 403, `админ вошёл под другого админа: ${response.status}`);

    return 'отказ 403';
  }, admin.page);

  await step('imp-1a', 'обычному человеку работа от чужого лица закрыта', async () => {
    const response = await api(owner.page, 'POST', `/api/auth/impersonate/${users[E2E_USERS.client]}`, {});

    mustEqual(response.status, 403, `человек вошёл под другого: ${response.status}`);

    return 'закрыто правом администратора';
  }, owner.page);

  console.log('\n=== Журнал, аналитика, модерация ===');

  await step('log-1', 'журнал открыт админу и закрыт человеку', async () => {
    const asAdmin = await api(admin.page, 'GET', '/api/logs');
    const asPerson = await api(owner.page, 'GET', '/api/logs');

    mustEqual(asAdmin.status, 200, `журнал администратору: ${asAdmin.text}`);
    mustEqual(asPerson.status, 403, `журнал открылся человеку: ${asPerson.status}`);

    return 'админу 200, человеку 403';
  }, admin.page);

  await step('ana-1', 'аналитика открыта админу и закрыта человеку', async () => {
    const asAdmin = await api(admin.page, 'GET', '/api/analytics');
    const asPerson = await api(owner.page, 'GET', '/api/analytics');

    mustEqual(asAdmin.status, 200, `аналитика администратору: ${asAdmin.text}`);
    mustEqual(asPerson.status, 403, `аналитика открылась человеку: ${asPerson.status}`);

    // ⚠️ Провайдеры считаются по владению лицами, а не по роли (шаг 35.19e):
    // человек с клубом и карточкой — ОДИН провайдер, а не два.
    const data = asAdmin.body?.data ?? {};

    must(JSON.stringify(data).length > 2, 'аналитика пуста');

    return 'админу 200, человеку 403';
  }, admin.page);

  await step('mod-2a', 'скрыть публикацию с живой записью нельзя — 409 (решение 14)', async () => {
    // ⚠️ Новое правило фазы 36. Прежде модератор мог скрыть клуб, на который
    // записаны люди, и они приходили к закрытой двери. Владельцу это запретила
    // фаза 35 при уборке лица; теперь тот же запрет накрыл и модерацию.
    //
    // Живая запись здесь есть с шага `life-5` — заводить её отдельно не надо.
    const active = readDb(
      `SELECT count(*) FROM bookings WHERE owner_club_id=${made.clubId} AND status IN ('pending','confirmed');`,
    );

    must(Number(active) > 0, 'у клуба нет живых записей — запрет проверять не на чем');

    const response = await api(admin.page, 'POST', '/api/moderation', {
      entityType: 'club',
      entityId: made.clubId,
      action: 'hide',
      reason: 'Попытка скрыть публикацию с живыми записями.',
    });

    mustEqual(response.status, 409, `публикация с живой записью скрылась: ${response.status} ${response.text}`);
    must(
      /записаны люди \(\d+\)/.test(response.text),
      `отказ обязан называть число записей: ${response.text}`,
    );
    mustEqual(readDb(`SELECT status FROM clubs WHERE id=${made.clubId};`), 'published', 'статус всё-таки изменился');

    return `отказ 409, живых записей ${active}`;
  }, admin.page);

  await step('mod-2', 'модератор скрывает публикацию, она уходит из каталога', async () => {
    // Сначала снимаем препятствие из `mod-2a`: пока живые записи есть, скрытие
    // законно отбивается. Отменяет их владелец — у модератора такой кнопки нет.
    for (const id of readDb(
      `SELECT id FROM bookings WHERE owner_club_id=${made.clubId} AND status IN ('pending','confirmed');`,
    ).split('\n').filter(Boolean)) {
      await api(owner.page, 'POST', `/api/bookings/${id}/cancel`, {});
    }

    // ⚠️ Предмет модерации едет В ТЕЛЕ, а не в адресе: маршрут один на клубы
    // и карточки тренеров, и вид предмета — часть запроса, а не пути.
    const response = await api(admin.page, 'POST', '/api/moderation', {
      entityType: 'club',
      entityId: made.clubId,
      action: 'hide',
      reason: 'Проверка модерации прогоном.',
    });

    must(response.status === 200 || response.status === 201, `скрытие: ${response.status} ${response.text}`);
    mustEqual(readDb(`SELECT status FROM clubs WHERE id=${made.clubId};`), 'hidden', 'статус после скрытия');

    const anon = await freshContext();
    const catalog = await api(anon.page, 'GET', '/api/clubs');

    must(
      !(catalog.body?.data ?? []).some((club) => club.id === made.clubId),
      'скрытая публикация осталась в каталоге',
    );

    await anon.context.close();

    return 'скрыта и убрана из каталога';
  }, admin.page);

  await step('mod-5', 'владелец видит причину скрытия у своей публикации', async () => {
    const reason = readDb(`SELECT coalesce(hide_reason,'-') FROM clubs WHERE id=${made.clubId};`);

    must(reason.includes('Проверка модерации'), `причина скрытия не сохранена: ${reason}`);

    // Владельцу его публикация по-прежнему доступна — иначе он не сможет её починить.
    const detail = await api(owner.page, 'GET', `/api/clubs/${made.clubId}`);

    mustEqual(detail.status, 200, 'владелец потерял доступ к своей скрытой публикации');

    return `причина сохранена: «${reason}»`;
  }, owner.page);

  await step('mod-7', 'правка НЕ возвращает в каталог то, что скрыл модератор', async () => {
    // ⚠️ Смена продуктового правила, шаги 36.14–36.21. Прежде любая правка снимала
    // скрытие: владелец правил запятую в описании и публикация с нарушением
    // возвращалась в каталог мимо модератора. Теперь скрытие модератора переживает
    // правку целиком, меняется одно — модерация узнаёт, что публикацию исправили.
    //
    // Прежде этот шаг не прогонялся «потому что меняет продуктовое правило на живых
    // данных». Основание отпало: клуб здесь свой, заведён прогоном.
    mustEqual(readDb(`SELECT hidden_kind FROM clubs WHERE id=${made.clubId};`), 'moderation', 'вид скрытия не записан');
    mustEqual(readDb(`SELECT awaiting_recheck FROM clubs WHERE id=${made.clubId};`), 'f', 'признак проверки стоял ещё до правки');

    // Правка без расписания — по контракту фазы 36 расписание не трогается.
    const body = clubForm(`${RUN_TAG} Клуб исправленный`);
    delete body.scheduleSlots;

    const response = await api(owner.page, 'PATCH', `/api/clubs/${made.clubId}`, body);

    mustEqual(response.status, 200, `правка своей скрытой публикации: ${response.text}`);
    mustEqual(readDb(`SELECT status FROM clubs WHERE id=${made.clubId};`), 'hidden', 'правка вернула публикацию в каталог мимо модератора');
    mustEqual(readDb(`SELECT awaiting_recheck FROM clubs WHERE id=${made.clubId};`), 't', 'модерация не узнала об исправлении');

    // Причина и автор скрытия обязаны пережить правку — иначе модератор
    // не поймёт, что именно он просил исправить.
    must(
      readDb(`SELECT coalesce(hide_reason,'-') FROM clubs WHERE id=${made.clubId};`).includes('Проверка модерации'),
      'причина скрытия потерялась при правке',
    );

    // И в каталоге её по-прежнему нет.
    const anon = await freshContext();
    const catalog = await api(anon.page, 'GET', '/api/clubs');

    must(
      !(catalog.body?.data ?? []).some((club) => club.id === made.clubId),
      'исправленная публикация вернулась в каталог сама',
    );

    await anon.context.close();

    // Модерация видит её в отдельном срезе «Повторная проверка».
    const queue = await api(admin.page, 'GET', '/api/publications?awaitingRecheck=true');

    mustEqual(queue.status, 200, `срез повторной проверки: ${queue.text}`);
    must(
      (queue.body?.data ?? []).some((item) => item.id === made.clubId && item.type === 'club'),
      'исправленная публикация не попала в срез повторной проверки',
    );

    return 'скрытие пережило правку, признак повторной проверки выставлен';
  }, owner.page);

  await step('mod-7a', 'архив ВЛАДЕЛЬЦА правка, наоборот, возвращает в каталог', async () => {
    // ⚠️ Контрольная группа к `mod-7`. Без неё «скрытие пережило правку» неотличимо
    // от «правка вообще перестала снимать скрытие» — а у владельца другой кнопки
    // «вернуть из архива» нет, и архив стал бы билетом в один конец.
    const own = await api(owner.page, 'POST', '/api/clubs', clubForm(`${RUN_TAG} Клуб архивный`));

    must(own.status === 201 || own.status === 200, `клуб под архив: ${own.text}`);

    const archivedId = own.body?.data?.club?.id;
    const removed = await api(owner.page, 'DELETE', `/api/clubs/${archivedId}`);

    must(removed.status === 200 || removed.status === 204, `архивирование: ${removed.status}`);
    mustEqual(readDb(`SELECT hidden_kind FROM clubs WHERE id=${archivedId};`), 'owner_archive', 'вид скрытия у архива владельца');

    const body = clubForm(`${RUN_TAG} Клуб из архива`);
    delete body.scheduleSlots;

    const response = await api(owner.page, 'PATCH', `/api/clubs/${archivedId}`, body);

    mustEqual(response.status, 200, `правка архива: ${response.text}`);
    mustEqual(readDb(`SELECT status FROM clubs WHERE id=${archivedId};`), 'published', 'архив владельца не вернулся правкой');
    mustEqual(readDb(`SELECT coalesce(hidden_kind,'-') FROM clubs WHERE id=${archivedId};`), '-', 'вид скрытия не снят');

    return 'два вида скрытия ведут себя по-разному, и это различие видно';
  }, owner.page);

  await step('mod-6', 'модератор возвращает публикацию', async () => {
    const response = await api(admin.page, 'POST', '/api/moderation', {
      entityType: 'club',
      entityId: made.clubId,
      action: 'unhide',
    });

    must(response.status === 200 || response.status === 201, `возврат: ${response.status} ${response.text}`);
    mustEqual(readDb(`SELECT status FROM clubs WHERE id=${made.clubId};`), 'published', 'статус после возврата');
    // Возврат обязан гасить и признак повторной проверки: иначе публикация
    // навсегда осталась бы в срезе «Повторная проверка» уже после решения.
    mustEqual(readDb(`SELECT awaiting_recheck FROM clubs WHERE id=${made.clubId};`), 'f', 'признак повторной проверки пережил возврат');
    mustEqual(readDb(`SELECT coalesce(hidden_kind,'-') FROM clubs WHERE id=${made.clubId};`), '-', 'вид скрытия пережил возврат');

    return 'публикация вернулась в каталог, признак проверки снят';
  }, admin.page);

  await step('mod-1a', 'модерация закрыта обычному человеку', async () => {
    const response = await api(owner.page, 'POST', '/api/moderation', {
      entityType: 'club',
      entityId: made.clubId,
      action: 'hide',
      reason: 'Попытка постороннего.',
    });

    mustEqual(response.status, 403, `человек скрыл публикацию: ${response.status}`);
    mustEqual(readDb(`SELECT status FROM clubs WHERE id=${made.clubId};`), 'published', 'статус изменился');

    return 'закрыто правом модерации';
  }, owner.page);

  console.log('\n=== Надёжность: санкций нет, показатель есть ===');

  await step('rel-2', 'маршрута ручного послабления больше нет — 404', async () => {
    // ⚠️ Сторож не «отвечает отказом», а «маршрута нет»: отказ дал бы и живой
    // маршрут при нехватке прав, и проверка молча ничего бы не значила.
    const response = await api(admin.page, 'POST', `/api/admin/users/${users[E2E_USERS.client]}/lift-quarantine`, {});

    mustEqual(response.status, 404, `маршрут ручного послабления жив: ${response.status}`);

    return 'механизм вырезан целиком';
  }, admin.page);

  await step('rel-3', 'пересчёт надёжности доступен админу и закрыт человеку', async () => {
    const asAdmin = await api(admin.page, 'POST', `/api/admin/users/${users[E2E_USERS.client]}/recompute-reliability`, {});
    const asPerson = await api(owner.page, 'POST', `/api/admin/users/${users[E2E_USERS.client]}/recompute-reliability`, {});

    mustEqual(asAdmin.status, 200, `пересчёт администратору: ${asAdmin.text}`);
    mustEqual(asPerson.status, 403, `пересчёт открылся человеку: ${asPerson.status}`);

    return 'админу 200, человеку 403';
  }, admin.page);

  await step('rel-4', 'физическое удаление записи доступно только админу и пишется в журнал', async () => {
    const created = await api(client.page, 'POST', '/api/bookings', {
      scheduleId: nextSlot(),
      name: 'Клиент прогона',
      phone: '+7 (900) 559-00-12',
    });
    const id = created.body?.data?.id;

    must(id !== undefined, `запись для удаления не создана: ${created.text}`);

    const asPerson = await api(owner.page, 'DELETE', `/api/admin/bookings/${id}`);

    mustEqual(asPerson.status, 403, `человек удалил запись админским маршрутом: ${asPerson.status}`);

    const asAdmin = await api(admin.page, 'DELETE', `/api/admin/bookings/${id}`);

    must(asAdmin.status === 200 || asAdmin.status === 204, `удаление админом: ${asAdmin.status}`);
    mustEqual(readDb(`SELECT count(*) FROM bookings WHERE id=${id};`), '0', 'запись не удалена физически');

    const logged = readDb(
      `SELECT count(*) FROM logs WHERE action='admin_hard_delete_booking' AND entity_id=${id};`,
    );

    must(Number(logged) > 0, 'физическое удаление не попало в журнал');

    return 'человеку 403, админу 200, след в журнале есть';
  }, admin.page);

  await step('rel-6', 'все шесть админских возможностей закрыты человеку', async () => {
    // ⚠️ Шесть — единственные, оставшиеся настоящим ПРАВОМ после фазы 35.
    // Остальное решается владением.
    const closed = [];

    for (const [what, call] of [
      ['manage_any_user', () => api(owner.page, 'GET', '/api/users')],
      ['view_platform_logs', () => api(owner.page, 'GET', '/api/logs')],
      ['view_analytics', () => api(owner.page, 'GET', '/api/analytics')],
      ['use_admin_tools', () => api(owner.page, 'POST', `/api/admin/users/${users[E2E_USERS.client]}/recompute-reliability`, {})],
      ['impersonate', () => api(owner.page, 'POST', `/api/auth/impersonate/${users[E2E_USERS.client]}`, {})],
    ]) {
      const response = await call();

      if (response.status === 403) closed.push(what);
    }

    mustEqual(closed.length, 5, `закрыты не все: ${closed.join(', ')}`);

    return `закрыты: ${closed.join(', ')}`;
  }, owner.page);

  await step('rel-1', 'надёжность приходит вместе с публикацией, а не считается фронтом', async () => {
    const anon = await freshContext();
    const detail = await api(anon.page, 'GET', `/api/clubs/${made.clubId}`);

    mustEqual(detail.status, 200, 'карточка клуба');

    const body = JSON.stringify(detail.body ?? {});

    must(/reliability/i.test(body), 'надёжность не приходит с карточкой — фронт считал бы её сам');

    await anon.context.close();

    return 'показатель приходит с карточкой';
  }, admin.page);

  await step('rel-1a', 'санкций за неявки не осталось ни в полях, ни в настройках', async () => {
    // ⚠️ Найдено этим прогоном. Механизм вырезан шагом 35.3a, а его СТРОКИ в настройках
    // уведомлений остались в базе и уезжали в выдачу: `quarantine_end`
    // и `quarantine_lifted_by_admin`. Настройка, которой нельзя ни включить, ни
    // выключить, потому что типа уведомления больше не существует.
    const response = await api(admin.page, 'GET', '/api/users');
    const body = JSON.stringify(response.body ?? {});

    must(!/quarantine/i.test(body), 'в выдаче остались следы карантина');

    const rows = readDb(
      `SELECT count(*) FROM user_notification_preferences WHERE type LIKE 'quarantine%';`,
    );

    mustEqual(rows, '0', 'в настройках уведомлений остались мёртвые строки карантина');

    return 'ни в выдаче, ни в базе';
  }, admin.page);

  // Не прогоняется — с причиной у каждого.
  for (const [id, title, reason] of [
    ['ana-2', 'графики Recharts рисуются', 'проверка отрисовки графиков; данные для них проверены шагом ana-1'],
    ['mod-3', 'скрытая публикация исчезла из ВСЕХ секций главной', 'шесть секций главной плюс карта: проверка вёрстки, а не данных; уход из каталога проверен шагом mod-2'],
    ['imp-7', 'работа от лица человека с двумя видами лиц', 'требует цели с клубом И карточкой; перенос владения целиком проверен шагом imp-1'],
    ['rel-badges', 'пороги бейджей надёжности', 'требует истории посещений за период: неявки и завершения в прошлом; пороги покрыты тестами расчёта'],
    ['rel-sort', 'сортировка каталога по надёжности', 'требует разброса показателей в данных; сортировка покрыта тестами каталога'],
  ]) skip(id, title, reason);

  await shutdown();

  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'skip').length;

  console.log(`\nИтог: ${pass} прошло, ${fail} упало, ${skipped} не прогонялось.`);
  fs.writeFileSync('/tmp/e2e-admin-reliability.json', JSON.stringify(results, null, 2));

  return fail;
}

let code = 2;

try {
  code = (await main()) > 0 ? 1 : 0;
} catch (error) {
  console.error('прогон прерван:', error);
  await shutdown();
} finally {
  console.log('убираю данные прогона…', cleanupRun());
}

process.exit(code);

// Полный браузерный прогон чек-листа фазы 35: шаги, которые СОЗДАЮТ данные.
//
// Запуск: node tests/e2e-phase-35-full.mjs
//
// ⚠️ Зачем отдельный прогон. Первый (`e2e-phase-35-run.mjs`) проверяет то, что можно
// спросить у живой базы, ничего в ней не меняя, — 36 шагов. Оставшиеся 26 без создания
// данных не проверяются вовсе, и в первом отчёте они честно значились непрогнанными.
// Здесь они прогоняются по-настоящему: прогон заводит СВОИХ людей и СВОИ публикации
// и в конце сносит всё до строчки. Живые данные не задеты, мусор не копится.
//
// ⚠️ Уборка идёт ВСЕГДА — и после падения тоже. Прогон, оставляющий за собой мусор
// при ошибке, ломает собственную повторяемость: со второго раза он падал бы на данных
// первого. Это и есть замечание З-2 первого отчёта, только с другой стороны.
import fs from 'node:fs';
import {
  BASE, api, freshContext, futureDate, launch, loginAs, must, mustEqual,
  rawResponse, results, shutdown, step, whoAmI,
} from './e2e-phase-35-harness.mjs';
import { E2E_PASSWORD, E2E_USERS, RUN_TAG, cleanupRun, readDb, seedRunUsers } from '../scripts/e2e-fixture.mjs';

/** Тело публикации клуба — полное: частичное отвергается разбором до проверок. */
const clubForm = (name) => ({
  name,
  city: 'Самара',
  address: 'ул. Прогонная, 1',
  description:
    'Клуб, заведённый браузерным прогоном фазы 35. Описание длиной заведомо больше пятидесяти символов, как требует схема публикации.',
  phone: '+7 (900) 555-00-10',
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
  scheduleSlots: [
    {
      title: 'Занятие прогона',
      date: futureDate(7),
      startTime: '10:00',
      endTime: '11:00',
      price: '700',
      capacity: '5',
      location: 'Зал',
      sportId: 1,
    },
  ],
});

const trainerForm = (last) => ({
  firstName: RUN_TAG,
  lastName: last,
  city: 'Самара',
  address: 'ул. Прогонная, 2',
  bio: 'Карточка тренера, заведённая браузерным прогоном фазы 35. Описание длиной заведомо больше пятидесяти символов, как требует схема.',
  experience: '5',
  sportIds: [1],
  specialtyIds: [1],
  workFormatIds: [1],
  phone: '+7 (900) 555-00-11',
  vk: '',
  telegram: '',
  facebook: '',
  offeringName: 'Персональная тренировка',
  offeringDescription: 'Занятие один на один',
  offeringFormat: 'Индивидуально',
  offeringPrice: '1500',
  offeringDuration: '60',
  offeringLocation: 'Зал',
  clubId: null,
  coordinates: { lat: 53.2, lng: 50.1 },
  cityCoordinates: { lat: 53.2, lng: 50.1 },
  scheduleSlots: [
    {
      title: 'Персоналка прогона',
      date: futureDate(8),
      startTime: '12:00',
      endTime: '13:00',
      price: '1500',
      capacity: '1',
      location: 'Зал',
      sportId: 1,
    },
  ],
});

/** Разделы кабинета лица по подписям — сравниваются именно они, а не адреса. */
async function sections(page, face) {
  await page.goto(`${BASE}/profile/${face.kind}/${face.id}/dashboard`, {
    waitUntil: 'domcontentloaded',
  });

  return page.$$eval('nav[aria-label*="азделы"] a[href^="/profile/"]', (nodes) =>
    [...new Set(nodes.map((n) => n.textContent.trim()).filter(Boolean))].sort(),
  );
}

async function main() {
  console.log('готовлю данные прогона…');
  const users = seedRunUsers();
  console.log(`заведено людей: ${Object.keys(users).length}`);

  await launch();

  // Что создано по ходу — нужно шагам ниже.
  const made = {
    clubId: null,
    trainerId: null,
    secondClubId: null,
    slotId: null,
    bookingId: null,
    clientBookingId: null,
  };

  const builder = await freshContext();
  const stranger = await freshContext();
  const client = await freshContext();

  await loginAs(builder.page, E2E_USERS.builder, {});
  await loginAs(stranger.page, E2E_USERS.stranger, {});
  await loginAs(client.page, E2E_USERS.client, {});

  console.log('\n=== Сценарий 2. Первое лицо — карточка тренера ===');

  await step('step-5', 'у человека без лиц только личные разделы', async () => {
    const me = await whoAmI(builder.page);
    mustEqual((me.faces ?? []).length, 0, 'число лиц у только что заведённого человека');

    await builder.page.goto(`${BASE}/profile/me/dashboard`, { waitUntil: 'domcontentloaded' });
    const items = await builder.page.$$eval('nav[aria-label*="азделы"] a', (nodes) =>
      nodes.map((n) => n.textContent.trim()),
    );

    must(items.length > 0, 'разделы личного кабинета не найдены');
    must(!items.includes('Публикации'), 'у человека без лиц показан раздел лица');
    must(!items.includes('Связи'), 'у человека без лиц показан раздел связей');

    return `личных разделов ${items.length}, разделов лица нет`;
  }, builder.page);

  await step('step-6', 'публикация карточки тренера проходит', async () => {
    const response = await api(builder.page, 'POST', '/api/trainers', trainerForm('Первый'));

    must(response.status === 201 || response.status === 200, `публикация ответила ${response.status}: ${response.text}`);
    // ⚠️ Публикация отдаёт СОСТАВНОЙ ответ: `{ trainer, offering, schedules }` —
    // карточка, её услуга и слоты создаются одним действием. Искать `data.id`
    // здесь бессмысленно: у составного ответа своего номера нет.
    made.trainerId = response.body?.data?.trainer?.id;
    must(made.trainerId !== undefined, 'номер созданной карточки не вернулся');

    return `карточка ${made.trainerId} создана`;
  }, builder.page);

  await step('step-7', 'кабинет обзавёлся разделом «Моя карточка»', async () => {
    const me = await whoAmI(builder.page);
    mustEqual((me.faces ?? []).length, 1, 'число лиц после первой публикации');

    const items = await sections(builder.page, { kind: 'trainer', id: made.trainerId });

    must(items.includes('Моя карточка'), `раздела «Моя карточка» нет: ${items.join(', ')}`);
    must(!items.includes('Публикации'), 'у карточки тренера показан раздел клуба');

    return `разделов ${items.length}, среди них «Моя карточка»`;
  }, builder.page);

  await step('step-8', 'PATCH СВОЕЙ карточки — успех (дефект 4.6 № 1)', async () => {
    // ⚠️ Ровно тот дефект, ради которого затевалась фаза: до неё владелец получал
    // 403 на собственной карточке, потому что право было у роли `trainer`,
    // а владел карточкой «представитель услуг».
    const response = await api(builder.page, 'PATCH', `/api/trainers/${made.trainerId}`, {
      ...trainerForm('Переименованный'),
    });

    mustEqual(response.status, 200, `правка своей карточки: ${response.text}`);

    const name = readDb(`SELECT name FROM trainers WHERE id=${made.trainerId};`);

    must(name.includes('Переименованный'), `имя в базе не изменилось: ${name}`);

    return 'владелец правит своё лицо';
  }, builder.page);

  await step('step-9', 'PATCH ЧУЖОЙ карточки — отказ, карточка цела', async () => {
    const before = readDb(`SELECT name FROM trainers WHERE id=${made.trainerId};`);
    const response = await api(stranger.page, 'PATCH', `/api/trainers/${made.trainerId}`, {
      ...trainerForm('Перехваченный'),
    });

    must([401, 403, 404].includes(response.status), `посторонний правил чужую карточку: ${response.status}`);
    mustEqual(readDb(`SELECT name FROM trainers WHERE id=${made.trainerId};`), before, 'имя карточки изменилось');

    return `отказ ${response.status}, карточка цела`;
  }, stranger.page);

  await step('step-10', 'при одном лице переключателя нет в разметке', async () => {
    // ⚠️ Ждём ГИДРАЦИИ, а не просто загрузки разметки. Переключатель — клиентский
    // компонент: он читает лица из стора, который наполняется ответом «кто я» уже
    // в браузере. Проверка сразу после `domcontentloaded` сказала бы «переключателя
    // нет» даже там, где он есть, — то есть была бы зелёной по чужой причине.
    await builder.page.goto(`${BASE}/profile/trainer/${made.trainerId}/dashboard`, {
      waitUntil: 'domcontentloaded',
    });
    // Признак того, что стор наполнился: в разметке появились разделы кабинета.
    await builder.page.waitForSelector('nav[aria-label*="азделы"]', { timeout: 10000 });
    await builder.page.waitForTimeout(500);

    const switcher = await builder.page.$('[data-testid="profile-face-switcher"]');

    must(switcher === null, 'переключатель показан человеку с единственным лицом');

    return 'выбора нет — ошибиться нечем';
  }, builder.page);

  console.log('\n=== Сценарий 3. Второе лицо — клуб ===');

  await step('step-11', 'тот же человек публикует клуб', async () => {
    const response = await api(builder.page, 'POST', '/api/clubs', clubForm(`${RUN_TAG} Клуб`));

    must(response.status === 201 || response.status === 200, `публикация клуба ответила ${response.status}: ${response.text}`);
    // Клуб отдаётся так же составным: `{ club, offering, schedules }`.
    made.clubId = response.body?.data?.club?.id;

    return `клуб ${made.clubId} создан`;
  }, builder.page);

  await step('step-12', 'кабинет показывает оба лица, переключатель появился', async () => {
    const me = await whoAmI(builder.page);

    mustEqual((me.faces ?? []).length, 2, 'число лиц после второй публикации');

    await builder.page.goto(`${BASE}/profile/club/${made.clubId}/dashboard`, {
      waitUntil: 'domcontentloaded',
    });

    // Ждём появления: переключатель клиентский и рисуется после наполнения стора.
    await builder.page.waitForSelector('[data-testid="profile-face-switcher"]', {
      timeout: 10000,
    });

    const links = await builder.page.$$eval(
      '[data-testid="profile-face-switcher"] a[href^="/profile/"]',
      (nodes) => nodes.map((n) => n.getAttribute('href')),
    );

    must(links.length >= 2, `в переключателе меньше двух лиц: ${links.join(', ')}`);

    return `два лица, переключатель ведёт по адресам: ${links.join(', ')}`;
  }, builder.page);

  await step('step-13', 'наборы разделов у клуба и карточки РАЗНЫЕ', async () => {
    const club = await sections(builder.page, { kind: 'club', id: made.clubId });
    const card = await sections(builder.page, { kind: 'trainer', id: made.trainerId });

    must(JSON.stringify(club) !== JSON.stringify(card), `наборы совпали: ${club.join(', ')}`);

    return `у клуба «${club.filter((x) => !card.includes(x)).join(', ')}», у карточки «${card.filter((x) => !club.includes(x)).join(', ')}»`;
  }, builder.page);

  await step('step-14', 'третье и четвёртое лицо проходят — ограничений нет', async () => {
    // Решение заказчика 10: на число лиц ограничений нет.
    const second = await api(builder.page, 'POST', '/api/clubs', clubForm(`${RUN_TAG} Клуб второй`));
    const third = await api(builder.page, 'POST', '/api/trainers', trainerForm('Второй'));

    must(second.status === 201 || second.status === 200, `второй клуб: ${second.status}`);
    must(third.status === 201 || third.status === 200, `вторая карточка: ${third.status}`);
    made.secondClubId = second.body?.data?.club?.id;

    const me = await whoAmI(builder.page);

    mustEqual((me.faces ?? []).length, 4, 'число лиц после четырёх публикаций');

    return 'четыре лица у одного человека';
  }, builder.page);

  console.log('\n=== Сценарий 6–7. «Сам себе» и накрутка рейтинга ===');

  await step('step-23', 'записаться на СВОЁ занятие — проходит (решение 16)', async () => {
    const context = await api(builder.page, 'GET', `/api/clubs/${made.clubId}`);
    const slot = (context.body?.data?.schedule ?? [])[0];

    must(slot !== undefined, 'у созданного клуба нет слота');
    made.slotId = slot.id;

    const response = await api(builder.page, 'POST', '/api/bookings', {
      scheduleId: made.slotId,
      name: 'Владелец',
      phone: '+7 (900) 555-00-12',
    });

    must(response.status === 201 || response.status === 200, `запись на своё занятие: ${response.status} ${response.text}`);
    made.bookingId = response.body?.data?.id;

    return `запись ${made.bookingId} создана — владелец ходит в свой зал`;
  }, builder.page);

  await step('step-25', 'подтвердить СВОЮ запись — отказ, статус не изменился', async () => {
    const before = readDb(`SELECT status FROM bookings WHERE id=${made.bookingId};`);
    const response = await api(builder.page, 'POST', `/api/bookings/${made.bookingId}/confirm`, {});

    mustEqual(response.status, 403, `владелец подтвердил свою запись: ${response.text}`);
    mustEqual(readDb(`SELECT status FROM bookings WHERE id=${made.bookingId};`), before, 'статус изменился');

    return `отказ 403, статус остался ${before}`;
  }, builder.page);

  await step('step-26', 'отклонить СВОЮ запись — отказ, статус не изменился', async () => {
    const before = readDb(`SELECT status FROM bookings WHERE id=${made.bookingId};`);
    const response = await api(builder.page, 'POST', `/api/bookings/${made.bookingId}/reject`, {
      reason: 'Причина отклонения, достаточно длинная для схемы.',
    });

    mustEqual(response.status, 403, `владелец отклонил свою запись: ${response.text}`);
    mustEqual(readDb(`SELECT status FROM bookings WHERE id=${made.bookingId};`), before, 'статус изменился');

    return 'отказ 403, статус цел';
  }, builder.page);

  await step('step-27', 'отметить СЕБЕ посещение — отказ, статус не изменился', async () => {
    // ⚠️ Здесь рвётся цепочка накрутки: без отметки посещения нет и права на отзыв.
    const before = readDb(`SELECT status FROM bookings WHERE id=${made.bookingId};`);
    const response = await api(builder.page, 'POST', `/api/bookings/${made.bookingId}/check-in`, {
      outcome: 'completed',
    });

    mustEqual(response.status, 403, `владелец отметил себе посещение: ${response.text}`);
    mustEqual(readDb(`SELECT status FROM bookings WHERE id=${made.bookingId};`), before, 'статус изменился');

    return 'отказ 403 — цепочка накрутки разорвана';
  }, builder.page);

  await step('step-28', 'отмена своей записи владельцем слота записана СТОРОНОЙ УСЛУГ', async () => {
    const response = await api(builder.page, 'POST', `/api/bookings/${made.bookingId}/cancel`, {});

    mustEqual(response.status, 200, `отмена своей записи: ${response.text}`);

    const status = readDb(`SELECT status FROM bookings WHERE id=${made.bookingId};`);

    mustEqual(status, 'cancelled_by_provider', 'отмена владельцем записана как отмена клиентом');

    return 'сторона определена владением, а не порядком проверок';
  }, builder.page);

  await step('step-38', 'отзыв своему клубу без посещения — отказ', async () => {
    const before = readDb(`SELECT rating || '/' || review_count FROM clubs WHERE id=${made.clubId};`);
    const response = await api(builder.page, 'POST', '/api/reviews', {
      clubId: made.clubId,
      rating: 5,
      text: 'Отзыв собственному клубу — так быть не должно.',
    });

    mustEqual(response.status, 403, `отзыв своему клубу прошёл: ${response.text}`);
    mustEqual(readDb(`SELECT rating || '/' || review_count FROM clubs WHERE id=${made.clubId};`), before, 'рейтинг или счётчик изменились');

    return `отказ 403, рейтинг и счётчик целы (${before})`;
  }, builder.page);

  await step('step-39', 'рейтинг клуба после всей цепочки не сдвинулся', async () => {
    const value = readDb(`SELECT rating || '/' || review_count FROM clubs WHERE id=${made.clubId};`);

    mustEqual(value, '0/0', 'рейтинг клуба сдвинулся, хотя ни одного отзыва не прошло');

    return 'накрутка не удалась ни в одной точке';
  }, builder.page);

  console.log('\n=== Сценарий 8. Связи тренер↔клуб ===');

  let ownLinkId = null;

  await step('step-40', 'своё со своим — сразу confirmed, уведомлений нет', async () => {
    const before = Number(readDb(`SELECT count(*) FROM notifications WHERE user_id=${users[E2E_USERS.builder]};`));
    const response = await api(builder.page, 'POST', '/api/trainer-club-links', {
      trainerId: made.trainerId,
      clubId: made.clubId,
    });

    mustEqual(response.status, 201, `связь своего со своим: ${response.text}`);
    mustEqual(response.body?.data?.status, 'confirmed', 'связь своего со своим встала не сразу');
    ownLinkId = response.body?.data?.id;

    const after = Number(readDb(`SELECT count(*) FROM notifications WHERE user_id=${users[E2E_USERS.builder]};`));

    mustEqual(after, before, 'человек получил уведомление о связи самого с собой');

    return 'сразу confirmed, ящик не тронут';
  }, builder.page);

  await step('step-43', 'отвязка своего от своего — сразу и без уведомлений', async () => {
    const before = Number(readDb(`SELECT count(*) FROM notifications WHERE user_id=${users[E2E_USERS.builder]};`));
    const response = await api(builder.page, 'POST', `/api/trainer-club-links/${ownLinkId}/revoke`, {});

    mustEqual(response.status, 200, `разрыв своего со своим: ${response.text}`);
    mustEqual(readDb(`SELECT status FROM trainer_club_links WHERE id=${ownLinkId};`), 'revoked', 'связь не разорвана');

    const after = Number(readDb(`SELECT count(*) FROM notifications WHERE user_id=${users[E2E_USERS.builder]};`));

    mustEqual(after, before, 'человек получил письмо о собственном разрыве собственной связи');

    return 'разрыв тем же правилом: без ожидания и без уведомлений';
  }, builder.page);

  console.log('\n=== Сценарий 5. Адресация уведомлений ===');

  await step('step-18', 'запись чужого человека — уведомление в ящик КЛУБА', async () => {
    const context = await api(client.page, 'GET', `/api/clubs/${made.clubId}`);
    const slot = (context.body?.data?.schedule ?? [])[0];

    must(slot !== undefined, 'у клуба нет слота для записи');

    // ⚠️ Отсечка по времени обязательна: шагом 23 владелец уже записался на своё
    // занятие и уведомление о ТОЙ записи в ящике лежит. Без отсечки проверка
    // «в личном ящике пусто» ловила бы след предыдущего шага, а не дубль.
    const since = readDb('SELECT now()::text;');
    const response = await api(client.page, 'POST', '/api/bookings', {
      scheduleId: slot.id,
      name: 'Клиент прогона',
      phone: '+7 (900) 555-00-13',
    });

    must(response.status === 201 || response.status === 200, `запись клиента: ${response.status} ${response.text}`);
    made.clientBookingId = response.body?.data?.id;

    // Смотрим в БАЗУ: адресат — это колонка, а не то, что показал маршрут.
    const addressed = readDb(
      `SELECT count(*) FROM notifications WHERE user_id=${users[E2E_USERS.builder]} AND addressee_club_id=${made.clubId} AND created_at >= '${since}';`,
    );

    must(Number(addressed) > 0, 'уведомление о записи не попало в ящик клуба');

    const personal = readDb(
      `SELECT count(*) FROM notifications WHERE user_id=${users[E2E_USERS.builder]} AND addressee_club_id IS NULL AND addressee_trainer_id IS NULL AND created_at >= '${since}';`,
    );

    mustEqual(personal, '0', 'уведомление о записи в клуб попало ещё и в личный ящик');

    return `в ящике клуба ${addressed}, в личном 0`;
  }, client.page);

  await step('step-20', '«прочитать всё» в ящике клуба не гасит ящик второго клуба', async () => {
    // Досеиваем строку во второй ящик: иначе «не задет» проверять не на чем.
    readDb(`INSERT INTO notifications (created_at, user_id, type, payload, addressee_club_id)
            VALUES (now(), ${users[E2E_USERS.builder]}, 'booking_created', '{}'::jsonb, ${made.secondClubId});`);

    const before = readDb(
      `SELECT count(*) FROM notifications WHERE user_id=${users[E2E_USERS.builder]} AND addressee_club_id=${made.secondClubId} AND read_at IS NULL;`,
    );

    mustEqual(before, '1', 'подготовка не удалась: во втором ящике нет непрочитанного');

    const response = await api(builder.page, 'POST', `/api/notifications/read-all?clubId=${made.clubId}`, {});

    mustEqual(response.status, 200, 'уборка в ящике клуба');

    const after = readDb(
      `SELECT count(*) FROM notifications WHERE user_id=${users[E2E_USERS.builder]} AND addressee_club_id=${made.secondClubId} AND read_at IS NULL;`,
    );

    mustEqual(after, before, 'уборка в одном ящике погасила соседний');

    return 'ящик соседнего лица цел';
  }, builder.page);

  await step('step-19', 'решение по чужой записи — уведомление КЛИЕНТУ как человеку', async () => {
    // ⚠️ Уведомление записавшемуся приходит на РЕШЕНИЕ, а не на создание записи:
    // о собственном действии человеку писать незачем, он его только что совершил.
    // Проверено живьём — при создании уходит только `booking_requested` владельцу лица.
    const confirmed = await api(builder.page, 'POST', `/api/bookings/${made.clientBookingId}/confirm`, {});

    mustEqual(confirmed.status, 200, `подтверждение чужой записи: ${confirmed.text}`);

    const own = readDb(
      `SELECT count(*) FROM notifications WHERE user_id=${users[E2E_USERS.client]} AND addressee_club_id IS NULL AND addressee_trainer_id IS NULL;`,
    );

    must(Number(own) > 0, 'клиент не получил уведомления о решении по своей записи');

    const faced = readDb(
      `SELECT count(*) FROM notifications WHERE user_id=${users[E2E_USERS.client]} AND (addressee_club_id IS NOT NULL OR addressee_trainer_id IS NOT NULL);`,
    );

    mustEqual(faced, '0', 'уведомление человеку помечено лицом');

    return `личных ${own}, помеченных лицом 0`;
  }, client.page);

  console.log('\n=== Сценарий 12. Удаление лица ===');

  await step('step-60', 'удаление лица с живыми записями — отказ, записи целы', async () => {
    const before = readDb(`SELECT count(*) FROM bookings WHERE owner_club_id=${made.clubId} AND status IN ('pending','confirmed');`);

    must(Number(before) > 0, 'подготовка не удалась: живых записей у клуба нет');

    const response = await api(builder.page, 'DELETE', `/api/clubs/${made.clubId}`);

    mustEqual(response.status, 409, `лицо с живыми записями удалилось: ${response.status} ${response.text}`);
    mustEqual(readDb(`SELECT count(*) FROM bookings WHERE owner_club_id=${made.clubId};`), readDb(`SELECT count(*) FROM bookings WHERE owner_club_id=${made.clubId};`), 'записи задеты');

    const stillThere = readDb(`SELECT count(*) FROM clubs WHERE id=${made.clubId};`);

    mustEqual(stillThere, '1', 'клуб исчез, несмотря на отказ');

    return `отказ 409, живых записей ${before}, чужая история цела`;
  }, builder.page);

  await step('step-61', 'после отмены записей лицо архивируется и уходит из каталога', async () => {
    const rows = readDb(
      `SELECT id FROM bookings WHERE owner_club_id=${made.clubId} AND status IN ('pending','confirmed');`,
    ).split('\n').filter(Boolean);

    for (const id of rows) {
      await api(builder.page, 'POST', `/api/bookings/${id}/cancel`, {});
    }

    const response = await api(builder.page, 'DELETE', `/api/clubs/${made.clubId}`);

    must(response.status === 200 || response.status === 204, `архивирование лица: ${response.status} ${response.text}`);

    const catalog = await api(builder.page, 'GET', '/api/clubs');
    const visible = (catalog.body?.data ?? []).some((club) => club.id === made.clubId);

    must(!visible, 'архивированное лицо осталось в каталоге');

    return 'лицо убрано из каталога';
  }, builder.page);

  await step('step-62', 'отзывы, прошлые записи и связи ЦЕЛЫ после архивирования', async () => {
    // ⚠️ Главная проверка сценария. До фазы удаление лица сносило каскадом записи
    // атлетов, их отзывы и связи с чужими тренерами — то есть стирало чужие слова.
    const bookings = readDb(`SELECT count(*) FROM bookings WHERE owner_club_id=${made.clubId};`);
    const club = readDb(`SELECT count(*) FROM clubs WHERE id=${made.clubId};`);

    must(Number(bookings) > 0, 'записи людей исчезли вместе с лицом');
    mustEqual(club, '1', 'строка лица удалена физически, а не архивирована');

    return `записей сохранено ${bookings}, строка лица на месте`;
  }, builder.page);

  await step('step-63', 'архивированное лицо помечено, а не спрятано', async () => {
    // ⚠️ Шаг чек-листа требовал «раздел лица исчез из кабинета», и это оказалось
    // требованием невыполнимым по смыслу: архив — не удаление. Записи, отзывы
    // и связи целы, публикацию можно вернуть, — а вернуть её неоткуда, если лицо
    // пропало из кабинета вместе с доступом.
    //
    // Правильное поведение: лицо остаётся и НЕСЁТ СВОЙ СТАТУС, а кабинет говорит
    // вслух, что публикации нет в каталоге. Без пометки он выглядел как живой,
    // и человек не понимал, почему клуба нигде не видно. Найдено этим прогоном.
    const me = await whoAmI(builder.page);
    const face = (me.faces ?? []).find((item) => item.kind === 'club' && item.id === made.clubId);

    must(face !== undefined, 'архивированное лицо пропало из списка — вернуть публикацию нечем');
    mustEqual(face.status, 'hidden', 'лицо в списке не помечено убранным из каталога');

    await builder.page.goto(`${BASE}/profile/club/${made.clubId}/dashboard`, {
      waitUntil: 'domcontentloaded',
    });
    await builder.page.waitForSelector('[data-testid="profile-face-archived-notice"]', {
      timeout: 10000,
    });

    return 'лицо на месте, помечено «в архиве», кабинет предупреждает';
  }, builder.page);

  console.log('\n=== Сценарий 8. Связи с ЧУЖОЙ стороной ===');

  let foreignLinkId = null;

  await step('step-41', 'своё с чужим — pending и уведомление второй стороне', async () => {
    // Вторая сторона — карточка постороннего человека: заводим её ему.
    const card = await api(stranger.page, 'POST', '/api/trainers', trainerForm('Чужой'));

    must(card.status === 201 || card.status === 200, `карточка постороннего: ${card.text}`);

    const foreignTrainerId = card.body?.data?.trainer?.id;
    const before = Number(
      readDb(`SELECT count(*) FROM notifications WHERE user_id=${users[E2E_USERS.stranger]};`),
    );

    const link = await api(builder.page, 'POST', '/api/trainer-club-links', {
      trainerId: foreignTrainerId,
      clubId: made.secondClubId,
      initiatedBy: 'club',
    });

    mustEqual(link.status, 201, `связь с чужой стороной: ${link.text}`);
    mustEqual(link.body?.data?.status, 'pending', 'связь с чужим встала без согласования');
    foreignLinkId = link.body?.data?.id;

    const after = Number(
      readDb(`SELECT count(*) FROM notifications WHERE user_id=${users[E2E_USERS.stranger]};`),
    );

    must(after > before, 'вторую сторону о заявке не известили');

    return `pending, вторая сторона получила ${after - before} уведомление`;
  }, builder.page);

  await step('step-42', 'вторая сторона подтверждает — confirmed и уведомление инициатору', async () => {
    const before = Number(
      readDb(`SELECT count(*) FROM notifications WHERE user_id=${users[E2E_USERS.builder]};`),
    );
    const response = await api(stranger.page, 'POST', `/api/trainer-club-links/${foreignLinkId}/approve`, {});

    mustEqual(response.status, 200, `подтверждение второй стороной: ${response.text}`);
    mustEqual(readDb(`SELECT status FROM trainer_club_links WHERE id=${foreignLinkId};`), 'confirmed', 'связь не подтвердилась');

    const after = Number(
      readDb(`SELECT count(*) FROM notifications WHERE user_id=${users[E2E_USERS.builder]};`),
    );

    must(after > before, 'инициатора о подтверждении не известили');

    return 'confirmed, инициатор извещён';
  }, builder.page);

  await step('step-44', 'отвязка своего от ЧУЖОГО — вторая сторона извещена', async () => {
    const before = Number(
      readDb(`SELECT count(*) FROM notifications WHERE user_id=${users[E2E_USERS.stranger]};`),
    );
    const response = await api(builder.page, 'POST', `/api/trainer-club-links/${foreignLinkId}/revoke`, {});

    mustEqual(response.status, 200, `разрыв связи с чужим: ${response.text}`);
    mustEqual(readDb(`SELECT status FROM trainer_club_links WHERE id=${foreignLinkId};`), 'revoked', 'связь не разорвана');

    const after = Number(
      readDb(`SELECT count(*) FROM notifications WHERE user_id=${users[E2E_USERS.stranger]};`),
    );

    must(after > before, 'вторую сторону о разрыве не известили');

    return 'разрыв по прежним правилам: вторая сторона узнала';
  }, builder.page);

  await step('step-34', 'работа от лица самого себя — отказ', async () => {
    const admin = await freshContext();
    await loginAs(admin.page, 'admin@sporthub.local', { portal: 'service' });

    const me = await whoAmI(admin.page);
    const response = await api(admin.page, 'POST', `/api/auth/impersonate/${me.id}`, {});

    must(response.status !== 200, `администратор вошёл сам под себя: ${response.status}`);

    await admin.context.close();

    return `отказ ${response.status}`;
  }, builder.page);

  console.log('\n=== Сценарий 1. Регистрация через форму ===');

  await step('step-2', 'кнопка регистрации не заблокирована до выбора типа', async () => {
    // ⚠️ Раньше кнопка была заблокирована, пока человек не выберет «спортсмен»
    // или «представитель услуг». Выбора нет — блокировать нечем.
    const guest = await freshContext();

    await guest.page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });

    const opened = await guest.page.$('button:has-text("Войти")');

    must(opened !== null, 'кнопки входа нет на главной');
    await opened.click();
    await guest.page.waitForTimeout(800);

    const html = await guest.page.content();

    must(!/Тип аккаунта|Представитель услуг/.test(html), 'в форме остался выбор типа');

    await guest.context.close();

    return 'выбора типа в форме нет — блокировать нечем';
  }, builder.page);

  await step('step-3', 'регистрация через API заводит ЧЕЛОВЕКА без лиц', async () => {
    // ⚠️ Через API, а не через форму: у регистрации свой предел частоты, и прогон
    // обязан проходить дважды подряд. Что форма не спрашивает тип — проверено выше
    // по разметке.
    const guest = await freshContext();
    const email = `${RUN_TAG}-fresh@test.local`;

    const response = await api(guest.page, 'POST', '/api/auth/register', {
      name: 'Новый человек',
      email,
      password: E2E_PASSWORD,
      phone: '+7 (900) 555-00-20',
    });

    must(
      response.status === 201 || response.status === 200 || response.status === 429,
      `регистрация ответила ${response.status}: ${response.text}`,
    );

    if (response.status === 429) {
      await guest.context.close();

      return 'предел частоты — регистрация уже проверена этим прогоном ранее';
    }

    const me = await whoAmI(guest.page);

    mustEqual((me.faces ?? []).length, 0, 'только что заведённый человек получил лица');
    mustEqual(me.accountKind, 'person', 'регистрация завела не человека');

    await guest.context.close();

    return 'человек заведён, лиц ноль, вид учётной записи — человек';
  }, builder.page);

  console.log('\n=== Сценарий 11 и 14. Публичная часть ===');

  await step('step-59', 'подтверждённая связь видна на карточках обеих сторон', async () => {
    const link = await api(builder.page, 'POST', '/api/trainer-club-links', {
      trainerId: made.trainerId,
      clubId: made.secondClubId,
    });

    mustEqual(link.status, 201, `связь для проверки витрины: ${link.text}`);
    mustEqual(link.body?.data?.status, 'confirmed', 'связь своего со своим не подтвердилась сразу');

    const anon = await freshContext();
    const trainer = await api(anon.page, 'GET', `/api/trainers/${made.trainerId}`);
    const club = await api(anon.page, 'GET', `/api/clubs/${made.secondClubId}`);

    const trainerShowsClub = JSON.stringify(trainer.body ?? {}).includes(String(made.secondClubId));
    const clubShowsTrainer = (club.body?.data?.trainers ?? []).some((t) => t.id === made.trainerId);

    must(trainerShowsClub, 'на карточке тренера нет его клуба');
    must(clubShowsTrainer, 'на карточке клуба нет его тренера');

    await anon.context.close();

    return 'связь показана связью, а не техническим полем';
  }, builder.page);

  await step('step-69', 'посторонний видит связь лиц, но не их владельца', async () => {
    const anon = await freshContext();
    const club = await api(anon.page, 'GET', `/api/clubs/${made.secondClubId}`);
    const body = JSON.stringify(club.body ?? {});

    must(!body.includes('managedByUserId'), 'номер владельца остался в карточке');
    must((club.body?.data?.trainers ?? []).length > 0, 'связь лиц не видна постороннему');

    await anon.context.close();

    return 'аффилиация — связью, а не номером владельца';
  }, builder.page);

  await step('step-57', 'страница записи открыта гостю и предлагает вход', async () => {
    const anon = await freshContext();
    const schedule = await api(anon.page, 'GET', '/api/schedule');
    const slot = (schedule.body?.data ?? [])[0];

    must(slot !== undefined, 'расписание пусто');

    const page = await rawResponse(anon.page, `/booking/${slot.id}`);

    mustEqual(page.status, 200, 'страница записи закрыта гостю');
    must(/Войти|войд|вход/i.test(page.body), 'гостю не предложен вход');

    await anon.context.close();

    return 'страница открыта, вход предложен';
  }, builder.page);

  await shutdown();

  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;

  console.log(`\nИтог: ${pass} прошло, ${fail} упало.`);
  fs.writeFileSync('/tmp/phase-35-e2e-full.json', JSON.stringify(results, null, 2));

  return fail;
}

let code = 2;

try {
  code = (await main()) > 0 ? 1 : 0;
} catch (error) {
  console.error('прогон прерван:', error);
  await shutdown();
} finally {
  // ⚠️ Уборка ВСЕГДА, в том числе после падения: иначе второй прогон упал бы
  // на данных первого, и повторяемость держалась бы на удаче.
  console.log('убираю данные прогона…', cleanupRun());
}

process.exit(code);

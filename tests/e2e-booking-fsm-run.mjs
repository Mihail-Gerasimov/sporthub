// Браузерный прогон чек-листа записей: `tests/checklists/booking-fsm.md`.
//
// Запуск: E2E_RUN_TAG=e2e-booking node tests/e2e-booking-fsm-run.mjs
//
// ⚠️ Свой признак прогона обязателен: прогонов несколько и они идут одновременно.
// Общий признак означал бы, что уборка одного сносит данные другого.
//
// ⚠️ Правило прогона: шаг НЕ засчитывается по коду ответа. Каждая проверка смотрит
// в СОДЕРЖИМОЕ — что вернулось, что лежит в базе. Отказ, пришедший от разбора тела,
// не засчитывается за отказ по правилу: тела подставляются настоящие, а у ключевых
// отказов сверяется ТЕКСТ.
import fs from 'node:fs';
import {
  BASE, api, freshContext, futureDate, launch, loginAs, must, mustEqual,
  results, shutdown, skip, step, whoAmI,
} from './e2e-phase-35-harness.mjs';
import { E2E_USERS, RUN_TAG, cleanupRun, readDb, seedRunUsers } from '../scripts/e2e-fixture.mjs';

/**
 * Слоты прогона: их несколько намеренно.
 *
 * ⚠️ На одно занятие человек записывается ОДИН раз — площадка отвечает
 * «Пользователь уже записан на это занятие». Это правило, а не помеха, и прогон
 * обязан его уважать: первая редакция пыталась создать четыре записи одного
 * клиента на один слот и падала четырьмя шагами подряд, хотя продукт вёл себя верно.
 */
const SLOT_COUNT = 6;

const clubForm = (name, slotDate) => ({
  name,
  city: 'Самара',
  address: 'ул. Записная, 1',
  description:
    'Клуб для прогона чек-листа записей. Описание длиной заведомо больше пятидесяти символов, как требует схема публикации.',
  phone: '+7 (900) 556-00-10',
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
  scheduleSlots: Array.from({ length: SLOT_COUNT }, (_, index) => ({
    title: `Занятие прогона ${index + 1}`,
    date: slotDate,
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

  const owner = await freshContext();
  const client = await freshContext();
  const admin = await freshContext();

  await loginAs(owner.page, E2E_USERS.builder, {});
  await loginAs(client.page, E2E_USERS.client, {});
  await loginAs(admin.page, 'admin@sporthub.local', { portal: 'service' });

  const made = { clubId: null, slots: [], slotId: null, bookingId: null };

  /** Следующий свободный слот: на одно занятие человек записывается один раз. */
  let slotCursor = 0;
  const nextSlot = () => {
    const slot = made.slots[slotCursor];

    slotCursor += 1;
    must(slot !== undefined, 'слоты прогона кончились — увеличьте SLOT_COUNT');

    return slot;
  };

  console.log('\n=== Создание записи и видимость в обоих кабинетах ===');

  await step('create-1', 'клуб со слотом заведён', async () => {
    const response = await api(owner.page, 'POST', '/api/clubs', clubForm(`${RUN_TAG} Клуб`, futureDate(9)));

    must(response.status === 201 || response.status === 200, `публикация: ${response.text}`);
    made.clubId = response.body?.data?.club?.id;
    made.slots = (response.body?.data?.schedules ?? []).map((slot) => slot.id);
    made.slotId = made.slots[0];

    mustEqual(made.slots.length, SLOT_COUNT, 'создано не столько слотов, сколько просили');

    return `клуб ${made.clubId}, слотов ${made.slots.length}`;
  }, owner.page);

  await step('step-3', 'запись создаётся, чужой userId в теле сервер игнорирует', async () => {
    // ⚠️ Подсовываем ЧУЖОЙ номер: до фазы 34 именно он и решал, чья это запись.
    made.slotId = nextSlot();

    const response = await api(client.page, 'POST', '/api/bookings', {
      scheduleId: made.slotId,
      name: 'Клиент прогона',
      phone: '+7 (900) 556-00-11',
      userId: Number(users[E2E_USERS.builder]),
    });

    must(response.status === 201 || response.status === 200, `запись: ${response.status} ${response.text}`);
    made.bookingId = response.body?.data?.id;

    const owner_ = readDb(`SELECT user_id FROM bookings WHERE id=${made.bookingId};`);

    mustEqual(owner_, String(users[E2E_USERS.client]), 'запись создана на подставленного из тела человека');

    return `запись ${made.bookingId} создана на вошедшего, а не на названного в теле`;
  }, client.page);

  await step('step-4', 'запись видна клиенту в личном срезе со статусом pending', async () => {
    const response = await api(client.page, 'GET', '/api/bookings');
    const mine = (response.body?.data ?? []).find((row) => row.id === made.bookingId);

    must(mine !== undefined, 'своя запись не видна в личном срезе');
    mustEqual(mine.status, 'pending', 'статус только что созданной записи');

    return 'видна клиенту, статус pending';
  }, client.page);

  await step('step-5', 'владельцу запись видна в срезе ЛИЦА, а не всех его лиц', async () => {
    const response = await api(owner.page, 'GET', `/api/bookings?scope=owner&faceType=club&faceId=${made.clubId}`);

    mustEqual(response.status, 200, `срез лица: ${response.text}`);

    const rows = response.body?.data ?? [];

    must(rows.some((row) => row.id === made.bookingId), 'записи нет в срезе своего лица');
    must(
      rows.every((row) => row.ownerClubId === made.clubId || row.clubId === made.clubId),
      'в срез лица попали записи чужих публикаций',
    );

    return `в срезе лица ${rows.length} записей, все — этого клуба`;
  }, owner.page);

  console.log('\n=== Отказы приходят от ВЛАДЕНИЯ, а не от роли ===');

  await step('step-3f', 'клиент не решает по своей же заявке — отказ по владению слотом', async () => {
    const response = await api(client.page, 'POST', `/api/bookings/${made.bookingId}/reject`, {
      reason: 'Причина отказа, достаточно длинная для схемы.',
    });

    mustEqual(response.status, 403, `клиент отклонил заявку: ${response.text}`);
    // ⚠️ Текст сверяется намеренно: общее «Недостаточно прав» означало бы, что
    // вернулась проверка по роли, а не по владению слотом.
    must(
      /отклонения записи/i.test(String(response.body?.error ?? '')),
      `отказ пришёл не от владения слотом: ${response.body?.error}`,
    );

    return 'отказ по владению слотом, текст точный';
  }, client.page);

  await step('step-1-admin', 'служебная запись не записывается', async () => {
    const adminSlot = made.slots[made.slots.length - 1];
    const before = readDb(`SELECT count(*) FROM bookings WHERE schedule_id=${adminSlot};`);
    const response = await api(admin.page, 'POST', '/api/bookings', {
      scheduleId: adminSlot,
      name: 'Администратор',
      phone: '+7 (900) 556-00-12',
    });

    mustEqual(response.status, 403, `администратор записался: ${response.text}`);
    must(
      /пользователям площадки/i.test(String(response.body?.error ?? '')),
      `отказ пришёл не от правила «не человек площадки»: ${response.body?.error}`,
    );
    mustEqual(readDb(`SELECT count(*) FROM bookings WHERE schedule_id=${adminSlot};`), before, 'строка создана');

    return 'отказ 403, строка не создана';
  }, admin.page);

  console.log('\n=== Подтверждение, уведомление, отклонение с причиной ===');

  await step('confirm-1', 'владелец подтверждает чужую заявку', async () => {
    const response = await api(owner.page, 'POST', `/api/bookings/${made.bookingId}/confirm`, {});

    mustEqual(response.status, 200, `подтверждение: ${response.text}`);
    mustEqual(readDb(`SELECT status FROM bookings WHERE id=${made.bookingId};`), 'confirmed', 'статус в базе');

    return 'статус confirmed';
  }, owner.page);

  await step('confirm-2', 'клиент получил уведомление о подтверждении — в ЛИЧНЫЙ ящик', async () => {
    const personal = readDb(
      `SELECT count(*) FROM notifications WHERE user_id=${users[E2E_USERS.client]} AND type='booking_confirmed' AND addressee_club_id IS NULL AND addressee_trainer_id IS NULL;`,
    );

    must(Number(personal) > 0, 'уведомление о подтверждении не пришло клиенту');

    return `личных уведомлений о подтверждении: ${personal}`;
  }, client.page);

  await step('step-3a', 'отклонение с причиной: причина доезжает до уведомления', async () => {
    const created = await api(client.page, 'POST', '/api/bookings', {
      scheduleId: nextSlot(),
      name: 'Клиент прогона',
      phone: '+7 (900) 556-00-11',
    });

    must(created.status === 201 || created.status === 200, `вторая запись: ${created.text}`);

    const id = created.body?.data?.id;
    const response = await api(owner.page, 'POST', `/api/bookings/${id}/reject`, {
      reason: 'Время не подходит',
    });

    mustEqual(response.status, 200, `отклонение: ${response.text}`);
    mustEqual(readDb(`SELECT status FROM bookings WHERE id=${id};`), 'rejected_by_provider', 'статус');

    const payload = readDb(
      `SELECT payload::text FROM notifications WHERE user_id=${users[E2E_USERS.client]} AND type='booking_rejected' ORDER BY id DESC LIMIT 1;`,
    );

    must(payload.includes('Время не подходит'), `причина не доехала до уведомления: ${payload}`);

    return 'статус rejected_by_provider, причина в уведомлении';
  }, owner.page);

  await step('step-3c', 'отклонение без причины проходит, клиент получает общий текст', async () => {
    const created = await api(client.page, 'POST', '/api/bookings', {
      scheduleId: nextSlot(),
      name: 'Клиент прогона',
      phone: '+7 (900) 556-00-11',
    });
    const id = created.body?.data?.id;
    const response = await api(owner.page, 'POST', `/api/bookings/${id}/reject`, {});

    mustEqual(response.status, 200, `отклонение без причины: ${response.text}`);
    mustEqual(readDb(`SELECT status FROM bookings WHERE id=${id};`), 'rejected_by_provider', 'статус');

    return 'причина необязательна';
  }, owner.page);

  console.log('\n=== Своя запись: решение принимает вторая сторона ===');

  let ownBookingId = null;

  await step('own-1', 'владелец записывается на своё занятие — успех', async () => {
    const response = await api(owner.page, 'POST', '/api/bookings', {
      scheduleId: nextSlot(),
      name: 'Владелец',
      phone: '+7 (900) 556-00-13',
    });

    must(response.status === 201 || response.status === 200, `запись владельца: ${response.text}`);
    ownBookingId = response.body?.data?.id;

    mustEqual(readDb(`SELECT user_id FROM bookings WHERE id=${ownBookingId};`), String(users[E2E_USERS.builder]), 'запись создана не на владельца');

    return 'владелец ходит в свой зал (решение 16)';
  }, owner.page);

  for (const [id, action] of [['own-2', 'confirm'], ['own-3', 'reject']]) {
    await step(id, `${action} по своей записи — 403 «вторая сторона»`, async () => {
      const before = readDb(`SELECT status FROM bookings WHERE id=${ownBookingId};`);
      const body = action === 'reject' ? { reason: 'Причина отказа, достаточно длинная.' } : {};
      const response = await api(owner.page, 'POST', `/api/bookings/${ownBookingId}/${action}`, body);

      mustEqual(response.status, 403, `${action} по своей записи прошёл: ${response.text}`);
      must(
        /вторая сторона/i.test(String(response.body?.error ?? '')),
        `отказ пришёл не от правила «сам себе»: ${response.body?.error}`,
      );
      mustEqual(readDb(`SELECT status FROM bookings WHERE id=${ownBookingId};`), before, 'статус изменился');

      return `отказ 403, статус остался ${before}`;
    }, owner.page);
  }

  await step('own-5', 'своя запись видна В ОБОИХ срезах — как клиента и как публикации', async () => {
    const asClient = await api(owner.page, 'GET', '/api/bookings');
    const asOwner = await api(owner.page, 'GET', `/api/bookings?scope=owner&faceType=club&faceId=${made.clubId}`);

    must((asClient.body?.data ?? []).some((row) => row.id === ownBookingId), 'своей записи нет в личном срезе');
    must((asOwner.body?.data ?? []).some((row) => row.id === ownBookingId), 'своей записи нет в срезе лица');

    return 'видна и как запись клиента, и как запись публикации';
  }, owner.page);

  await step('own-6', 'себя в собственном списке клиентов нет', async () => {
    const response = await api(owner.page, 'GET', '/api/users?scope=clients');

    mustEqual(response.status, 200, `список клиентов: ${response.text}`);
    must(
      !(response.body?.data ?? []).some((row) => row.id === Number(users[E2E_USERS.builder])),
      'владелец увидел себя в собственной клиентской базе',
    );

    return 'себя в своей базе нет';
  }, owner.page);

  console.log('\n=== Срезы записей закрыты по владению ===');

  await step('scope-1', 'человеку без лиц срез владельца отвечает ОТКАЗОМ, а не пустотой', async () => {
    const nobody = await freshContext();
    await loginAs(nobody.page, E2E_USERS.stranger, {});

    for (const scope of ['owner', 'clients']) {
      const response = await api(nobody.page, 'GET', `/api/bookings?scope=${scope}`);

      mustEqual(response.status, 403, `?scope=${scope} у человека без лиц ответил ${response.status}`);
    }

    await nobody.context.close();

    return 'оба среза — 403, а не пустой список';
  }, owner.page);

  await step('scope-2', 'полный срез площадки закрыт правом администратора', async () => {
    const response = await api(owner.page, 'GET', '/api/bookings?scope=all');

    mustEqual(response.status, 403, `полный срез открылся обычному человеку: ${response.status}`);

    const asAdmin = await api(admin.page, 'GET', '/api/bookings?scope=all');

    mustEqual(asAdmin.status, 200, 'полный срез закрыт даже администратору');

    return 'человеку 403, администратору 200';
  }, owner.page);

  await step('scope-3', 'ЧУЖОЕ лицо в паре — отказ; половина пары — разбор', async () => {
    const foreign = await api(owner.page, 'GET', '/api/bookings?scope=owner&faceType=club&faceId=1');
    const half = await api(owner.page, 'GET', '/api/bookings?scope=owner&faceId=1');

    mustEqual(foreign.status, 403, `чужое лицо отдало срез: ${foreign.status}`);
    mustEqual(half.status, 400, `половина пары принята: ${half.status}`);

    return 'чужое лицо 403, половина пары 400';
  }, owner.page);

  console.log('\n=== Отмены: сторона и своевременность ===');

  await step('cancel-1', 'клиент отменяет свою запись — сторона клиента', async () => {
    const created = await api(client.page, 'POST', '/api/bookings', {
      scheduleId: nextSlot(),
      name: 'Клиент прогона',
      phone: '+7 (900) 556-00-11',
    });
    const id = created.body?.data?.id;

    const response = await api(client.page, 'POST', `/api/bookings/${id}/cancel`, {});

    mustEqual(response.status, 200, `отмена клиентом: ${response.text}`);
    mustEqual(readDb(`SELECT status FROM bookings WHERE id=${id};`), 'cancelled_by_athlete', 'сторона отмены');
    // Слот в будущем на девять дней — отмена своевременная.
    mustEqual(readDb(`SELECT coalesce(cancel_reason,'-') FROM bookings WHERE id=${id};`), 'on_time', 'своевременность отмены');

    return 'cancelled_by_athlete, on_time';
  }, client.page);

  await step('cancel-5', 'чужую запись не отменить — она на месте', async () => {
    const created = await api(client.page, 'POST', '/api/bookings', {
      scheduleId: nextSlot(),
      name: 'Клиент прогона',
      phone: '+7 (900) 556-00-11',
    });
    const id = created.body?.data?.id;

    const nobody = await freshContext();
    await loginAs(nobody.page, E2E_USERS.stranger, {});

    const response = await api(nobody.page, 'DELETE', `/api/bookings/${id}`);

    must([401, 403, 404].includes(response.status), `посторонний отменил чужую запись: ${response.status}`);
    mustEqual(readDb(`SELECT status FROM bookings WHERE id=${id};`), 'pending', 'статус чужой записи изменился');

    await nobody.context.close();

    return `отказ ${response.status}, запись на месте`;
  }, client.page);

  await step('cancel-4', 'владелец отменяет подтверждённую — сторона услуг, клиент извещён', async () => {
    const before = Number(
      readDb(`SELECT count(*) FROM notifications WHERE user_id=${users[E2E_USERS.client]};`),
    );
    const response = await api(owner.page, 'POST', `/api/bookings/${made.bookingId}/cancel`, {});

    mustEqual(response.status, 200, `отмена владельцем: ${response.text}`);
    mustEqual(readDb(`SELECT status FROM bookings WHERE id=${made.bookingId};`), 'cancelled_by_provider', 'сторона отмены');

    const after = Number(
      readDb(`SELECT count(*) FROM notifications WHERE user_id=${users[E2E_USERS.client]};`),
    );

    must(after > before, 'клиента об отмене не известили');

    return 'cancelled_by_provider, клиент извещён';
  }, owner.page);

  // Не прогоняется — с причиной у каждого.
  for (const [id, title, reason] of [
    ['step-4-checkin', 'автоматический переход в unmarked через 48 часов', 'требует сдвига времени на двое суток; переход покрыт тестами FSM на бэкенде'],
    ['auto-cancel', 'автоотмена pending за час до слота', 'требует слота меньше чем через час; правило покрыто тестами `runLazyTransitions`'],
    ['snapshot', 'снимок политики отмены переживает правку услуги', 'требует отмены за 25 часов до слота — сдвиг времени; снимок покрыт тестами записей'],
    ['ui-modal', 'модалка причины отказа: открытие, отмена, пустое поле при повторном открытии', 'проверка интерфейса модалки; покрыта тестами компонента на фронте'],
  ]) skip(id, title, reason);

  await shutdown();

  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'skip').length;

  console.log(`\nИтог: ${pass} прошло, ${fail} упало, ${skipped} не прогонялось.`);
  fs.writeFileSync('/tmp/e2e-booking-fsm.json', JSON.stringify(results, null, 2));

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

// Браузерный прогон чек-листа фазы 36 «Закрытие долга» — `tests/checklists/phase-36-debt.md`.
//
// Запуск: E2E_RUN_TAG=e2e-phase36 node tests/e2e-phase-36-run.mjs
//
// ⚠️ Свой признак прогона обязателен: прогонов несколько, они ходят в ОДНУ базу,
// и общий признак означал бы, что уборка одного сносит данные другого.
//
// ⚠️ Правило прогона (шапка самого чек-листа): шаг НЕ засчитывается по коду ответа.
// 200 без проверки того, что на экране, и 409 без проверки, что данные целы, —
// это не пройденный шаг. Фаза целиком про то, что сервер и браузер расходятся,
// поэтому ключевые действия идут ЧЕРЕЗ ИНТЕРФЕЙС (модалка правки, кнопка «Удалить»
// с подтверждением, раздел модерации, колокольчик), а не только запросом.
//
// ⚠️ Живые публикации прогон не трогает: сценарии скрывают, архивируют и отменяют
// записи. Все публикации заводятся прогоном и сносятся `cleanupRun()` в `finally`.
//
// ⚠️ Два осознанных отступления от буквы чек-листа, оба названы вслух и повторены
// в отчёте:
//   1. Личности разведены по ОТДЕЛЬНЫМ браузерным контекстам, а не сменой сессии
//      в одном окне. Требование «один контекст на сессию» написано под ручной
//      прогон MCP, где вкладка одна; отдельный контекст даёт то же самое строже —
//      гость гарантированно без cookie. Исключение — сценарий 7: там мусорная
//      cookie ставится ПОСЛЕ выхода в том же контексте, как чек-лист и требует.
//   2. Сценарий 8 («человек без единого лица») идёт от `E2E_USERS.client`, а не
//      от `builder`: к моменту сценария 8 у `builder` уже три лица прогона —
//      он их и заводил в сценариях 1–6. `client` к этому шагу лиц не имеет
//      ни одного, то есть проверяется ровно тот случай, который назван.
//   3. step-62 («модератором скрыть публикацию — критичное уведомление клиенту
//      приходит») идёт через отмену записей провайдером. Само скрытие клиенту
//      не пишет ничего, а при живых записях отклоняется (решение 21): чтобы
//      скрыть, записи сперва отменяют — и вот эта отмена и есть критичный
//      `booking_cancelled_by_provider`. Проверяется тот же запрет: обязательный
//      тип не выключается ни галочкой, ни запросом в обход неё.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// ⚠️ Каталог снимков задаётся ДО загрузки обвязки: она читает переменную окружения
// на уровне модуля, а статический импорт выполнился бы раньше присваивания.
// Отсюда динамический импорт — иначе снимки падений фазы 36 легли бы в папку фазы 35.
process.env.E2E_SHOTS_DIR ??= path.join(path.dirname(new URL(import.meta.url).pathname), 'screenshots', 'phase-36');

const { BASE, api, freshContext, futureDate, launch, loginAs, must, mustEqual, rawResponse, results, shutdown, skip, step, whoAmI } =
  await import('./e2e-phase-35-harness.mjs');
const { E2E_USERS, RUN_TAG, cleanupRun, readDb, seedRunUsers } = await import('../scripts/e2e-fixture.mjs');

/** Модератор фикстурой не заводится: им может быть только живая служебная запись. */
const ADMIN = 'admin@sporthub.local';
/** Живой человек с карточками — условие приёмки 14. */
const SEEDED_TRAINER = 'trainer@sporthub.local';

/** Тело публикации клуба. Слоты идут списком: чек-лист требует двух и более. */
const clubForm = (name, slots, over = {}) => ({
  name,
  city: 'Самара',
  address: 'ул. Долговая, 1',
  description:
    'Клуб для прогона чек-листа фазы 36. Описание длиной заведомо больше пятидесяти символов, как требует схема.',
  phone: '+7 (900) 558-00-10',
  email: `${RUN_TAG}-club@test.local`,
  priceFrom: '700',
  sportIds: [1, 3],
  tagIds: [],
  amenityIds: [],
  vk: '',
  telegram: '',
  facebook: '',
  coordinates: { lat: 53.2, lng: 50.1 },
  cityCoordinates: { lat: 53.2, lng: 50.1 },
  scheduleSlots: slots,
  ...over,
});

const slot = (title, days, startTime, endTime) => ({
  title,
  date: futureDate(days),
  startTime,
  endTime,
  price: '700',
  capacity: '10',
  location: 'Зал',
  sportId: 1,
});

/** Тело публикации карточки тренера. `clubId` заводит подтверждённую связь сразу. */
const trainerForm = (last, clubId, over = {}) => ({
  firstName: RUN_TAG,
  lastName: last,
  city: 'Самара',
  address: 'ул. Долговая, 2',
  bio: 'Карточка для прогона чек-листа фазы 36. Описание длиной заведомо больше пятидесяти символов, как требует схема.',
  experience: '5',
  sportIds: [1, 3],
  specialtyIds: [1],
  workFormatIds: [1],
  phone: '+7 (900) 558-00-11',
  vk: '',
  telegram: '',
  facebook: '',
  offeringName: 'Персональная',
  offeringDescription: 'Один на один',
  offeringFormat: 'Индивидуально',
  offeringPrice: '1500',
  offeringDuration: '60',
  offeringLocation: 'Зал',
  clubId,
  coordinates: { lat: 53.2, lng: 50.1 },
  cityCoordinates: { lat: 53.2, lng: 50.1 },
  scheduleSlots: [slot('Персоналка прогона', 15, '12:00', '13:00')],
  ...over,
});

/** Снимок расписания «до слота»: сравнивается поле в поле, а не по длине массива. */
const scheduleShot = (detail) =>
  (detail?.schedule ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    date: item.date,
    startTime: item.startTime,
    endTime: item.endTime,
    price: item.price,
    capacity: item.capacity,
  }));

/** Открыть модалку правки публикации из кабинета лица и дождаться её отрисовки. */
async function openEditModal(page, kind) {
  await page.getByRole('button', { name: 'Редактировать' }).first().click();
  const title = kind === 'club' ? 'Редактировать клуб' : 'Редактировать карточку тренера';
  await page.getByRole('button', { name: 'Сохранить изменения' }).waitFor({ state: 'visible', timeout: 10_000 });
  return title;
}

/**
 * Текст сообщения модалки (`role="status"` в её подвале) или пустая строка.
 *
 * ⚠️ Поиск ОБЯЗАН быть внутри `[role="dialog"]`. Успешное сохранение закрывает
 * модалку и показывает уведомление кабинета — оно тоже `role="status"`, и общий
 * поиск по странице выдавал «Изменения клуба сохранены» как текст отказа: шаг
 * краснел на успехе.
 */
async function modalNotice(page) {
  const notice = page.locator('[role="dialog"] [role="status"]').first();
  if ((await notice.count()) === 0) return '';
  try {
    return (await notice.innerText({ timeout: 3_000 })).trim();
  } catch {
    return '';
  }
}

/**
 * Удалить слот по названию прямо в форме.
 *
 * ⚠️ Кнопка «Удалить» у слота рисуется только когда слотов больше одного —
 * так устроен `ScheduleSlotsEditor`, и чек-лист про это предупреждает отдельно.
 * Ищем блок слота от поля с названием вверх до ближайшего предка, у которого
 * своя кнопка «Удалить»: привязываться к именам классов нельзя, они меняются
 * при первой же правке вёрстки.
 */
async function removeSlotByTitle(page, title) {
  await page.evaluate((needle) => {
    const field = [...document.querySelectorAll('input')].find((input) => input.value === needle);
    if (!field) throw new Error(`слот «${needle}» не найден в форме`);

    let node = field.parentElement;
    while (node) {
      const button = [...node.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Удалить');
      if (button) {
        button.click();
        return;
      }
      node = node.parentElement;
    }

    throw new Error(`кнопки «Удалить» у слота «${needle}» нет — слотов меньше двух?`);
  }, title);
}

/** Сохранить модалку и дождаться либо её закрытия, либо сообщения об отказе. */
async function saveModal(page) {
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await page.waitForTimeout(1_500);
  return modalNotice(page);
}

/** Скрыть или вернуть публикацию модератором. Запрос идёт из БРАУЗЕРА админа. */
const moderate = (page, action, entityType, entityId, reason) =>
  api(page, 'POST', '/api/moderation', { action, entityType, entityId, ...(reason ? { reason } : {}) });

/** Живые будущие записи публикации — счётчик для сверки «данные целы». */
const liveBookings = (clubId) =>
  Number(
    readDb(
      `SELECT count(*) FROM bookings WHERE owner_club_id = ${clubId} AND status IN ('pending','confirmed') AND date >= current_date;`,
    ),
  );

async function main() {
  const users = seedRunUsers();
  console.log(`Люди прогона: ${Object.keys(users).length}`);

  await launch();

  const owner = await freshContext();
  const stranger = await freshContext();
  const client = await freshContext();
  const admin = await freshContext();
  const guest = await freshContext();

  await loginAs(owner.page, E2E_USERS.builder);
  await loginAs(stranger.page, E2E_USERS.stranger);
  await loginAs(client.page, E2E_USERS.client);
  await loginAs(admin.page, ADMIN, { portal: 'service' });

  // ───────────────────────── Данные прогона ─────────────────────────
  // Клуб А — сценарии 1, 2, 5, 6. Клуб Б — сценарий 4 (архив) и площадка тренера.
  // Карточка Т — сценарий 3.
  const made = { clubA: null, slugA: '', slotsA: [], clubB: null, slugB: '', trainer: null, slugT: '', slotsT: [], bookingId: null };

  const createA = await api(owner.page, 'POST', '/api/clubs', clubForm(`${RUN_TAG} Клуб А`, [
    slot('Занятие А1', 11, '10:00', '11:00'),
    slot('Занятие А2', 12, '10:00', '11:00'),
    slot('Занятие А3', 13, '10:00', '11:00'),
  ]));
  must(createA.status === 201 || createA.status === 200, `клуб А не создан: ${createA.status} ${createA.text}`);
  made.clubA = createA.body?.data?.club?.id;
  made.slugA = createA.body?.data?.club?.slug;
  made.slotsA = (createA.body?.data?.schedules ?? []).map((item) => item.id);

  const createB = await api(owner.page, 'POST', '/api/clubs', clubForm(`${RUN_TAG} Клуб Б`, [
    slot('Занятие Б1', 14, '10:00', '11:00'),
    slot('Занятие Б2', 16, '10:00', '11:00'),
  ]));
  must(createB.status === 201 || createB.status === 200, `клуб Б не создан: ${createB.status} ${createB.text}`);
  made.clubB = createB.body?.data?.club?.id;
  made.slugB = createB.body?.data?.club?.slug;

  const createT = await api(owner.page, 'POST', '/api/trainers', trainerForm('Тренер', made.clubB));
  must(createT.status === 201 || createT.status === 200, `карточка тренера не создана: ${createT.status} ${createT.text}`);
  made.trainer = createT.body?.data?.trainer?.id;
  made.slugT = createT.body?.data?.trainer?.slug;
  // Слоты карточки нужны сценарию 11: на них записывается клиент, чтобы отличить
  // «настройка лица применилась» от «применилась личная».
  made.slotsT = (createT.body?.data?.schedules ?? []).map((item) => item.id);

  const book = await api(client.page, 'POST', '/api/bookings', { scheduleId: made.slotsA[0] });
  must(book.status === 201 || book.status === 200, `запись клиента не создана: ${book.status} ${book.text}`);
  made.bookingId = book.body?.data?.id;

  console.log(`Данные прогона: клуб А ${made.clubA}, клуб Б ${made.clubB}, карточка ${made.trainer}, запись ${made.bookingId}`);

  // ═════════════ Сценарий 1: правка публикации не трогает расписание ═════════════
  console.log('\n=== Сценарий 1. Правка не трогает расписание ===');
  let baseline = [];
  let baselineBookings = 0;
  let baselineStatus = '';

  await step('step-1', 'кабинет клуба открыт владельцем', async () => {
    await owner.page.goto(`${BASE}/profile/club/${made.clubA}/publications`, { waitUntil: 'domcontentloaded' });
    await owner.page.getByText('Мои публикации').first().waitFor({ timeout: 15_000 });
    const html = await owner.page.content();
    must(html.includes(`${RUN_TAG} Клуб А`), 'публикации прогона нет в кабинете лица');
    return 'раздел публикаций показывает клуб прогона';
  }, owner.page);

  await step('step-2', 'снят эталон расписания и записей', async () => {
    const detail = await api(owner.page, 'GET', `/api/clubs/${made.clubA}`);
    mustEqual(detail.status, 200, 'ответ карточки клуба владельцу');
    baseline = scheduleShot(detail.body?.data);
    must(baseline.length >= 2, `слотов у клуба прогона: ${baseline.length}, нужно два и более`);
    baselineBookings = liveBookings(made.clubA);
    baselineStatus = readDb(`SELECT status FROM bookings WHERE id = ${made.bookingId};`);
    mustEqual(baselineBookings, 1, 'живых будущих записей на старте');
    return `слотов ${baseline.length}, живых записей ${baselineBookings}, статус записи «${baselineStatus}»`;
  }, owner.page);

  await step('step-3', 'модалка правки открывается из карточки публикации', async () => {
    await openEditModal(owner.page, 'club');
    const phone = await owner.page.getByLabel('Телефон', { exact: true }).inputValue();
    must(phone.trim() !== '', 'модалка открылась пустой — правка не подхватила данные публикации');
    return `форма правки открыта, телефон «${phone}»`;
  }, owner.page);

  await step('step-4', 'изменён ТОЛЬКО телефон, изменения сохранены', async () => {
    await owner.page.getByLabel('Телефон', { exact: true }).fill('+7 (900) 558-00-99');
    const notice = await saveModal(owner.page);
    must(notice === '', `сохранение отказало: ${notice}`);
    const detail = await api(owner.page, 'GET', `/api/clubs/${made.clubA}`);
    mustEqual(detail.body?.data?.club?.phone, '+7 (900) 558-00-99', 'телефон после правки');
    return 'телефон сохранён';
  }, owner.page);

  await step('step-5', 'расписание совпадает с эталоном ДО СЛОТА', async () => {
    const detail = await api(owner.page, 'GET', `/api/clubs/${made.clubA}`);
    const after = scheduleShot(detail.body?.data);
    mustEqual(JSON.stringify(after), JSON.stringify(baseline), 'расписание после правки телефона');
    return `слоты целы, номера прежние: ${after.map((item) => item.id).join(',')}`;
  }, owner.page);

  await step('step-6', 'число записей и статус записи не изменились', async () => {
    mustEqual(liveBookings(made.clubA), baselineBookings, 'живых записей после правки');
    mustEqual(readDb(`SELECT status FROM bookings WHERE id = ${made.bookingId};`), baselineStatus, 'статус записи после правки');
    return `записей ${baselineBookings}, статус «${baselineStatus}»`;
  }, owner.page);

  await step('step-7', 'удаление слота с живой записью отправлено формой', async () => {
    await owner.page.reload({ waitUntil: 'domcontentloaded' });
    await owner.page.getByText('Мои публикации').first().waitFor({ timeout: 15_000 });
    await openEditModal(owner.page, 'club');
    await removeSlotByTitle(owner.page, 'Занятие А1');
    const notice = await saveModal(owner.page);
    must(notice !== '', 'форма промолчала: отказа на экране нет');
    return `сообщение формы: «${notice}»`;
  }, owner.page);

  await step('step-8', 'отказ с ЧИСЛОМ записей на экране, слот и запись целы', async () => {
    const notice = await modalNotice(owner.page);
    must(/\(\s*1\s*\)/.test(notice), `в сообщении нет числа записей: «${notice}»`);
    must(notice.toLowerCase().includes('отмените'), `сообщение не называет следующий шаг: «${notice}»`);
    const detail = await api(owner.page, 'GET', `/api/clubs/${made.clubA}`);
    const after = scheduleShot(detail.body?.data);
    mustEqual(JSON.stringify(after), JSON.stringify(baseline), 'расписание после отказа');
    mustEqual(liveBookings(made.clubA), 1, 'живых записей после отказа');
    mustEqual(readDb(`SELECT status FROM bookings WHERE id = ${made.bookingId};`), baselineStatus, 'статус записи после отказа');
    return `отказ назвал число, слоты и запись целы`;
  }, owner.page);

  await step('step-9', 'после отмены записи слот удаляется', async () => {
    const cancel = await api(client.page, 'POST', `/api/bookings/${made.bookingId}/cancel`, {});
    must(cancel.status === 200, `отмена записи клиентом: ${cancel.status} ${cancel.text}`);
    mustEqual(liveBookings(made.clubA), 0, 'живых записей после отмены');

    await owner.page.reload({ waitUntil: 'domcontentloaded' });
    await owner.page.getByText('Мои публикации').first().waitFor({ timeout: 15_000 });
    await openEditModal(owner.page, 'club');
    await removeSlotByTitle(owner.page, 'Занятие А1');
    const notice = await saveModal(owner.page);
    must(notice === '', `удаление слота отказало: «${notice}»`);

    const detail = await api(owner.page, 'GET', `/api/clubs/${made.clubA}`);
    const after = scheduleShot(detail.body?.data);
    mustEqual(after.length, baseline.length - 1, 'число слотов после удаления');
    must(!after.some((item) => item.title === 'Занятие А1'), 'удалённый слот остался в расписании');
    made.slotsA = after.map((item) => item.id);
    return `слотов осталось ${after.length}`;
  }, owner.page);

  // ═════════════ Сценарий 2: скрытая публикация клуба и три смотрящих ═════════════
  console.log('\n=== Сценарий 2. Скрытый клуб и три смотрящих ===');

  await step('step-10', 'модератор вошёл и открыл раздел модерации', async () => {
    await admin.page.goto(`${BASE}/service-portal/moderation`, { waitUntil: 'domcontentloaded' });
    await admin.page.getByText('Модерация публикаций').first().waitFor({ timeout: 15_000 });
    const me = await whoAmI(admin.page);
    mustEqual(me?.accountKind ?? me?.account_kind ?? 'admin', 'admin', 'вид учётной записи модератора');
    return 'раздел модерации открыт служебной записью';
  }, admin.page);

  await step('step-11', 'публикация клуба скрыта с причиной', async () => {
    const response = await moderate(admin.page, 'hide', 'club', made.clubA, `${RUN_TAG}: причина скрытия прогона`);
    mustEqual(response.status, 200, `скрытие клуба: ${response.text}`);
    mustEqual(readDb(`SELECT status FROM clubs WHERE id = ${made.clubA};`), 'hidden', 'статус клуба в базе');
    mustEqual(readDb(`SELECT hidden_kind FROM clubs WHERE id = ${made.clubA};`), 'moderation', 'вид скрытия в базе');
    await admin.page.reload({ waitUntil: 'domcontentloaded' });
    await admin.page.getByText('Модерация публикаций').first().waitFor({ timeout: 15_000 });
    const html = await admin.page.content();
    must(html.includes('Скрыто модератором') || html.includes('Скрыто'), 'раздел модерации не показывает скрытие');
    return 'скрыто модератором, причина записана';
  }, admin.page);

  await step('step-12', 'гостю карточка клуба по прямой ссылке — «не найдено»', async () => {
    const response = await rawResponse(guest.page, `/clubs/${made.slugA}`);
    mustEqual(response.status, 404, 'страница скрытого клуба гостю');
    must(!response.body.includes(`${RUN_TAG} Клуб А`), 'в теле страницы 404 оказалось имя скрытой публикации');
    return 'страница отвечает 404 и имени не выдаёт';
  }, guest.page);

  await step('step-13', 'гостю скрытая недоступна ни одним из ШЕСТИ путей', async () => {
    const byId = await api(guest.page, 'GET', `/api/clubs/${made.clubA}`);
    const bySlug = await api(guest.page, 'GET', `/api/clubs/by-slug/${made.slugA}`);
    const list = await api(guest.page, 'GET', '/api/clubs');
    const hiddenList = await api(guest.page, 'GET', '/api/clubs?includeHidden=true');
    const slotContext = await api(guest.page, 'GET', `/api/schedule/${made.slotsA[0]}/context`);
    const clubTrainers = await api(guest.page, 'GET', `/api/trainers?clubId=${made.clubA}`);

    mustEqual(byId.status, 404, 'путь 1: карточка по номеру');
    mustEqual(bySlug.status, 404, 'путь 2: карточка по адресу-ссылке');
    mustEqual(list.status, 200, 'путь 3: список каталога отвечает');
    must(!(list.body?.data ?? []).some((club) => club.id === made.clubA), 'путь 3: скрытая в каталоге');
    mustEqual(hiddenList.status, 200, 'путь 4: includeHidden сужает, а не отказывает');
    must(!(hiddenList.body?.data ?? []).some((club) => club.id === made.clubA), 'путь 4: includeHidden отдал скрытую гостю');
    mustEqual(slotContext.status, 404, 'путь 5: контекст слота');
    must(!clubTrainers.text.includes(`${RUN_TAG} Клуб А`), 'путь 6: список тренеров клуба выдал скрытую публикацию');
    return 'все шесть путей молчат; отказ 404, а не 403';
  }, guest.page);

  await step('step-14', 'гостю публикации нет ни в каталоге, ни в расписании', async () => {
    const schedule = await api(guest.page, 'GET', '/api/schedule');
    mustEqual(schedule.status, 200, 'ответ расписания');
    const leaked = (schedule.body?.data ?? []).filter((item) => made.slotsA.includes(item.id));
    mustEqual(leaked.length, 0, `слотов скрытой публикации в общем расписании: ${leaked.length}`);
    return 'слотов скрытой публикации в расписании нет';
  }, guest.page);

  await step('step-15', 'вошедшему постороннему — тоже «не найдено»', async () => {
    const page = await rawResponse(stranger.page, `/clubs/${made.slugA}`);
    const detail = await api(stranger.page, 'GET', `/api/clubs/${made.clubA}`);
    mustEqual(page.status, 404, 'страница скрытого клуба постороннему');
    mustEqual(detail.status, 404, 'карточка скрытого клуба постороннему');
    return 'вошедший посторонний идёт той же веткой, что и гость';
  }, stranger.page);

  await step('step-16', 'владелец видит свою скрытую — карточка с плашкой и причиной', async () => {
    await owner.page.goto(`${BASE}/clubs/${made.slugA}`, { waitUntil: 'domcontentloaded' });
    const notice = owner.page.locator('[data-testid="hidden-publication-notice"]');
    await notice.waitFor({ timeout: 15_000 });
    // ⚠️ Сравнение без учёта регистра: подпись печатается капслоком правилом CSS
    // (`uppercase`), и `innerText` отдаёт её именно так, как видит человек.
    const text = (await notice.innerText()).toLowerCase();
    must(text.includes('скрыто модератором'), `плашка не называет модерацию: «${text}»`);
    must(text.includes(`${RUN_TAG.toLowerCase()}: причина скрытия прогона`), `плашка не показала причину: «${text}»`);
    const html = await owner.page.content();
    must(html.includes(`${RUN_TAG} Клуб А`), 'карточка владельцу не отрисована — только плашка');
    return 'карточка целиком плюс плашка с причиной';
  }, owner.page);

  await step('step-17', 'модератор видит ту же карточку целиком', async () => {
    const page = await rawResponse(admin.page, `/clubs/${made.slugA}`);
    mustEqual(page.status, 200, 'страница скрытого клуба модератору');
    must(page.body.includes(`${RUN_TAG} Клуб А`), 'модератору не отрисовано имя публикации');
    return 'модератору карточка отдана';
  }, admin.page);

  await step('step-18', 'запись на слот скрытой публикации отклонена', async () => {
    const asGuest = await api(guest.page, 'POST', '/api/bookings', { scheduleId: made.slotsA[0] });
    const asClient = await api(client.page, 'POST', '/api/bookings', { scheduleId: made.slotsA[0] });
    must(asGuest.status !== 201 && asGuest.status !== 200, `гость записался: ${asGuest.status}`);
    must(asClient.status !== 201 && asClient.status !== 200, `вошедший записался на скрытую: ${asClient.status} ${asClient.text}`);
    mustEqual(liveBookings(made.clubA), 0, 'записей после попыток');
    return `гость ${asGuest.status}, вошедший ${asClient.status}`;
  }, client.page);

  // ═════════════ Сценарий 3: то же для карточки тренера ═════════════
  console.log('\n=== Сценарий 3. Скрытая карточка тренера ===');

  await step('step-19', 'модератор скрыл карточку тренера прогона', async () => {
    const response = await moderate(admin.page, 'hide', 'trainer', made.trainer, `${RUN_TAG}: причина скрытия карточки`);
    mustEqual(response.status, 200, `скрытие карточки: ${response.text}`);
    mustEqual(readDb(`SELECT status FROM trainers WHERE id = ${made.trainer};`), 'hidden', 'статус карточки в базе');
    mustEqual(readDb(`SELECT hidden_kind FROM trainers WHERE id = ${made.trainer};`), 'moderation', 'вид скрытия карточки');
    return 'карточка скрыта модератором';
  }, admin.page);

  await step('step-20', 'гостю карточка тренера по прямой ссылке — «не найдено»', async () => {
    const page = await rawResponse(guest.page, `/trainers/${made.slugT}`);
    const byId = await api(guest.page, 'GET', `/api/trainers/${made.trainer}`);
    const bySlug = await api(guest.page, 'GET', `/api/trainers/by-slug/${made.slugT}`);
    mustEqual(page.status, 404, 'страница скрытой карточки гостю');
    mustEqual(byId.status, 404, 'карточка по номеру гостю');
    mustEqual(bySlug.status, 404, 'карточка по адресу-ссылке гостю');
    return 'страница и оба маршрута отвечают 404';
  }, guest.page);

  await step('step-21', 'на странице клуба-площадки скрытого тренера нет', async () => {
    const page = await rawResponse(guest.page, `/clubs/${made.slugB}`);
    mustEqual(page.status, 200, 'страница клуба-площадки гостю');
    must(page.body.includes(`${RUN_TAG} Клуб Б`), 'страница площадки отрисована без имени клуба');
    must(!page.body.includes(`${RUN_TAG} Тренер`), 'скрытый тренер остался в списке тренеров клуба');
    return 'клуб виден, скрытый тренер из списка ушёл';
  }, guest.page);

  await step('step-22', 'владелец видит свою скрытую карточку с плашкой и причиной', async () => {
    await owner.page.goto(`${BASE}/trainers/${made.slugT}`, { waitUntil: 'domcontentloaded' });
    const notice = owner.page.locator('[data-testid="hidden-publication-notice"]');
    await notice.waitFor({ timeout: 15_000 });
    const text = (await notice.innerText()).toLowerCase();
    must(text.includes('скрыто модератором'), `плашка карточки не называет модерацию: «${text}»`);
    must(text.includes(`${RUN_TAG.toLowerCase()}: причина скрытия карточки`), `плашка карточки без причины: «${text}»`);
    return 'плашка и причина на месте';
  }, owner.page);

  // ═════════════ Сценарий 4: архив владельца — не скрытие модератором ═════════════
  console.log('\n=== Сценарий 4. Архив владельца ===');

  await step('step-23', 'владелец убрал публикацию в архив кнопкой «Удалить»', async () => {
    await owner.page.goto(`${BASE}/profile/club/${made.clubB}/publications`, { waitUntil: 'domcontentloaded' });
    await owner.page.getByText('Мои публикации').first().waitFor({ timeout: 15_000 });
    owner.page.once('dialog', (dialog) => {
      void dialog.accept();
    });
    await owner.page.getByRole('button', { name: 'Удалить' }).first().click();
    await owner.page.waitForTimeout(2_000);
    mustEqual(readDb(`SELECT status FROM clubs WHERE id = ${made.clubB};`), 'hidden', 'статус клуба Б после архивирования');
    mustEqual(readDb(`SELECT hidden_kind FROM clubs WHERE id = ${made.clubB};`), 'owner_archive', 'вид скрытия клуба Б');
    return 'клуб убран в архив владельцем';
  }, owner.page);

  await step('step-24', 'в кабинете плашка НЕ называет архив работой модератора', async () => {
    await owner.page.goto(`${BASE}/profile/club/${made.clubB}/publications`, { waitUntil: 'domcontentloaded' });
    await owner.page.getByText('Мои публикации').first().waitFor({ timeout: 15_000 });
    const list = owner.page.locator('[data-testid="provider-publications-list"]');
    const text = (await list.innerText()).trim();
    must(!/модератор|администратор/i.test(text), `кабинет называет архив владельца скрытием со стороны надзора: «${text.replace(/\s+/g, ' ').slice(0, 240)}»`);
    return 'подпись в кабинете про надзор не говорит';
  }, owner.page);

  await step('step-25', 'на публичной странице плашка называет архив, а не модерацию', async () => {
    await owner.page.goto(`${BASE}/clubs/${made.slugB}`, { waitUntil: 'domcontentloaded' });
    const notice = owner.page.locator('[data-testid="hidden-publication-notice"]');
    await notice.waitFor({ timeout: 15_000 });
    const text = (await notice.innerText()).toLowerCase();
    must(text.includes('убрано владельцем'), `плашка не называет архив: «${text}»`);
    must(!text.includes('модератор'), `архив владельца назван модерацией: «${text}»`);
    return 'плашка называет архив владельца';
  }, owner.page);

  await step('step-26', 'архив владельца не значится «Исправлено, ждёт проверки»', async () => {
    const awaiting = await api(admin.page, 'GET', '/api/publications?awaitingRecheck=true');
    mustEqual(awaiting.status, 200, 'отбор очереди повторной проверки');
    must(!(awaiting.body?.data ?? []).some((item) => item.type === 'club' && item.id === made.clubB),
      'архив владельца попал в очередь повторной проверки');
    const all = await api(admin.page, 'GET', '/api/publications?search=' + encodeURIComponent(`${RUN_TAG} Клуб Б`));
    const item = (all.body?.data ?? []).find((row) => row.type === 'club' && row.id === made.clubB);
    must(item !== undefined, 'клуб Б не найден в разделе модерации');
    mustEqual(item.hiddenKind, 'owner_archive', 'вид скрытия в разделе модерации');
    mustEqual(item.awaitingRecheck ?? false, false, 'признак повторной проверки у архива');
    must(item.status !== 'pending', 'архив владельца показан как «Новая, на проверке»');
    return 'очередь повторной проверки архив не считает своим';
  }, admin.page);

  await step('step-27', 'владелец вернул публикацию в каталог правкой', async () => {
    await owner.page.goto(`${BASE}/profile/club/${made.clubB}/publications`, { waitUntil: 'domcontentloaded' });
    await owner.page.getByText('Мои публикации').first().waitFor({ timeout: 15_000 });
    await openEditModal(owner.page, 'club');
    const notice = await saveModal(owner.page);
    must(notice === '', `возврат из архива отказал: «${notice}»`);
    mustEqual(readDb(`SELECT status FROM clubs WHERE id = ${made.clubB};`), 'published', 'статус клуба Б после возврата');
    const list = await api(guest.page, 'GET', '/api/clubs');
    must((list.body?.data ?? []).some((club) => club.id === made.clubB), 'вернувшаяся публикация не видна гостю');
    return 'публикация снова в каталоге и видна гостю';
  }, owner.page);

  // ═════════════ Сценарий 5: правка скрытой уходит на повторную проверку ═════════════
  console.log('\n=== Сценарий 5. Повторная проверка ===');

  await step('step-28', 'владелец исправил публикацию, скрытую модератором', async () => {
    mustEqual(readDb(`SELECT status FROM clubs WHERE id = ${made.clubA};`), 'hidden', 'клуб А на входе в сценарий 5');
    await owner.page.goto(`${BASE}/profile/club/${made.clubA}/publications`, { waitUntil: 'domcontentloaded' });
    await owner.page.getByText('Мои публикации').first().waitFor({ timeout: 15_000 });
    await openEditModal(owner.page, 'club');
    await owner.page.getByLabel('Телефон', { exact: true }).fill('+7 (900) 558-00-77');
    const notice = await saveModal(owner.page);
    must(notice === '', `правка скрытой публикации отказала: «${notice}»`);
    return 'правка сохранена';
  }, owner.page);

  await step('step-29', 'публикация ОСТАЛАСЬ скрытой, в каталоге её нет', async () => {
    mustEqual(readDb(`SELECT status FROM clubs WHERE id = ${made.clubA};`), 'hidden', 'статус после правки скрытой');
    mustEqual(readDb(`SELECT awaiting_recheck FROM clubs WHERE id = ${made.clubA};`), 't', 'признак повторной проверки');
    const list = await api(guest.page, 'GET', '/api/clubs');
    must(!(list.body?.data ?? []).some((club) => club.id === made.clubA), 'исправленная скрытая вернулась в каталог');
    const byId = await api(guest.page, 'GET', `/api/clubs/${made.clubA}`);
    mustEqual(byId.status, 404, 'карточка исправленной скрытой гостю');
    return 'скрытие сохранено, признак поставлен';
  }, guest.page);

  await step('step-30', 'раздел модерации показывает признак и отбор по нему', async () => {
    const awaiting = await api(admin.page, 'GET', '/api/publications?awaitingRecheck=true');
    mustEqual(awaiting.status, 200, 'отбор очереди повторной проверки');
    const rows = awaiting.body?.data ?? [];
    must(rows.some((row) => row.type === 'club' && row.id === made.clubA), 'исправленной публикации нет в очереди');
    must(rows.every((row) => row.awaitingRecheck === true), 'в очередь попали публикации без признака');

    await admin.page.goto(`${BASE}/service-portal/moderation`, { waitUntil: 'domcontentloaded' });
    await admin.page.getByText('Модерация публикаций').first().waitFor({ timeout: 15_000 });
    await admin.page.getByLabel('Повторная проверка').selectOption('awaiting');
    await admin.page.waitForTimeout(2_000);
    const html = await admin.page.content();
    must(html.includes('Исправлено, ждёт проверки'), 'бейджа «Исправлено, ждёт проверки» на экране нет');
    must(html.includes(`${RUN_TAG} Клуб А`), 'исправленной публикации нет в отобранном списке');
    return `в очереди ${rows.length}, бейдж и отбор работают в браузере`;
  }, admin.page);

  await step('step-31', 'модератор видит признак в СВОЕЙ панели, а не в колокольчике человека', async () => {
    // ⚠️ Прежде этот шаг искал колокольчик в шапке основного сайта — так было написано
    // в плане фазы. Прогон нашёл, что посыл неверен: `NotificationBell` для вида
    // учётной записи `admin` возвращает `null` явной строкой, лента
    // `/profile/me/notifications` закрыта `requirePerson()`, а в служебной панели
    // колокольчика нет вовсе. Строка уведомления создавалась и не была видна НИКОМУ.
    //
    // Признак переехал в собственную поверхность администратора: заводить ему
    // человеческую ленту ради одного типа значило бы боком отменить решение
    // заказчика 13, отстранившее админа от базового набора человека.
    const feed = await api(admin.page, 'GET', '/api/notifications?limit=20');
    mustEqual(feed.status, 200, 'ответ ленты уведомлений');
    const items = feed.body?.data?.items ?? feed.body?.data ?? [];
    must(
      Array.isArray(items) ? items.some((item) => item.type === 'publication_recheck_requested') : false,
      `уведомления о повторной проверке нет в ленте: ${feed.text.slice(0, 200)}`,
    );

    // А теперь главное: видно ли это ЧЕЛОВЕКУ, а не только API.
    await admin.page.goto(`${BASE}/service-portal/dashboard`, { waitUntil: 'domcontentloaded' });
    await admin.page.waitForTimeout(2_000);

    const badge = admin.page.getByLabel(/Исправлено, ждёт проверки/).first();
    must((await badge.count()) > 0, 'счётчика повторной проверки в навигации служебной панели нет');

    const value = (await badge.innerText()).trim();
    must(/^[1-9]\d*$/.test(value), `счётчик показывает «${value}» вместо числа`);

    return `счётчик в панели показывает ${value}, строка уведомления в ленте есть`;
  }, admin.page);

  await step('step-32', 'модератор снял скрытие — признак погашен, публикация в каталоге', async () => {
    const response = await moderate(admin.page, 'unhide', 'club', made.clubA);
    mustEqual(response.status, 200, `снятие скрытия: ${response.text}`);
    mustEqual(readDb(`SELECT status FROM clubs WHERE id = ${made.clubA};`), 'published', 'статус после снятия скрытия');
    mustEqual(readDb(`SELECT awaiting_recheck FROM clubs WHERE id = ${made.clubA};`), 'f', 'признак повторной проверки после снятия');
    const list = await api(guest.page, 'GET', '/api/clubs');
    must((list.body?.data ?? []).some((club) => club.id === made.clubA), 'публикация не вернулась в каталог');
    return 'публикация в каталоге, признак погашен';
  }, admin.page);

  // ═════════════ Сценарий 6: скрытие при живых записях ═════════════
  console.log('\n=== Сценарий 6. Скрытие при живых записях ===');
  let secondBooking = null;

  await step('step-33', 'клиент записался на слот публикации прогона', async () => {
    const response = await api(client.page, 'POST', '/api/bookings', { scheduleId: made.slotsA[0] });
    must(response.status === 201 || response.status === 200, `запись клиента: ${response.status} ${response.text}`);
    secondBooking = response.body?.data?.id;
    mustEqual(liveBookings(made.clubA), 1, 'живых записей после записи клиента');
    return `запись ${secondBooking}`;
  }, client.page);

  await step('step-34', 'скрыть публикацию с живой записью нельзя — отказ с числом', async () => {
    const response = await moderate(admin.page, 'hide', 'club', made.clubA, `${RUN_TAG}: попытка при живых записях`);
    mustEqual(response.status, 409, `ответ на скрытие при живых записях: ${response.text}`);
    const message = response.body?.error ?? '';
    must(/\(\s*1\s*\)/.test(message), `в отказе нет числа записей: «${message}»`);
    mustEqual(readDb(`SELECT status FROM clubs WHERE id = ${made.clubA};`), 'published', 'статус публикации после отказа');
    const list = await api(guest.page, 'GET', '/api/clubs');
    must((list.body?.data ?? []).some((club) => club.id === made.clubA), 'публикация ушла из каталога, хотя скрытие отклонено');
    return `отказ 409, сообщение: «${message}»`;
  }, admin.page);

  await step('step-35', 'после отмены записи скрытие проходит', async () => {
    const cancel = await api(client.page, 'POST', `/api/bookings/${secondBooking}/cancel`, {});
    must(cancel.status === 200, `отмена записи: ${cancel.status} ${cancel.text}`);
    mustEqual(liveBookings(made.clubA), 0, 'живых записей после отмены');
    const response = await moderate(admin.page, 'hide', 'club', made.clubA, `${RUN_TAG}: скрытие после отмены`);
    mustEqual(response.status, 200, `скрытие после отмены: ${response.text}`);
    mustEqual(readDb(`SELECT status FROM clubs WHERE id = ${made.clubA};`), 'hidden', 'статус после скрытия');
    return 'скрытие прошло';
  }, admin.page);

  await step('step-36', 'модератор вернул публикацию в каталог', async () => {
    const response = await moderate(admin.page, 'unhide', 'club', made.clubA);
    mustEqual(response.status, 200, `возврат в каталог: ${response.text}`);
    mustEqual(readDb(`SELECT status FROM clubs WHERE id = ${made.clubA};`), 'published', 'статус после возврата');
    const detail = await api(guest.page, 'GET', `/api/clubs/${made.clubA}`);
    mustEqual(detail.status, 200, 'карточка гостю после возврата');
    return 'публикация снова публична';
  }, admin.page);

  // ═════════════ Сценарий 7: мусорная cookie ═════════════
  console.log('\n=== Сценарий 7. Мусорная cookie ===');
  const junk = 'never-issued-value';
  const setJunk = async (page) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((value) => {
      document.cookie = `sh-session=${value}; path=/`;
    }, junk);
  };

  await step('step-37', 'после выхода поставлена мусорная cookie', async () => {
    const logout = await api(guest.page, 'POST', '/api/auth/logout', {});
    must(logout.status === 200 || logout.status === 204, `выход: ${logout.status}`);
    await setJunk(guest.page);
    const cookie = await guest.page.evaluate(() => document.cookie);
    must(cookie.includes(junk), `cookie не поставилась: «${cookie}»`);
    return 'мусорная cookie в браузере';
  }, guest.page);

  await step('step-38', 'закрытый раздел с мусорной cookie уводит на главную', async () => {
    await guest.page.goto(`${BASE}/profile/me/dashboard`, { waitUntil: 'domcontentloaded' });
    mustEqual(guest.page.url().replace(/\/$/, ''), BASE, `адрес после увода: ${guest.page.url()}`);
    return 'увод на главную';
  }, guest.page);

  await step('step-39', 'при уводе запроса «кто я» не было', async () => {
    // ⚠️ Смотрим на САМ ответ увода, а не на переход. Обычная навигация уводит
    // на главную, главная монтирует `SessionBootstrap` — и он честно спрашивает
    // «кто я» уже ПОСЛЕ увода. Считая запросы перехода, шаг краснел на правильном
    // поведении. Здесь берётся один ответ с `redirect: 'manual'`: всё, что
    // случится в этот промежуток, к уводу и относится.
    await setJunk(guest.page);
    // ⚠️ Пауза до начала замера обязательна: страница, на которой мы стоим, сама
    // монтирует `SessionBootstrap` и спрашивает «кто я». Без неё в замер попадал
    // чужой запрос, и шаг краснел на правильном поведении.
    await guest.page.waitForTimeout(2_000);
    const seen = [];
    const listener = (request) => {
      if (request.url().includes('/api/auth/me')) seen.push(request.url());
    };
    guest.page.on('request', listener);
    const response = await rawResponse(guest.page, '/profile/me/schedule');
    await guest.page.waitForTimeout(500);
    guest.page.off('request', listener);
    must(response.status === 0 || response.status === 307 || response.status === 308,
      `увод отвечает не перенаправлением: ${response.status}`);
    must(response.body.length < 512, `на увод отрисована страница: тело ${response.body.length} байт`);
    mustEqual(seen.length, 0, `обращений к «кто я» при уводе: ${seen.join(', ')}`);
    return `увод ${response.status || 'opaqueredirect'}, тело ${response.body.length} байт, «кто я» не спрашивали`;
  }, guest.page);

  await step('step-40', 'страница входа в служебную панель с мусорной cookie открывается', async () => {
    await setJunk(guest.page);
    await guest.page.goto(`${BASE}/service-portal`, { waitUntil: 'domcontentloaded' });
    must(guest.page.url().includes('/service-portal'), `с мусорной cookie увело со страницы входа: ${guest.page.url()}`);
    const html = await guest.page.content();
    must(/вход|войти|пароль/i.test(html), 'страница входа не отрисована');
    return 'человек с испорченной cookie не заперт вне входа';
  }, guest.page);

  await step('step-41', 'мусорная cookie погашена', async () => {
    const cookie = await guest.page.evaluate(() => document.cookie);
    must(!cookie.includes(junk), `мусорная cookie пережила заход: «${cookie}»`);
    return 'cookie снята браузером по Set-Cookie';
  }, guest.page);

  await step('step-42', 'замер размера ответа вне браузера', async () => {
    const measure = (args) =>
      Number(
        execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{size_download}', ...args], { encoding: 'utf8' }).trim(),
      );
    const guestSize = measure([`${BASE}/profile/me/dashboard`]);
    const junkSize = measure(['-H', `Cookie: sh-session=${junk}`, `${BASE}/profile/me/dashboard`]);
    must(junkSize <= guestSize + 64, `мусорная cookie дороже гостя: гость ${guestSize} Б, мусор ${junkSize} Б`);
    return `гость ${guestSize} Б, мусорная cookie ${junkSize} Б`;
  }, guest.page);

  // ═════════════ Сценарий 8: первое лицо заводится из личного кабинета ═════════════
  console.log('\n=== Сценарий 8. Первое лицо из личного кабинета ===');
  const madeByClient = { clubId: null, trainerId: null };

  await step('step-43', 'вошёл человек без единого лица', async () => {
    const me = await whoAmI(client.page);
    mustEqual((me.faces ?? []).length, 0, 'число лиц у человека сценария 8');
    return `лиц ноль (учётка ${E2E_USERS.client})`;
  }, client.page);

  await step('step-44', 'в личном кабинете есть обе кнопки заведения лица', async () => {
    await client.page.goto(`${BASE}/profile/me/dashboard`, { waitUntil: 'domcontentloaded' });
    await client.page.getByRole('button', { name: 'Опубликовать клуб' }).waitFor({ timeout: 15_000 });
    await client.page.getByRole('button', { name: 'Опубликовать карточку тренера' }).waitFor({ timeout: 15_000 });
    // ⚠️ `redirect: 'manual'` отдаёт перенаправление непрозрачным ответом:
    // статус 0 и тип `opaqueredirect`. Проверять «307» здесь нельзя — браузер
    // такого не покажет.
    const redirect = await rawResponse(client.page, '/profile/me');
    must(redirect.type === 'opaqueredirect' || redirect.status === 200,
      `ответ /profile/me: ${redirect.status} (${redirect.type})`);
    return 'обе кнопки на месте, /profile/me ведёт в кабинет';
  }, client.page);

  await step('step-45', 'клуб заводится до конца, кабинет лица открывается', async () => {
    // ⚠️ Форма клуба требует города и адреса, а подсказки ходят к службам Яндекса
    // и прогоном не проверяются (предупреждение чек-листа к шагу 45). Поэтому само
    // заведение идёт запросом из БРАУЗЕРА этого же человека — с его cookie
    // и заголовками, — а проверяется то, ради чего шаг существует: кабинет лица
    // открылся и лицо появилось у человека.
    const response = await api(client.page, 'POST', '/api/clubs', clubForm(`${RUN_TAG} Клуб клиента`, [
      slot('Занятие клиента', 17, '10:00', '11:00'),
    ]));
    must(response.status === 201 || response.status === 200, `заведение клуба: ${response.status} ${response.text}`);
    madeByClient.clubId = response.body?.data?.club?.id;
    const me = await whoAmI(client.page);
    mustEqual((me.faces ?? []).length, 1, 'число лиц после заведения клуба');
    const cabinet = await rawResponse(client.page, `/profile/club/${madeByClient.clubId}/dashboard`);
    mustEqual(cabinet.status, 200, 'кабинет заведённого лица');
    return `клуб ${madeByClient.clubId}, кабинет лица открылся`;
  }, client.page);

  await step('step-46', 'в модалке тренера виден выбор клуба-площадки', async () => {
    await client.page.goto(`${BASE}/profile/me/dashboard`, { waitUntil: 'domcontentloaded' });
    await client.page.getByRole('button', { name: 'Опубликовать карточку тренера' }).click();
    await client.page.getByText('Связать себя с клубом').first().waitFor({ timeout: 15_000 });
    const body = client.page.locator('[data-testid="publish-modal-body"]');
    const html = await body.innerHTML();
    must(html.includes('Без привязки к клубу'), 'выбора клуба-площадки в модалке нет');
    must(html.includes(`${RUN_TAG} Клуб клиента`), 'собственный клуб не предложен площадкой (ловушка 18)');
    return 'выбор площадки на месте и знает про лица человека';
  }, client.page);

  await step('step-47', 'раздела доп-услуг в модалке тренера нет', async () => {
    const body = client.page.locator('[data-testid="publish-modal-body"]');
    const text = await body.innerText();
    must(!text.includes('Дополнительные услуги'), 'редактор доп-услуг остался в модалке (шаг 36.9a)');
    must(!/добавить услугу/i.test(text), 'кнопка добавления доп-услуги осталась в модалке');
    return 'редактор доп-услуг убран';
  }, client.page);

  await step('step-48', 'в кабинете лица кнопок заведения больше нет', async () => {
    await client.page.goto(`${BASE}/profile/club/${madeByClient.clubId}/dashboard`, { waitUntil: 'domcontentloaded' });
    await client.page.waitForTimeout(1_500);
    const html = await client.page.content();
    must(!html.includes('Опубликовать клуб'), 'кнопка «Опубликовать клуб» осталась в кабинете лица');
    must(!html.includes('Опубликовать карточку тренера'), 'кнопка «Опубликовать карточку тренера» осталась в кабинете лица');
    return 'заведение лица живёт только в личном кабинете';
  }, client.page);

  // ═════════════ Сценарий 9: ограничитель «кто я» не мешает живому человеку ═════════════
  console.log('\n=== Сценарий 9. Ограничитель на «кто я» ===');

  await step('step-49', 'владелец прошёл по десяти разделам кабинета подряд', async () => {
    const sections = ['dashboard', 'bookings', 'clients', 'finance', 'links', 'notifications', 'publications', 'reviews', 'settings', 'stats'];
    const refused = [];
    const listener = (response) => {
      if (response.status() === 429) refused.push(`${response.status()} ${response.url()}`);
    };
    owner.page.on('response', listener);
    for (const section of sections) {
      await owner.page.goto(`${BASE}/profile/club/${made.clubA}/${section}`, { waitUntil: 'domcontentloaded' });
      await owner.page.waitForTimeout(300);
    }
    owner.page.off('response', listener);
    owner.page.refusedDuringWalk = refused;
    return `пройдено разделов ${sections.length}`;
  }, owner.page);

  await step('step-50', 'ни одного 429, интерфейс цел', async () => {
    const refused = owner.page.refusedDuringWalk ?? [];
    mustEqual(refused.length, 0, `отказов по частоте при обычной навигации: ${refused.join('; ')}`);
    const me = await whoAmI(owner.page);
    must(me?.id !== undefined, 'после обхода разделов сессия перестала отвечать');
    const html = await owner.page.content();
    must(html.includes('Кабинет') || html.includes('Статистика'), 'последний раздел кабинета не отрисовался');
    return 'отказов по частоте нет, кабинет отвечает';
  }, owner.page);

  // ═════════════ Сценарий 10: тестовая карточка после уборки ═════════════
  console.log('\n=== Сценарий 10. Живая карточка тренера ===');
  const seeded = await freshContext();

  await step('step-51', 'живой тренер входит и попадает в кабинет своей карточки', async () => {
    await loginAs(seeded.page, SEEDED_TRAINER);
    const me = await whoAmI(seeded.page);
    const cards = (me.faces ?? []).filter((face) => face.kind === 'trainer');
    must(cards.length > 0, 'у живого тренера не осталось карточек');
    const cabinet = await rawResponse(seeded.page, `/profile/trainer/${cards[0].id}/dashboard`);
    mustEqual(cabinet.status, 200, 'кабинет собственной карточки');
    seeded.page.cards = cards;
    return `карточек ${cards.length}, кабинет первой открылся`;
  }, seeded.page);

  await step('step-52', 'карточка полная: описание, специализации, форматы, адрес, расписание, связь', async () => {
    const cards = seeded.page.cards ?? [];
    const checked = [];
    for (const card of cards) {
      const detail = await api(seeded.page, 'GET', `/api/trainers/${card.id}`);
      const data = detail.body?.data?.trainer ?? detail.body?.data ?? {};
      const schedule = detail.body?.data?.schedule ?? [];
      const links = await api(seeded.page, 'GET', `/api/trainer-club-links?trainerId=${card.id}&status=confirmed`);
      const complete =
        (data.bio ?? '').length > 0 &&
        (data.specialtyIds ?? []).length > 0 &&
        (data.workFormatIds ?? []).length > 0 &&
        (data.address ?? '') !== '' &&
        schedule.length > 0 &&
        (links.body?.data ?? []).length > 0;
      checked.push(`${card.id}:${complete ? 'полная' : 'неполная'}`);
      if (complete) return `полная карточка найдена — ${checked.join(', ')}`;
    }
    throw new Error(`полной карточки у живого тренера нет: ${checked.join(', ')}`);
  }, seeded.page);

  await seeded.context.close();

  // ═════════════ Сценарий 11: настройка действует при ОТПРАВКЕ ═════════════
  //
  // ⚠️ Предмет сценария — ОТСУТСТВИЕ СТРОКИ, а не её сокрытие. До этапа Э9
  // выключенный тип создавал уведомление и прятал его при чтении; с решения
  // заказчика 22 он не создаёт строки вовсе. Отличить «не создано» от «спрятано»
  // можно только в самой таблице, поэтому ключевые проверки смотрят в базу.
  //
  // ⚠️ Три подготовительных действия названы вслух: без них сценарий проверял бы
  // не то, что написано в чек-листе.
  //   1. Карточка тренера скрыта модератором в сценарии 3 и до сих пор скрыта,
  //      а на слот скрытой публикации записаться нельзя (step-18). Возвращаем её
  //      в каталог — иначе step-58 краснел бы на правильном поведении.
  //   2. Клуб заводится НОВЫЙ: у клубов А и Б к этому месту уже есть свои
  //      уведомления от сценариев 1–6, и «в ленте пусто» пришлось бы проверять
  //      разностью счётчиков вместо буквального «пусто».
  //   3. Владелец гасит всё прочитанным: значок колокольчика считает
  //      непрочитанное ВСЕГО человека, и «значок показывает ноль» без этого
  //      не проверяется вовсе.
  console.log('\n=== Сценарий 11. Настройка действует при отправке ===');

  const ownerId = Number((await whoAmI(owner.page)).id);
  const clientId = Number((await whoAmI(client.page)).id);

  const unhideT = await moderate(admin.page, 'unhide', 'trainer', made.trainer);
  must(unhideT.status === 200, `карточка тренера не возвращена в каталог: ${unhideT.status} ${unhideT.text}`);

  const createC = await api(owner.page, 'POST', '/api/clubs', clubForm(`${RUN_TAG} Клуб В`, [
    slot('Занятие В1', 18, '10:00', '11:00'),
    slot('Занятие В2', 19, '10:00', '11:00'),
  ]));
  must(createC.status === 201 || createC.status === 200, `клуб В не создан: ${createC.status} ${createC.text}`);

  /** Тихий клуб сценария 11: его ящик на старте пуст, и это проверяемо. */
  const quiet = {
    clubId: createC.body?.data?.club?.id,
    slots: (createC.body?.data?.schedules ?? []).map((item) => item.id),
    firstBooking: null,
    secondBooking: null,
    trainerBooking: null,
  };
  must(quiet.slots.length >= 2, `слотов у клуба В: ${quiet.slots.length}, нужно два (второй — для записи после возврата галочки)`);

  const readAll = await api(owner.page, 'POST', '/api/notifications/read-all', {});
  must(readAll.status === 200, `пометить всё прочитанным: ${readAll.status} ${readAll.text}`);

  /** Число строк уведомлений по условию — смотрим в таблицу, а не в ответ маршрута. */
  const notifyRows = (where) => Number(readDb(`SELECT count(*) FROM notifications WHERE ${where};`));

  /**
   * Число на значке колокольчика. Значка может не быть вовсе — это и есть ноль:
   * компонент рисует его только при непрочитанных.
   */
  const bellBadge = async (page) => {
    await page.waitForSelector('header button[aria-label="Уведомления"]', { timeout: 15_000 });
    // Счётчик спрашивается после отрисовки; без паузы читалось бы значение до ответа.
    await page.waitForTimeout(2_000);
    const badge = await page.$('[data-testid="notification-bell-badge"]');
    return badge === null ? 0 : Number((await badge.textContent()).trim());
  };

  /** Строка настройки «тип выключен» в названном ящике. */
  const disabledRows = (type, where) =>
    Number(
      readDb(
        `SELECT count(*) FROM user_notification_preferences WHERE user_id = ${ownerId} AND type = '${type}' AND enabled = false AND ${where};`,
      ),
    );

  await step('step-53', 'в кабинете клуба выключена «Новая заявка на запись»', async () => {
    await owner.page.goto(`${BASE}/profile/club/${quiet.clubId}/settings`, { waitUntil: 'domcontentloaded' });
    const toggle = owner.page.locator('[data-testid="notification-preferences-toggle-booking_requested"]');
    await toggle.waitFor({ timeout: 15_000 });
    // ⚠️ Редактор читает настройки с сервера уже ПОСЛЕ отрисовки. Щёлкнуть раньше
    // ответа значит щёлкнуть по значению, которое сейчас перепишут.
    await owner.page.waitForTimeout(2_000);
    must(await toggle.isChecked(), 'тип «Новая заявка на запись» был выключен ещё до шага');
    await toggle.uncheck();
    // Отправка отложена на полсекунды — ждём её и ответ сервера.
    await owner.page.waitForTimeout(2_500);
    mustEqual(disabledRows('booking_requested', `face_club_id = ${quiet.clubId}`), 1, 'строка настройки в ящике клуба');
    mustEqual(
      disabledRows('booking_requested', 'face_club_id IS NULL AND face_trainer_id IS NULL'),
      0,
      'личная настройка человека',
    );
    return 'тип выключен в ящике клуба, личный ящик не тронут';
  }, owner.page);

  await step('step-54', 'страница говорит, что настройка действует на НОВЫЕ уведомления', async () => {
    // Человек не должен догадываться: выключил — перестанут приходить новые,
    // а пришедшее раньше останется в ленте.
    const text = (await owner.page.locator('[data-testid="notification-preferences-editor"]').innerText()).replace(/\s+/g, ' ');
    must(/действует на новые уведомления/i.test(text), `на странице не сказано про новые уведомления: «${text.slice(0, 240)}»`);
    must(/останутся в ленте/i.test(text), `не сказано, что уже пришедшее остаётся: «${text.slice(0, 240)}»`);
    return 'обещание названо на экране, а не только в замысле';
  }, owner.page);

  await step('step-55', 'клиент записался на слот клуба с выключенным типом', async () => {
    const response = await api(client.page, 'POST', '/api/bookings', { scheduleId: quiet.slots[0] });
    must(response.status === 201 || response.status === 200, `запись клиента: ${response.status} ${response.text}`);
    quiet.firstBooking = response.body?.data?.id;
    mustEqual(Number(readDb(`SELECT count(*) FROM bookings WHERE id = ${quiet.firstBooking};`)), 1, 'запись в базе');
    return `запись ${quiet.firstBooking} создана`;
  }, client.page);

  await step('step-56', 'строки уведомления в базе нет ВОВСЕ', async () => {
    // ⚠️ Это и есть предмет сценария. Прежде строка создавалась и пряталась
    // при чтении — «пусто на экране» об этом не говорит ничего.
    mustEqual(notifyRows(`addressee_club_id = ${quiet.clubId} AND type = 'booking_requested'`), 0, 'строк заявки в ящике клуба');
    mustEqual(notifyRows(`addressee_club_id = ${quiet.clubId}`), 0, 'строк в ящике клуба вообще');
    return 'уведомление не создано, а не спрятано';
  }, owner.page);

  await step('step-57', 'лента ящика клуба пуста, значок колокольчика — ноль', async () => {
    // Прежде лента прятала, а колокольчик показывал: у них были разные правила
    // отбора. Здесь оба смотрят на одно и то же отсутствие строки.
    await owner.page.goto(`${BASE}/profile/club/${quiet.clubId}/notifications`, { waitUntil: 'domcontentloaded' });
    await owner.page.getByText('Пока нет уведомлений').first().waitFor({ timeout: 15_000 });
    mustEqual(await owner.page.locator('[data-testid^="notification-item-"]').count(), 0, 'строк в ленте ящика клуба');
    mustEqual(await bellBadge(owner.page), 0, 'число на значке колокольчика');
    return 'в ленте пусто, значок ноль';
  }, owner.page);

  await step('step-58', 'на слот карточки тренера уведомление приходит', async () => {
    // Настройка КЛУБА — про клуб. Второе лицо того же человека её не наследует,
    // иначе «настройки на лицо» были бы личными настройками под другим именем.
    const response = await api(client.page, 'POST', '/api/bookings', { scheduleId: made.slotsT[0] });
    must(response.status === 201 || response.status === 200, `запись на слот карточки: ${response.status} ${response.text}`);
    quiet.trainerBooking = response.body?.data?.id;
    mustEqual(notifyRows(`addressee_trainer_id = ${made.trainer} AND type = 'booking_requested'`), 1, 'строк заявки в ящике карточки');
    return `запись ${quiet.trainerBooking}, уведомление в ящике карточки есть`;
  }, client.page);

  await step('step-59', 'число на значке равно числу непрочитанных строк в списке', async () => {
    // ⚠️ Значок считает непрочитанное ВСЕГО человека, список — одного ящика.
    // Сравнение имеет смысл потому, что перед сценарием всё погашено прочитанным
    // и непрочитанная строка на площадке ровно одна. Разойдись они здесь —
    // это значило бы, что счётчик и лента снова читают разные наборы.
    await owner.page.goto(`${BASE}/profile/trainer/${made.trainer}/notifications`, { waitUntil: 'domcontentloaded' });
    await owner.page.waitForTimeout(2_000);
    const unread = await owner.page.locator('[data-testid^="notification-item-unread-"]').count();
    const badge = await bellBadge(owner.page);
    const inDb = notifyRows(`addressee_trainer_id = ${made.trainer} AND read_at IS NULL`);
    mustEqual(unread, inDb, 'непрочитанных строк на экране против базы');
    mustEqual(badge, unread, 'число на значке против числа строк в списке');
    return `значок ${badge}, непрочитанных в списке ${unread}, в базе ${inDb}`;
  }, owner.page);

  await step('step-60', 'галочка возвращена — новое уведомление приходит', async () => {
    await owner.page.goto(`${BASE}/profile/club/${quiet.clubId}/settings`, { waitUntil: 'domcontentloaded' });
    const toggle = owner.page.locator('[data-testid="notification-preferences-toggle-booking_requested"]');
    await toggle.waitFor({ timeout: 15_000 });
    await owner.page.waitForTimeout(2_000);
    must(!(await toggle.isChecked()), 'настройка вернулась с сервера включённой — правка шага 53 не сохранилась');
    await toggle.check();
    await owner.page.waitForTimeout(2_500);
    mustEqual(disabledRows('booking_requested', `face_club_id = ${quiet.clubId}`), 0, 'выключенная настройка после возврата галочки');

    const response = await api(client.page, 'POST', '/api/bookings', { scheduleId: quiet.slots[1] });
    must(response.status === 201 || response.status === 200, `вторая запись клиента: ${response.status} ${response.text}`);
    quiet.secondBooking = response.body?.data?.id;
    mustEqual(notifyRows(`addressee_club_id = ${quiet.clubId} AND type = 'booking_requested'`), 1, 'строк заявки в ящике клуба после возврата');
    return `галочка включена, запись ${quiet.secondBooking}, уведомление пришло`;
  }, owner.page);

  await step('step-61', 'пропущенное уведомление задним числом не появилось', async () => {
    // ⚠️ Названная цена решения 22: выключил — потерял насовсем. Проверяется
    // не словом, а тем, НА КАКУЮ запись ссылается единственная пришедшая строка:
    // если бы пропущенное «догнало», строк стало бы две.
    mustEqual(notifyRows(`addressee_club_id = ${quiet.clubId} AND type = 'booking_requested'`), 1, 'строк заявки в ящике клуба');
    // ⚠️ Ссылка на предмет читается ОДНОЙ формой — `subjectType` + `subjectId`
    // (шаг 36.51). Прежде форм было четыре, и заявка называлась ключом `bookingId`;
    // прогон читал именно его и после сведения форм начал получать пустоту.
    const about = readDb(
      `SELECT payload->>'subjectId' FROM notifications WHERE addressee_club_id = ${quiet.clubId} AND type = 'booking_requested';`,
    );
    mustEqual(Number(about), Number(quiet.secondBooking), 'номер записи в единственном уведомлении');
    return `единственная строка про запись ${about}; пропущенная (${quiet.firstBooking}) не воскресла`;
  }, owner.page);

  await step('step-62', 'критичный тип выключить нельзя — уведомление доходит', async () => {
    // ⚠️ Отступление от буквы чек-листа, названное вслух и повторённое в отчёте.
    // Там написано «модератором скрыть публикацию — критичное уведомление клиенту
    // приходит». Само скрытие клиенту не пишет ничего, а при живых записях оно
    // и вовсе отклоняется (решение 21, сценарий 6): чтобы скрыть, провайдер сперва
    // отменяет записи — и вот ЭТА отмена и есть критичный `booking_cancelled_by_provider`.
    // Порядок чек-листа сохранён целиком, проверяется тот же запрет: обязательный
    // тип не выключается ни галочкой (она disabled), ни запросом в обход неё.
    const off = await api(client.page, 'PATCH', `/api/users/${clientId}/notification-preferences`, {
      preferences: { booking_cancelled_by_provider: false },
    });
    mustEqual(off.status, 200, `попытка выключить критичный тип: ${off.text}`);
    mustEqual(
      Number(
        readDb(
          `SELECT count(*) FROM user_notification_preferences WHERE user_id = ${clientId} AND type = 'booking_cancelled_by_provider' AND enabled = false;`,
        ),
      ),
      0,
      'выключенный критичный тип в базе',
    );

    const before = notifyRows(`user_id = ${clientId} AND type = 'booking_cancelled_by_provider'`);
    for (const bookingId of [quiet.firstBooking, quiet.secondBooking]) {
      const cancel = await api(owner.page, 'POST', `/api/bookings/${bookingId}/cancel`, {});
      must(cancel.status === 200, `отмена записи ${bookingId} провайдером: ${cancel.status} ${cancel.text}`);
    }
    const after = notifyRows(`user_id = ${clientId} AND type = 'booking_cancelled_by_provider'`);
    mustEqual(after, before + 2, 'критичных уведомлений клиенту после двух отмен');

    const hide = await moderate(admin.page, 'hide', 'club', quiet.clubId, `${RUN_TAG}: скрытие клуба сценария 11`);
    mustEqual(hide.status, 200, `скрытие публикации модератором: ${hide.text}`);
    mustEqual(readDb(`SELECT status FROM clubs WHERE id = ${quiet.clubId};`), 'hidden', 'статус клуба после скрытия');
    return `критичный тип не выключился, уведомлений ${before} → ${after}, публикация скрыта`;
  }, client.page);

  await shutdown();
}

/** Отчёт по формату скила: таблица шагов, падения, окружение. */
function writeReport() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `phase-36-${stamp}.md`);

  const pass = results.filter((row) => row.status === 'pass').length;
  const fail = results.filter((row) => row.status === 'fail').length;
  const skipped = results.filter((row) => row.status === 'skip').length;

  const icon = { pass: '✅ passed', fail: '❌ failed', skip: '⏭ skipped' };
  const rows = results
    .map((row) => `| ${row.id} | ${row.title} | ${icon[row.status]} | ${row.ms ? `${(row.ms / 1000).toFixed(1)}s` : '—'} | ${String(row.detail).replace(/\|/g, '/').replace(/\n/g, ' ')} |`)
    .join('\n');

  const failures = results
    .filter((row) => row.status === 'fail')
    .map((row) => `### ${row.id} — ${row.title}\n\n- **Ожидалось:** по чек-листу\n- **Получено:** ${row.detail}\n- **Снимок:** ${row.shot || '—'}\n`)
    .join('\n');

  fs.writeFileSync(
    file,
    `# E2E Report: Phase 36 — закрытие долга\n\n` +
      `**Дата:** ${new Date().toISOString()}\n` +
      `**Чек-лист:** tests/checklists/phase-36-debt.md\n` +
      `**Признак прогона:** ${RUN_TAG}\n` +
      `**Итог:** ${fail === 0 ? '✅ PASSED' : '❌ FAILED'} (${pass} прошло, ${fail} упало, ${skipped} не прогонялось)\n\n` +
      `## Таблица шагов\n\n| ID | Описание | Статус | Длительность | Заметки |\n| --- | --- | --- | --- | --- |\n${rows}\n\n` +
      (failures ? `## Падения\n\n${failures}\n` : '## Падений нет\n') +
      `\n## Окружение\n\n- Node: ${process.version}\n- Playwright: библиотека, Chromium headless\n- Стенд: ${BASE} (контейнеры \`npm run app:up\`)\n`,
    'utf8',
  );

  return { file, pass, fail, skipped };
}

let exitCode = 0;

try {
  await main();
} catch (error) {
  console.error('прогон прерван:', error);
  results.push({ id: 'run', title: 'прогон прерван', status: 'fail', detail: String(error.message ?? error), ms: 0 });
  exitCode = 2;
  await shutdown();
} finally {
  // ⚠️ Уборка обязана случиться и после падения: иначе прогон оставляет
  // в живой базе людей, публикации и записи — ровно тот мусор, который
  // эта фаза вычищает.
  const cleaned = cleanupRun();
  console.log(`\nУборка: людей ${cleaned.users}, клубов ${cleaned.clubs}, карточек ${cleaned.trainers}`);

  const report = writeReport();
  console.log(`Итог: ${report.pass} прошло, ${report.fail} упало, ${report.skipped} не прогонялось.`);
  console.log(`Отчёт: ${report.file}`);
  process.exit(exitCode === 2 ? 2 : report.fail > 0 ? 1 : 0);
}

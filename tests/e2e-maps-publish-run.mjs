// Браузерный прогон чек-листа публикаций и карт: `tests/checklists/maps-publish.md`.
//
// Запуск: E2E_RUN_TAG=e2e-publish node tests/e2e-maps-publish-run.mjs
//
// ⚠️ Свой признак прогона обязателен: прогонов несколько и они идут одновременно.
//
// ⚠️ Правило прогона: шаг не засчитывается по коду ответа — проверки смотрят
// в содержимое и в базу. У ключевых отказов сверяется ТЕКСТ: общее «Недостаточно
// прав» вместо «не твоя вещь» означало бы, что вернулась проверка по роли.
import fs from 'node:fs';
import {
  BASE, api, freshContext, futureDate, launch, loginAs, must, mustEqual,
  results, shutdown, skip, step, whoAmI,
} from './e2e-phase-35-harness.mjs';
import { E2E_USERS, RUN_TAG, cleanupRun, readDb, seedRunUsers } from '../scripts/e2e-fixture.mjs';

const clubForm = (name, over = {}) => ({
  name,
  city: 'Самара',
  address: 'ул. Публикационная, 1',
  description:
    'Клуб для прогона чек-листа публикаций. Описание длиной заведомо больше пятидесяти символов, как требует схема.',
  phone: '+7 (900) 557-00-10',
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
  scheduleSlots: [
    {
      title: 'Занятие прогона',
      date: futureDate(11),
      startTime: '10:00',
      endTime: '11:00',
      price: '700',
      capacity: '10',
      location: 'Зал',
      sportId: 1,
    },
  ],
  ...over,
});

const trainerForm = (last, over = {}) => ({
  firstName: RUN_TAG,
  lastName: last,
  city: 'Самара',
  address: 'ул. Публикационная, 2',
  bio: 'Карточка для прогона чек-листа публикаций. Описание длиной заведомо больше пятидесяти символов, как требует схема.',
  experience: '5',
  sportIds: [1, 3],
  specialtyIds: [1],
  workFormatIds: [1],
  phone: '+7 (900) 557-00-11',
  vk: '',
  telegram: '',
  facebook: '',
  offeringName: 'Персональная',
  offeringDescription: 'Один на один',
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
      date: futureDate(12),
      startTime: '12:00',
      endTime: '13:00',
      price: '1500',
      capacity: '1',
      location: 'Зал',
      sportId: 1,
    },
  ],
  ...over,
});

async function main() {
  const users = seedRunUsers();
  await launch();

  const owner = await freshContext();
  const stranger = await freshContext();
  const client = await freshContext();
  const admin = await freshContext();

  await loginAs(owner.page, E2E_USERS.builder, {});
  await loginAs(stranger.page, E2E_USERS.stranger, {});
  await loginAs(client.page, E2E_USERS.client, {});
  await loginAs(admin.page, 'admin@sporthub.local', { portal: 'service' });

  const made = { clubId: null, trainerId: null, slotId: null };

  /**
   * Тело правки клуба: слоты идут СО СВОИМИ НОМЕРАМИ.
   *
   * ⚠️ Это не мелочь оформления, а контракт. `scheduleSlots` — полное состояние
   * расписания: слот с номером правится, слот БЕЗ номера считается новым, а всё,
   * чего в теле нет, удаляется — и записи на удалённые слоты отменяются от имени
   * провайдера. Форма кабинета номера шлёт (`PublishClubModal`), поэтому в продукте
   * записи не теряются; прогон обязан вести себя так же, иначе он проверял бы
   * поведение, которого у пользователя не бывает.
   */
  const editForm = async (name) => {
    const detail = await api(owner.page, 'GET', `/api/clubs/${made.clubId}`);
    const slots = (detail.body?.data?.schedule ?? []).map((slot) => ({
      id: slot.id,
      title: slot.title,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      price: String(slot.price),
      capacity: String(slot.capacity),
      location: slot.room ?? 'Зал',
      sportId: slot.sportId,
    }));

    return { ...clubForm(name), scheduleSlots: slots };
  };

  console.log('\n=== Публикация: любой вошедший, оба вида лица ===');

  await step('pub-7', 'карточку тренера заводит любой вошедший (шаг 35.19c)', async () => {
    // ⚠️ До фазы 35 это было правом роли `trainer`, и представитель услуг получал
    // 403 на собственную карточку — дефект 4.6 № 1.
    const response = await api(owner.page, 'POST', '/api/trainers', trainerForm('Первый'));

    must(response.status === 201 || response.status === 200, `публикация карточки: ${response.text}`);
    made.trainerId = response.body?.data?.trainer?.id;

    return `карточка ${made.trainerId}`;
  }, owner.page);

  await step('pub-8', 'клуб заводит тот же человек — вид лица ничего не запрещает', async () => {
    const response = await api(owner.page, 'POST', '/api/clubs', clubForm(`${RUN_TAG} Клуб`));

    must(response.status === 201 || response.status === 200, `публикация клуба: ${response.text}`);
    made.clubId = response.body?.data?.club?.id;
    made.slotId = (response.body?.data?.schedules ?? [])[0]?.id;

    const me = await whoAmI(owner.page);

    mustEqual((me.faces ?? []).length, 2, 'число лиц после двух публикаций');

    return `клуб ${made.clubId}, лиц у человека 2`;
  }, owner.page);

  await step('pub-10', 'ограничений на число лиц нет (решение 10)', async () => {
    const more = await api(owner.page, 'POST', '/api/trainers', trainerForm('Второй'));

    must(more.status === 201 || more.status === 200, `вторая карточка: ${more.text}`);

    const me = await whoAmI(owner.page);

    mustEqual((me.faces ?? []).length, 3, 'третье лицо не завелось');

    return 'три лица у одного человека';
  }, owner.page);

  await step('pub-11', 'служебная запись лиц не заводит (решение 13)', async () => {
    const club = await api(admin.page, 'POST', '/api/clubs', clubForm(`${RUN_TAG} Админский`));
    const trainer = await api(admin.page, 'POST', '/api/trainers', trainerForm('Админский'));

    mustEqual(club.status, 403, `администратор завёл клуб: ${club.status}`);
    mustEqual(trainer.status, 403, `администратор завёл карточку: ${trainer.status}`);
    must(
      /пользователи площадки/i.test(String(club.body?.error ?? '')),
      `отказ пришёл не от правила «не человек площадки»: ${club.body?.error}`,
    );

    return 'оба вида лица администратору закрыты, отказ по нужному правилу';
  }, admin.page);

  console.log('\n=== Мульти-спорт и справочники ===');

  await step('multi-1', 'мульти-спорт сохраняется массивом, а не одним видом', async () => {
    const detail = await api(owner.page, 'GET', `/api/clubs/${made.clubId}`);
    const sports = detail.body?.data?.sportIds ?? detail.body?.data?.sports?.map((s) => s.id) ?? [];

    must(sports.length >= 2, `у клуба сохранился один вид спорта: ${JSON.stringify(sports)}`);

    return `видов спорта ${sports.length}`;
  }, owner.page);

  await step('multi-4', 'справочники приходят номерами, а не свободным текстом', async () => {
    // ⚠️ Проверяется схема, а не интерфейс: свободный текст вместо номера — это
    // мусор в справочнике, который потом не свести.
    const response = await api(owner.page, 'POST', '/api/clubs', {
      ...clubForm(`${RUN_TAG} Свободный тег`),
      tagIds: ['произвольный тег'],
    });

    mustEqual(response.status, 400, `свободный текст принят в справочник: ${response.status}`);

    return 'схема принимает только номера справочника';
  }, owner.page);

  console.log('\n=== Правка своего и чужого лица ===');

  await step('edit-1', 'владелец правит СВОЮ карточку тренера — 200', async () => {
    const response = await api(owner.page, 'PATCH', `/api/trainers/${made.trainerId}`, trainerForm('Изменённый'));

    mustEqual(response.status, 200, `правка своей карточки: ${response.text}`);
    must(readDb(`SELECT name FROM trainers WHERE id=${made.trainerId};`).includes('Изменённый'), 'имя не изменилось');

    return 'дефект 4.6 № 1 закрыт';
  }, owner.page);

  await step('edit-2', 'он же правит СВОЙ клуб — 200', async () => {
    const response = await api(owner.page, 'PATCH', `/api/clubs/${made.clubId}`, await editForm(`${RUN_TAG} Клуб правленый`));

    mustEqual(response.status, 200, `правка своего клуба: ${response.text}`);

    return 'оба вида своего лица правятся';
  }, owner.page);

  await step('edit-3', 'чужая карточка — отказ ПО ВЛАДЕНИЮ, карточка цела', async () => {
    const before = readDb(`SELECT name FROM trainers WHERE id=${made.trainerId};`);
    const response = await api(stranger.page, 'PATCH', `/api/trainers/${made.trainerId}`, trainerForm('Перехваченный'));

    mustEqual(response.status, 403, `посторонний правил чужую карточку: ${response.status}`);
    // ⚠️ Текст сверяется: общее «Недостаточно прав» означало бы возврат проверки по роли.
    must(
      /редактирования тренера/i.test(String(response.body?.error ?? '')),
      `отказ пришёл не от владения: ${response.body?.error}`,
    );
    mustEqual(readDb(`SELECT name FROM trainers WHERE id=${made.trainerId};`), before, 'карточка изменилась');

    return 'отказ по владению, вещь цела';
  }, stranger.page);

  await step('edit-4', 'чужой клуб — отказ по владению, клуб цел', async () => {
    const before = readDb(`SELECT name FROM clubs WHERE id=${made.clubId};`);
    const response = await api(stranger.page, 'PATCH', `/api/clubs/${made.clubId}`, await editForm('Перехваченный клуб'));

    mustEqual(response.status, 403, `посторонний правил чужой клуб: ${response.status}`);
    must(
      /редактирования клуба/i.test(String(response.body?.error ?? '')),
      `отказ пришёл не от владения: ${response.body?.error}`,
    );
    mustEqual(readDb(`SELECT name FROM clubs WHERE id=${made.clubId};`), before, 'клуб изменился');

    return 'отказ по владению, вещь цела';
  }, stranger.page);

  await step('edit-6', 'правка с НОМЕРАМИ слотов записи не трогает', async () => {
    // ⚠️ Главная проверка этой пары шагов. Владелец, поправивший телефон клуба,
    // не должен лишать людей записей — а механика замены расписания это позволяет:
    // слот без номера считается новым, старый удаляется, записи на него отменяются
    // от имени провайдера (и бьют по его же надёжности).
    const slot = (await api(owner.page, 'GET', `/api/clubs/${made.clubId}`)).body?.data?.schedule?.[0];

    must(slot !== undefined, 'у клуба не осталось слотов');
    made.slotId = slot.id;

    const booked = await api(client.page, 'POST', '/api/bookings', {
      scheduleId: made.slotId,
      name: 'Клиент прогона',
      phone: '+7 (900) 557-00-12',
    });

    must(booked.status === 201 || booked.status === 200, `запись клиента: ${booked.text}`);

    const bookingId = booked.body?.data?.id;
    const response = await api(owner.page, 'PATCH', `/api/clubs/${made.clubId}`, {
      ...(await editForm(`${RUN_TAG} Клуб с новым телефоном`)),
      phone: '+7 (900) 557-99-99',
    });

    mustEqual(response.status, 200, `правка телефона: ${response.text}`);
    mustEqual(readDb(`SELECT status FROM bookings WHERE id=${bookingId};`), 'pending', 'правка телефона отменила запись человека');
    mustEqual(readDb(`SELECT coalesce(schedule_id::text,'NULL') FROM bookings WHERE id=${bookingId};`), String(made.slotId), 'запись потеряла свой слот');

    return 'телефон изменён, запись человека цела';
  }, owner.page);

  await step('edit-7', 'правка БЕЗ номеров слотов больше НЕ отменяет записи — 409', async () => {
    // ⚠️ Смена контракта, шаги 36.4–36.8. Прежде эта проверка утверждала обратное
    // и сама просила переписать себя: тело без номеров означало «заменить расписание
    // целиком», записи на прежние слоты отменялись от имени провайдера, и это
    // портило его же надёжность за его собственную правку формы.
    //
    // Теперь удаление слота с живой будущей записью отбивается 409 с числом записей.
    // В продукте так и не бывало — форма номера шлёт, — но контракт этого не требовал,
    // и любой другой клиент стоил людям записей.
    const activeBefore = readDb(
      `SELECT count(*) FROM bookings WHERE owner_club_id=${made.clubId} AND status IN ('pending','confirmed');`,
    );

    must(Number(activeBefore) > 0, 'у клуба нет живых записей — проверять запрет не на чем');

    const response = await api(owner.page, 'PATCH', `/api/clubs/${made.clubId}`, clubForm(`${RUN_TAG} Клуб без номеров`));

    mustEqual(response.status, 409, `правка без номеров обязана отбиться 409: ${response.text}`);
    must(
      /записаны люди \(\d+\)/.test(response.text),
      `отказ обязан называть число записей: ${response.text}`,
    );

    // Отказ обязан быть отказом: ни одна запись не отменена.
    const cancelled = readDb(
      `SELECT count(*) FROM bookings WHERE owner_club_id=${made.clubId} AND status='cancelled_by_provider';`,
    );

    mustEqual(Number(cancelled), 0, 'записи всё-таки отменились — запрет не сработал');

    // И расписание цело: 409 не имеет права снести часть слотов.
    const slots = readDb(
      `SELECT count(*) FROM schedule WHERE owner_club_id=${made.clubId};`,
    );

    must(Number(slots) > 0, 'слоты исчезли при отказе — правка не атомарна');

    return `отказ 409, записей ${activeBefore}, слотов ${slots}`;
  }, owner.page);

  await step('edit-8', 'правка БЕЗ расписания вовсе — расписание не трогается', async () => {
    // Новое обещание фазы 36: поля нет — расписание не трогаем.
    const before = readDb(`SELECT count(*) FROM schedule WHERE owner_club_id=${made.clubId};`);
    const body = clubForm(`${RUN_TAG} Клуб только телефон`);
    delete body.scheduleSlots;
    body.phone = '+7 (846) 111-11-11';

    const response = await api(owner.page, 'PATCH', `/api/clubs/${made.clubId}`, body);

    mustEqual(response.status, 200, `правка без расписания: ${response.text}`);

    const after = readDb(`SELECT count(*) FROM schedule WHERE owner_club_id=${made.clubId};`);

    mustEqual(Number(after), Number(before), 'расписание изменилось, хотя его не присылали');

    return `слотов было ${before}, стало ${after}`;
  }, owner.page);

  console.log('\n=== Архивирование вместо удаления (решение 21) ===');

  await step('arch-5', 'лицо с живой записью не убирается — 409 с внятным текстом', async () => {
    // ⚠️ Шаг требует одного: у клуба есть живая будущая запись. Раньше её
    // приходилось заводить здесь заново — до фазы 36 шаг `edit-7` подменял
    // расписание целиком, прежний слот удалялся, а запись клиента отменялась
    // от имени провайдера, и к этому месту записываться было снова не на что.
    //
    // Фаза 36 это и починила: правка без номеров отбивается 409, слот и запись
    // из `edit-6` доживают сюда целыми. Поэтому повторная запись того же клиента
    // на тот же слот теперь законно отбивается «Пользователь уже записан» —
    // и прогон обязан не заводить вторую, а взять живую.
    const fresh = (await api(owner.page, 'GET', `/api/clubs/${made.clubId}`)).body?.data?.schedule?.[0];

    must(fresh !== undefined, 'у клуба не осталось слотов');
    made.slotId = fresh.id;

    const booked = await api(client.page, 'POST', '/api/bookings', {
      scheduleId: made.slotId,
      name: 'Клиент прогона',
      phone: '+7 (900) 557-00-12',
    });

    // Запись либо завелась сейчас, либо уже живёт с шага `edit-6` — годятся оба
    // исхода, но живая запись обязана быть: без неё запрет проверять не на чем.
    const bookingId =
      booked.status === 201 || booked.status === 200
        ? booked.body?.data?.id
        : readDb(
            `SELECT id FROM bookings WHERE owner_club_id=${made.clubId} AND status IN ('pending','confirmed') ORDER BY id LIMIT 1;`,
          );

    must(
      String(bookingId ?? '') !== '',
      `у клуба нет живой записи, а завести не вышло: ${booked.text}`,
    );

    const response = await api(owner.page, 'DELETE', `/api/clubs/${made.clubId}`);

    mustEqual(response.status, 409, `лицо с живой записью убралось: ${response.status}`);
    must(
      /записаны люди/i.test(String(response.body?.error ?? '')),
      `текст отказа не объясняет причину: ${response.body?.error}`,
    );
    mustEqual(readDb(`SELECT count(*) FROM clubs WHERE id=${made.clubId};`), '1', 'клуб исчез');
    mustEqual(readDb(`SELECT status FROM bookings WHERE id=${bookingId};`), 'pending', 'запись человека задета');

    return 'отказ 409, клуб и запись целы';
  }, owner.page);

  await step('arch-6', 'после отмены записи лицо архивируется, а не удаляется', async () => {
    const rows = readDb(
      `SELECT id FROM bookings WHERE owner_club_id=${made.clubId} AND status IN ('pending','confirmed');`,
    ).split('\n').filter(Boolean);

    for (const id of rows) {
      await api(owner.page, 'POST', `/api/bookings/${id}/cancel`, {});
    }

    const response = await api(owner.page, 'DELETE', `/api/clubs/${made.clubId}`);

    must(response.status === 200 || response.status === 204, `архивирование: ${response.status} ${response.text}`);
    mustEqual(readDb(`SELECT count(*) FROM clubs WHERE id=${made.clubId};`), '1', 'строка клуба удалена физически');
    mustEqual(readDb(`SELECT status FROM clubs WHERE id=${made.clubId};`), 'hidden', 'клуб не помечен убранным');

    const reason = readDb(`SELECT coalesce(hide_reason,'-') FROM clubs WHERE id=${made.clubId};`);

    must(reason !== '-', 'причина архивирования не записана');

    return `архивирован, причина: «${reason}»`;
  }, owner.page);

  await step('arch-6a', 'архивированное лицо ушло из публичного каталога', async () => {
    const anon = await freshContext();
    const catalog = await api(anon.page, 'GET', '/api/clubs');

    must(
      !(catalog.body?.data ?? []).some((club) => club.id === made.clubId),
      'архивированный клуб остался в каталоге',
    );

    await anon.context.close();

    return 'из каталога убран';
  }, owner.page);

  await step('arch-7', 'записи по архивированному лицу ЦЕЛЫ', async () => {
    // ⚠️ Главная проверка сценария: до фазы удаление лица сносило каскадом
    // записи людей, их отзывы и связи — то есть стирало чужую историю.
    const bookings = readDb(`SELECT count(*) FROM bookings WHERE owner_club_id=${made.clubId};`);

    must(Number(bookings) > 0, 'записи людей исчезли вместе с лицом');

    return `записей сохранено ${bookings}`;
  }, owner.page);

  await step('arch-8', 'архивированное лицо помечено в списке лиц, а не спрятано', async () => {
    const me = await whoAmI(owner.page);
    const face = (me.faces ?? []).find((item) => item.kind === 'club' && item.id === made.clubId);

    must(face !== undefined, 'архивированное лицо пропало — вернуть публикацию нечем');
    mustEqual(face.status, 'hidden', 'лицо не помечено убранным из каталога');

    const live = (me.faces ?? []).filter((item) => item.status !== 'hidden');

    must(live.length > 0, 'живых лиц не осталось — сравнивать не с чем');

    return `лиц ${me.faces.length}, из них живых ${live.length}`;
  }, owner.page);

  await step('arch-8a', 'карточка тренера убирается тем же путём', async () => {
    const response = await api(owner.page, 'DELETE', `/api/trainers/${made.trainerId}`);

    must(response.status === 200 || response.status === 204, `архивирование карточки: ${response.status}`);
    mustEqual(readDb(`SELECT status FROM trainers WHERE id=${made.trainerId};`), 'hidden', 'карточка не помечена');

    return 'правило одно на оба вида лица';
  }, owner.page);

  console.log('\n=== Город добавляется на лету ===');

  await step('city-2', 'незнакомый город попадает в справочник и не дублируется', async () => {
    const city = `Прогонград ${RUN_TAG}`;
    const before = readDb(`SELECT count(*) FROM cities WHERE name='${city}';`);

    mustEqual(before, '0', 'город уже есть — проверка бессмысленна');

    const first = await api(owner.page, 'POST', '/api/clubs', clubForm(`${RUN_TAG} Город раз`, { city }));

    must(first.status === 201 || first.status === 200, `публикация в новом городе: ${first.text}`);
    mustEqual(readDb(`SELECT count(*) FROM cities WHERE name='${city}';`), '1', 'город не добавился');

    const second = await api(owner.page, 'POST', '/api/clubs', clubForm(`${RUN_TAG} Город два`, { city }));

    must(second.status === 201 || second.status === 200, `вторая публикация: ${second.text}`);
    mustEqual(readDb(`SELECT count(*) FROM cities WHERE name='${city}';`), '1', 'город продублировался');

    readDb(`DELETE FROM cities WHERE name='${city}';`);

    return 'добавлен один раз, дубликата нет';
  }, owner.page);

  console.log('\n=== Публичная витрина ===');

  await step('map-1', 'главная отдаётся гостю и несёт координаты для карты', async () => {
    const anon = await freshContext();
    const clubs = await api(anon.page, 'GET', '/api/clubs');
    const withCoords = (clubs.body?.data ?? []).filter(
      (club) => club.coordinates?.lat !== undefined || club.latitude !== undefined,
    );

    mustEqual(clubs.status, 200, 'каталог гостю');
    must(withCoords.length > 0, 'ни у одного клуба нет координат — карту рисовать нечем');

    await anon.context.close();

    return `клубов с координатами: ${withCoords.length}`;
  }, owner.page);

  // Не прогоняется — с причиной у каждого.
  for (const [id, title, reason] of [
    ['map-3', 'клик по маркеру открывает popup', 'внешняя карта Яндекса: проверка зависит от загрузки CDN и живого ключа, в прогоне нестабильна'],
    ['map-5', 'смена города пересчитывает центр карты', 'то же основание — внешняя карта'],
    ['geo-2', 'подсказки города от Yandex Geosuggest', 'внешняя служба: живой ключ и квота; тайм-аут и предел частоты покрыты тестами бэкенда'],
    ['geo-4', 'геокодер подставляет координаты по адресу', 'то же основание — внешняя служба'],
    ['ui-tags', 'TagSelector показывает справочник без свободного ввода', 'проверка интерфейса; схема на номера справочника проверена шагом multi-4'],
    // ⚠️ Шаг 36.9a убрал редактор доп-услуг целиком — вместе с полем
    // `additionalOfferings`. Прежняя причина («требует интерфейса редактора»)
    // обещала, что шаг ждёт своего часа; ждать больше нечего — проверять нечего,
    // и это надо было сказать вслух, а не оставить видимость отложенной проверки.
    ['edit-5', 'правка доп-услуг не задевает соседние', 'проверять нечего: шаг 36.9a убрал редактор доп-услуг и поле `additionalOfferings` — сервер их всё равно молча выбрасывал, ни одна услуга не сохранялась. Механизм делается отдельной работой'],
  ]) skip(id, title, reason);

  await shutdown();

  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'skip').length;

  console.log(`\nИтог: ${pass} прошло, ${fail} упало, ${skipped} не прогонялось.`);
  fs.writeFileSync('/tmp/e2e-maps-publish.json', JSON.stringify(results, null, 2));

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

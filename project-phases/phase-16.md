# Phase 16

> Этот файл содержит одну фазу проекта целиком. Главный вход в контекст — `CLAUDE.md`.
> Навигация по фазам — через `PHASES_OVERVIEW.md`.
> В ежедневной работе открывай прежде всего активную фазу и не перечитывай все phase-файлы подряд без необходимости.
> Структура фазы сохраняется в исходном стиле: заголовок фазы, краткий результат, шаги по порядку, затем чеклист и статус.
> Перед стартом новой фазы проверь, что для неё уже есть отдельный `phase-XX.md`, и после завершения шагов или фазы синхронизируй статус здесь, в `PHASES_OVERVIEW.md`, `CLAUDE.md`, `README.md` и при необходимости в `STACK_OVERVIEW.md`.

## Phase 16: Fake Athlete Booking Flow (MVP)

> После этой фазы: авторизованный fake-athlete может открыть опубликованный slot клуба или тренера, подтвердить запись на `/booking/[scheduleId]`, увидеть её в блоке `Предстоящие записи` своего кабинета, отменить запись из ЛК, а provider увидит эту запись и обновлённый счётчик активных записей в своём кабинете.

Phase 16 не делает production booking-system.
Это MVP-фаза на текущем fake-auth сценарии и двух существующих пользователях проекта:
- `userId=1` — athlete;
- `userId=2` — provider.

В проекте уже есть booking-фундамент: доменная модель `Booking`, `POST /api/bookings`, страница `/booking/[scheduleId]`, athlete/provider кабинеты и JSON data-layer.
Phase 16 не строит booking-flow с нуля, а доводит текущую цепочку до первого живого сквозного сценария:
`UI -> API -> db.ts -> JSON`.
Это lightweight MVP-write flow: по сложности он ближе к оставлению комментария, чем к production booking-system, но всё равно обязан честно синхронизировать `bookings.json`, `schedule.bookedCount` и два кабинета.

**Ключевые решения:**

- Записаться на тренировку может только пользователь с fake-auth аккаунтом типа `athlete`.
- В рамках MVP текущий athlete фиксируется как `userId = 1`.
- Provider не может записываться ни через UI, ни через API.
- Phase 16 не добавляет новые технологии, новые зависимости или обновление стека: работа идёт внутри текущего `Next.js + React + Tailwind + Zustand + Zod + JSON` контура.
- Точка входа в запись остаётся прежней: `/booking/[scheduleId]`.
- Сценарий записи остаётся page-based: используется текущая страница `/booking/[scheduleId]`, без popup или modal-flow.
- Booking page остаётся server-rendered preview-страницей, а интерактивная запись добавляется отдельным client action-block.
- Booking page не получает большую форму: только summary слота, кто записывается, primary action и короткий success/error state.
- Минимальный create-contract: клиент передаёт только `scheduleId` и `userId`.
- Сервер сам вычисляет booking metadata из slot-context: `date`, `ownerType`, `ownerId`, `offeringId`, `clubId`, `trainerId`, `sportId`, `totalPrice`.
- Fake-auth остаётся клиентским MVP-сценарием, но booking API всё равно валидирует `user.role = 'athlete'` на create и ownership на delete по данным `users.json`.
- Cancel в этой фазе — `hard delete`, а не перевод записи в `status = 'cancelled'`.
- Create и cancel должны работать без partial write: запись и изменение `schedule.bookedCount` обновляются единым pseudo-atomic сценарием.
- Для athlete/provider UI активной считается запись со статусом `confirmed` или `pending` и датой не раньше текущего дня; внутри текущего дня время слота в этой фазе ещё не вычитается.
- Для booking-notice используется существующий `ActionNotice` pattern, без второго toast-механизма.
- После create/cancel UI обновляется через текущий server-driven подход: `router.refresh()`, без нового client store для bookings.
- Блок `История`, completed lifecycle, provider-side actions, detail page записи, оплата, архив, уведомления и real auth остаются вне scope.
- Добавляется новая ачивка `Первая запись на тренировку`: она всегда видна в системе ачивок и открывается, когда у athlete появляется хотя бы одна активная запись; без активной записи остаётся в блоке `Ачивки в процессе`.

### Step 16.1: Зафиксировать MVP-scope записи и минимальный booking-contract

- **Действие:**
  - зафиксировать, что booking доступен только fake-athlete с `role = 'athlete'`;
  - закрепить, что текущий MVP-athlete для сценария — `userId = 1`;
  - определить минимальный create-contract: клиент передаёт только `scheduleId` и `userId`;
  - закрепить, что server-side create guard обязан проверить `user.role = 'athlete'`, даже в fake-auth режиме;
  - определить минимальный cancel-contract: athlete может удалить только свою активную запись;
  - закрепить, что server-side delete guard обязан проверить ownership записи;
  - явно зафиксировать, что cancel в этой фазе — hard delete;
  - закрепить единое определение active booking для athlete/provider UI;
  - оставить вне scope историю отмен, completed lifecycle, provider-side actions, расширенные поля записи и real auth/session validation.

- **Проверка:**
  - контракт записи становится точнее текущего черновика;
  - реализатору не нужно додумывать payload, ownership и cancel semantics;
  - booking-flow остаётся MVP, а не превращается в CRM-логику.

- **Тесты:**
  - contract-level тесты на минимальный POST payload;
  - type-level тест на новый achievement id `first-booking`;
  - тесты на трактовку hard-cancel как удаления записи, а не смены статуса.

- **Ожидаемый результат:**
  - у фазы есть чёткий и узкий decision-complete booking-contract.

### Step 16.2: Подключить create/cancel booking-flow через `API -> db.ts -> JSON`

> **Примечание:** backend-шаг идёт перед UI-шагом, чтобы action block на booking page подключался к уже рабочему atomic API, а не к текущему split create-flow.

- **Действие:**
  - заменить текущий split create-flow на pseudo-atomic create helper в `db.ts`;
  - helper должен одним сценарием:
    - прочитать `bookings` и `schedule`;
    - проверить slot existence, capacity и duplicate;
    - собрать новый booking и обновлённый slot в памяти;
    - записать обе коллекции единым rollback-сценарием;
  - добавить cancel helper в `db.ts`, который:
    - находит booking;
    - проверяет ownership;
    - удаляет booking (hard delete — запись физически удаляется из JSON);
    - уменьшает `schedule.bookedCount`;
    - пишет изменения единым rollback-сценарием;
  - обновить `POST /api/bookings` под новый контракт;
  - упростить duplicate check: после hard-delete cancelled записей нет в JSON, проверка `booking.status !== 'cancelled'` больше не нужна — любой existing booking для данного userId+scheduleId = duplicate;
  - добавить комментарий в POST handler: `// MVP: запись сразу confirmed. pending зарезервирован для будущего payment-flow.`;
  - добавить `DELETE /api/bookings/[id]` с `userId` и ownership guard;
  - сохранить стандартный API contract проекта.

- **Проверка:**
  - create booking реально создаётся в JSON;
  - duplicate booking на тот же slot не проходит;
  - booking невозможен без мест;
  - cancel реально удаляет запись из JSON (hard delete, не status change);
  - ни create, ни cancel не оставляют partial write.

- **Тесты:**
  - db tests на atomic create/cancel, duplicate guard, capacity guard и rollback;
  - тест на atomicity failure: если write упал → данные откатились;
  - тест что hard-delete физически удаляет запись из JSON (не меняет status);
  - тест что после hard-delete пользователь может заново записаться на тот же slot;
  - API tests на POST success/failure;
  - API tests на DELETE success/failure, not-athlete guard, delete чужой записи, slot/booking not found.

- **Ожидаемый результат:**
  - booking-flow становится живой и безопасной частью текущей архитектуры.

### Step 16.3: Доработать `/booking/[scheduleId]` из preview в реальную MVP-точку записи

- **Действие:**
  - сохранить текущую server-rendered preview-часть страницы как информационный блок;
  - добавить отдельный client booking-action block;
  - не добавлять popup/modal: запись остаётся на текущей booking page;
  - в action block показывать:
    - кто записывается;
    - текущее состояние слота;
    - одну основную кнопку `Подтвердить запись`;
    - success/error notice;
    - CTA `Перейти в ЛК` после успеха;
  - поддержать состояния:
    - athlete может записаться;
    - guest / not-authenticated;
    - provider session;
    - мест нет;
    - пользователь уже записан на этот slot;
  - после успешной записи делать `router.refresh()` для обновления свободных мест и server-state страницы.

- **Проверка:**
  - booking page перестаёт быть только preview;
  - действие записи выглядит как живой сценарий, а не как декоративная кнопка;
  - preview-часть страницы не ломается.

- **Тесты:**
  - render tests для action block (кнопка, состояния guest/provider/full/duplicate);
  - mock fetch test: симуляция клика → проверка вызова POST с правильным payload → обработка success response (notice + CTA visible);
  - mock fetch test: симуляция ошибки → error notice visible;
  - regression test на сохранность preview-блока.

- **Ожидаемый результат:**
  - `/booking/[scheduleId]` становится рабочей MVP-страницей записи.

### Step 16.4: Перевести блок `Предстоящие записи` в ЛК спортсмена на честную active-booking динамику

- **Действие:**
  - строить upcoming block только от active future bookings текущего athlete;
  - для MVP считать active future booking по правилу `date >= today`, без отдельной same-day time logic;
  - использовать единый helper active-filtering и для summary count, и для карточек;
  - сохранить честный empty-state;
  - после booking показывать новую запись;
  - после hard cancel убирать запись из блока.

- **Проверка:**
  - блок перестаёт быть списком сырых bookings;
  - результат booking-flow сразу отражается в athlete cabinet;
  - empty-state и filled-state предсказуемы.

- **Тесты:**
  - athlete profile tests на empty-state и filled-state;
  - tests на count `Ближайшие записи`;
  - tests на сортировку по дате/времени;
  - tests на исчезновение карточки после cancel.

- **Ожидаемый результат:**
  - athlete cabinet начинает честно отражать реальные активные записи.

### Step 16.5: Добавить отдельную MVP-карточку записи в `Предстоящие записи`

- **Действие:**
  - оформить отдельную booking-card для athlete cabinet;
  - карточка должна показывать:
    - тип: услуга клуба / услуга тренера;
    - название услуги;
    - кто проводит;
    - дата и время;
    - место;
    - status badge;
    - action `Отменить запись`;
  - cancel должен запускаться прямо из карточки, без отдельной detail-page записи;
  - после cancel показывать notice и делать `router.refresh()`.

- **Проверка:**
  - карточка читается быстро;
  - визуально понятен тип записи и ближайший slot;
  - cancel доступен без лишней навигации.

- **Тесты:**
  - UI tests на рендер type/title/location/date/time;
  - tests на наличие и работу кнопки cancel;
  - regression tests на empty-state блока.

- **Ожидаемый результат:**
  - `Предстоящие записи` получают понятный и живой UI-формат.

### Step 16.6: Добавить booking-aware динамику в athlete cabinet без трогания истории

- **Действие:**
  - перевести на booking-данные только те части athlete cabinet, которые уже можно честно оживить;
  - обновить:
    - summary count `Ближайшие записи`;
    - блок `Предстоящие записи`;
    - achievement summary;
    - общий progress bar;
  - не трогать:
    - `История`;
    - completed booking logic;
    - временную логику уже прошедших занятий.

- **Проверка:**
  - athlete cabinet становится заметно живее;
  - фаза не уходит в лишнюю доменную сложность;
  - старые блоки не ломаются там, где логика ещё не готова.

- **Тесты:**
  - summary counts tests;
  - progress summary tests;
  - regression tests на `AthleteHistorySection`;
  - tests на sync после create/cancel booking.

- **Ожидаемый результат:**
  - athlete cabinet получает первую цельную booking-динамику без изменения history-flow.

### Step 16.7: Добавить ачивку `Первая запись на тренировку`

- **Действие:**
  - расширить achievement-system новым id `first-booking`;
  - логика MVP:
    - есть хотя бы одна активная запись — ачивка открыта;
    - активных записей нет — ачивка остаётся видимой в блоке `Ачивки в процессе`;
  - включить ачивку в общий progress bar и summary opened count;
  - не смешивать новую ачивку с completed-only achievements;
  - добавить STUB-комментарий к `getBookingStreakWithoutCancellation()` в `athlete-achievements.ts`: streak logic корректно заработает только при наличии soft-delete или completed lifecycle (post-MVP); в текущем MVP с hard-delete streak не ломается, но и completed bookings нет — функция возвращает 0.

- **Проверка:**
  - booking-flow влияет на achievements;
  - hard cancel или ручная очистка JSON возвращают ачивку из `Открытых` в `Ачивки в процессе`;
  - логика остаётся вычисляемой и простой.

- **Тесты:**
  - unit tests на переход `first-booking` между `Ачивки в процессе` и `Открытыми`;
  - tests на пересчёт общего progress;
  - athlete profile tests на рендер новой ачивки.

- **Ожидаемый результат:**
  - запись начинает влиять не только на список занятий, но и на прогресс спортсмена.

### Step 16.8: Подключить booking-динамику к ЛК провайдера

> **Примечание:** `ProviderBookingsSection`, `getProviderIncomingBookings()` и `getProviderSummary()` уже существуют и вызываются в `ProviderProfilePage.tsx`. Этот шаг не пересоздаёт секцию заново, а дополняет существующую карточку записи и проверяет корректность данных после booking-flow.

- **Действие:**
  - проверить что существующий `ProviderBookingsSection` корректно отображает booking-данные, созданные через новый atomic API;
  - убедиться что после hard-delete athlete'ом записи `router.refresh()` обновляет provider cabinet;
  - проверить что `getProviderSummary()` корректно считает KPI `Активные записи`;
  - дополнить существующую карточку записи недостающими полями:
    - имя спортсмена;
    - email спортсмена;
    - короткая строка `к кому / куда`, чтобы запись не была двусмысленной при нескольких публикациях провайдера;
  - данные для карточки обогащать через `users.json` и `schedule.json`, а не хранить денормализованно в booking;
  - provider-side actions не добавлять: только read-only просмотр.

- **Проверка:**
  - provider видит новую запись после действия спортсмена;
  - после hard cancel запись исчезает;
  - KPI `Активные записи` синхронно обновляется;
  - provider сразу понимает, к какой публикации относится запись;
  - блок не показывает cancelled/history state, который вне scope фазы.

- **Тесты:**
  - provider helper tests на active incoming bookings;
  - provider section tests на athlete name/email/title/date/time/type/context;
  - provider profile tests на KPI update и empty-state.

- **Ожидаемый результат:**
  - provider cabinet получает первую реальную booking-динамику.

### Step 16.9: Проверить сквозную интеграцию booking-flow

- **Действие:**
  - проверить полный сценарий:
    - athlete логинится;
    - открывает slot;
    - записывается;
    - видит success-notice и CTA на booking page;
    - видит запись в своём ЛК;
    - provider видит запись у себя;
    - athlete отменяет запись;
    - обе стороны видят rollback;
  - отдельно проверить оба варианта:
    - booking trainer service;
    - booking club service;
  - отдельно проверить guard-сценарии:
    - guest;
    - provider session;
    - duplicate booking;
    - full slot;
    - delete чужой booking.

- **Проверка:**
  - flow одинаково работает для двух ownerType;
  - не ломаются каталоги, detail pages и publish flow провайдера;
  - booking ощущается как сквозной сценарий проекта, а не isolated stub.

- **Тесты:**
  - integration test: полный lifecycle — book → appear in athlete ЛК → appear in provider ЛК → cancel → disappear from both;
  - integration tests на club booking create/cancel;
  - integration tests на trainer booking create/cancel;
  - guard-сценарии: guest, provider session, duplicate booking, full slot, delete чужой booking;
  - при необходимости расширить isolated seed fixtures для сквозных сценариев.

- **Ожидаемый результат:**
  - запись становится полноценной MVP-связкой между публичной частью и двумя кабинетами.

### Чек-лист Phase 16

- [x] Авторизованный fake-athlete может записаться на published slot
- [x] Запись работает и для услуги тренера, и для услуги клуба
- [x] `/booking/[scheduleId]` содержит не только preview, но и реальный booking-action block
- [x] Booking flow остаётся page-based и не вводит popup/modal сценарий
- [x] Минимальный create-contract — клиент передаёт только `scheduleId` и `userId`
- [x] Booking создаётся через `API -> db.ts -> JSON`
- [x] Create и cancel не оставляют partial write
- [x] Create API валидирует `role = 'athlete'`, а DELETE проверяет ownership записи
- [x] Нельзя создать duplicate active booking на один и тот же slot
- [x] Учитываются свободные места
- [x] Для MVP active booking считается по `date >= today`, без same-day time filtering
- [x] В ЛК спортсмена блок `Предстоящие записи` строится от реальных active bookings
- [x] У `Предстоящих записей` есть отдельная MVP-карточка
- [x] Из ЛК спортсмена можно отменить запись
- [x] Cancel в этой фазе работает как hard delete
- [x] После cancel запись исчезает из JSON и из `Предстоящих записей`
- [x] Блок `История` в athlete cabinet не меняется в этой фазе
- [x] Добавлена ачивка `Первая запись на тренировку`
- [x] Progress bar и achievement summary обновляются от booking-данных
- [x] После cancel ачивка `Первая запись на тренировку` возвращается в блок `Ачивки в процессе`
- [x] В ЛК провайдера счётчик `Активные записи` становится динамическим
- [x] В ЛК провайдера блок `Входящие записи` показывает базовую карточку записанного спортсмена
- [x] Карточка провайдера коротко показывает, кто записался и к кому / куда пришла запись
- [x] Provider-side booking-card остаётся read-only
- [x] Athlete/provider данные синхронно обновляются после create/cancel booking
- [x] Тесты покрывают booking create/cancel, athlete cabinet, provider cabinet и регрессии
- [x] Документация синхронизирована

**Выполнено:** Step 16.1, Step 16.2, Step 16.3, Step 16.4, Step 16.5, Step 16.6, Step 16.7, Step 16.8, Step 16.9

**Следующий шаг:** отсутствует — Phase 16 закрыта

**Статус Phase 16:** ✅ ЗАВЕРШЕНА

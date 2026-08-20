# E2E: Notifications (Phase 24 Steps 24.5–24.7 + Phase 26 Steps 26.2/26.3/26.8 + hotfix + Phase 27 fixes)

**Role:** cross-role (athlete ↔ provider)
**Base URL:** http://localhost:3000
**Preconditions:**

- Seed; у провайдера id=2 есть слоты с валидным расписанием
- dev-сервер запущен
- `notifications.json` желательно пустой или с контролируемым содержимым для детерминизма bucket'ов
- `src/data/users.json` у id=2 **не содержит** `notificationPreferences.booking_requested: false` (откатить после прошлых прогонов)

## Scenario: Bell-icon и dropdown

**Role:** athlete (id=1)

- [ ] **step-1** Login, navigate `/` — expect bell-icon в Header виден
- [ ] **step-2** Создать уведомление (например через booking: записаться и дождаться confirm от провайдера из отдельного сценария) → expect badge увеличился
- [ ] **step-3** Click на колокольчик — expect dropdown с последними 5 уведомлениями, в title/description `getNotificationCopy()` текст
- [ ] **step-4** Phase 27 Step 27.6 — click по любому непрочитанному элементу dropdown: (1) POST `/api/notifications/[id]/read`; (2) badge уменьшается на 1 (или исчезает); (3) dropdown закрывается; (4) `router.push` на `/profile/athlete/notifications`. Проверить через `browser_evaluate` что `window.location.pathname === '/profile/athlete/notifications'`
- [ ] **step-5** Click «Все уведомления» в шапке dropdown — expect тоже redirect на `/profile/athlete/notifications` (тот же target, без mark-as-read)

## Scenario: `NotificationsListPage` фильтры групп (athlete vs provider)

**Role:** athlete → provider

- [ ] **step-1** Login athlete, navigate `/profile/athlete/notifications` — expect **3 tab'а** фильтров: `Все`, `Записи`, `Дисциплина` (tab `Связи` СКРЫТ — Step 26.8)
- [ ] **step-2** Phase 27 Step 27.3 — assert счётчики tab'ов **не** считают provider-специфичные типы (если в базе есть `booking_requested`/`..._to_provider` для user=1, они игнорируются в счётчиках)
- [ ] **step-3** Assert счётчики в каждом tab'е — считаются от полного списка (не от текущего фильтра)
- [ ] **step-4** Click «Только непрочитанные» — прочитанные исчезают
- [ ] **step-5** Assert уведомления разложены по bucket'ам `Сегодня` / `Вчера` / `Эта неделя` / `Раньше`
- [ ] **step-6** Click «Отметить всё как прочитанное» — expect тост success, все без индикаторов
- [ ] **step-7** Logout, login provider, navigate `/profile/provider/notifications` — expect **4 tab'а** (с `Связи`)

## Scenario: Редактор preferences (`UserNotificationPreferencesEditor`)

**Role:** athlete → provider

- [ ] **step-1** Login athlete, navigate `/profile/athlete/settings` — expect **2 группы**: «Записи» + «Дисциплина» (группа «Связи» СКРЫТА)
- [ ] **step-2** Phase 27 Step 27.3 — assert в группе «Записи» у athlete **нет** чекбоксов `booking_requested`, `booking_cancelled_by_athlete_to_provider`, `booking_auto_expired_to_provider` (provider-типы не рендерятся у athlete). Должны быть видны только athlete-адресованные типы
- [ ] **step-3** Assert REQUIRED чекбоксы disabled: `booking_confirmed`, `booking_cancelled_by_provider`, `quarantine_start`, с плашкой «Нельзя отключить»
- [ ] **step-4** Click по `booking_completed` (non-required) — после ~500ms expect toast «Настройки уведомлений сохранены»
- [ ] **step-5** Phase 27 Step 27.0 — `browser_navigate` на ту же страницу (refresh) → assert галочка `booking_completed` **осталась снятой** (раньше сбрасывалась на default true)
- [ ] **step-6** Создать событие типа `booking_completed` (через provider check-in с пред-подготовленным слотом в прошлом) → expect уведомление НЕ появляется у атлета — ни в dropdown, ни на странице `/notifications`, ни в badge (Phase 27 Step 27.2 — единый фильтр)
- [ ] **step-7** Logout, login provider, `/profile/provider/settings` — expect все **3 группы** (booking, links, quarantine). В группе «Записи» должны быть видны provider-типы (`booking_requested` и др.)

## Scenario: Phase 26 hotfix — провайдер получает booking-уведомления

**Role:** athlete (id=1) ↔ provider (id=2)

- [ ] **step-1** Login athlete, записаться на слот провайдера id=2 через POST /api/bookings (или через UI)
- [ ] **step-2** Logout, login provider — expect колокольчик **+1**, в dropdown уведомление `booking_requested` с title «Новая запись на ваш слот»
- [ ] **step-3** Navigate `/profile/provider/notifications` → tab `Записи` — expect уведомление в сегодняшнем bucket'е
- [ ] **step-4** Logout, login athlete → отменить pending/confirmed запись → logout, login provider — expect новое уведомление `booking_cancelled_by_athlete_to_provider` («Клиент отменил запись»)
- [ ] **step-5** Имитировать auto-expire: создать pending на слот с `startTime < now + 1h` → открыть любую provider-страницу (триггерит `runLazyBookingTransitions`) → expect 2 уведомления: `booking_auto_expired` (атлет) + `booking_auto_expired_to_provider` (провайдер). Прогон в ручном режиме подтверждён, для MCP нужна правильная подготовка slot в seed
- [ ] **step-6** Provider сам отменил confirmed — expect ЕМУ уведомление НЕ пришло (он инициатор, достаточно UI-toast)
- [ ] **step-7** В `/profile/provider/settings` → группа «Записи» — expect 3 новых чекбокса (`Новая запись на ваш слот`, `Клиент отменил запись`, `Запись авто-отменена`), все не-REQUIRED
- [ ] **step-8** Phase 27 Step 27.2 — отключить `booking_requested` → создать новый pending от атлета → вернуться к provider. Expect: уведомление НЕ появляется **ни в одном** из трёх мест — в dropdown, на `/profile/provider/notifications`, **и badge-счётчик не растёт** (раньше был 3-сторонний рассинхрон)

## Scenario: Toast-стек на действиях

**Role:** provider (id=2)

- [ ] **step-1** Login, в `/profile/provider/bookings` выполнить любое действие (confirm/reject/check-in/cancel) — expect toast внизу справа
- [ ] **step-2** Assert toast auto-dismiss через ~4 секунды
- [ ] **step-3** Быстро выполнить 3 действия подряд — expect 3 toast'а стекаются, уникальные id

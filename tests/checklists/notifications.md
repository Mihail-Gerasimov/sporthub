# E2E: Notifications (Phase 24 Steps 24.5–24.7 + Phase 26 Steps 26.2/26.3/26.8 + hotfix + Phase 27 fixes + Phase 35 Steps 35.26–35.28a/35.37)

**Role:** cross-face (человек ↔ лицо услуг)
**Base URL:** http://localhost:3000
**Preconditions:**

- База поднята и засеяна (`npm run db:up`, `npm run db:seed`), подняты бэкенд `:3001` и фронт `:3000`
- Учётки из сида `apps/api/src/storage/seed/dev-seed.ts`, пароль общий — `DEV_PASSWORD`:
  id=4 `athlete@sporthub.local` (лиц нет), id=2 `owner@sporthub.local` (клубы 1 и 2 со слотами
  в расписании), id=5 `both@sporthub.local` (клуб 3 и карточка тренера 2)
- Таблица уведомлений желательно пустая или с контролируемым содержимым — для детерминизма bucket'ов
- У id=2 в настройках **не отключён** `booking_requested` (откатить после прошлых прогонов):
  проверяется через `GET /api/users/2/notification-preferences`

⚠️ **Адресат уведомления — лицо (фаза 35).** Восемь типов адресуются не человеку, а его
лицу услуг: `booking_requested`, `booking_cancelled_by_athlete_to_provider`,
`booking_auto_expired_to_provider`, `link_requested`, `link_approved`, `link_rejected`,
`link_revoked`, `review_received_by_provider`. Остальные восемь адресуются человеку.
В строке уведомления помимо `userId` (владелец-человек) заполняется колонка лица —
`addressee_club_id` либо `addressee_trainer_id`, но не обе.

⚠️ **Ящики читаются параметром, а не ролью.** `GET /api/notifications` без параметров —
объединённый срез «всё моё»; `?scope=personal` — только личные строки; `?clubId=` / `?trainerId=` —
ящик конкретного лица (чужое лицо → 403 «Недостаточно прав»); `?scope=all` — вся площадка,
только под правом администратора. Те же параметры принимают `GET /api/notifications/unread-count`
и `POST /api/notifications/read-all`.

⚠️ **Типов сейчас 16, групп три.** Карантинные `quarantine_start`, `quarantine_end`,
`quarantine_lifted_by_admin` вырезаны в фазе 35 (этап Э0a) вместе с санкциями за неявки.
Обязательных типов ровно два: `booking_confirmed` и `booking_cancelled_by_provider`.

## Scenario: Bell-icon и dropdown

**Role:** id=4 (лиц нет)

- [ ] **step-1** Login, navigate `/` — expect bell-icon в Header виден
- [ ] **step-2** Создать уведомление (например через booking: записаться и дождаться confirm от владельца лица из отдельного сценария) → expect badge увеличился
- [ ] **step-3** Click на колокольчик — expect dropdown с последними 5 уведомлениями, в title/description `getNotificationCopy()` текст
- [ ] **step-4** Phase 27 Step 27.6 — click по любому непрочитанному элементу dropdown: (1) POST `/api/notifications/[id]/read`; (2) badge уменьшается на 1 (или исчезает); (3) dropdown закрывается; (4) `router.push` на `/profile/athlete/notifications`. Проверить через `browser_evaluate` что `window.location.pathname === '/profile/athlete/notifications'`
- [ ] **step-5** Click «Все уведомления» в шапке dropdown — expect тоже redirect на `/profile/athlete/notifications` (тот же target, без mark-as-read)
- [ ] **step-6** **Шаг 35.36.** Assert у id=4 колокольчик на месте, хотя лиц у человека нет:
      уведомления есть у всякого вошедшего. Logout, login id=1 (админ) — колокольчика
      в Header **нет вовсе**: у служебной записи ни записей, ни отзывов
- [ ] **step-7** Logout, login id=2 (есть лица) — click «Все уведомления» ведёт в
      `/profile/provider/notifications`: адрес берётся у кабинета активного лица

## Scenario: `NotificationsListPage` — вкладки это темы, а не роли

**Role:** id=4 → id=2

- [ ] **step-1** Login id=4, navigate `/profile/athlete/notifications` — expect **4 tab'а**
      фильтров: `Все`, `Записи`, `Связи`, `Отзывы`.
      ⚠️ **Шаг 35.28a:** вкладка `Связи` больше **не** прячется у человека без лиц —
      вкладки это темы, а не роли получателя, и спрятанная вкладка означала бы строки,
      которые видно в «Все» и невозможно отфильтровать. Вкладки `Дисциплина` нет вовсе:
      санкции за неявки отменены (этап Э0a)
- [ ] **step-2** Assert счётчики tab'ов считают **все** строки ящика, включая адресованные
      лицам. ⚠️ Отбора по формуле «тип → роль получателя» здесь больше нет ни в списке,
      ни в счётчиках: видимость строки решает её **адресат**, и решает это сервер
- [ ] **step-3** Assert счётчики в каждом tab'е — считаются от полного списка (не от текущего фильтра)
- [ ] **step-4** Click «Только непрочитанные» — прочитанные исчезают
- [ ] **step-5** Assert уведомления разложены по bucket'ам `Сегодня` / `Вчера` / `Эта неделя` / `Раньше`
- [ ] **step-6** Click «Отметить всё как прочитанное» — expect тост success, все без индикаторов
- [ ] **step-7** Logout, login id=2, navigate `/profile/provider/notifications` — expect
      **те же 4 tab'а**. Assert: набор вкладок у человека с лицами и без лиц одинаковый —
      различие теперь только в содержимом

## Scenario: Адресат — лицо услуг

**Role:** id=4 (клиент) → id=2 (два клуба) → id=5 (клуб и карточка)

Ядро фазы 35 по этому домену. Проверяется, что уведомление приходит **лицу**, а объединённый
ящик человека остаётся объединённым.

- [ ] **step-1** id=4 записывается на слот клуба **1** (владелец id=2). Login id=2
- [ ] **step-2** Assert строка в базе: `booking_requested` несёт `addressee_club_id = 1`
      и `user_id = 2`. Колонка карточки тренера пуста — заполнено **ровно одно** лицо
      (ограничение `notifications_addressee_one`)
- [ ] **step-3** `GET /api/notifications?clubId=1` — уведомление есть.
      `GET /api/notifications?clubId=2` — его **нет**: ящик второго клуба свой
- [ ] **step-4** `GET /api/notifications?scope=personal` — уведомления **нет**: личный ящик
      не смешивается с ящиками лиц
- [ ] **step-5** `GET /api/notifications` без параметров — уведомление **есть**: объединённый
      срез «всё моё» читается по `user_id` без всяких `OR`
- [ ] **step-6** `GET /api/notifications/unread-count?clubId=1` и `?clubId=2` — числа
      **разные**, каждое по своему ящику
- [ ] **step-7** `POST /api/notifications/read-all?clubId=1` — expect погашен только ящик
      клуба 1. Assert: `unread-count?clubId=2` **не изменился**, личный счётчик тоже
- [ ] **step-8** `GET /api/notifications?clubId=<чужой клуб>` под id=2 — expect **403**
      «Недостаточно прав». Assert: ни одной чужой строки в ответе
- [ ] **step-9** `GET /api/notifications?scope=all` под id=2 — 401/403: полный срез площадки
      закрыт правом администратора
- [ ] **step-10** Своя запись к **чужому** тренеру: id=2 записывается на слот 4 карточки
      тренера 1 (владелец id=3), id=3 подтверждает → уведомление `booking_confirmed`
      приходит id=2 **как человеку**: колонки лица пусты, строка видна
      в `?scope=personal` и **не** видна в `?clubId=1`. ⚠️ Сценарий стал достижим только
      в фазе 35: прежде владелец лица записаться не мог вовсе, и `AUDIENCE[type]`
      прятал бы от него эти строки
- [ ] **step-11** id=5: связь и запись по клубу 3 и по карточке 2 — уведомления
      раскладываются по двум **разным** ящикам (`?clubId=3` и `?trainerId=2`), а не
      в один общий

⚠️ Интерфейс страницы уведомлений ящик лица пока **не** запрашивает: `NotificationsListPage`
и `POST /api/notifications/read-all` ходят без параметров лица, то есть показывают и гасят
объединённый ящик. Шаги 3–7 этого сценария проверяются через API.

## Scenario: Редактор preferences (`UserNotificationPreferencesEditor`)

**Role:** id=4 → id=2

- [ ] **step-1** Login id=4, navigate `/profile/athlete/settings` — expect **3 группы**:
      «Записи», «Связи», «Отзывы». Группы «Дисциплина» больше нет — санкции за неявки
      отменены (этап Э0a)
- [ ] **step-2** **Шаг 35.28a.** Assert: в группе «Записи» показаны **все** типы группы,
      включая `booking_requested`, `booking_cancelled_by_athlete_to_provider`,
      `booking_auto_expired_to_provider`. Прежде их прятали у атлета; ролей нет, у человека
      с клубом эти уведомления есть, и спрятанный чекбокс означал бы неотключаемый тип
- [ ] **step-3** Assert REQUIRED чекбоксы disabled: `booking_confirmed`,
      `booking_cancelled_by_provider`, с плашкой «Нельзя отключить». Их ровно два
- [ ] **step-4** Click по `booking_completed` (non-required) — после ~500ms expect toast «Настройки уведомлений сохранены»
- [ ] **step-5** Phase 27 Step 27.0 — `browser_navigate` на ту же страницу (refresh) → assert галочка `booking_completed` **осталась снятой**: настройка сохранена в базе, а не только в состоянии страницы
- [ ] **step-6** Создать событие типа `booking_completed` (через check-in владельцем лица с пред-подготовленным слотом в прошлом) → expect уведомление НЕ появляется у человека — ни в dropdown, ни на странице `/notifications`, ни в badge (Phase 27 Step 27.2 — единый фильтр)
- [ ] **step-7** Logout, login id=2, `/profile/provider/settings` — expect **те же 3 группы**
      и тот же набор чекбоксов. Assert: набор настроек у человека с лицами и без лиц
      одинаковый — отключать можно всё, кроме двух обязательных
- [ ] **step-8** ❓ **Настройки на лицо (решение 5.9).** Схема базы к этому готова:
      в `user_notification_preferences` есть `face_club_id` / `face_trainer_id`
      и три частичных уникальных индекса. Но `PATCH /api/users/:id/notification-preferences`
      параметра лица **не принимает**, а чтение по лицу не фильтрует — заглушить один клуб,
      не заглушая остальные, сейчас нельзя. Шаг оставлен вопросом: доделывается ли API
      в этой фазе или переносится

## Scenario: Владелец лица получает booking-уведомления

**Role:** id=4 ↔ id=2

- [ ] **step-1** Login id=4, записаться на слот клуба id=2 через POST /api/bookings (или через UI). Клиент в теле не передаётся — сервер берёт его из сессии
- [ ] **step-2** Logout, login id=2 — expect колокольчик **+1**, в dropdown уведомление `booking_requested` с title «Новая запись на ваш слот»
- [ ] **step-3** Navigate `/profile/provider/notifications` → tab `Записи` — expect уведомление в сегодняшнем bucket'е
- [ ] **step-4** Logout, login id=4 → отменить pending/confirmed запись → logout, login id=2 — expect новое уведомление `booking_cancelled_by_athlete_to_provider` («Клиент отменил запись») в ящике того клуба, чей был слот
- [ ] **step-5** Имитировать auto-expire: создать pending на слот с `startTime < now + 1h` → открыть любую страницу кабинета лица (её загрузка ходит в `GET /api/bookings`, а он запускает ленивые переходы `runLazyTransitions` на бэкенде) → expect 2 уведомления: `booking_auto_expired` (человеку-клиенту, без лица) + `booking_auto_expired_to_provider` (в ящик лица). Прогон в ручном режиме подтверждён, для MCP нужна правильная подготовка slot в сиде
- [ ] **step-6** Владелец лица сам отменил confirmed — expect ЕМУ уведомление НЕ пришло (он инициатор, достаточно UI-toast)
- [ ] **step-7** В `/profile/provider/settings` → группа «Записи» — expect чекбоксы
      `Новая запись на ваш слот`, `Клиент отменил запись`, `Запись авто-отменена`,
      все не-REQUIRED
- [ ] **step-8** Phase 27 Step 27.2 — отключить `booking_requested` → создать новый pending от id=4 → вернуться к id=2. Expect: уведомление НЕ появляется **ни в одном** из трёх мест — в dropdown, на `/profile/provider/notifications`, **и badge-счётчик не растёт**. Проверяются все три места сразу: фильтр отключённых типов один, и расхождение между ними означало бы, что какой-то из потребителей его обходит

## Scenario: Счётчики сводки и колокольчика

**Role:** id=2

- [ ] **step-1** Login id=2, navigate `/profile/provider/dashboard` — assert KPI
      «Непрочитанные» (`provider-dashboard-unread`) считает строки, у которых **заполнено
      лицо** (`addresseeType`), то есть непрочитанное **лиц** человека
- [ ] **step-2** Assert колокольчик в Header считает **весь** ящик человека
      (`GET /api/notifications/unread-count` без параметров) — и личные строки тоже
- [ ] **step-3** ❓ Завести человеку одно личное непрочитанное (например `booking_confirmed`
      по своей записи) и сравнить числа — они разойдутся. Это ловушка 7.8 фазы 35:
      свериться с заказчиком, задумано ли расхождение или сводка должна считать то же,
      что колокольчик

## Scenario: Toast-стек на действиях

**Role:** id=2

- [ ] **step-1** Login, в `/profile/provider/bookings` выполнить любое действие (confirm/reject/check-in/cancel) — expect toast внизу справа
- [ ] **step-2** Assert toast auto-dismiss через ~4 секунды
- [ ] **step-3** Быстро выполнить 3 действия подряд — expect 3 toast'а стекаются, уникальные id

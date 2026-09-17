# Phase 20

> Этот файл содержит одну фазу проекта целиком. Главный вход в контекст — `CLAUDE.md`.
> Навигация по фазам — через `PHASES_OVERVIEW.md`.
> В ежедневной работе открывай прежде всего активную фазу и не перечитывай все phase-файлы подряд без необходимости.
> Структура фазы сохраняется в исходном стиле: заголовок фазы, краткий результат, шаги по порядку, затем чеклист и статус.
> Перед стартом новой фазы проверь, что для неё уже есть отдельный `phase-XX.md`, и после завершения шагов или фазы синхронизируй статус здесь, в `PHASES_OVERVIEW.md`, `CLAUDE.md`, `README.md` и при необходимости в `STACK_OVERVIEW.md`.

## Phase 20: Логи активности платформы

> После этой фазы: на платформе работает система логирования ключевых действий. Все значимые события (публикации, букинги, админ-действия) автоматически записываются в журнал. В админ-панели появляется новая страница «Логи» с хронологической лентой событий, фильтрами по типу действия, дате и актору, пагинацией и автообновлением. Логи — фундамент для Phase 21 (аналитика использует логи как источник данных об активности) и Phase 22 (модерация пишет свои действия в эту же систему).

Phase 20 — инфраструктурная фаза. Не меняет существующие пользовательские flows, только добавляет наблюдаемость.

---

### Ключевые решения

**Хранение логов:**

- Новый JSON-файл `src/data/logs.json` — коллекция логов, аналогичная существующим (`bookings.json`, `reviews.json` и т.д.).
- Доступ строго через `src/lib/db.ts` — как и все остальные данные. Расширяем `DataCollectionMap` (строки 22–31) и `DATA_FILES` (строки 163–172).
- Конкурентность записи: при одновременных запросах возможен race condition на read-modify-write JSON-файла. Для MVP это допустимо (один пользователь, dev-режим). При переходе на PostgreSQL проблема исчезает.

**Структура записи лога:**

- Тип `LogEntry extends BaseEntity`: id, createdAt (timestamp), action (тип действия), actorId (кто выполнил), actorRole (роль актора), entityType (`'club' | 'trainer' | 'booking'`), entityId, meta (опциональный объект с деталями — название, причина, город, target и т.д.).
- Union-тип `LogAction` — все допустимые значения action. **Определяется сразу с запасом на Phase 22:** `publish_create`, `publish_update`, `publish_delete`, `booking_create`, `booking_cancel`, `admin_login`, `admin_impersonate_start`, `admin_impersonate_stop`, `moderation_hide`, `moderation_unhide`, `moderation_auto_restore`. Группировка по комментариям: `// Phase 20`, `// Phase 22 moderation`.

**Принцип записи — fire-and-forget:**

- Хелпер `logAction()` обёрнут в pattern: `logAction({...}).catch(() => {})` — void промис, ошибки проглатываются.
- Не используем `await` перед `logAction()` — вызов стоит ПЕРЕД `return NextResponse.json()`, но без блокировки.
- Ошибка записи лога НЕ должна ронять основное действие и НЕ должна менять HTTP-ответ.
- Хелпер вызывается из существующих API routes одной строкой — минимальная инвазивность.

**Чтение и отображение:**

- Новый API route `GET /api/logs` для чтения логов с фильтрацией и пагинацией.
- **Пагинация offset/limit** — это первый paginated endpoint проекта. Все существующие GET routes (`/api/clubs`, `/api/trainers`, `/api/bookings`, `/api/reviews`, `/api/sports`, `/api/schedule`) возвращают ВСЕ данные без пагинации.
- Страница в админ-панели — хронологическая лента событий.
- Автообновление: кнопка «Обновить» (всегда видна) + опциональный поллинг каждые 30 секунд с индикатором. Это первый polling-паттерн в проекте.

**Логирование admin-действий:**

- `adminLogin()`, `startImpersonation()`, `stopImpersonation()` — действия Zustand store (`src/stores/useAuthStore.ts`, строки 127–161). Серверного endpoint для этих действий нет.
- Решение: `POST /api/logs` endpoint (в том же файле, что и GET). Клиент вызывает его после успешного admin-действия.
- **actorId при impersonation:** `useAuthStore.user` указывает на target-пользователя. Для admin-логов использовать `adminOriginalUser.id` как actorId, а `user.id` — в meta как target.

---

### Что НЕ входит в Phase 20 (запланировано на будущее)

| Функционал | Когда |
|-----------|-------|
| Логирование POST /api/reviews (создание отзывов) | При расширении системы логов или в отдельной фазе |
| Логирование GET/read-запросов | Не планируется в MVP |
| Cursor-based пагинация | При переходе на PostgreSQL и больших объёмах данных |
| WebSocket / SSE real-time обновление | Когда поллинг перестанет хватать |
| Ротация / архивирование старых логов | При переходе на PostgreSQL |
| Полнотекстовый поиск по логам | Следующая итерация admin-панели |
| Экспорт логов (CSV/JSON) | Следующая итерация admin-панели |

---

### Step 20.1: Модель данных и хелпер записи логов

> **Архитектурное решение:** хелпер `logAction()` живёт в отдельном файле `src/lib/logAction.ts`, а не в `db.ts`. Причина: `db.ts` помечен `import 'server-only'` и содержит только data-access. Хелпер `logAction()` — utility, который вызывается из API routes и оборачивает `db.ts` вызовы в fire-and-forget. Разделение ответственности: `db.ts` — чтение/запись, `logAction.ts` — бизнес-логика записи лога.

- **Действие:**
  - определить в `src/types/index.ts`:
    - union-тип `LogAction` — все допустимые значения: `'publish_create' | 'publish_update' | 'publish_delete' | 'booking_create' | 'booking_cancel' | 'admin_login' | 'admin_impersonate_start' | 'admin_impersonate_stop' | 'moderation_hide' | 'moderation_unhide' | 'moderation_auto_restore'`. Группировка по комментариям: `// Phase 20 — publish, booking, admin` и `// Phase 22 — moderation (зарезервировано)`;
    - union-тип `LogEntityType = 'club' | 'trainer' | 'booking' | 'user'`;
    - интерфейс `LogEntry extends BaseEntity` с полями: `action: LogAction`, `actorId: EntityId`, `actorRole: UserRole`, `entityType: LogEntityType`, `entityId: EntityId`, `meta?: Record<string, unknown>`;
  - создать пустой JSON-файл `src/data/logs.json` (содержимое: `[]`);
  - расширить `DataCollectionMap` в `src/lib/db.ts` (строки 22–31): добавить `logs: LogEntry[]`; добавить импорт типа `LogEntry` из `@/types`;
  - добавить `logs: 'logs.json'` в `DATA_FILES` (строки 163–172);
  - добавить функции доступа в `src/lib/db.ts`:
    - `getLogs(): Promise<LogEntry[]>` — чтение коллекции;
    - `appendLog(entry: Omit<LogEntry, 'id' | 'createdAt'>): Promise<LogEntry>` — запись одной записи: читает коллекцию, добавляет с `getNextEntityId()` и `createTimestamp()`, пишет обратно;
  - создать хелпер `src/lib/logAction.ts`:
    - экспортирует `logAction(params: Omit<LogEntry, 'id' | 'createdAt'>): Promise<void>`;
    - внутри вызывает `appendLog(params)`;
    - обёрнут в `try-catch`: при ошибке — `console.error('[logAction] failed:', error)`, не пробрасывает исключение наружу;
  - обновить тестовую инфраструктуру: `createIsolatedDataDirectory()` в `src/test/helpers/data-directory.ts` копирует `src/data/` целиком — `logs.json` подхватится автоматически. В `seedTestData()` (`src/test/helpers/seed-fixtures.ts`, строка 351) добавить `write('logs.json', [])` в `Promise.all`.

- **Проверка:**
  - тип `LogEntry` и `LogAction` определены и экспортируются из `src/types/index.ts`;
  - `logAction()` записывает событие в `logs.json`;
  - ошибка записи не пробрасывается наружу (catch silent);
  - `getLogs()` возвращает записанные логи;
  - существующие тесты проходят (новая коллекция не ломает `db.ts`).

- **Тесты:**
  - тест `appendLog()` — запись лога, проверка id/createdAt/полей;
  - тест `getLogs()` — чтение записанных логов;
  - тест `logAction()` — fire-and-forget, лог появляется в коллекции;
  - тест `logAction()` — при ошибке записи (mock write failure через `__setWriteCollectionTestHookForTests`) не бросает исключение;
  - regression тесты на существующие коллекции `db.ts` (clubs, trainers, bookings).

- **Ожидаемый результат:**
  - модель лога и хелпер записи готовы, `DataCollectionMap` расширена коллекцией `logs`, тестовая инфраструктура обновлена.

### Step 20.2: Встраивание логирования в существующие API routes

> **Примечание:** DELETE handlers для клубов и тренеров СУЩЕСТВУЮТ: `src/app/api/clubs/[id]/route.ts:160` и `src/app/api/trainers/[id]/route.ts:165`. Они вызывают `deleteClubPublication(clubId)` / `deleteTrainerPublication(trainerId)` из `db.ts` — функции каскадно удаляют сущность, offerings, schedule, bookings и reviews, возвращая `void`. Для `publish_delete` лога нужно ПЕРЕД вызовом delete прочитать данные сущности (`getClubById()` / `getTrainerById()`), чтобы захватить name и другую meta-информацию для лога.

- **Действие:**
  - добавить `import { logAction } from '@/lib/logAction'` в каждый затрагиваемый API route;
  - вызов `logAction({...}).catch(() => {})` без `await`, перед `return NextResponse.json()` — для create/update; после fetch-before-delete — для delete;
  - конкретные точки встраивания:

  **Публикации — create:**
  - `src/app/api/clubs/route.ts`, POST handler (строка ~135): после `const result = await createClubPublication(entities)` → `logAction({ action: 'publish_create', actorId: userId, actorRole: 'club_owner', entityType: 'club', entityId: result.club.id, meta: { name: result.club.name, city: result.club.city } }).catch(() => {})`;
  - `src/app/api/trainers/route.ts`, POST handler (строка ~132): аналогично с `result.trainer.id`, `result.trainer.name`;

  **Публикации — update:**
  - `src/app/api/clubs/[id]/route.ts`, PATCH handler (строка ~141): после `const result = await updateClubPublication(...)` → `logAction({ action: 'publish_update', actorId: userId, actorRole: 'club_owner', entityType: 'club', entityId: clubId, meta: { name: result.club.name } }).catch(() => {})`;
  - `src/app/api/trainers/[id]/route.ts`, PATCH handler (строка ~146): аналогично;

  **Публикации — delete:**
  - `src/app/api/clubs/[id]/route.ts`, DELETE handler (строка ~160): ПЕРЕД `await deleteClubPublication(clubId)` добавить `const club = await getClubById(clubId)`, ПОСЛЕ delete → `logAction({ action: 'publish_delete', actorId: club?.managedByUserId ?? 0, actorRole: 'club_owner', entityType: 'club', entityId: clubId, meta: { name: club?.name ?? 'unknown' } }).catch(() => {})`;
  - `src/app/api/trainers/[id]/route.ts`, DELETE handler (строка ~165): аналогично с `getTrainerById(trainerId)`;

  **Букинги — create:**
  - `src/app/api/bookings/route.ts`, POST handler (строка ~110): после `const booking = await createBookingAtomic(...)` → `logAction({ action: 'booking_create', actorId: booking.userId, actorRole: 'athlete', entityType: 'booking', entityId: booking.id, meta: { scheduleId: booking.scheduleId, sportId: booking.sportId, date: booking.date } }).catch(() => {})`;

  **Букинги — cancel:**
  - `src/app/api/bookings/[id]/route.ts`, DELETE handler (строка ~39): перед `cancelBooking()` данные bookingId и userId уже доступны из params/body → `logAction({ action: 'booking_cancel', actorId: userId, actorRole: 'athlete', entityType: 'booking', entityId: bookingId }).catch(() => {})` — вызвать ПОСЛЕ успешного `cancelBooking()`;

  - логирование вызывается после успешного выполнения основного действия (кроме delete, где fetch-before-delete).

- **Проверка:**
  - при выполнении каждого из перечисленных действий в `logs.json` появляется соответствующая запись;
  - существующее поведение API не изменилось (ответы, статусы, данные);
  - ошибка logAction не влияет на HTTP-ответ.

- **Тесты:**
  - тест: POST /api/clubs → в `logs.json` появляется запись `publish_create` с `entityType: 'club'`;
  - тест: PATCH /api/clubs/[id] → запись `publish_update`;
  - тест: DELETE /api/clubs/[id] → запись `publish_delete` с meta содержащей name;
  - тест: POST /api/trainers → запись `publish_create` с `entityType: 'trainer'`;
  - тест: PATCH /api/trainers/[id] → запись `publish_update`;
  - тест: DELETE /api/trainers/[id] → запись `publish_delete`;
  - тест: POST /api/bookings → запись `booking_create`;
  - тест: DELETE /api/bookings/[id] → запись `booking_cancel`;
  - regression тесты: все существующие API route тесты проходят без изменений (response shape, status codes, side effects).

- **Ожидаемый результат:**
  - все существующие mutation API routes пишут логи при успешном выполнении; поведение API не изменилось.

### Step 20.3: API route для чтения логов

> **Примечание:** это первый paginated endpoint проекта. Все существующие GET routes возвращают ВСЕ данные. Здесь вводим паттерн offset/limit с total count — он может быть переиспользован в будущих API.

- **Действие:**
  - создать файл `src/app/api/logs/route.ts` — GET handler;
  - Zod-схема для query-параметров:
    - `action` (опциональная строка из `LogAction` union);
    - `actorId` (опциональное число);
    - `from` (опциональная ISO date string — начало периода);
    - `to` (опциональная ISO date string — конец периода);
    - `offset` (число, default 0);
    - `limit` (число, default 50, max 100);
  - читать логи через `getLogs()`, фильтровать в памяти:
    - `action` — exact match;
    - `actorId` — exact match;
    - `from` / `to` — сравнение `createdAt` с ISO-строками;
  - сортировка: по `createdAt` desc (новые первые);
  - пагинация: `total` = длина отфильтрованного массива, `data` = `slice(offset, offset + limit)`;
  - формат ответа: `{ success: true, data: LogEntry[], total: number, offset: number, limit: number }`;
  - при ошибке: стандартный `{ success: false, error: "..." }` с 400/500.

- **Проверка:**
  - endpoint возвращает логи в правильном формате;
  - фильтры работают по отдельности и в комбинации;
  - пагинация возвращает правильные срезы и корректный `total`;
  - пустая коллекция → `{ data: [], total: 0 }`.

- **Тесты:**
  - тест: GET /api/logs без параметров → все логи, sorted desc;
  - тест: фильтрация по `action=publish_create` → только create-логи;
  - тест: фильтрация по `actorId` → логи конкретного актора;
  - тест: фильтрация по `from`/`to` → логи в диапазоне;
  - тест: комбинированные фильтры (`action` + `from`);
  - тест: пагинация — `offset=0&limit=2` → первые 2, `offset=2&limit=2` → следующие 2;
  - тест: `offset` > total → пустой `data`, корректный `total`;
  - тест: пустая коллекция логов → `{ data: [], total: 0, offset: 0, limit: 50 }`.

- **Ожидаемый результат:**
  - API route чтения логов работает с фильтрами и пагинацией, это первый paginated endpoint проекта.

### Step 20.4: Страница логов в админ-панели

> **Архитектурное решение:** страница логов — `'use client'` компонент с собственным data-fetching (`fetch` к `/api/logs`). Server-side data loading не нужен — логи фетчатся динамически при смене фильтров и при поллинге. Это отличается от DashboardPage, которая получает данные через server component props.

- **Действие:**
  - создать страницу `src/app/service-portal/(admin)/logs/page.tsx` — server component-обёртка с metadata `{ title: 'SportHub — Логи' }`, рендерит `<LogsPage />`;
  - создать клиентский компонент `src/components/admin/LogsPage.tsx` (`'use client'`):
    - состояние фильтров через `useState`: `actionFilter` (select: все / конкретный LogAction), `periodFilter` (пресеты: сегодня / неделя / всё), `actorFilter` (текстовое поле actorId);
    - `useEffect` + `fetch('/api/logs?...')` при смене фильтров или пагинации;
    - лента событий: карточки с информацией — время (formatted), актор (id + role badge), действие (human-readable label), затронутая сущность (тип + id + name из meta);
    - пагинация: кнопки «Назад» / «Далее» с отображением `offset+1–offset+count из total`;
    - автообновление: кнопка «Обновить» (всегда видна, принудительный refetch) + автопoллинг каждые 30 секунд через `useEffect` + `setInterval` + cleanup в return. Индикатор «Автообновление вкл/выкл» (toggle);
    - пустое состояние: «Нет событий по выбранным фильтрам» если `data.length === 0`;
    - skeleton при загрузке (initial и при смене фильтров);
  - добавить пункт «Логи» в навигацию: в `src/components/admin/AdminNavigation.tsx` (строка 13) добавить `{ href: '/service-portal/logs', label: 'Логи' }` в массив `adminNavItems` — позиция: после «Модерация», перед «Финансы» (порядок: Пользователи, Аналитика, Модерация, Логи, Финансы);
  - маппинг `LogAction` → human-readable labels на русском (например, `publish_create` → «Публикация создана», `booking_cancel` → «Запись отменена»).

- **Проверка:**
  - страница отображает логи из API;
  - фильтры перезапрашивают данные и обновляют ленту;
  - пагинация работает (переходы вперёд/назад);
  - кнопка «Обновить» вызывает refetch;
  - автопoллинг работает и выключается;
  - пустое состояние корректно;
  - skeleton при загрузке;
  - пункт «Логи» виден в навигации и подсвечивается при активном route.

- **Тесты:**
  - render тест `LogsPage` — рендерится без ошибок (mock fetch);
  - тест: пустое состояние при `data: []`;
  - тест: skeleton при loading state;
  - тест: пункт «Логи» присутствует в `AdminNavigation`.

- **Ожидаемый результат:**
  - страница логов отображает хронологическую ленту с фильтрами, пагинацией и автообновлением.

### Step 20.5: Логирование админ-действий

> **Архитектурное решение:** admin-действия (`adminLogin`, `startImpersonation`, `stopImpersonation`) происходят в Zustand store на клиенте (`src/stores/useAuthStore.ts`, строки 127–161). Серверной точки входа для этих действий нет. Решение: использовать `POST /api/logs` endpoint (файл `src/app/api/logs/route.ts`, созданный в Step 20.3) — клиент вызывает его после успешного admin-действия. POST handler принимает payload лога и записывает через `appendLog()`.

- **Действие:**
  - добавить POST handler в `src/app/api/logs/route.ts`:
    - Zod-схема: `{ action: LogAction, actorId: EntityId, actorRole: UserRole, entityType: LogEntityType, entityId: EntityId, meta?: Record<string, unknown> }`;
    - минимальная валидация: `action` из допустимого списка, все обязательные поля;
    - вызов `appendLog(validatedData)`;
    - ответ: `{ success: true, data: logEntry }` со статусом 201;
  - добавить вызовы из клиентского кода:
    - **admin_login:** в `ServicePortalLoginForm` (`src/components/admin/ServicePortalLoginForm.tsx`) — после успешного `adminLogin(sessionUser)`: `fetch('/api/logs', { method: 'POST', body: JSON.stringify({ action: 'admin_login', actorId: sessionUser.id, actorRole: 'admin', entityType: 'user', entityId: sessionUser.id }) }).catch(() => {})`;
    - **admin_impersonate_start:** в `DashboardPage` (`src/components/admin/DashboardPage.tsx`, функция `handleImpersonate` строка ~115) — после `startImpersonation(targetSessionUser, targetAccountType)`: `fetch('/api/logs', { method: 'POST', body: JSON.stringify({ action: 'admin_impersonate_start', actorId: user.id, actorRole: 'admin', entityType: 'user', entityId: targetUser.id, meta: { targetUserName: targetUser.name, targetAccountType } }) }).catch(() => {})`. **Важно:** `actorId` = текущий admin user (ДО impersonation), `entityId` = target user;
    - **admin_impersonate_stop:** в `ImpersonationBanner` (`src/components/admin/ImpersonationBanner.tsx`) — перед `stopImpersonation()`: `fetch('/api/logs', { method: 'POST', body: JSON.stringify({ action: 'admin_impersonate_stop', actorId: adminOriginalUser.id, actorRole: 'admin', entityType: 'user', entityId: user.id }) }).catch(() => {})`. **Важно:** `actorId` = `adminOriginalUser.id` (настоящий админ), `entityId` = `user.id` (target, от имени которого работали);
  - все клиентские вызовы — fire-and-forget (`.catch(() => {})`): ошибка логирования не влияет на UI.

- **Проверка:**
  - при логине админа в `logs.json` появляется запись `admin_login`;
  - при start impersonation — `admin_impersonate_start` с meta содержащей `targetUserName`;
  - при stop impersonation — `admin_impersonate_stop`;
  - `actorId` всегда указывает на реального админа, не на target-пользователя;
  - ошибка POST /api/logs не ломает admin UI.

- **Тесты:**
  - тест POST /api/logs: валидный payload → запись создаётся, статус 201;
  - тест POST /api/logs: невалидный payload (пропущены обязательные поля) → 400;
  - тест POST /api/logs: невалидный `action` → 400;
  - тест: после admin_impersonate_start лог содержит `actorId` = admin.id, `entityId` = target.id.

- **Ожидаемый результат:**
  - admin-специфичные события логируются через dedicated POST endpoint, actorId корректен при impersonation.

### Step 20.6: Финальная верификация и синхронизация документации

- **Действие:**
  - прогнать:
    - `npm run format`
    - `npm run lint`
    - `npm run test`
    - `npm run build`
  - ручной сценарий:
    - опубликовать клуб через ЛК провайдера → открыть `/service-portal/logs` → проверить что лог `publish_create` записался и виден на странице, meta содержит name и city;
    - отредактировать клуб → проверить лог `publish_update`;
    - удалить клуб → проверить лог `publish_delete` с name в meta (fetch-before-delete);
    - опубликовать и удалить тренера → аналогичные проверки;
    - создать букинг → проверить лог `booking_create`;
    - отменить букинг → проверить лог `booking_cancel`;
    - войти как админ → проверить лог `admin_login`;
    - начать impersonation → проверить лог `admin_impersonate_start`, meta содержит targetUserName;
    - остановить impersonation → проверить лог `admin_impersonate_stop`;
    - на странице логов: проверить фильтр по action type → лента фильтруется;
    - проверить фильтр по периоду → корректный диапазон;
    - проверить пагинацию → переходы вперёд/назад;
    - проверить кнопку «Обновить» → refetch;
    - проверить пустое состояние (сбросить фильтры до невозможного);
    - убедиться что ошибка логирования не ломает: publish, booking, admin flows;
  - синхронизировать документацию:
    - `CLAUDE.md` — обновить «Текущее состояние»;
    - `PHASES_OVERVIEW.md` — статус Phase 20;
    - `phase-20.md` — чек-лист;
    - `PROJECT_STATE.md` — новые файлы, API routes, типы;
    - `README.md` — прогресс;
    - `STACK_OVERVIEW.md` — если затронуты архитектурные решения;
    - `feature-docs/admin.md` — добавить секцию «Логи», убрать «Нет логирования действий» из ограничений.

- **Проверка:**
  - все события логируются, лента отображает корректно, фильтры работают, существующий функционал не сломан.

- **Ожидаемый результат:**
  - фаза полностью зелёная, логирование не ломает существующие flows, документация синхронизирована.

---

### Чек-лист Phase 20

**Модель и инфраструктура (Step 20.1):**
- [x] `LogEntry` и `LogAction` определены и экспортируются из `src/types/index.ts`
- [x] `LogAction` включает зарезервированные значения для Phase 22 (`moderation_*`)
- [x] `logs.json` создан в `src/data/`
- [x] `DataCollectionMap` расширена, `getLogs()` и `appendLog()` добавлены в `db.ts`
- [x] `logAction()` хелпер работает (fire-and-forget, catch errors) в `src/lib/logAction.ts`
- [x] `seedTestData()` обновлена — пишет `logs.json`

**Интеграция в API routes (Step 20.2):**
- [x] POST /api/clubs → лог `publish_create`
- [x] PATCH /api/clubs/[id] → лог `publish_update`
- [x] DELETE /api/clubs/[id] → лог `publish_delete` (fetch-before-delete для meta)
- [x] POST /api/trainers → лог `publish_create`
- [x] PATCH /api/trainers/[id] → лог `publish_update`
- [x] DELETE /api/trainers/[id] → лог `publish_delete` (fetch-before-delete для meta)
- [x] POST /api/bookings → лог `booking_create`
- [x] DELETE /api/bookings/[id] → лог `booking_cancel`
- [x] Существующее поведение API не изменилось (ответы, статусы)

**API чтения логов (Step 20.3):**
- [x] GET /api/logs работает с фильтрами (action, actorId, from, to)
- [x] Пагинация offset/limit реализована с total count
- [x] Сортировка по createdAt desc
- [x] Пустая коллекция → `{ data: [], total: 0 }`

**UI админ-панели (Step 20.4):**
- [x] Страница `/service-portal/logs` отображает ленту событий
- [x] Пункт «Логи» добавлен в `AdminNavigation` (после Модерация, перед Финансы)
- [x] Фильтры на странице работают (тип действия, период, актор)
- [x] Пагинация на странице работает
- [x] Кнопка «Обновить» и автопoллинг работают
- [x] Skeleton при загрузке, пустое состояние

**Админ-действия (Step 20.5):**
- [x] POST /api/logs endpoint принимает и записывает логи
- [x] admin_login логируется при входе в `/service-portal`
- [x] admin_impersonate_start логируется с meta `{ targetUserName, targetAccountType }`
- [x] admin_impersonate_stop логируется
- [x] actorId при impersonation = `adminOriginalUser.id`, не `user.id`
- [x] Ошибка POST /api/logs не ломает admin UI

**Финализация (Step 20.6):**
- [x] format / lint / test / build проходят
- [x] Ручной сценарий полностью пройден
- [x] Ошибка логирования не ломает publish / booking / admin flows
- [x] Документация синхронизирована

**Выполнено:** Steps 20.1–20.6

**Следующий шаг:** —

**Статус Phase 20:** ✅ ЗАВЕРШЕНА

### Принцип масштабирования

- JSON-файл логов → таблица `activity_logs` в PostgreSQL (структура 1:1)
- `appendLog()` в `db.ts` → сервис логирования в NestJS
- `logAction()` хелпер → декоратор или middleware в NestJS
- `POST /api/logs` для клиентских событий → WebSocket / queue при необходимости
- Поллинг → WebSocket / SSE при необходимости
- Пагинация offset/limit → cursor-based при больших объёмах

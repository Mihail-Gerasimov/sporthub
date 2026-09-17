# Phase 22

> Этот файл содержит одну фазу проекта целиком. Главный вход в контекст — `CLAUDE.md`.
> Навигация по фазам — через `PHASES_OVERVIEW.md`.
> В ежедневной работе открывай прежде всего активную фазу и не перечитывай все phase-файлы подряд без необходимости.
> Структура фазы сохраняется в исходном стиле: заголовок фазы, краткий результат, шаги по порядку, затем чеклист и статус.
> Перед стартом новой фазы проверь, что для неё уже есть отдельный `phase-XX.md`, и после завершения шагов или фазы синхронизируй статус здесь, в `PHASES_OVERVIEW.md`, `CLAUDE.md`, `README.md` и при необходимости в `STACK_OVERVIEW.md`.

## Phase 22: Модерация публикаций

> После этой фазы: админ может просматривать все публикации платформы на странице модерации, скрывать нежелательные с указанием причины и возвращать обратно. Скрытые публикации не отображаются в каталогах, на карте и в поиске. В ЛК провайдера скрытая публикация показывается с badge «Скрыто администратором» и причиной. Провайдер может отредактировать скрытую публикацию — после редактирования статус автоматически возвращается в `published`. Все действия модерации записываются в логи (Phase 20).

Phase 22 — фаза, которая затрагивает существующий код: новый статус публикации, фильтрация в каталогах и на карте, обновление ЛК провайдера, защита booking-flow. Поэтому идёт последней в блоке Phase 20–22.

**Пререквизит:** Phase 20 (логи) завершена.

---

### Ключевые решения

**Модель модерации — постфактум, без очереди:**

- Провайдер публикует как раньше — мгновенно, статус сразу `published`. Никаких изменений в publish-flow.
- Админ может постфактум скрыть публикацию с указанием причины.
- Это НЕ pre-publish модерация (без статуса `pending`, без очереди на проверку). Pre-publish модерация — следующая итерация.

**Новый статус `hidden`:**

- `EntityStatus` в `src/types/index.ts:29` расширяется: `'published' | 'draft' | 'hidden'`.
- В интерфейсах `Club` (строки 58–84) и `Trainer` (строки 86–111) добавляются опциональные поля модерации: `hideReason?: string`, `hiddenByUserId?: EntityId`, `hiddenAt?: ISODateTimeString`.
- Скрытая публикация остаётся в данных, но не отображается в публичных каталогах, на карте и в поиске.

**Критически важный паттерн фильтрации:**

- Поле `status` в Club и Trainer **опциональное** (`status?: EntityStatus`). Seed-данные и старые публикации могут иметь `status: undefined`.
- Фильтрация скрытых: `entity.status !== 'hidden'`, **НЕ** `entity.status === 'published'`. Иначе все сущности без status (undefined) пропадут из каталогов.
- Этот паттерн применяется ВЕЗДЕ: API routes, клиентская фильтрация, маркеры карты, booking protection.

**Восстановление после редактирования (auto-restore):**

- Провайдер может отредактировать скрытую публикацию через существующий edit-flow.
- После успешного редактирования статус автоматически возвращается в `published` (без повторной проверки в MVP).
- Auto-restore реализуется в core db.ts функциях `updateClubPublication()` (строка 805) и `updateTrainerPublication()` (строка 924): если entity до обновления имеет `status === 'hidden'`, принудительно установить `status: 'published'` и очистить `hideReason`, `hiddenByUserId`, `hiddenAt`.
- Админ может снова скрыть если нужно.

**Влияние на существующий код:**

- Каталоги — серверная фильтрация `status !== 'hidden'` в API routes `GET /api/clubs` и `GET /api/trainers`.
- Карта — маркеры скрытых не показываются. Серверная фильтрация (API) гарантирует что скрытые не попадут в props. Клиентский `useMapMarkers` получает доп. defense-in-depth check.
- Detail-страницы (`/clubs/[slug]`, `/trainers/[slug]`) — если публикация скрыта, показать состояние «Эта публикация скрыта администратором» (НЕ 404).
- Booking — на скрытую публикацию нельзя записаться. Проверка через цепочку: schedule → offering → ownerType/ownerId → entity status.
- ЛК провайдера — badge и причина скрытия для hidden-публикаций.

**Логирование:**

- Все действия модерации (`moderation_hide`, `moderation_unhide`, `moderation_auto_restore`) пишутся в логи через `logAction()` из Phase 20. Эти action types уже зарезервированы в `LogAction` union.

---

### Что НЕ входит в Phase 22 (запланировано на будущее)

| Функционал | Когда |
|-----------|-------|
| Pre-publish модерация (статус `pending`, очередь проверки) | Следующая итерация модерации |
| Автоматическая модерация (AI/ML фильтры) | Когда будет серверная инфраструктура |
| Массовые действия (скрыть/показать несколько публикаций) | Следующая итерация admin-панели |
| Модерация отзывов | Отдельная фаза |
| Модерация пользователей (бан/блокировка через UserStatus) | Отдельная фаза (UserStatus уже имеет `banned` / `suspended`) |
| Уведомление провайдера о скрытии (email/push) | Когда будет система уведомлений |
| Апелляция скрытия со стороны провайдера | Следующая итерация |
| История модерации конкретной публикации (timeline) | Данные есть в логах Phase 20, UI — следующая итерация |

---

### Step 22.1: Расширение модели данных

> **Архитектурное решение:** поле `status` в `Club` и `Trainer` опциональное (`status?: EntityStatus`). Значение `undefined` уже существует в seed-данных и трактуется как `published`. Добавление `'hidden'` в union не ломает существующие данные. НО: любая фильтрация должна использовать `status !== 'hidden'`, а НЕ `status === 'published'` — иначе сущности без status пропадут.

- **Действие:**
  - в `src/types/index.ts`:
    - расширить `EntityStatus` (строка 29): `'published' | 'draft' | 'hidden'`;
    - добавить опциональные поля модерации в интерфейс `Club` (после строки 83): `hideReason?: string`, `hiddenByUserId?: EntityId`, `hiddenAt?: ISODateTimeString`;
    - добавить аналогичные поля в интерфейс `Trainer` (после строки 110): `hideReason?: string`, `hiddenByUserId?: EntityId`, `hiddenAt?: ISODateTimeString`;
  - убедиться что `src/lib/db.ts` — все существующие операции с Club и Trainer (read, create, update, delete) работают без изменений. Новые поля опциональны — старые данные валидны;
  - обновить нормализаторы если есть (проверить `normalizeTrainer()` в `db.ts:342` — не должна ломаться от новых полей);
  - убедиться что Zod-схемы публикации (`src/lib/schemas/publish.ts`) не ломаются — они не валидируют `status` / `hideReason` / `hiddenByUserId` / `hiddenAt` (эти поля устанавливаются серверно, не через publish-форму);
  - `LogAction` union уже содержит `moderation_hide`, `moderation_unhide`, `moderation_auto_restore` (зарезервированы в Phase 20).

- **Проверка:**
  - `EntityStatus` содержит `'hidden'`;
  - типы `Club` и `Trainer` имеют опциональные поля модерации;
  - существующие операции с Club и Trainer работают без изменений;
  - новые поля опциональны — старые данные (без `hideReason`, `hiddenByUserId`, `hiddenAt`) валидны;
  - `normalizeTrainer()` не ломается.

- **Тесты:**
  - тест: существующие CRUD-операции работают с обновлёнными типами (regression `db.ts`);
  - тест: чтение существующих fixture-данных (без новых полей) — без ошибок;
  - тест: запись сущности с новыми полями (`hideReason`, `hiddenByUserId`, `hiddenAt`) — корректно сохраняется и читается.

- **Ожидаемый результат:**
  - тип `EntityStatus` расширен, новые поля опциональны, существующий код и данные не ломаются.

### Step 22.2: API route модерации — hide/unhide

> **Примечание:** Phase 20 определяет `LogAction` union с зарезервированными значениями `moderation_hide`, `moderation_unhide`, `moderation_auto_restore`. Phase 22 использует эти значения для записи логов модерации через `logAction()` из `src/lib/logAction.ts`.

- **Действие:**
  - создать файл `src/app/api/moderation/route.ts` — POST handler;
  - Zod-схема входного payload:
    - `action: 'hide' | 'unhide'` (дискриминатор действия);
    - `entityType: 'club' | 'trainer'`;
    - `entityId: number`;
    - `moderatorId: number`;
    - `reason: string` (обязательна при `action: 'hide'`, опциональна при `unhide`);
  - валидация модератора: `const moderator = await getUserById(moderatorId)` → проверка `moderator.role === 'admin'`. Если не admin — 403;
  - добавить в `src/lib/db.ts` функции:
    - `hideEntity(entityType: CatalogOwnerType, entityId: EntityId, reason: string, moderatorId: EntityId): Promise<Club | Trainer>`:
      - читает сущность (`getClubById` / `getTrainerById`);
      - если не найдена — throw `'Сущность не найдена'`;
      - устанавливает: `status: 'hidden'`, `hideReason: reason`, `hiddenByUserId: moderatorId`, `hiddenAt: createTimestamp()`;
      - записывает обратно через `writeCollection`;
      - возвращает обновлённую сущность;
    - `unhideEntity(entityType: CatalogOwnerType, entityId: EntityId): Promise<Club | Trainer>`:
      - читает сущность;
      - если не найдена — throw;
      - устанавливает: `status: 'published'`, очищает `hideReason`, `hiddenByUserId`, `hiddenAt` (установить `undefined`);
      - записывает, возвращает;
  - после успешного hide/unhide — `logAction()`:
    - hide: `{ action: 'moderation_hide', actorId: moderatorId, actorRole: 'admin', entityType, entityId, meta: { name: entity.name, reason } }`;
    - unhide: `{ action: 'moderation_unhide', actorId: moderatorId, actorRole: 'admin', entityType, entityId, meta: { name: entity.name } }`;
  - ответ: `{ success: true, data: entity }` при успехе; `{ success: false, error: "..." }` при ошибке с соответствующим HTTP-статусом.

- **Проверка:**
  - hide переводит публикацию в `status: 'hidden'` с причиной, moderatorId и датой;
  - unhide возвращает в `status: 'published'`, очищает поля скрытия;
  - логи записываются (`moderation_hide`, `moderation_unhide`);
  - невалидный `moderatorId` (не admin) → 403;
  - несуществующая сущность → 404.

- **Тесты:**
  - тест: hide клуба — `status === 'hidden'`, `hideReason` установлен, `hiddenByUserId` = moderatorId;
  - тест: unhide клуба — `status === 'published'`, `hideReason` очищен;
  - тест: hide тренера — аналогично;
  - тест: hide с невалидным `moderatorId` (не admin) → 403;
  - тест: hide несуществующей сущности → 404;
  - тест: hide без `reason` → 400;
  - тест: unhide уже published сущности → идемпотентно, без ошибки;
  - тест: лог `moderation_hide` записан с meta `{ name, reason }`;
  - тест: лог `moderation_unhide` записан.

- **Ожидаемый результат:**
  - API модерации работает: hide устанавливает `status='hidden'` с причиной, unhide возвращает в `'published'`, логи пишутся.

### Step 22.3: API route для списка публикаций (админ)

> **Архитектурное решение:** объединённый список клубов и тренеров — новый паттерн. Существующие API routes разделяют сущности (`GET /api/clubs`, `GET /api/trainers`). Для страницы модерации нужен один endpoint, возвращающий оба типа в едином формате с общей пагинацией и фильтрами.

- **Действие:**
  - создать файл `src/app/api/publications/route.ts` — GET handler;
  - Zod-схема для query-параметров:
    - `status`: `'all' | 'published' | 'hidden'` (default `'all'`);
    - `type`: `'all' | 'club' | 'trainer'` (default `'all'`);
    - `city`: опциональная строка;
    - `sportId`: опциональное число;
    - `search`: опциональная строка (поиск по названию, case-insensitive substring);
    - `offset`: число (default 0);
    - `limit`: число (default 50, max 100);
  - логика:
    - загрузить `getClubs()` и `getTrainers()`;
    - нормализовать в единый формат:
      ```
      PublicationItem {
        id: number;
        name: string;
        type: 'club' | 'trainer';
        city: string;
        sportIds: number[];
        status: EntityStatus | undefined;
        createdAt: string;
        managedByUserId: number;
        hideReason?: string;
        hiddenAt?: string;
      }
      ```
    - объединить оба массива, применить фильтры (status, type, city, sportId, search);
    - сортировка: по `createdAt` desc;
    - пагинация: `total` / `offset` / `limit` (паттерн из Phase 20 `GET /api/logs`);
  - формат ответа: `{ success: true, data: PublicationItem[], total: number, offset: number, limit: number }`.

- **Проверка:**
  - endpoint возвращает объединённый список клубов и тренеров;
  - фильтры работают в комбинации;
  - поиск по названию работает (case-insensitive);
  - пагинация корректна.

- **Тесты:**
  - тест: GET без фильтров → все публикации (клубы + тренеры);
  - тест: фильтр `status=hidden` → только скрытые;
  - тест: фильтр `status=published` → только published и undefined;
  - тест: фильтр `type=club` → только клубы;
  - тест: фильтр `city=Самара`;
  - тест: поиск по названию — partial match, case-insensitive;
  - тест: комбинированные фильтры;
  - тест: пагинация — `offset=0&limit=2` → первые 2, total корректный.

- **Ожидаемый результат:**
  - объединённый список клубов и тренеров доступен через API с фильтрами, поиском и пагинацией.

### Step 22.4: Страница модерации в админ-панели

- **Действие:**
  - заменить placeholder `src/app/service-portal/(admin)/moderation/page.tsx` на server component с metadata `{ title: 'SportHub — Модерация' }`, рендерит `<ModerationPage />`;
  - создать клиентский компонент `src/components/admin/ModerationPage.tsx` (`'use client'`):
    - data-fetching через `fetch('/api/publications?...')` с фильтрами;
    - список публикаций: карточки с информацией — название, тип (badge «Клуб» / «Тренер»), город, виды спорта, провайдер (managedByUserId), дата создания, текущий статус (badge «Опубликовано» / «Скрыто» с цветом);
    - действия в карточке:
      - для published: кнопка «Скрыть» → открывает модалку;
      - для hidden: кнопка «Показать» → вызов unhide без модалки (confirm dialog);
    - фильтры: статус (all/published/hidden), тип (all/club/trainer), город (select из `AVAILABLE_CITIES`), вид спорта (select);
    - поиск по названию (текстовое поле с debounce);
    - пагинация;
    - пустое состояние;
    - skeleton при загрузке;
  - создать компонент модалки `src/components/admin/HideReasonModal.tsx` (`'use client'`):
    - использует `Modal` из `src/components/ui/`;
    - поле причины (textarea, обязательное);
    - кнопки «Скрыть» / «Отмена»;
    - при подтверждении — `fetch('/api/moderation', { method: 'POST', body: { action: 'hide', ... } })`;
    - после успеха — refetch списка;
  - навигация: пункт «Модерация» уже существует в `AdminNavigation.tsx` (строка 16: `{ href: '/service-portal/moderation', label: 'Модерация' }`) — ничего добавлять не нужно.

- **Проверка:**
  - страница отображает публикации из API;
  - hide с причиной работает через модалку;
  - unhide работает через confirm;
  - фильтры, поиск, пагинация работают;
  - пустое состояние и skeleton корректны.

- **Тесты:**
  - render тест `ModerationPage` — рендерится без ошибок (mock fetch);
  - render тест `HideReasonModal` — поле причины и кнопки;
  - тест: пустое состояние при `data: []`;
  - тест: карточка published-сущности имеет кнопку «Скрыть»;
  - тест: карточка hidden-сущности имеет кнопку «Показать».

- **Ожидаемый результат:**
  - placeholder-страница модерации заменена полноценной, hide/unhide работает через модалку/confirm.

### Step 22.5: Фильтрация скрытых публикаций в каталогах и на карте

> **Примечание:** текущий booking-flow (`scheduleId → getScheduleById() → createBookingAtomic()` в `src/lib/db.ts:559`) не проверяет статус parent-сущности. Для блокировки booking на скрытую публикацию нужно пройти цепочку: schedule → offering (через `schedule.offeringId`) → `ownerType`/`ownerId` → найти Club или Trainer → проверить `status !== 'hidden'`. Проверку добавить в `POST /api/bookings` handler (`src/app/api/bookings/route.ts:68`) ПЕРЕД вызовом `createBookingAtomic()`.

- **Действие:**
  - **Каталоги (серверная фильтрация):**
    - `src/app/api/clubs/route.ts`, GET handler: после загрузки `getClubs()` добавить фильтр `clubs.filter(c => c.status !== 'hidden')` ПЕРЕД применением других фильтров (search, sportId, minRating);
    - `src/app/api/trainers/route.ts`, GET handler: аналогично `trainers.filter(t => t.status !== 'hidden')`;
    - **ВАЖНО:** `status !== 'hidden'`, а НЕ `status === 'published'`. Значение `undefined` допустимо (= published);

  - **Карта (defense-in-depth):**
    - Серверная фильтрация в API гарантирует что скрытые не попадут в props. Дополнительно в `src/components/map/useMapMarkers.ts` добавить client-side check: при фильтрации клубов (строка ~48) и тренеров (строка ~67) добавить `&& entity.status !== 'hidden'`;

  - **Detail-страницы:**
    - `src/app/clubs/[slug]/page.tsx`: после `const club = await getClubBySlug(slug)` — если `club && club.status === 'hidden'`, рендерить специальный компонент «Эта публикация скрыта администратором» вместо `ClubDetailPageClient`. НЕ вызывать `notFound()`;
    - `src/app/trainers/[slug]/page.tsx`: аналогично с `trainer.status === 'hidden'` — рендерить «скрыта» вместо `TrainerDetailPageClient`;
    - компонент «публикация скрыта»: простая карточка с иконкой, текстом и ссылкой «Вернуться в каталог»;

  - **Booking protection:**
    - в `src/app/api/bookings/route.ts`, POST handler (строка ~68): ПЕРЕД вызовом `createBookingAtomic()`:
      - получить schedule: `const schedule = await getScheduleById(scheduleId)` (если нет — 404 уже обработан внутри `createBookingAtomic`, но проверяем раньше для статуса);
      - по `schedule.ownerType` и `schedule.ownerId` получить parent: `const entity = schedule.ownerType === 'club' ? await getClubById(schedule.ownerId!) : await getTrainerById(schedule.ownerId!)`;
      - если `entity?.status === 'hidden'` — вернуть 403: `{ success: false, error: 'Публикация скрыта, запись невозможна' }`;
    - альтернатива: добавить проверку внутри `createBookingAtomic()` в `db.ts:559`. Выбор зависит от предпочтения — бизнес-логика в route vs в db. Рекомендация: в route, по аналогии с existing athlete role guard на строке 86.

- **Проверка:**
  - скрытые публикации не отображаются в каталогах (GET /api/clubs, GET /api/trainers);
  - маркеры скрытых не показываются на карте;
  - detail-страница скрытой публикации показывает «скрыта», не 404;
  - booking на скрытую публикацию → 403;
  - published публикации (включая `status: undefined`) работают как раньше;
  - существующие фильтры (search, sportId, minRating, city) работают как раньше.

- **Тесты:**
  - тест: GET /api/clubs — hidden клуб не в ответе, published — есть, `status: undefined` — есть;
  - тест: GET /api/trainers — аналогично;
  - тест: `useMapMarkers` — hidden entity исключена из маркеров;
  - тест: detail-страница скрытого клуба → рендерит «публикация скрыта»;
  - тест: detail-страница published клуба → рендерит как раньше;
  - тест: POST /api/bookings на schedule с hidden parent → 403;
  - тест: POST /api/bookings на schedule с published parent → 201 (regression);
  - regression тесты: каталоги, карта, booking — всё работает как раньше для published сущностей.

- **Ожидаемый результат:**
  - скрытые публикации не видны в каталогах, на карте, detail-страница показывает «скрыта», booking невозможен.

### Step 22.6: Статус и причина скрытия в ЛК провайдера + auto-restore

- **Действие:**
  - **Badge в ЛК провайдера:**
    - в блоке «Мои публикации» ЛК провайдера (`src/components/profile/` — секция Publications): если публикация имеет `status === 'hidden'` — показать badge «Скрыто администратором» (красный/warning) и причину `hideReason` мелким текстом под badge;
    - кнопка «Редактировать» остаётся доступной для скрытых публикаций (провайдер может исправить проблему);

  - **Auto-restore при редактировании:**
    - в `src/lib/db.ts`, функция `updateClubPublication()` (строка 805): ПЕРЕД записью обновлённого клуба — проверить текущий `status`. Если `status === 'hidden'`:
      - установить `status: 'published'`;
      - очистить `hideReason: undefined`, `hiddenByUserId: undefined`, `hiddenAt: undefined`;
      - после successful write: `logAction({ action: 'moderation_auto_restore', actorId: userId, actorRole: 'club_owner', entityType: 'club', entityId: clubId, meta: { name: updatedClub.name, previousReason: originalHideReason } }).catch(() => {})`;
    - в `src/lib/db.ts`, функция `updateTrainerPublication()` (строка 924): аналогичная логика;
    - `logAction` импортировать из `src/lib/logAction.ts`. **Важно:** `db.ts` помечен `import 'server-only'` — `logAction.ts` тоже серверный, конфликта нет;

  - **Ожидаемый flow:** провайдер видит badge → нажимает «Редактировать» → edit-модалка открывается с данными (reverse-mapping работает как раньше) → провайдер вносит изменения → submit → PATCH /api/clubs/[id] или PATCH /api/trainers/[id] → `updateClubPublication` / `updateTrainerPublication` → auto-restore → лог → публикация снова в каталогах и на карте.

- **Проверка:**
  - скрытая публикация показывает badge и причину в ЛК;
  - кнопка «Редактировать» доступна для скрытых;
  - редактирование скрытой публикации работает (edit-flow не ломается);
  - после редактирования `status` возвращается в `'published'`, поля модерации очищены;
  - публикация снова появляется в каталогах и на карте;
  - лог `moderation_auto_restore` записывается с meta `{ name, previousReason }`;
  - редактирование published-публикации НЕ вызывает auto-restore логику (нет ненужного лога).

- **Тесты:**
  - тест: render badge «Скрыто» для hidden публикации в ЛК провайдера;
  - тест: render причины скрытия;
  - тест: кнопка «Редактировать» видна для hidden;
  - тест: PATCH hidden клуба → `status === 'published'`, `hideReason === undefined`;
  - тест: PATCH hidden тренера → аналогично;
  - тест: PATCH published клуба → `status` не меняется, нет лога `moderation_auto_restore`;
  - тест: лог `moderation_auto_restore` содержит `previousReason`;
  - regression тесты: edit-flow для published публикаций работает как раньше.

- **Ожидаемый результат:**
  - провайдер видит badge и причину в ЛК, редактирование скрытой публикации восстанавливает `status` в `published`.

### Step 22.7: Финальная верификация и синхронизация документации

- **Действие:**
  - прогнать:
    - `npm run format`
    - `npm run lint`
    - `npm run test`
    - `npm run build`
  - ручной сценарий:
    - опубликовать клуб → убедиться что появился в каталоге, на карте, доступен для booking;
    - открыть `/service-portal/moderation` → убедиться что клуб виден в списке;
    - скрыть клуб с причиной «Нарушение правил» → убедиться что:
      - пропал из каталога (GET /api/clubs);
      - пропал с карты (маркер отсутствует);
      - detail-страница `/clubs/[slug]` показывает «публикация скрыта»;
      - booking на слот этого клуба → 403;
      - лог `moderation_hide` записан и виден на странице логов;
    - зайти в ЛК провайдера → увидеть badge «Скрыто администратором» и причину «Нарушение правил»;
    - отредактировать скрытый клуб (изменить описание) → убедиться что:
      - статус вернулся в `published`;
      - клуб снова в каталоге и на карте;
      - лог `moderation_auto_restore` записан;
      - badge в ЛК пропал;
    - повторить с тренером;
    - проверить unhide через кнопку «Показать» на странице модерации;
    - проверить фильтры на странице модерации (status, type, search);
    - проверить пагинацию;
    - убедиться что published публикации (и с `status: undefined`) работают как раньше;
  - синхронизировать документацию:
    - `CLAUDE.md` — обновить «Текущее состояние»;
    - `PHASES_OVERVIEW.md` — статус Phase 22;
    - `phase-22.md` — чек-лист;
    - `PROJECT_STATE.md` — обновлённые типы, новые API routes, новые компоненты;
    - `README.md` — прогресс;
    - `STACK_OVERVIEW.md` — если затронуты архитектурные решения;
    - `feature-docs/admin.md` — добавить секцию «Модерация», убрать «Нет модерации» из ограничений, обновить «План расширения»;
    - `feature-docs/publish-flow.md` — обновить если затронут publish/edit flow;
    - `feature-docs/yandex-maps.md` — обновить если затронута карта;
    - `feature-docs/_overview.md` — обновить связи если нужно.

- **Проверка:**
  - полный цикл работает: publish → hide → провайдер видит → edit → auto-restore → снова в каталоге. Существующие flows не сломаны.

- **Ожидаемый результат:**
  - полный цикл publish → hide → edit → auto-restore работает, все flows не сломаны, документация синхронизирована.

---

### Чек-лист Phase 22

**Модель данных (Step 22.1):**
- [x] `EntityStatus` расширен: `'published' | 'draft' | 'hidden'`
- [x] `Club` имеет опциональные `hideReason`, `hiddenByUserId`, `hiddenAt`
- [x] `Trainer` имеет те же поля
- [x] Существующие данные и операции не ломаются
- [x] Фильтрация использует `status !== 'hidden'`, НЕ `status === 'published'`

**API модерации (Steps 22.2–22.3):**
- [x] POST /api/moderation — hide работает с причиной, moderatorId и датой
- [x] POST /api/moderation — unhide работает, очищает поля скрытия
- [x] Валидация модератора: `role === 'admin'` (не хардкод id=3)
- [x] Логи `moderation_hide` и `moderation_unhide` записываются
- [x] GET /api/publications — объединённый список клубов + тренеров
- [x] Фильтры (status, type, city, sport), поиск, пагинация

**UI модерации (Step 22.4):**
- [x] Placeholder-страница `/service-portal/moderation` заменена
- [x] Hide через модалку с полем причины работает
- [x] Unhide через confirm работает
- [x] Фильтры, поиск, пагинация на странице
- [x] Skeleton при загрузке, пустое состояние

**Фильтрация скрытых (Step 22.5):**
- [x] GET /api/clubs — скрытые исключены (серверная фильтрация)
- [x] GET /api/trainers — скрытые исключены
- [x] Маркеры карты — скрытые не показываются
- [x] Detail-страница скрытого клуба → «публикация скрыта» (не 404)
- [x] Detail-страница скрытого тренера → «публикация скрыта» (не 404)
- [x] POST /api/bookings на hidden entity → 403
- [x] Published и `status: undefined` сущности работают как раньше

**ЛК провайдера и auto-restore (Step 22.6):**
- [x] Badge «Скрыто администратором» и причина в ЛК для hidden публикаций
- [x] Кнопка «Редактировать» доступна для hidden
- [x] PATCH hidden entity → `status: 'published'`, поля модерации очищены
- [x] Публикация снова в каталогах и на карте после auto-restore
- [x] Лог `moderation_auto_restore` записывается с `{ name, previousReason }`
- [x] PATCH published entity → нет ненужного auto-restore лога

**Финализация (Step 22.7):**
- [x] format / lint / test / build проходят
- [x] Полный ручной сценарий пройден (publish → hide → edit → restore)
- [x] Существующий publish / edit / booking / admin flow не сломан
- [x] Документация синхронизирована

**Выполнено:** Steps 22.1–22.7

**Следующий шаг:** —

**Статус Phase 22:** ✅ ЗАВЕРШЕНА

### Принцип масштабирования

- Статус `hidden` → enum `EntityStatus` в Prisma-схеме (переносится 1:1)
- Причина скрытия → отдельная таблица `moderation_actions` (история всех действий, не только последнее)
- `hideEntity()` / `unhideEntity()` → сервис модерации в NestJS
- Постфактум модерация → pre-publish модерация (статус `pending` при создании, очередь на проверку)
- Ручная модерация → автоматические проверки (воркеры) + ручной review для спорных случаев
- Логирование уже встроено через Phase 20
- `GET /api/publications` → SQL VIEW объединяющий clubs и trainers с общей пагинацией

# Phase 26

> Этот файл содержит одну фазу проекта целиком. Главный вход в контекст — `CLAUDE.md`.
> Навигация по фазам — через `PHASES_OVERVIEW.md`.
> В ежедневной работе открывай прежде всего активную фазу и не перечитывай все phase-файлы подряд без необходимости.
> Структура фазы сохраняется в исходном стиле: заголовок фазы, краткий результат, шаги по порядку, затем чеклист и статус.

## Phase 26: Дедупликация и полировка ЛК

> Phase 26 — прямое продолжение Phase 25. Цель — добить техдолг, который Phase 25 осознанно оставила позади, чтобы не раздувать фазу и не ломать работающее. Никакой новой бизнес-функциональности — только «причёска» кодовой базы, закрытие отложенных UI-пунктов и доведение fake-авторизации до уровня остальных runtime-сущностей. После завершения фазы: корневые `/profile/athlete` и `/profile/provider` перестают дублировать подмаршруты (redirect на `/dashboard`), `ProviderPublications` получает полноценный edit/delete, шаблонный `AccessDeniedCard` выносится в один файл, `NotificationsListPage` дорабатывается фильтрами групп и группировкой по датам, в Settings появляется UI-редактор notification preferences, seed обогащается до 7 юзеров (3 provider + 3 athlete + 1 admin), а login/register переходят с фейка на проверку email в `users.json` с динамической записью регистраций — по той же модели, что и все остальные write-операции в проекте.

**Пререквизит:** Phase 25 ✅ завершена. Все 17 степов (включая Step 25.17 финал) закоммичены на ветку `phase-25`. 1251/1251 тестов зелёные. Для старта Phase 26 создаётся новая ветка `phase-26` от `phase-25` (пользователь пока не планирует мерж в `main`).

---

### Фокус фазы

Phase 26 — **рефакторинговая**. Она не добавляет пользовательских сценариев, не меняет данные, не трогает FSM и reliability. Работы делятся на три категории:

1. **Структурная дедупликация:** корневые `/profile/*` перестают дублировать подмаршруты; общий `AccessDeniedCard` вместо 15 копипаст; перенос edit/delete handler'ов из корневого `ProviderProfilePage` в `ProviderPublications`. Это закрывает главный блок отложенного из Step 25.17.
2. **Полировка UI отложенных из 25.14:** `NotificationsListPage` получает фильтры групп и группировку по датам; в Settings обеих ролей появляется `UserNotificationPreferencesEditor` с чекбоксами per-тип и REQUIRED disabled.
3. **Dev-experience:** `users.json` расширяется до 7 юзеров (3 provider + 3 athlete + 1 admin) — чтобы двусторонние сценарии (`Links` invite, reliability per club vs per trainer, Clients с разной историей) были честно тестируемыми; фикс `analytics.route.test.ts` через `fixtureUsers` в `seedTestData`, чтобы расширение seed не ломало существующие тесты; `bookings.json` и `provider-client-notes.json` получают примеры для наглядной демонстрации; manual QA-чеклист для прохода по трём ролям.
4. **Fake auth по email:** `AuthModal` переходит с нулевой валидации (текущий `createLoginSessionUser` на `AuthModal.tsx:111` всегда возвращает id=1 или id=2, игнорируя введённый email) на проверку в `users.json`. Новые `/api/auth/login` и `/api/auth/register` — с тем же набором проверок, что и остальные write-API (Zod + readCollection + writeCollection + conflict detection). `db.createUser()` — копия паттерна `createTrainerClubLink`/`createProviderClientNote`. Никакого bcrypt/JWT — password хранится plaintext в `users.json`, всё в рамках MVP-фикции; контракт `useAuthStore` не меняется, 162 существующих вызова `login/register` в тестах продолжают работать без правок.

---

### Ключевые решения

**Порядок степов — от безопасного к рискованному:**

- Начинаем с extract `AccessDeniedCard` (Step 26.1) — изолированное изменение, не ломает API/данные.
- Затем полировка `NotificationsListPage` (26.2) и новый `UserNotificationPreferencesEditor` (26.3) — изолированные новые компоненты.
- Step 26.4 — самый объёмный рефакторинг (`ProviderPublications` full CRUD) — но он изолирован в рамках одного компонента и не трогает корневой `ProviderProfilePage` (вырезается только в 26.5).
- Step 26.5 — redirect корневых `/profile/*` и удаление `AthleteProfilePage`/`ProviderProfilePage`. Это самый рискованный шаг: ломаются 5 тестовых файлов, их надо переписать или удалить. Делаем в последнюю очередь, когда UI-функциональность всё остальное зелёное.
- Step 26.6 — seed-обогащение (до 7 юзеров) с одновременным фиксом `analytics.route.test.ts`. Полностью безопасный при правильном подходе (`seedTestData` пишет users.json).
- Step 26.7 — Fake auth по email: `/api/auth/login`, `/api/auth/register`, `db.createUser`. Обязательно делаем ПОСЛЕ seed-обогащения (26.6), чтобы в `users.json` было по 3 email'а на тип для нормального manual-теста двусторонних сценариев. Контракт `useAuthStore` не меняем — только подменяем handlers в AuthModal на fetch.
- Step 26.8 — manual QA-чеклист + smoke integration-тест + финальная синхронизация docs.

**НЕ вводим:**

- Никаких новых API-endpoints, кроме возможно технических (если вскроется при переносе).
- Никакой новой бизнес-логики в `db.ts` — используем только то, что уже есть.
- Никаких изменений в типы `User`/`Booking`/`Offering` и т.д.
- Никаких новых `feature-docs/` (обновляем только `profile-hub.md` и `_overview.md`, если нужно).

**Возможные «всплывшие»:**

- В процессе миграции edit/delete в `ProviderPublications` может выясниться, что handlers зависят от state/refs, которые трудно вынести — в этом случае делаем второй вариант: рендерим `ProviderPublicationsSection` внутри `ProviderPublications` с теми же handlers (шаблон ProviderProfilePage) и отдельным state.
- При удалении монолитов `AthleteProfilePage`/`ProviderProfilePage` может всплыть компонент, который всё ещё их импортирует (кроме 5 уже найденных) — grep на этапе 26.5 обязателен.
- `AthleteFeedbackSettingsSection` временно дублирует блок отзывов, который уже мигрировал в `AthleteReviewsSection` (25.6). В Step 26.5 при удалении `AthleteProfilePage` либо переиспользуем Section только для отзыв-формы, либо выносим отзывы полностью в `AthleteReviews`.

---

### Риски и митигация (до старта фазы)

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| Redirect корневых ломает существующие `href="/profile/provider"` | низкая | grep нашёл только `BookingActionBlock.tsx:189 href="/profile/athlete"` — исправим на `/profile/athlete/dashboard` ИЛИ оставим, т.к. redirect сработает. Других прямых ссылок в коде нет. |
| Тесты `athlete-profile-page.test.tsx` и `provider-profile-page.test.tsx` содержат уникальные проверки, которые нигде не дублируются | средняя | В Step 26.5: перед удалением — прочитать оба теста, выделить уникальные case'ы, перенести их в тесты подмаршрутов (Dashboard/Schedule/Bookings и т.д.). Не удалять «в ноль» без анализа. |
| `profile-city-display.test.tsx` и `profile-account-id.test.tsx` проверяют city/id-display, который в подмаршрутах может рендериться в других местах | средняя | Переписать оба теста на текущие обёртки (AthleteDashboard/ProviderDashboard показывают имя/город в шапке). |
| Перенос edit/delete handlers в ProviderPublications требует fetch bootstrap к `/api/clubs/[id]`, `/api/trainers/[id]` — логика занимает ~150 строк в ProviderProfilePage | средняя | Смотрим в 26.4 что именно переносим. Если handlers слишком связаны — оставляем шаблон `useState` + модалки внутри ProviderPublications (копируем логику, не урезаем). |
| `runtime-dynamic-pages.test.ts` проверяет `dynamic='force-dynamic'` у корневых pages — после redirect-страницы атрибут не нужен | низкая | Переписать: либо убрать проверку корневых (они больше не рендерят контент), либо проверять другое у новых pages. |
| `analytics.route.test.ts` зависит от `totalUsers=3` при production seed | высокая | В Step 26.6: сначала добавить `fixtureUsers` в `seedTestData` (users.json пишется в isolated dir), только потом расширять production seed. Тест изолируется от production seed. |
| `NotificationsListPage` уже 167 строк — может содержать логику, которая конфликтует с новыми фильтрами групп | низкая | В Step 26.2: прочитать текущий компонент, добавлять инкрементально, не переписывать с нуля. |
| `UserNotificationPreferencesEditor` должен работать для обеих ролей одинаково, но `AthleteSettings`/`ProviderSettings` структурно разные | низкая | Новый компонент — универсальный, принимает `user` и `onChange`. Подключаем в оба места. |
| Расширение users.json ломает тесты, которые читают production seed (помимо analytics) | средняя | Grep `getUsers\(\)` в `src/test/` — большинство использует `seedTestData` (isolated). Если какой-то тест читает production — переписываем его ДО расширения seed (в 26.6). |
| Во время миграции запись пользователя в `ProviderPublications` и в корневом `ProviderProfilePage` одновременно = двойные handlers state | нулевая | Шаги разделены: 26.4 — handlers в Publications, state в Publications. 26.5 — удаление корневого. Пока в 26.4 корневой цел, проблема не возникает. |
| `AuthModal.tsx:111` `createLoginSessionUser` жёстко hardcode id=1/id=2 независимо от email — после миграции на fetch тесты форм могут сломаться | средняя | В 26.7 **не меняем контракт `useAuthStore`** (162 вызова `getState().login/register` в тестах продолжают работать). Трогаем только `handleLoginSubmit`/`handleRegisterSubmit` в AuthModal + 1 файл `src/test/auth/auth-modal.test.tsx` (обновить с fetchMock для login/register). |
| Email-mismatch: seed provider пытается залогиниться как athlete в модалке | низкая | `/api/auth/login` сверяет `accountType` с `user.role`: `athlete↔'athlete'`, `provider↔'club_owner' OR 'trainer'`. При несоответствии — 403 с понятным сообщением. |
| Конфликт email при регистрации (пользователь вводит email уже существующего seed-user) | низкая | `/api/auth/register` проверяет `users.find(u => u.email === body.email)` → 409 «Email уже зарегистрирован». Стандартный паттерн, как `createTrainerClubLink` 409 для дубликата. |
| Password хранится plaintext в `users.json` → риск «утечки» в dev | нулевая для MVP | `users.json` в `.gitignore` с Phase 24. В репу файлы не летят. При переходе на реальную auth (пост-MVP) — добавить `bcrypt.hash()` в `createUser` и проверку в login. Контракт API не изменится. |
| Admin логинится через отдельный `/service-portal` и не должен проходить через `/api/auth/login` | низкая | В `/api/auth/login` исключаем `role === 'admin'` → 403 «Админы входят через service-portal». Существующий `admin-login-form.test.ts` не затрагивается. |
| Новые seed-юзеры (26.6) попадают в seed users.json до фикса auth (26.7) — если в 26.6 кто-то вручную логинится через AuthModal, попадёт под старый `createLoginSessionUser` с id=1/id=2 | нулевая | Последовательность 26.6 → 26.7 строгая. Между шагами не делаем manual-проверки через AuthModal. Для автоматических тестов (через `getState().login`) разницы нет. |

---

### Step 26.1: Общий AccessDeniedCard — вынос в shared-компонент

- **Действие:**
  - `src/components/profile/AccessDeniedCard.tsx` (новый) — один универсальный компонент с props:
    ```ts
    type AccessDeniedCardProps = {
      /** Какой роли требуется — определяет заголовок и badge'ы. */
      requiredRole: 'athlete' | 'provider';
      /** Опциональный кастомный текст (если дефолтный не подходит). */
      message?: string;
      /** Опциональный testid — чтобы старые тесты с `provider-X-access-denied` продолжали работать. */
      testId?: string;
    };
    ```
  - Внутри:
    - Читает `useAuthStore` (`isAuthenticated`, `accountType`, `openAuthModal`).
    - Рендерит `<Card>` с `data-testid={testId ?? (requiredRole === 'provider' ? 'profile-access-denied-provider' : 'profile-access-denied-athlete')}`.
    - `Badge tone="danger"` с текстом `Provider only` / `Athlete only`.
    - Если `accountType` не совпадает с required — добавляет `Badge tone="outline"` с «Athlete session» / «Provider session».
    - Дефолтные `message` (можно кастомизировать):
      - provider: «Этот раздел доступен только провайдерам.»
      - athlete: «Этот раздел доступен только спортсменам.»
    - Кнопки «Войти» (если не залогинен) + ссылка «Вернуться на главную».
  - Заменить во всех 15 компонентах:
    - `src/components/profile/athlete/AthleteDashboard.tsx`
    - `src/components/profile/athlete/AthleteSchedule.tsx`
    - `src/components/profile/athlete/AthleteStats.tsx`
    - `src/components/profile/athlete/AthleteFavorites.tsx`
    - `src/components/profile/athlete/AthleteReviews.tsx`
    - `src/components/profile/athlete/AthleteSettings.tsx`
    - `src/components/profile/provider/ProviderDashboard.tsx`
    - `src/components/profile/provider/ProviderBookingsInbox.tsx`
    - `src/components/profile/provider/ProviderClients.tsx`
    - `src/components/profile/provider/ProviderStats.tsx`
    - `src/components/profile/provider/ProviderLinks.tsx`
    - `src/components/profile/provider/ProviderPublications.tsx`
    - `src/components/profile/provider/ProviderReviews.tsx`
    - `src/components/profile/provider/ProviderSettings.tsx`
    - `src/components/profile/provider/ProviderFinance.tsx`
  - **Сохранить старые testid'ы** (`provider-clients-access-denied`, `athlete-settings-access-denied` и т.д.) через prop `testId` — иначе сломаются существующие тесты.

- **Проверка:**
  - Зайти на любой `/profile/*` маршрут как не-залогиненный — видим карточку «Доступ ограничен» с `Войти`.
  - Залогиниться как провайдер, зайти на `/profile/athlete/schedule` — видим «Athlete only» с бейджем «Provider session».
  - Залогиниться как атлет, зайти на `/profile/provider/clients` — видим «Provider only» с бейджем «Athlete session».

- **Тесты:**
  - `src/test/profile/access-denied-card.test.tsx` (+3: рендер для provider-only с athlete session, athlete-only с provider session, не-залогиненный видит «Войти»).
  - Существующие тесты `provider-*-access-denied`/`athlete-*-access-denied` продолжают работать без правок (сохранение testid'ов через prop).

- **Ожидаемый результат:**
  - Один компонент `AccessDeniedCard` на 15 consumers. Удалены 15 локальных `function AccessDeniedCard()` блоков (~150 строк копипаст).

---

### Step 26.2: NotificationsListPage — фильтры групп и группировка по датам

- **Действие:**
  - Прочитать `src/components/profile/notifications/NotificationsListPage.tsx` (167 строк, есть основа) — определить что уже есть и что нужно добавить.
  - **Фильтры групп** (по `NOTIFICATION_TYPE_GROUP` из `notification-types.ts`):
    - Tab-бар сверху списка: «Все» / «Записи» / «Связи» / «Дисциплина» + счётчики.
    - State `activeGroup: 'all' | 'booking' | 'links' | 'quarantine'`, default `'all'`.
    - Фильтрация items по `NOTIFICATION_TYPE_GROUP[item.type] === activeGroup`.
  - **Группировка по датам:**
    - Секции `Сегодня` / `Вчера` / `Эта неделя` / `Раньше`.
    - Хелпер `getDateBucket(createdAt: ISODateTimeString, now: Date): 'today'|'yesterday'|'thisWeek'|'earlier'`.
    - Рендер каждой секции как `<section>` с заголовком-бейджем + списком карточек. Пустая секция скрыта.
  - **Тоггл «Только непрочитанные»:**
    - Checkbox или toggle-switch рядом с фильтрами групп.
    - State `showOnlyUnread`, default `false`. При включении: фильтрация `!readAt`.
    - При включении тоггла обновляется fetch с `unreadOnly=true` (уже работает в Phase 24 API) — для корректного total.

- **Проверка:**
  - Залогиниться как атлет с разнообразными типами уведомлений → фильтр групп отсекает, группировка работает.
  - Переключить `showOnlyUnread` — пропадают прочитанные.
  - Клик по «Все» снова показывает весь список.

- **Тесты:**
  - `src/test/profile/notifications-list-page-filters.test.tsx` (+5: рендер 4 групп-табов со счётчиками; выбор группы booking — фильтрует; выбор quarantine — только quarantine-типы; тоггл showOnlyUnread — отсекает `readAt`-непустые; дата-бакеты рендерятся как отдельные секции).
  - Существующие тесты `NotificationsListPage` продолжают проходить.

- **Ожидаемый результат:**
  - Атлет/провайдер в `/profile/*/notifications` видит организованную ленту с группировкой по дате и фильтром типов.

---

### Step 26.3: UserNotificationPreferencesEditor — UI-редактор preferences в Settings

- **Действие:**
  - `src/components/profile/UserNotificationPreferencesEditor.tsx` (новый, 'use client'):
    ```ts
    type Props = {
      user: User; // текущий пользователь со свои notificationPreferences
    };
    ```
  - Внутри:
    - 3 group-сессии (`booking`, `links`, `quarantine`) через `NOTIFICATION_TYPE_GROUP`.
    - В каждой секции — чекбоксы per `NotificationType`:
      - Label из нового хелпера `getNotificationTypeLabel(type): string` (если нет — добавить в `notification-copy.ts`).
      - `checked = isNotificationTypeEnabled(user, type)`.
      - Для REQUIRED-типов — `disabled` + пояснение «Нельзя отключить» рядом.
    - State local-draft: `prefs: Record<NotificationType, boolean>`.
    - `onChange(type, value)` → обновить state → `debounce(500ms)` → `PATCH /api/users/[id]/notification-preferences` с полным `prefs` → toast success/error → refresh (для актуализации `user`).
    - Testids: `notification-preferences-editor`, `notification-preferences-toggle-{type}`, `notification-preferences-group-{group}`.
  - Интеграция:
    - `src/components/profile/athlete/AthleteSettings.tsx` — добавить секцию с `<UserNotificationPreferencesEditor user={user} />` рядом с существующим `AthleteFeedbackSettingsSection`.
    - `src/components/profile/provider/ProviderSettings.tsx` — аналогично рядом с `ProviderSettingsSection`.

- **Проверка:**
  - Зайти как атлет в `/profile/athlete/settings` → видим 3 секции уведомлений с чекбоксами. REQUIRED-типы серые и disabled.
  - Снять галочку `booking_completed` → через 500мс POST → toast «Настройки сохранены» → refresh (если вернуться на `/profile/athlete/notifications` — тип `booking_completed` пропадает из ленты).
  - То же для провайдера в `/profile/provider/settings`.

- **Тесты:**
  - `src/test/profile/user-notification-preferences-editor.test.tsx` (+6):
    - Рендер 3 групп (testid `notification-preferences-group-*`).
    - REQUIRED-типы disabled: попытка клик на `notification-preferences-toggle-booking_confirmed` не меняет checked.
    - Клик на non-required → state обновляется.
    - Debounced fetch: после клика ждём 500мс → `fetchMock` вызван с PATCH.
    - Success toast появляется после PATCH 200.
    - Error toast появляется при PATCH 403.

- **Ожидаемый результат:**
  - Пользователь (любой роли) через UI управляет, какие типы уведомлений хочет получать. Отключённые не попадают в bell и в список.

---

### Step 26.4: ProviderPublications full CRUD — перенос edit/delete handlers

- **Действие:**
  - Прочитать `src/components/profile/ProviderProfilePage.tsx` (618 строк), выделить блоки:
    - State: `isClubModalOpen`, `isTrainerModalOpen`, `editingClubId`, `editingTrainerId`, `clubBootstrap`, `trainerBootstrap`, `isLoadingBootstrap`, `deletingEntityId`.
    - Handlers: `openCreateClubModal`, `openEditClubModal(id)`, `handleClubSubmit(data)`, `openCreateTrainerModal`, `openEditTrainerModal(id)`, `handleTrainerSubmit`, `handleDeleteClub(id)`, `handleDeleteTrainer(id)`, `bootstrapEditClub(id)`, `bootstrapEditTrainer(id)`.
    - Render: `<PublishClubModal>`, `<PublishTrainerModal>` внизу компонента.
  - Скопировать весь этот блок в `src/components/profile/provider/ProviderPublications.tsx`:
    - Добавить state, handlers, модалки внутри компонента.
    - `ProviderPublicationsSection` теперь получает `onEdit={openEditXxxModal}` и `onDelete={handleDeleteXxx}`.
    - Удалить плашку «Редактирование через корневой кабинет» — больше не нужна.
    - **Не трогать** корневой `ProviderProfilePage` — он остаётся работающим дублем до Step 26.5.
  - Bootstrap-логика (`bootstrapEditClub`/`bootstrapEditTrainer`) делает fetch на `/api/clubs/[id]` или `/api/trainers/[id]` — эндпоинты уже существуют, используются корневым кабинетом. Переиспользуем.
  - Handler `handleDeleteClub`/`handleDeleteTrainer` — подтверждение через `Modal` + fetch `DELETE /api/clubs/[id]` или `/api/trainers/[id]` (если эти endpoints есть; если нет — пропускаем до Phase, когда появятся). **Проверить в 26.4 step:** есть ли сейчас DELETE у корневого.

- **Проверка:**
  - Залогиниться как провайдер, зайти на `/profile/provider/publications` → видим список публикаций с кнопками «Редактировать» и «Удалить».
  - Кликнуть «Редактировать» на клубе → открывается модалка `PublishClubModal` с prefilled данными → изменить что-то → «Сохранить» → toast → router.refresh → в списке обновлённые данные.
  - Кликнуть «Удалить» на тренере → подтверждение → DELETE → toast → тренер исчез из списка.
  - Проверить что корневой `/profile/provider` продолжает работать (в нём тоже edit/delete работают параллельно — дубль на время, в 26.5 убираем).

- **Тесты:**
  - `src/test/profile/provider-publications-crud.test.tsx` (+6):
    - Рендер кнопок «Редактировать» и «Удалить» для каждой публикации.
    - Клик «Редактировать клуб» → fetch `/api/clubs/1` → открытие модалки.
    - Клик «Удалить клуб» → открывается confirm-модалка.
    - Confirm → fetch DELETE → toast success.
    - Error flow: fetch 403/404 → toast error, список не обновлён.
    - Access-gate: athlete видит `provider-publications-access-denied` (уже работает).

- **Ожидаемый результат:**
  - `/profile/provider/publications` — полноценный маршрут для CRUD-публикаций провайдера, не хуже корневого `/profile/provider`.

---

### Step 26.5: Redirect корневых `/profile/*` + удаление монолитов

> **Самый рискованный шаг фазы** (~1400 удалённых строк, 13+ изменённых/удалённых файлов). Делается в 3 последовательные итерации (A → B → C) внутри одного коммита, с промежуточными grep/test-чекпоинтами.

#### Blast radius (подтверждён Explore-агентами в plan mode)

**Импорты монолитов (продакшн):** `src/app/profile/athlete/page.tsx`, `src/app/profile/provider/page.tsx`.

**Импорты монолитов (тесты, 5 файлов):** `athlete-profile-page.test.tsx`, `provider-profile-page.test.tsx`, `profile-city-display.test.tsx`, `profile-account-id.test.tsx`, `runtime-dynamic-pages.test.ts`.

**Прямые ссылки на `/profile/athlete` и `/profile/provider` в продакшн-коде (6 мест):**
- `src/components/booking/BookingActionBlock.tsx:189` — `href="/profile/athlete"`
- `src/components/profile/provider/ProviderDashboard.tsx:256` — `href="/profile/provider"` (ссылка «Перейти к публикации»)
- `src/components/profile/provider/ProviderDashboard.tsx:416` — `href="/profile/provider"` (quick action «Опубликовать новое»)
- `src/components/profile/provider/ProviderLinks.tsx:261` — `href="/profile/provider"` («Опубликовать услугу»)
- `src/components/profile/provider/ProviderClients.tsx:346` — `href="/profile/provider"` («Опубликовать услугу»)
- `src/components/layout/MobileNav.tsx:60` — `href: '/profile/athlete'` (mobile «Профиль»)

**Orphan-компоненты (после удаления монолитов):**
- `src/components/profile/AthleteHistorySection.tsx` — без своего теста, использовался только в `AthleteProfilePage.tsx:555`. Оставляем с маркером-комментарием; функционально история покрыта `AthleteSchedule` с FSM-фильтром `completed`.
- `src/components/profile/ProviderLinkRequestsSection.tsx` — имеет собственный тест `provider-link-requests-section.test.tsx` (4+ кейсов, рендерит компонент напрямую). Оставляем с маркером; тест продолжает проходить самостоятельно; функционально логика дублирована в `/profile/provider/links`.

**Что НЕ меняется:**
- `useAuthStore.ts` → `profilePath: '/profile/athlete' | '/profile/provider'` (остаётся, redirect сработает для `Header.cabinetHref` и `DashboardPage.tsx:159` admin impersonation; тест `useAuthStore.test.tsx:152,155` ожидает именно такую строку — не ломается).
- `src/test/profile/provider-link-requests-section.test.tsx` (orphan-тест сохраняется).
- `src/test/profile/athlete-history.test.ts` (тестирует helper `getAthleteHistoryItems`, а не компонент — не затронут).

---

#### Итерация A — Pre-work: миграция уникального UI в Dashboard'ы + обновление прямых ссылок

**Цель:** сохранить в подмаршрутах UI-элементы, которые были только в монолитах (ID аккаунта + город); обновить все href'ы так, чтобы пользователь шёл на подмаршрут напрямую, а не через redirect.

- **Действие A.1:** `src/components/profile/athlete/AthleteDashboard.tsx` — в шапке (там где рендерится `user.name` приветствие):
  - Добавить `<span data-testid="athlete-dashboard-account-id" className="text-sm font-mono text-muted">ID: #{user.id}</span>` с guard'ом `user.id != null`.
  - Добавить `<p data-testid="athlete-dashboard-city" className="text-sm text-muted">{user.city ? \`г. ${user.city}\` : 'не указан'}</p>`.

- **Действие A.2:** `src/components/profile/provider/ProviderDashboard.tsx` — аналогично в шапке:
  - `<span data-testid="provider-dashboard-account-id">ID: #{user.id}</span>`.
  - `<p data-testid="provider-dashboard-city">{user.city ? \`г. ${user.city}\` : 'не указан'}</p>`.
  - Обновить 2 href-ссылки: `line 256` и `line 416` → `/profile/provider/publications` (не `/profile/provider` — полный CRUD теперь там после Step 26.4).

- **Действие A.3:** обновить 4 оставшиеся прямые ссылки:
  - `src/components/booking/BookingActionBlock.tsx:189` → `href="/profile/athlete/dashboard"`.
  - `src/components/profile/provider/ProviderLinks.tsx:261` → `href="/profile/provider/publications"`.
  - `src/components/profile/provider/ProviderClients.tsx:346` → `href="/profile/provider/publications"`.
  - `src/components/layout/MobileNav.tsx:60` → `href: '/profile/athlete/dashboard'`.

- **Чекпоинт A:** `npm run test` — существующие 1271 тестов остаются зелёными (кроме тех, что специально проверяют отсутствие `athlete-dashboard-account-id` / `athlete-dashboard-city` — таких не должно быть; кроме тестов на конкретный `href` — если найдутся, обновить).

---

#### Итерация B — Redirect + удаление монолитов

- **Действие B.1:** `src/app/profile/athlete/page.tsx` — полный rewrite:
  ```ts
  // Корневой /profile/athlete больше не имеет собственного UI — перенаправляем
  // на Dashboard-подмаршрут (Phase 26 Step 26.5).
  import { redirect } from 'next/navigation';

  export default function AthleteRootPage() {
    redirect('/profile/athlete/dashboard');
  }
  ```
  Убираем `dynamic='force-dynamic'`, все импорты db/компонентов.

- **Действие B.2:** `src/app/profile/provider/page.tsx` — аналогично, redirect на `/profile/provider/dashboard`.

- **Действие B.3:** удалить файлы:
  - `src/components/profile/AthleteProfilePage.tsx` (573).
  - `src/components/profile/ProviderProfilePage.tsx` (618).

- **Действие B.4:** orphan-маркеры (файлы НЕ удаляем):
  - `src/components/profile/AthleteHistorySection.tsx` — добавить header-комментарий: `// ВНИМАНИЕ (Phase 26 Step 26.5): компонент стал orphan — больше не импортируется. История completed-bookings доступна через /profile/athlete/schedule с FSM-фильтром 'completed'. Файл оставлен как готовый reference UI для возможного будущего /profile/athlete/history.`
  - `src/components/profile/ProviderLinkRequestsSection.tsx` — аналогичный комментарий (с упоминанием `/profile/provider/links` как замены). Собственный тест `provider-link-requests-section.test.tsx` продолжает работать.

- **Действие B.5:** grep-валидация ПЕРЕД коммитом:
  ```bash
  rg "AthleteProfilePage|ProviderProfilePage" src/
  # Ожидается: только orphan-маркеры в 2 файлах (0 импортов)
  ```

- **Чекпоинт B:** в этот момент 5 тестовых файлов импортируют удалённые монолиты → падение ожидаемо. Переход к итерации C обязателен.

---

#### Итерация C — Обновление тестов

- **Действие C.1 (перенос уникального кейса перед удалением):** в `src/test/profile/athlete-reviews-page.test.tsx` добавить **+1 тест** на pagination отзывов:
  - Кнопка `Показать все отзывы` появляется при > 3 отзывах.
  - Клик → виден 4-й отзыв.
  - Повторный клик `Скрыть отзывы` → 4-й отзыв скрыт.
  - Тест рендерит `<AthleteReviews>` с 4+ reviews, проверяет `screen.getByRole('button', { name: /Показать все отзывы/i })`.

- **Действие C.2 (удалить 2 тестовых файла):**
  - `src/test/profile/athlete-profile-page.test.tsx` (20 тестов — все 20 покрыты подмаршрутами: `athlete-dashboard.test.tsx`, `athlete-stats.test.tsx`, `athlete-favorites-page.test.tsx`, `athlete-settings-page.test.tsx`, `athlete-reviews-page.test.tsx` после C.1).
  - `src/test/profile/provider-profile-page.test.tsx` (16 тестов — все покрыты `provider-dashboard.test.tsx`, `provider-publications-crud.test.tsx` Step 26.4, `provider-bookings-inbox.test.tsx`, `provider-link-requests-section.test.tsx`).

- **Действие C.3 (rewrite 2 теста):** `src/test/profile/profile-city-display.test.tsx` → рендерить `AthleteDashboard`/`ProviderDashboard` вместо монолитов.
  - Добавить `vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }) }))`.
  - Сохранить 4 кейса: athlete с `city='Самара'` → `screen.getByTestId('athlete-dashboard-city')` содержит `г. Самара`; athlete без city → `не указан`; provider с `city='Москва'`; provider без city.
  - Минимальные props: `<AthleteDashboard bookings={[]} clubs={[]} schedule={[]} trainers={[]} users={[user]} />`, `<ProviderDashboard bookings={[]} clubs={[]} trainers={[]} offerings={[]} schedule={[]} links={[]} notifications={[]} />`.

- **Действие C.4:** `src/test/admin/profile-account-id.test.tsx` → аналогично, рендерить Dashboard'ы.
  - Athlete: `screen.getByTestId('athlete-dashboard-account-id')` содержит `ID: #${MVP_ATHLETE_USER_ID}`.
  - Provider: `screen.getByTestId('provider-dashboard-account-id')` содержит `ID: #${MVP_PROVIDER_USER_ID}`.

- **Действие C.5:** `src/test/ui/runtime-dynamic-pages.test.ts` → обновить:
  - Удалить импорты `AthleteProfilePageModule`, `ProviderProfilePageModule`.
  - Удалить test-case `кабинеты отключают статическую оптимизацию` (корневые теперь redirect, не dynamic).
  - Оставить 2 test-case'а (home + detail+booking) без изменений.

- **Действие C.6 (новый тест):** создать `src/test/ui/profile-root-redirects.test.ts` (+3 кейса):
  - (1) `AthleteRootPage()` вызывает `redirect('/profile/athlete/dashboard')` — через `vi.mock('next/navigation', () => ({ redirect: vi.fn() }))`, проверить `redirectMock.mock.calls[0][0]`.
  - (2) Аналогично для `ProviderRootPage()` → `/profile/provider/dashboard`.
  - (3) Smoke: прямые ссылки ведут на подмаршруты (BookingActionBlock `<Link href="/profile/athlete/dashboard">` + MobileNav item). Может быть реализовано через импорт констант из этих файлов ИЛИ через рендер с фикстурой.

---

#### Полный список файловых изменений

**Создаваемые (1):**
- `src/test/ui/profile-root-redirects.test.ts` (+3 кейса)

**Модифицируемые — продакшн (10):**
- `src/components/profile/athlete/AthleteDashboard.tsx` (+2 элемента в шапке)
- `src/components/profile/provider/ProviderDashboard.tsx` (+2 элемента + 2 href)
- `src/components/booking/BookingActionBlock.tsx` (1 href)
- `src/components/profile/provider/ProviderLinks.tsx` (1 href)
- `src/components/profile/provider/ProviderClients.tsx` (1 href)
- `src/components/layout/MobileNav.tsx` (1 href)
- `src/app/profile/athlete/page.tsx` (полный rewrite → redirect)
- `src/app/profile/provider/page.tsx` (полный rewrite → redirect)
- `src/components/profile/AthleteHistorySection.tsx` (orphan header-комментарий)
- `src/components/profile/ProviderLinkRequestsSection.tsx` (orphan header-комментарий)

**Удаляемые (4):**
- `src/components/profile/AthleteProfilePage.tsx` (573)
- `src/components/profile/ProviderProfilePage.tsx` (618)
- `src/test/profile/athlete-profile-page.test.tsx`
- `src/test/profile/provider-profile-page.test.tsx`

**Модифицируемые — тесты (4):**
- `src/test/profile/athlete-reviews-page.test.tsx` (+1 pagination-кейс)
- `src/test/profile/profile-city-display.test.tsx` (rewrite на Dashboard)
- `src/test/admin/profile-account-id.test.tsx` (rewrite на Dashboard)
- `src/test/ui/runtime-dynamic-pages.test.ts` (удалить 2 импорта + 1 test-case)

---

#### Риски и митигации (12 сценариев)

| # | Риск | Вероятность | Митигация |
|---|------|-------------|-----------|
| 1 | 5 тестов ломаются при удалении монолитов | 100% | Итерация C обрабатывает все 5 в одном коммите |
| 2 | Pagination отзывов теряет покрытие | средняя | C.1 переносит кейс в `athlete-reviews-page.test.tsx` ДО удаления `athlete-profile-page.test.tsx` |
| 3 | ID/city пропадают из UI (user видел в монолите) | низкая | Итерация A.1-A.2 добавляет в Dashboard'ы |
| 4 | Admin impersonation идёт через redirect (extra hop) | нулевая | `useAuthStore.profilePath` работает → redirect; тесты не ломаются |
| 5 | Orphan `AthleteHistorySection` без теста | низкая | Функционал покрывается `AthleteSchedule` FSM-фильтром; маркер-комментарий |
| 6 | `ProviderLinkRequestsSection` orphan с активным тестом | нулевая | Тест самодостаточен, рендерит компонент напрямую — не через монолит |
| 7 | Build fails на остаточных импортах | средняя | Grep-проверка B.5 + `npm run build` в верификации |
| 8 | `profile-city-display.test.tsx` требует больше props при переписке | средняя | Dashboard'ы принимают опциональные массивы, фикстуры минимальные |
| 9 | `runtime-dynamic-pages.test.ts` падает из-за unused imports | низкая | Импорты удаляются вместе с test-case'ом |
| 10 | Header `cabinetHref` идёт на корневой → redirect | нулевая | Прозрачно для UX, один hop приемлем для MVP |
| 11 | Server page с `redirect()` в Next 16 требует `dynamic` | низкая | App Router поддерживает redirect без dynamic; если build жалуется — добавить обратно |
| 12 | Ссылка «Опубликовать» → `/profile/provider/publications` ломает UX, если подмаршрут не готов | нулевая | Step 26.4 завершён — CRUD + CTA в publications работают |

---

#### Проверка

- **Автоматические:**
  - `npm run format` — без изменений.
  - `npm run lint` — 0 errors, ≤11 legacy warnings (не добавляем новых).
  - `npm run test` — ~1240–1245 зелёных (1271 − 36 удалённых монолит-тестов + 3 новых redirect + 1 pagination + 4 переписанных).
  - `npm run build` — все маршруты билдятся; корневые `/profile/athlete` и `/profile/provider` в выводе могут быть `○` (static redirect) или `ƒ` (dynamic) — оба допустимы.

- **Grep-верификация:**
  ```bash
  rg "AthleteProfilePage|ProviderProfilePage" src/
  # Ожидается: только orphan-комментарии в 2 файлах (0 импортов)
  ```

- **Manual QA (`npm run dev`):**
  - Guest открывает `/profile/athlete` → redirect на `/dashboard` + access-denied.
  - Athlete: `/profile/athlete` → dashboard, в шапке видны ID + город.
  - Provider аналогично для `/profile/provider`.
  - Booking успех → «Перейти в ЛК» → сразу `/profile/athlete/dashboard` (не через корневой).
  - Mobile nav «Профиль» athlete → сразу `/profile/athlete/dashboard`.
  - Provider без публикаций → Dashboard CTA «Опубликовать новое» → `/profile/provider/publications` → работает CRUD.

---

#### Тесты (суммарно)

- `src/test/profile/athlete-reviews-page.test.tsx` (+1 pagination)
- `src/test/ui/profile-root-redirects.test.ts` (+3)
- Удалено: ~36 из `athlete-profile-page.test.tsx` и `provider-profile-page.test.tsx`
- Переписано без изменения кол-ва: `profile-city-display.test.tsx` (4), `profile-account-id.test.tsx` (2), `runtime-dynamic-pages.test.ts` (−1 test-case)

**Итого: 1271 → ~1240–1245 зелёных.**

---

#### Ожидаемый результат

Корневые `/profile/athlete` и `/profile/provider` больше не дублируют функциональность подмаршрутов — выполняют redirect в `/dashboard`. Удалены ~1200 строк legacy-монолитов (573 + 618). ID аккаунта и город сохранены в Dashboard-шапках. Все прямые ссылки в продакшн-коде ведут напрямую на подмаршруты. Orphan-компоненты (`AthleteHistorySection`, `ProviderLinkRequestsSection`) помечены комментариями, готовы к возможному повторному использованию.

**Коммит:** `refactor(profile): Step 26.5 — redirect корневых /profile/* + удаление монолитов (~-1200 строк)`

---

### Step 26.6: Seed-обогащение до 7 юзеров + изоляция analytics-теста

- **Действие:**
  - **Фикс analytics-теста (делать ПЕРВЫМ):**
    - `src/test/helpers/seed-fixtures.ts` — добавить `fixtureUsers` (3 user: athlete id=1, provider id=2, admin id=3; полная копия текущего `src/data/users.json`, password `"sporthub123"` для id=1/2, `"admin-sporthub-2026"` для id=3).
    - В `seedTestData()` — `write('users.json', fixtureUsers)`.
    - Проверить `src/test/api/analytics.route.test.ts` — `expect(kpi.totalUsers).toBe(3)` теперь работает от isolated seed, не от production.
  - **Обогащение production seed (после фикса analytics):**
    - `src/data/users.json` — расширяется до **7 записей**:
      - **id=1** (athlete) — существующий Алексей Смирнов
      - **id=2** (club_owner) — существующая Марина Крылова (владеет клубами)
      - **id=3** (admin) — существующий Администратор SportHub
      - **id=4** (club_owner, новый) — например, «Дмитрий Соколов» (владелец второго клуба для двустороннего invite-flow)
      - **id=5** (trainer, новый, role='trainer') — например, «Анна Иванова» (тренер-фрилансер, отправляет запросы клубам)
      - **id=6** (athlete, новый) — stable клиент (5+ completed, без no_show)
      - **id=7** (athlete, новый) — danger-клиент (5 completed + 5 late-cancel, чтобы reliability badge=danger)
    - Всем non-admin — password `"demo"` для удобного manual-теста в AuthModal после Step 26.7.
    - `src/data/clubs.json` / `trainers.json` — связать новых провайдеров: id=4 владеет одним новым клубом, id=5 владеет одним новым тренером (или оставить как есть, если из текущих seed-клубов уже есть у marina все нужное).
    - `src/data/bookings.json` — добавить bookings для новых атлетов на клубы id=2 и id=4: completed + no_show + cancelled_by_athlete (late), чтобы reliability атлетов id=6 и id=7 разлинчался и Clients-фильтры заиграли.
    - `src/data/trainer-club-links.json` — один confirmed link (trainer id=5 ↔ club провайдера id=2 или id=4) + один pending link для демо табов Links.
    - `src/data/provider-client-notes.json` — 2-3 примера заметок (provider id=2 про athletes id=6 и id=7).
  - **Полный прогон тестов после расширения:** если ещё какой-то тест зависит от production seed → grep-фикс + изоляция.
  - Все изменённые файлы в `src/data/` уже в `.gitignore` — не коммитятся, но остаются локально для dev-сервера.

- **Проверка:**
  - `npm run dev` → залогиниться провайдером id=2 (password `"demo"` после Step 26.7, `"sporthub123"` до) → зайти на `/profile/provider/clients` — видны карточки атлетов id=1, id=6, id=7 с разными reliability-бейджами.
  - Зайти на `/profile/provider/stats` — heatmap и топ-5 offerings заполнены реальными данными.
  - Зайти на `/profile/provider/links` от лица id=4 (club-only) → видны запросы от trainer'а id=5. Approve → confirmed link появляется.
  - Логин атлетом id=7 → видит свой danger-бейдж в Stats.

- **Тесты:**
  - `src/test/lib/seed-fixtures-users.test.ts` (+2: `seedTestData` пишет `users.json` с 3 fixtures; `getUsers` возвращает ровно 3 в isolated dir — не зависит от production).
  - Полный прогон — все 1253+ тестов зелёные.

- **Ожидаемый результат:**
  - `users.json` с 7 реалистичными профилями для manual/dev-демонстрации двусторонних сценариев. Analytics-тест изолирован от production seed — можно безопасно расширять.

---

### Step 26.7: Fake auth по email — `/api/auth/login` + `/api/auth/register` + `db.createUser`

- **Действие:**
  - **Новый helper `db.createUser(data)`** в `src/lib/db.ts`:
    ```ts
    export async function createUser(
      data: Omit<User, 'id' | 'createdAt'>,
    ): Promise<User>
    ```
    - Паттерн копируется с `createTrainerClubLink` / `createProviderClientNote`: `readCollection('users')` → `getNextEntityId` → `createTimestamp` → `writeCollection`.
    - Проверка уникальности email НЕ внутри createUser — делается на уровне роута (чтобы createUser оставалась простой CRUD-функцией).
  - **Новый endpoint `src/app/api/auth/login/route.ts` (POST):**
    - Zod: `{ email: z.string().email(), accountType: z.enum(['athlete', 'provider']) }`. Password в body принимаем опциональным (для совместимости с будущей формой), но не проверяем.
    - Находим `users.find(u => u.email === body.email && u.status === 'active')`.
    - Если нет → 404 «Пользователь не найден».
    - Если `user.role === 'admin'` → 403 «Админы входят через /service-portal».
    - Проверка role vs accountType: `accountType === 'athlete'` требует `role === 'athlete'`, `accountType === 'provider'` требует `role ∈ ('club_owner', 'trainer')`. Несоответствие → 403 «Неверный тип кабинета для этого email».
    - Успех → `{ success: true, data: { id, name, email, phone, avatarUrl, city } }` (без password в ответе).
    - Никакого `logAction` — это fake-auth, не продакшен.
  - **Новый endpoint `src/app/api/auth/register/route.ts` (POST):**
    - Zod: `{ name, email, password, phone?, city?, accountType }` — все валидации уровня трима и email-формата как в текущем `AuthModal`.
    - Проверка: `users.find(u => u.email === body.email)` → 409 «Email уже зарегистрирован».
    - Создаём: `role = accountType === 'athlete' ? 'athlete' : 'club_owner'` (trainer-регистрация через провайдер → role=`club_owner` по умолчанию; при публикации тренера позже `managedByUserId` прописывается корректно).
    - Вызываем `createUser({ role, status: 'active', name, email, phone: phone ?? '', password, avatarUrl: '', favoriteClubIds: [], city })`.
    - Успех → `{ success: true, data: { id, name, email, phone, city } }`.
  - **Обновление AuthModal `src/components/auth/AuthModal.tsx`:**
    - Заменить `createLoginSessionUser` / `createRegisterSessionUser` на async-handlers:
      - `handleLoginSubmit` → `fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, accountType: loginAccountType }) })` → если `!ok` → error toast + setLoginErrors; если ok → `useAuthStore.getState().login({ accountType, user: data })`.
      - `handleRegisterSubmit` → `fetch('/api/auth/register', { ... })` → если `!ok` → error (409 → «Email уже зарегистрирован», 400 → form-errors); если ok → `useAuthStore.getState().register({ accountType, user: data })`.
    - Удалить функции `createLoginSessionUser` (AuthModal:111) и `createRegisterSessionUser` (AuthModal:211) — они больше не нужны.
    - Импорты `MVP_ATHLETE_USER_ID` / `MVP_PROVIDER_USER_ID` в AuthModal убрать (они остаются в store для других consumers).
    - `loading` state во время fetch — блокирует submit-кнопку.
  - **Обновление `src/test/auth/auth-modal.test.tsx`:**
    - Добавить `fetchMock` для `/api/auth/login` и `/api/auth/register`.
    - Тесты которые проверяют «submit → store обновлён» — теперь с `waitFor(fetchMock.toHaveBeenCalled)` и возвратом моковой response.
    - Error-case тесты: mock возвращает 404/409 → форма показывает error message.
  - **Что НЕ трогаем:**
    - Контракт `useAuthStore` (`login`, `register`, `logout`, `adminLogin`) — остаётся прежним. 162 вызова `getState().login/register` в остальных тестах продолжают работать без единой правки.
    - `/service-portal` admin-login — не затрагивается (админ не проходит через `/api/auth/login`).

- **Проверка:**
  - `npm run dev` → на главной открыть AuthModal → ввести `alexey@sporthub.local` + любой password + «Спортсмен» → вход успешен → в Header видно имя «Алексей Смирнов», в useAuthStore user.id=1.
  - Ввести `marina@studio.local` + «Спортсмен» → 403 «Неверный тип кабинета» (она club_owner).
  - Ввести `anything@nope.com` + «Спортсмен» → 404 «Пользователь не найден».
  - Вкладка «Регистрация»: ввести имя + уникальный email + password + accountType=athlete → успех → залогинен, id=8 (следующий после 7), запись появилась в `users.json`.
  - Попытка регистрации с существующим email → 409 «Email уже зарегистрирован».
  - После рестарта `npm run dev` → логин нового атлета по его email работает (данные в файле).

- **Тесты:**
  - `src/test/api/auth.login.route.test.ts` (+4): 200 success athlete, 404 missing email, 403 wrong accountType (club_owner пытается как athlete), 403 admin не проходит.
  - `src/test/api/auth.register.route.test.ts` (+3): 201 success + user появился в `getUsers()`, 409 email exists, 400 invalid input (короткий name / невалидный email).
  - `src/test/lib/db-create-user.test.ts` (+2): createUser назначает id / createdAt / записывает в users.json.
  - Обновлённый `src/test/auth/auth-modal.test.tsx` — добавить fetchMock, существующие success-case'ы продолжают работать, +2 error-case'а (404 + 409).

- **Ожидаемый результат:**
  - `users.json` становится живой коллекцией, как `bookings.json` и `clubs.json`. Логин и регистрация проходят через API, но всё остаётся в рамках MVP-фикции (plaintext password, никакого JWT). Контракт zustand store не меняется — остальные 162 вызова в тестах не трогаются.

---

### Step 26.8: Фильтр группы «Связи» у атлета в `UserNotificationPreferencesEditor` + `NotificationsListPage`

> Добавлен после manual-теста: атлет видел 4 чекбокса группы `links` в настройках уведомлений, хотя `link_*` уведомления физически никогда не приходят атлетам (все `notify()` для link-событий уходят на `managedByUserId` провайдера). Тот же баг живёт и в `NotificationsListPage` — фильтр-tab «Связи» у атлета всегда показывает count=0 и никогда не даёт полезного результата. Исправляем оба места одним и тем же паттерном.

- **Действие:**
  - `src/components/profile/UserNotificationPreferencesEditor.tsx`:
    - Добавить обязательный prop `accountType: 'athlete' | 'provider'`.
    - Вычислять `visibleGroups`:
      ```ts
      const visibleGroups: NotificationGroupKey[] =
        accountType === 'athlete' ? ['booking', 'quarantine'] : NOTIFICATION_GROUP_KEYS;
      ```
    - В рендере заменить `NOTIFICATION_GROUP_KEYS.map(...)` на `visibleGroups.map(...)` — группа `links` у атлета **не рендерится** (её нет в DOM, не `display:none`).
  - `src/components/profile/athlete/AthleteSettings.tsx` → `<UserNotificationPreferencesEditor userId={user.id} accountType="athlete" />`.
  - `src/components/profile/provider/ProviderSettings.tsx` → аналогично с `accountType="provider"`.
  - `src/components/profile/notifications/NotificationsListPage.tsx`:
    - Добавить обязательный prop `accountType: 'athlete' | 'provider'`.
    - Вычислить `visibleGroupKeys`: athlete → `['booking', 'quarantine']`, provider → `NOTIFICATION_GROUP_KEYS`.
    - В рендере tab-ряда заменить `['all', ...NOTIFICATION_GROUP_KEYS]` на `['all', ...visibleGroupKeys]`.
    - Если `activeGroup` окажется вне `visibleGroupKeys` (например, сохранилось в state после смены аккаунта) — сбросить на `'all'` (`useEffect`, одноразовая проверка).
  - `src/app/profile/athlete/notifications/page.tsx` → `<NotificationsListPage notifications={...} userId={...} accountType="athlete" />`.
  - `src/app/profile/provider/notifications/page.tsx` → аналогично с `accountType="provider"`.

- **Проверка:**
  - Login как athlete → `/profile/athlete/settings` → видны только 2 group-секции («Записи» и «Дисциплина»). Группы «Связи» нет в DOM.
  - Login как athlete → `/profile/athlete/notifications` → 3 tab'а (Все / Записи / Дисциплина). Tab'а «Связи» нет.
  - Login как provider → `/profile/provider/settings` → все 3 group-секции (включая «Связи»).
  - Login как provider → `/profile/provider/notifications` → все 4 tab'а (Все / Записи / Связи / Дисциплина).

- **Тесты:**
  - `src/test/profile/user-notification-preferences-editor.test.tsx` (+1 кейс: при `accountType="athlete"` testid'а `notification-preferences-group-links` нет в DOM; testid'ы `-booking` и `-quarantine` есть).
  - Существующие 6 тестов editor'а обновить: в рендерах добавить `accountType` (самый простой вариант — `"provider"`, т.к. показывает все 3 группы и существующие assertion'ы не ломаются).
  - `src/test/profile/notifications-list-page-filters.test.tsx` (+1 кейс: при `accountType="athlete"` testid'а `notifications-filter-group-links` нет в DOM).
  - Существующие 5 тестов NotificationsListPage'а обновить: в рендерах добавить `accountType="provider"` (или `"athlete"` — ассертят только booking/quarantine+all, tab `links` они не трогают).

- **Ожидаемый результат:**
  - У атлета в Settings и Notifications нет мусорной группы `links` — оба UI рендерят только релевантные типы. Контракт API `/api/users/[id]/notification-preferences` не меняется. Существующие `link_*` ключи в `users.json` (у id=1 они есть из seed'а) остаются в JSON, но UI их не показывает и не редактирует — API переваривает любые валидные keys, ничего не ломается.

---

### Step 26.9: KPI-карточка «Рейтинг» в `ProviderDashboard`

> Добавлен после manual-теста: в ЛК провайдера пропал средний рейтинг по отзывам. В удалённом в Step 26.5 монолите была KPI `averageRating`, при миграции на `ProviderDashboard` она не переехала.

- **Действие:**
  - `src/app/profile/provider/dashboard/page.tsx`:
    - В `Promise.all` добавить `getReviews()`.
    - Передать `reviews={reviews}` в `<ProviderDashboard>`.
  - `src/components/profile/provider/ProviderDashboard.tsx`:
    - В импортах: добавить `Review` в type-import из `@/types` и `getProviderReviews` в named-import из `@/components/profile/provider-helpers`.
    - Prop `reviews?: Review[]` (default `[]`).
    - Вычислить `providerReviews` через `getProviderReviews(reviews, providerClubs.map(c => c.id), providerTrainers.map(t => t.id))` (helper уже есть).
    - **Инлайн-вычисление** `averageRating` (не через `getProviderSummary` — тот ждёт `ProviderIncomingBooking[]`, а у нас `providerBookings: Booking[]`, типы не совпадают; для KPI нужен только averageRating — вытаскиваем 2 строки):
      ```ts
      const averageRating = useMemo(() => {
        if (providerReviews.length === 0) return 0;
        const sum = providerReviews.reduce((acc, r) => acc + r.rating, 0);
        return Math.round((sum / providerReviews.length) * 10) / 10;
      }, [providerReviews]);
      ```
    - Добавить 5-ю `<KpiCard>` в KPI-ряду (после карточки «Непрочитанные»):
      - `testid="provider-dashboard-rating"`
      - `label="Рейтинг"`
      - `value={averageRating}`
      - `caption="Средний балл отзывов"`
      - `href="/profile/provider/reviews"`
    - Grid расширить: `sm:grid-cols-2 xl:grid-cols-5` (было `xl:grid-cols-4`).
    - Edge case: при 0 отзывов KPI покажет значение `0` — это консистентно с остальными count-based карточками. Улучшение до «—» опционально (KpiCard принимает `value: number`, потребует расширения контракта — вне scope фикса).

- **Проверка:**
  - Login provider с reviews на managed-сущности → `/profile/provider/dashboard` → видна 5-я карточка «Рейтинг» с корректным значением.
  - Клик по карточке (wrapping `<Link>` с testid `provider-dashboard-rating-link`) → `/profile/provider/reviews`.

- **Тесты:**
  - `src/test/profile/provider-dashboard.test.tsx` (+1 кейс: рендер с `reviews=[{rating:5,...},{rating:4,...}]` на managed-club — карточка `provider-dashboard-rating` содержит текст `4.5` и обёрнута в link `href="/profile/provider/reviews"`).

- **Ожидаемый результат:**
  - На Dashboard провайдера возвращён средний рейтинг по отзывам — теперь 5 KPI-карточек вместо 4. Helper `getProviderSummary()` в `provider-helpers.ts` остаётся живым (используется в тестах + будущих consumers), но ProviderDashboard его не вызывает.

---

### Step 26.10: Breadcrumb на подмаршрутах ЛК

> Добавлен после manual-теста: на мобильном вьюпорте (< 768px) sidebar скрыт в drawer «☰ Разделы», и пользователь не видит очевидного пути «назад» после клика на Quick Actions / KPI-карточку на Dashboard. На desktop sidebar есть, но breadcrumb всё равно полезен для контекста.

- **Действие:**
  - Новый компонент `src/components/profile/ProfileBreadcrumb.tsx` (client, `'use client'`):
    - Сигнатура: `function ProfileBreadcrumb({ items, variant }: { items: ProfileNavItem[]; variant: 'athlete' | 'provider' })`.
    - Читает `usePathname()` из `next/navigation`.
    - Находит активный `item = items.find(i => i.href === pathname)`.
    - **Return `null`** если: (a) `items.length === 0` (гость или wrong-role — sidebar тоже пустой, breadcrumb не нужен); (b) `item === undefined` (pathname не мэтчит ни один nav item); (c) `item.key === 'dashboard'` (на Dashboard breadcrumb скрыт).
    - Иначе рендерит `<nav aria-label="Хлебные крошки" className="mb-3 text-sm text-muted">`:
      - `<Link href="/profile/{variant}/dashboard" className="hover:text-accent">Обзор</Link>`
      - `<span className="mx-2">/</span>`
      - `<span className="text-ink">{item.label}</span>`
    - Testid на корневом `<nav>`: `profile-breadcrumb`.
  - `src/components/profile/ProfileLayoutShell.tsx`:
    - Импортировать `ProfileBreadcrumb`.
    - Рендерить **внутри правой grid-колонки**, перед `{children}` (иначе breadcrumb займёт grid-ячейку между сайдбаром и контентом и сломает 2-колоночный layout):
      ```tsx
      <div className="min-w-0">
        <ProfileBreadcrumb items={items} variant={variant} />
        {children}
      </div>
      ```

- **Проверка:**
  - Login athlete → `/profile/athlete/dashboard` → `profile-breadcrumb` **нет** в DOM.
  - Login athlete → клик на sidebar «Статистика» → `/profile/athlete/stats` → видна ленточка «Обзор / Статистика». Клик на «Обзор» → возврат на dashboard.
  - Аналогично для provider.
  - Гость на `/profile/athlete/dashboard` (или любой другой подмаршрут) → sidebar пустой, breadcrumb тоже не рендерится (access-denied карточка занимает всю правую колонку).

- **Тесты:**
  - Опционально: `src/test/profile/profile-breadcrumb.test.tsx` (+3: (1) при pathname=dashboard `profile-breadcrumb` не в DOM; (2) на подмаршруте link «Обзор» ведёт на `/profile/athlete/dashboard` + label активного item; (3) items=[] → не рендерится). Логика тривиальна — тест не критичен, но быстр.

- **Ожидаемый результат:**
  - На всех подмаршрутах ЛК кроме Dashboard виден компактный breadcrumb с back-ссылкой на Dashboard. Работает и на desktop, и на mobile. На Dashboard / при пустом items / при несовпадении pathname — breadcrumb гарантированно не рендерится и не ломает layout.

---

### Step 26.11: Финал — manual QA, integration smoke и синхронизация docs

- **Действие:**
  - **Manual QA-чеклист** (документ `project-phases/phase-26-qa-checklist.md`):
    - Athlete: register → login → find club → book → cancel (on-time) → leave review → view stats → update notification preferences.
    - Provider (club): login → publish club → edit club → view incoming booking → confirm → check-in completed → view client in Clients → add note → view stats heatmap → invite trainer.
    - Admin: login → view logs → click «История FSM» → drawer opens → lift quarantine → recompute reliability.
    - Фиксируем только PASS/FAIL — баг-фикс не входит в scope Phase 26.
  - **Integration smoke-тест** (новый автоматизированный):
    - `src/test/integration/phase-26-smoke.test.ts` — проходит основной happy-path атлета (создание booking → cancel → review). Не проверяет каждую кнопку, но проверяет, что цепочка API → db → UI работает вместе.
  - **Синхронизация docs:**
    - `feature-docs/profile-hub.md` — обновить: убрать из «Ограничения MVP» пункты про дубль корневых, read-only Publications, отсутствие UserNotificationPreferencesEditor, копипаст AccessDeniedCard. Оставить «redirect сделан в Phase 26», добавить «AccessDeniedCard — shared-компонент».
    - `feature-docs/notifications.md` (если есть) — добавить секцию про preferences и UI-редактор.
    - `feature-docs/_overview.md` — не требует изменений (домен `profile-hub` уже добавлен).
    - `CLAUDE.md` — секция «Текущее состояние»: Phase 25 остаётся ✅, Phase 26 ✅ ЗАВЕРШЕНА.
    - `PHASES_OVERVIEW.md` — статус Phase 26.
    - `project-phases/phase-26.md` — финальный статус ✅.
    - `PROJECT_STATE.md` — удалить ссылки на `AthleteProfilePage`/`ProviderProfilePage`, добавить `AccessDeniedCard` в ключевые компоненты, `UserNotificationPreferencesEditor` в utils/components.
    - `README.md` — прогресс Phase 26 ✅.
  - **Финальный git:**
    - Ветка `phase-26` остаётся незамёрженной (по указанию пользователя).
    - Последний коммит: `chore(docs): Step 26.7 — финал Phase 26, синхронизация документации`.

- **Проверка:**
  - `npm run format && npm run lint && npm run test && npm run build` — всё зелёное.
  - Количество тестов ≥ 1280 (исходно 1251 + ~25-30 за фазу).
  - 0 lint errors.
  - Manual QA по чеклисту — все пункты PASS.

- **Тесты:**
  - `src/test/integration/phase-26-smoke.test.ts` (+1 большой интеграционный).

- **Ожидаемый результат:**
  - Phase 26 закрыта. Кодовая база чище, UI-функциональность догнана, dev-демо наглядное. Ветка готова к мёржу (когда пользователь решит).

---

### Чек-лист Phase 26

**Step 26.1 — Shared AccessDeniedCard:** ✅
- [x] Новый `src/components/profile/AccessDeniedCard.tsx` с props `{ requiredRole, message?, testId? }`
- [x] Замена в 14 компонентах (5 athlete: Dashboard/Stats/Favorites/Reviews/Settings + 9 provider: Dashboard/Bookings/Clients/Stats/Links/Publications/Reviews/Settings/Finance). *Изначально план назвал 15 — при проверке `AthleteSchedule` оказался без access-gate, поэтому фактически 14.*
- [x] Сохранение existing provider-testid'ов через prop `testId` (9 шт); athlete получают дефолтный `profile-access-denied-athlete`
- [x] Удаление локальных `function AccessDeniedCard()` из 14 файлов + чистка unused imports (Link / Badge / Button / Card / useUIStore в разных сочетаниях)
- [x] Тесты: `src/test/profile/access-denied-card.test.tsx` (+3: provider-only+athlete-session / athlete-only+provider-session / гость видит «Войти»)
- [x] Верификация: 1254/1254 зелёные, 0 errors lint, 11 legacy warnings, build ✓

**Step 26.2 — NotificationsListPage полировка:** ✅
- [x] Фильтры групп (4 таба: Все / Записи / Связи / Дисциплина) через `NOTIFICATION_TYPE_GROUP`. Testid'ы `notifications-filter-group-{all|booking|links|quarantine}`, счётчики внутри каждого таба (от оригинального списка, не от отфильтрованного).
- [x] Группировка по датам (Сегодня / Вчера / Эта неделя / Раньше) через экспортируемый helper `getDateBucket(iso, now)`. Понедельник — начало недели (UTC для детерминизма). Testid'ы секций `notifications-bucket-{today|yesterday|thisWeek|earlier}`, пустые секции скрыты, внутри каждой sort DESC по `createdAt`.
- [x] Тоггл «Только непрочитанные» (`notifications-toggle-unread`, checkbox, клиентская фильтрация `readAt === undefined`). Передача `unreadOnly=true` в API отложена — текущая фильтрация чисто клиентская (страница передаёт уже загруженный список). Серверный параметр уже работает в Phase 24 и используется в `useUnreadCountPolling` для bell-иконки.
- [x] Тесты: `src/test/profile/notifications-list-page-filters.test.tsx` (+5: рендер 4 tab'ов со счётчиками; выбор booking — скрывает link/quarantine; выбор quarantine — только quarantine; toggle отсекает прочитанные; date-buckets распределяют уведомления).
- [x] Existing `notifications-page.test.tsx` (4 кейса) продолжает проходить без правок — testid'ы `notification-item-*` и `notification-item-unread-*` сохранены.
- [x] Верификация: 1259/1259 зелёные, 0 errors lint, 11 legacy warnings, build ✓.

**Step 26.3 — UserNotificationPreferencesEditor:** ✅
- [x] Новый `src/components/profile/UserNotificationPreferencesEditor.tsx` (client) — Card с 3 group-секциями
- [x] Контракт props: `{ userId: number; notificationPreferences?: Partial<Record<NotificationType, boolean>> }` (изначально в плане был `{ user: User }`, переделан на primitives — `useAuthStore.user` имеет тип `AuthSessionUser` без полного User, передавать полный User неоправданно раздувает контракт)
- [x] 3 group-секции (`notification-preferences-group-{booking|links|quarantine}`) с чекбоксами per `NotificationType` (`notification-preferences-toggle-{type}`); label'ы через `getNotificationCopy(type).title` из существующего `notification-copy.ts` (отдельный `getNotificationTypeLabel` не нужен — `getNotificationCopy` уже даёт human-readable title)
- [x] REQUIRED-типы (`booking_confirmed`, `booking_cancelled_by_provider`, `quarantine_start`) — `disabled` на input'е + плашка Badge «Нельзя отключить»; handler `handleToggle` защищает от обхода через native click на disabled input
- [x] Debounced (500мс) PATCH `/api/users/[userId]/notification-preferences` с полным снапшотом prefs + toast 'Настройки уведомлений сохранены' (success) / 'Не удалось сохранить настройки уведомлений' (error); cleanup таймера на unmount
- [x] Интеграция в `AthleteSettings` и `ProviderSettings` через `typeof user.id === 'number'` guard (AuthSessionUser.id опционален) с обёртыванием в `<div className="flex flex-col gap-5">` рядом с существующими секциями. Существующие testid'ы `provider-settings` сохранены.
- [x] Тесты: `src/test/profile/user-notification-preferences-editor.test.tsx` (+6): рендер 3 групп; REQUIRED disabled + non-required enabled; клик → debounced PATCH с правильным body; success toast на 200; error toast на 403; REQUIRED click → нет fetch
- [x] Нюансы тестов: `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(500)` + `await Promise.resolve()` для flushing microtasks (без waitFor — последний висит с fakeTimers)
- [x] Верификация: 1265/1265 зелёные, 0 errors lint, 11 legacy warnings, build ✓

**Step 26.4 — ProviderPublications full CRUD:** ✅
- [x] Перенос state модалок из корневого `ProviderProfilePage`: `isClubModalOpen`, `isTrainerModalOpen`, `clubModalMode`, `trainerModalMode`, `clubEditEntityId`, `trainerEditEntityId`, `clubInitialData`, `trainerInitialData`, `trainerEditClubOption` + `editBootstrapRequestIdRef`
- [x] Перенос handlers: `handlePublishSuccess`, `invalidatePendingEditBootstrap`, `resetClubModalState`, `resetTrainerModalState`, `handleOpenCreateClubModal`, `handleOpenCreateTrainerModal`, `handleEditPublication` (GET /api/clubs/[id] или /api/trainers/[id] + /api/trainer-club-links?trainerId=... параллельно), `handleDeletePublication` (DELETE /api/clubs/[id] / /api/trainers/[id])
- [x] Рендер `<PublishClubModal>` и `<PublishTrainerModal>` внутри `ProviderPublications` со всеми пропами (mode, entityId, initialData, справочники)
- [x] `<ProviderPublicationsSection onEdit={handleEditPublication} onDelete={handleDeletePublication} />` — handlers подключены; ProviderPublicationsSection уже поддерживает эти props из Phase 25
- [x] Добавлены CTA-кнопки «Опубликовать клуб»/«Опубликовать тренера» в отдельной Card (раньше были только в корневом кабинете)
- [x] Удалена плашка «Редактирование через корневой кабинет»
- [x] Расширены props `ProviderPublications`: `{ clubs?, trainers?, sports?, tags?, amenities?, specialties?, workFormats? }` — все опциональные с `[]` default, существующий smoke-тест `<ProviderPublications clubs={[]} trainers={[]} />` не сломан
- [x] Server page `src/app/profile/provider/publications/page.tsx` расширен — `Promise.all` 7 источников: getClubs/getTrainers/getSports/getTags/getAmenities/getSpecialties/getWorkFormats
- [x] Тесты: `src/test/profile/provider-publications-crud.test.tsx` (+6): (1) рендер 2×Редактировать + 2×Удалить + отсутствие плашки; (2) Edit club → fetch `/api/clubs/1` → dialog `Редактировать клуб`; (3) Delete с confirm=true → DELETE → toast «Публикация удалена» + refresh; (4) confirm=false → fetch не вызван; (5) 403 → toast с server-error, без refresh; (6) GET 404 → toast error, модалка не открывается
- [x] Существующий `provider-publications-reviews-settings.test.tsx` обновлён: добавлен `vi.mock('next/navigation')` (новый компонент использует `useRouter` для router.refresh)
- [x] Корневой `ProviderProfilePage` **не тронут** — продолжает работать параллельно с собственным CRUD (финальное удаление — Step 26.5)
- [x] Верификация: 1271/1271 зелёные (+6), 0 errors lint, 11 legacy warnings, build ✓

**Step 26.5 — Redirect корневых + удаление монолитов:** ✅ (3 итерации, 1 коммит)

**Итерация A ✅ — Pre-work: миграция UI в Dashboard + обновление 6 прямых ссылок**
- [x] `AthleteDashboard.tsx` — `athlete-dashboard-account-id` + `athlete-dashboard-city` в шапке
- [x] `ProviderDashboard.tsx` — `provider-dashboard-account-id` + `provider-dashboard-city` + 2 href (256, 428) на `/profile/provider/publications` *(примечание: href:428 был пропущен replace_all из-за разного indent между main CTA и Quick Action — подтянут follow-up коммитом после code-review)*
- [x] `BookingActionBlock.tsx:189` → `/profile/athlete/dashboard`
- [x] `ProviderLinks.tsx:261` → `/profile/provider/publications`
- [x] `ProviderClients.tsx:346` → `/profile/provider/publications`
- [x] `MobileNav.tsx:60` → `/profile/athlete/dashboard`
- [x] Обновили тесты на href: `booking-action-block.test.tsx` (2) и `booking-flow-integration.test.tsx` (2) — все с `/profile/athlete/dashboard`
- [x] Чекпоинт: 1271/1271 зелёных перед Итерацией B

**Итерация B ✅ — Redirect + удаление монолитов**
- [x] `src/app/profile/athlete/page.tsx` — `redirect('/profile/athlete/dashboard')`
- [x] `src/app/profile/provider/page.tsx` — `redirect('/profile/provider/dashboard')`
- [x] Удалён `AthleteProfilePage.tsx` (573)
- [x] Удалён `ProviderProfilePage.tsx` (618)
- [x] `AthleteHistorySection.tsx` — orphan header-комментарий
- [x] `ProviderLinkRequestsSection.tsx` — orphan header-комментарий (тест `provider-link-requests-section.test.tsx` продолжает работать)
- [x] Обновлены устаревшие комменты в `/dashboard/page.tsx` обеих ролей
- [x] Grep-валидация: 0 импортов `AthleteProfilePage|ProviderProfilePage` в продакшн

**Итерация C ✅ — Обновление тестов**
- [x] `athlete-reviews-page.test.tsx` (+1 pagination-кейс с `fireEvent.click` — `.click()` без fireEvent не обновляет React-state)
- [x] Удалён `src/test/profile/athlete-profile-page.test.tsx` (20 тестов)
- [x] Удалён `src/test/profile/provider-profile-page.test.tsx` (16 тестов)
- [x] **Вскрылось:** 3 integration-теста жёстко завязаны на монолиты (`booking-flow-integration.test.tsx` 7 кейсов, `dynamic-publish-flow.test.tsx` 3 кейса, `edit-public-surfaces-flow.test.tsx` 2 кейса) — они импортировали `ProviderProfileRoute`/`AthleteProfileRoute`, которые теперь только redirect'ят. **Решение:** удалить все 3 файла (12 тестов) — концепция «один монолит с всеми фичами» больше не релевантна; покрытие восстановит новый `phase-26-smoke.test.ts` в Step 26.8
- [x] Переписан `src/test/profile/profile-city-display.test.tsx` — рендерит `AthleteDashboard`/`ProviderDashboard`; для провайдера фикстура с `managedByUserId=1` чтобы Dashboard не уходил в empty-state
- [x] Переписан `src/test/admin/profile-account-id.test.tsx` — аналогично, dummy-клуб для провайдера
- [x] Обновлён `src/test/ui/runtime-dynamic-pages.test.ts` — удалены импорты монолит-модулей + test-case
- [x] Создан `src/test/ui/profile-root-redirects.test.tsx` (+3 кейса через `vi.hoisted` для redirectMock): athlete redirect / provider redirect / MobileNav href
- [x] Итоговая верификация: **1226/1226 зелёных (−45)**, 0 errors lint, 11 legacy warnings, build ✓

**Итоговые метрики:**
- Тесты: 1271 → **1226** (−45: удалены 20 athlete-monolith + 16 provider-monolith + 12 integration + 1 runtime-case = 49; добавлены 3 redirect + 1 pagination = 4; итого −45)
- Удалено кода: ~**1700 строк** (573 AthleteProfilePage + 618 ProviderProfilePage + ~500 строк integration-тестов)
- Добавлено кода: ~80 строк (2 redirect-page'а + 2 ID/city блока в Dashboard'ах + новые тесты)
- **Чистое изменение: −1600 строк** в продакшн+тест коде

**Orphan-компоненты (остаются с header-маркерами):**
- `AthleteHistorySection.tsx` — без теста
- `ProviderLinkRequestsSection.tsx` — со своим тестом (продолжает работать)

**Что НЕ тронули:** `useAuthStore.profilePath` остаётся `/profile/athlete | /profile/provider` — redirect работает для Header и admin impersonation; тесты useAuthStore/profile-nav-items не ломаются.

**Отложено на Step 26.8:** новый integration smoke-тест `phase-26-smoke.test.ts` (восстанавливает покрытие удалённых 12 integration-тестов в контексте новой архитектуры хаб-подмаршруты).

**Step 26.6 — Seed-обогащение до 7 юзеров + analytics-изоляция:** ✅
- [x] `src/test/helpers/seed-fixtures.ts` → `fixtureUsers` (3: athlete=1, club_owner=2, admin=3) + `seedTestData()` пишет `users.json`
- [x] `src/data/users.json` расширен до 7 записей: id=1-3 existing + id=4 club_owner (Дмитрий Соколов) + id=5 club_owner (Анна Иванова — при регистрации UI все провайдеры попадают в `role='club_owner'`, потом через publish-flow могут публиковать клуб или тренера) + id=6/7 athletes (Ольга/Иван). Non-admin — password `"demo"`.
- [x] Тесты: `src/test/lib/seed-fixtures-users.test.ts` (+2: fixtureUsers структура + getUsers возвращает 3 из isolated)
- [x] Все 1228/1228 зелёные (+2), `analytics.route.test.ts` продолжает работать от isolated fixtures
- [x] hotfix Step 26.5: `ProviderDashboard.tsx:428` — Quick Action «Опубликовать новое» → `/profile/provider/publications` (подтянут после code-review)
- [ ] **Отложено на Step 26.7/manual:** обогащение `clubs.json`/`trainers.json`/`bookings.json`/`trainer-club-links.json`/`provider-client-notes.json` — dev-данные уже содержат пользовательские записи из publish-flow, ломать их seed'ом не стоит. При manual QA после fake-auth (26.7) user сам заполнит через UI.

**Step 26.7 — Fake auth по email:** ✅
- [x] `db.createUser(data: Omit<User, 'id' | 'createdAt'>)` — паттерн createTrainerClubLink; id/createdAt назначает сервер, email-unique check на уровне роута.
- [x] `POST /api/auth/login` — Zod {email, accountType, password?}; 404 missing, 403 admin→/service-portal, 403 role↔accountType mismatch; возвращает sanitized user без password.
- [x] `POST /api/auth/register` — Zod + 409 на дубликат email + createUser; role-mapping: athlete→'athlete', provider→'club_owner'.
- [x] `AuthModal.tsx`: `handleLoginSubmit`/`handleRegisterSubmit` переведены на `async fetch`; удалены `createLoginSessionUser` + `createRegisterSessionUser` + `submitTimeoutRef`/`AUTH_SUBMIT_DELAY_MS` (setTimeout 600мс больше не нужен, fetch даёт реальную задержку); импорты `MVP_ATHLETE_USER_ID`/`MVP_PROVIDER_USER_ID`/`AuthSessionUser`/`useEffect`/`useRef` удалены.
- [x] Ошибки сервера (404/409) → `setLoginErrors({ email })`/`setRegisterErrors({ email })`, модалка остаётся открытой, isSubmitting=false.
- [x] Контракт `useAuthStore.login/register` не менялся — 162 существующих тестовых вызова остались без правок.
- [x] `src/test/auth/auth-modal.test.tsx` — полностью переписан на fetchMock (fake-timers убраны, `vi.advanceTimersByTime(600)` → `await waitFor`); +2 error-case теста (404 login / 409 register).
- [x] Тесты: auth.login.route (+4), auth.register.route (+4), db-create-user (+2), auth-modal.test.tsx (11 total, 2 из них новые error-cases, остальные переработаны из fake-timers → fetchMock) = +12
- [x] Верификация: 1240/1240 ✓ (+12), 0 errors lint, build ✓.

**Step 26.8 — Финал:** ✅
- [x] `project-phases/phase-26-qa-checklist.md` — manual чеклист для 3 ролей с seed-таблицей (id=1-7) и 6 секциями (auth / redirect / подмаршруты / access-gate / link-flow / notification preferences)
- [x] `src/test/integration/phase-26-smoke.test.ts` (+3): register создаёт user в users.json; register → login для нового user работает; mismatch role↔accountType → 403
- [x] `feature-docs/auth.md` — добавлена строка Phase 26 Step 26.7 в «Связанные фазы»; Ограничения MVP: legacy пункты зачёркнуты, добавлен комментарий про plaintext password
- [x] `feature-docs/profile-hub.md` — в Phase 26 строку добавлены все Steps 26.1-26.8
- [x] `CLAUDE.md` / `PHASES_OVERVIEW.md` / `PROJECT_STATE.md` / `README.md` — статус Phase 26 ✅
- [x] `project-phases/phase-26.md` — финальный статус ✅
- [x] `npm run format / lint / test / build` — всё зелёное; 1243/1243 тестов
- [x] Все 8 степов закоммичены на ветку `phase-26`

> **Phase 26 была помечена ✅ ЗАВЕРШЕНА на 26.8**, но при manual-тесте пользователь нашёл 3 UX-проблемы (мусор-группа `links` у атлета, пропавший рейтинг провайдера, отсутствие breadcrumb-навигации). Фаза переоткрыта — добавлены Steps 26.8/26.9/26.10 (UX-фиксы), старый финал переименован в Step 26.11. Все 8 уже сделанных коммитов остаются, добавятся ещё 4.

**Step 26.8 — Фильтр группы «Связи» у атлета (Settings + Notifications):** ✅
- [x] `UserNotificationPreferencesEditor.tsx` — prop `accountType`, `visibleGroups.map` (athlete → без `links`)
- [x] `AthleteSettings.tsx` / `ProviderSettings.tsx` — прокинут `accountType`
- [x] `NotificationsListPage.tsx` — prop `accountType`, tab `links` скрыт у athlete, reset `activeGroup` через useEffect если вышел из visibleGroupKeys
- [x] `app/profile/athlete/notifications/page.tsx` / `provider/notifications/page.tsx` — прокинут `accountType`
- [x] Тесты: +1 editor (athlete без `group-links`) +1 NotificationsListPage (athlete без `filter-group-links`), existing рендеры во всех 3 файлах тестов обновлены с явным `accountType`
- [x] Верификация: 1245/1245 зелёные (+2), 0 errors lint, 12 legacy warnings, build ✓

**Step 26.9 — KPI-карточка «Рейтинг» в ProviderDashboard:** ✅
- [x] `dashboard/page.tsx` — `getReviews()` в `Promise.all`, prop `reviews`
- [x] `ProviderDashboard.tsx` — импорты `Review` + `getProviderReviews`; инлайн `averageRating` (не `getProviderSummary` — несовместимые типы Booking/ProviderIncomingBooking); 5-я KpiCard (testid `provider-dashboard-rating`, href `/profile/provider/reviews`)
- [x] Grid: `xl:grid-cols-4` → `xl:grid-cols-5`
- [x] Тест: +1 кейс (2 reviews, rating=5+4 → `4.5` в карточке, link `provider-dashboard-rating-link` на `/profile/provider/reviews`)
- [x] Верификация: 1246/1246 зелёные (+1), 0 errors lint, 12 legacy warnings, build ✓

**Step 26.10 — Breadcrumb в ProfileLayoutShell:** ✅
- [x] Новый `src/components/profile/ProfileBreadcrumb.tsx` (`{ items, variant }`, `usePathname`, null на Dashboard / при items=[] / при pathname-mismatch, testid `profile-breadcrumb`)
- [x] Интеграция в `ProfileLayoutShell.tsx` внутри правой grid-колонки (`<div className="min-w-0">`), перед `{children}`
- [x] Тесты: `profile-breadcrumb.test.tsx` (+5: Dashboard → null, подмаршрут athlete → «Обзор» link + label, подмаршрут provider → link на `/profile/provider/dashboard`, items=[] → null, mismatch pathname → null)
- [x] Верификация: 1251/1251 зелёные (+5), 0 errors lint, 12 legacy warnings, build ✓

**Step 26.11 — Финал (бывший 26.8):** ✅
- [x] `phase-26-qa-checklist.md` обновлён: athlete settings → 2 группы (без «Связи»), notifications → 3 tab'а; 5-я KPI «Рейтинг» в provider dashboard; новый раздел «Breadcrumb на подмаршрутах ЛК»; новая секция 7 «Финал 26.8–26.10 (UX-фиксы после первого manual QA)»
- [x] `phase-26-smoke.test.ts` без изменений (покрывает auth, фильтры группы не смокаются — есть unit-тесты)
- [x] `feature-docs/profile-hub.md` обновлён: KPI провайдера → 5 карточек, athlete settings — 2 группы, секция «Навигация» — breadcrumb, секция Notification preferences — про accountType, таблица «Связанные фазы» — Phase 26 ✅ со всеми 11 степами
- [x] `feature-docs/notifications.md` обновлён: в Step 26.2 добавлена связь с 26.8 (accountType в NotificationsListPage), таблица фаз — Phase 26 Step 26.8 ✅
- [x] `CLAUDE.md` / `PHASES_OVERVIEW.md` — финал фазы ✅
- [x] `PROJECT_STATE.md` обновлён: UserNotificationPreferencesEditor с accountType, новый `ProfileBreadcrumb`
- [x] `README.md` — Phase 26 ✅, описание MVP дополнено (5-я KPI «Рейтинг», breadcrumb, athlete без «Связи»)
- [x] `npm run format / lint / test / build` — всё зелёное, 1251/1251 ✓
- [x] Все 11 степов закоммичены на ветку `phase-26`

---

**Выполнено:** Step 26.1–26.11 ✅ ФАЗА ЗАВЕРШЕНА. Финал: shared `AccessDeniedCard` (15 замен), фильтры/группировка в `NotificationsListPage`, `UserNotificationPreferencesEditor` в Settings, `ProviderPublications` full CRUD, redirect корневых `/profile/*` + удаление монолитов `AthleteProfilePage`/`ProviderProfilePage` (~1200 строк), seed расширен до 7 юзеров (3 provider + 3 athlete + 1 admin) + изоляция analytics-теста через `fixtureUsers`, fake auth по email через `/api/auth/login` + `/api/auth/register` + `db.createUser`, скрытие группы `links` у athlete в Settings и Notifications, 5-я KPI «Рейтинг» в `ProviderDashboard`, `ProfileBreadcrumb` на подмаршрутах ЛК.

**Следующий шаг:** — (Phase 26 завершена; все 11 степов закоммичены на ветку `phase-26`).

**Статус Phase 26:** ✅ ЗАВЕРШЕНА

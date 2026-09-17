# Phase 17

> Этот файл содержит одну фазу проекта целиком. Главный вход в контекст — `CLAUDE.md`.
> Навигация по фазам — через `PHASES_OVERVIEW.md`.
> В ежедневной работе открывай прежде всего активную фазу и не перечитывай все phase-файлы подряд без необходимости.
> Структура фазы сохраняется в исходном стиле: заголовок фазы, краткий результат, шаги по порядку, затем чеклист и статус.
> Перед стартом новой фазы проверь, что для неё уже есть отдельный `phase-XX.md`, и после завершения шагов или фазы синхронизируй статус здесь, в `PHASES_OVERVIEW.md`, `CLAUDE.md`, `README.md` и при необходимости в `STACK_OVERVIEW.md`.

## Phase 17: Super Admin — сервисная панель и impersonation

> После этой фазы: в проекте появляется третий seed-пользователь с ролью `admin`, сервисная панель `/service-portal` с фейк-авторизацией, списком всех пользователей (фильтр по ролям, поиск по ID), карточками аккаунтов с базовой статистикой, и механизм impersonation — админ может войти под любым пользователем и выполнять действия от его имени через существующий ЛК. В профилях спортсмена и провайдера отображается ID аккаунта. У пользователей появляется поле `status` для будущего механизма блокировки.

Phase 17 не делает production admin-panel.
Это MVP-фаза на текущем fake-auth сценарии и существующей архитектуре проекта.
Работаем с тремя seed-пользователями:
- `userId=1` — athlete;
- `userId=2` — provider;
- `userId=3` — admin (новый).

Новые регистрации и реальная аутентификация не учитываются.
Impersonation реализуется через текущий Zustand auth store без изменения существующего auth-механизма.
Все admin-действия над пользовательскими данными выполняются через существующие ЛК и существующие API — без дублирования бизнес-логики.

**Ключевые решения:**

- Super Admin — это третий seed-пользователь с `role: 'admin'`.
- В `UserRole` значение `'admin'` уже существует (types/index.ts:8) — менять тип не нужно.
- В тип `User` добавляется опциональное поле `status?: 'active' | 'banned' | 'suspended'` — в этой фазе используется только `active`, но поле закладывается для будущих фаз (блокировка, модерация). Поле optional для обратной совместимости с test fixtures.
- Вход в admin-панель — через отдельную страницу `/service-portal` (не `/admin` — слишком очевидный путь для ботов и сканеров).
- На `/service-portal` форма логин/пароль работает как **фейк-вход** (аналог текущей AuthModal): реальная серверная валидация credentials не производится, при "входе" клиент создаёт admin-сессию через `adminLogin()` с hardcoded данными seed-пользователя (id=3). Любой валидный email проходит — консистентно с основным fake-auth flow.
- Auth store расширяется **параллельным admin-треком**: `AuthAccountType` остаётся `'provider' | 'athlete'` без изменений. Вместо проверки `currentUser.role` (которого нет в `AuthSessionUser`) вводится отдельный boolean `isAdmin` в state.
- `adminOriginalUser` типизируется как `AuthSessionUser | null` (НЕ `User | null`) — полный `User` содержит `password`, который нельзя хранить в localStorage.
- `startImpersonation` принимает два аргумента: `(targetUser: AuthSessionUser, targetAccountType: AuthAccountType)` — accountType ОБЯЗАТЕЛЕН, потому что профильные страницы проверяют `accountType` из store (`athlete`/`provider`). Без переключения `accountType` админ увидит "Доступ запрещён" вместо ЛК.
- Утилита `userRoleToAccountType(role)` маппит DB-роль в frontend accountType: `athlete` → `'athlete'`, `club_owner`/`trainer` → `'provider'`, `admin` → `null`.
- Новые поля store (`isAdmin`, `isImpersonating`, `adminOriginalUser`) ОБЯЗАТЕЛЬНО добавляются в `partialize` Zustand persist — иначе при перезагрузке страницы админ потеряет контекст impersonation и застрянет под чужим аккаунтом.
- Header расширяется: если `isAdmin && !isImpersonating` → показывает "Панель управления" → `/service-portal/dashboard` вместо стандартной ссылки на кабинет.
- После входа админ попадает на `/service-portal/dashboard` — список всех пользователей платформы.
- Dashboard содержит: расширенный поиск с комбинируемыми фильтрами, карточки пользователей с базовой информацией и статистикой из существующих данных. Статистика переиспользует существующие хелперы (`getAthleteActiveFutureBookings`, `getProviderClubs`, `getProviderTrainers`), а не дублирует логику.
- **Поиск в dashboard:** базовое текстовое поле (поиск по ID, имени или email одной строкой) + кнопка «Фильтры» → динамически раскрывает дополнительные поля (роль, статус). Фильтры комбинируются: можно искать по одному параметру или по нескольким одновременно (например, "athlete" + "active" + часть имени). При выборе дополнительных фильтров поля появляются динамически, без перезагрузки.
- Impersonation: кнопка «Войти как пользователь» в карточке юзера. Технически — вызов `startImpersonation(targetSessionUser, targetAccountType)` с сохранением admin-сессии в `adminOriginalUser` для возврата.
- При активном impersonation сверху всех страниц отображается admin-плашка (в AppShell ПЕРЕД Header): «Вы работаете от имени [Имя] #[ID] — [Вернуться в панель]».
- После impersonation админ видит стандартный ЛК пользователя (спортсмена или провайдера) и может выполнять все доступные действия: редактировать публикации, отменять записи и т.д. Это работает без изменений API, потому что API получают `userId` из request body → при impersonation это id целевого пользователя.
- При выходе из impersonation админ возвращается в `/service-portal/dashboard`.
- В ЛК спортсмена и провайдера добавляется отображение ID аккаунта (например, `ID: #1`) в блоке профиля.
- Guard для `/service-portal/*` реализуется через client-side layout guard в route group `(admin)` — проверка `isAuthenticated && isAdmin` с redirect. Это согласуется с существующими guard'ами (AthleteProfilePage, ProviderProfilePage). Middleware.ts НЕ добавляется.
- Структура `/service-portal/` закладывается модульной: `dashboard` сейчас, заглушки для `analytics`, `moderation`, `finance` — опционально в этой фазе как placeholder-страницы.
- Phase 17 не добавляет новых технологий и зависимостей — работа внутри текущего `Next.js + React + Tailwind + Zustand + Zod + JSON` контура.
- **Навигация admin между панелью и основным сайтом:** в admin layout добавляется ссылка «Открыть сайт» → `/` (главная в основном layout). На основном сайте Header показывает «Панель управления» → `/service-portal/dashboard`. При impersonation плашка с «Вернуться в панель» видна на всех страницах. Итого маршрут: dashboard → сайт → dashboard → ЛК пользователя → dashboard — без потери контекста.
- **Блокировка AuthModal для admin-сессии:** если `isAdmin === true`, основная AuthModal блокируется (не открывается или показывает предупреждение). Это предотвращает случайную потерю admin-сессии при попытке войти через пользовательский auth-flow. В будущем бизнес-логику можно будет смягчить.
- Реальная блокировка пользователей, модерация, финансовая аналитика, серверная валидация credentials и расширенные admin-функции остаются вне scope.

**Архитектура auth — параллельный admin-трек (ноль breaking changes):**

```
AuthState (расширенный):
├── user: AuthSessionUser | null          — текущий пользователь (или impersonated)
├── accountType: AuthAccountType | null   — 'provider' | 'athlete' | null (без изменений типа)
├── isAuthenticated: boolean
├── isAdmin: boolean                      — NEW: true = admin-сессия
├── isImpersonating: boolean              — NEW: true = активный impersonation
├── adminOriginalUser: AuthSessionUser | null — NEW: сохранённая admin-сессия
├── login / register / logout             — существующие actions (без изменений)
├── adminLogin(user)                      — NEW: вход как admin
├── startImpersonation(user, accountType) — NEW: вход под пользователем
└── stopImpersonation()                   — NEW: возврат к admin-сессии
```

**Переходы состояний:**

| Действие | user | accountType | isAdmin | isImpersonating | adminOriginalUser |
|----------|------|-------------|---------|-----------------|-------------------|
| adminLogin | adminUser | null | true | false | null |
| startImpersonation | targetUser | athlete/provider | true | true | adminUser |
| stopImpersonation | adminUser | null | true | false | null |
| logout (любой момент) | null | null | false | false | null |

### Step 17.1: Расширить доменную модель — роль admin, статус пользователя, seed-данные

- **Действие:**
  - добавить тип `UserStatus = 'active' | 'banned' | 'suspended'` в `src/types/index.ts`;
  - добавить опциональное поле `status?: UserStatus` в тип `User` (optional для обратной совместимости с test fixtures);
  - обновить `users.json` — добавить `"status": "active"` к обоим существующим пользователям;
  - создать seed-пользователя `userId=3` с `role: 'admin'`, `status: 'active'` в `users.json`;
  - добавить `USER_STATUSES` массив в `src/lib/constants.ts`;
  - экспортировать `MVP_ADMIN_USER_ID = 3` из `src/stores/useAuthStore.ts`;
  - убедиться, что существующий код (auth store, ЛК, API guards) не ломается от нового пользователя и новых полей.

- **Проверка:**
  - тип `User` содержит опциональный `status` и поддерживает `role = 'admin'`;
  - seed admin-пользователь доступен в `users.json`;
  - существующие пользователи получили `status: 'active'`;
  - текущий auth-flow и ЛК не затронуты.

- **Тесты:**
  - тест на наличие admin seed-пользователя в users.json (через isolated data directory);
  - тест что `UserStatus` принимает `'active' | 'banned' | 'suspended'`;
  - regression тесты на существующий auth-flow.

- **Ожидаемый результат:**
  - доменная модель готова к admin-функционалу без breaking changes.

### Step 17.2: Расширить auth store — поддержка admin-входа и impersonation

- **Действие:**
  - добавить в Zustand auth store новые поля:
    - `isAdmin: boolean` (default: `false`) — флаг admin-сессии;
    - `isImpersonating: boolean` (default: `false`) — флаг активного impersonation;
    - `adminOriginalUser: AuthSessionUser | null` (default: `null`) — сохранённая admin-сессия при impersonation;
  - добавить actions:
    - `adminLogin(user: AuthSessionUser)` — устанавливает `user`, `isAuthenticated = true`, `isAdmin = true`, `accountType = null`;
    - `startImpersonation(targetUser: AuthSessionUser, targetAccountType: AuthAccountType)` — сохраняет текущего админа в `adminOriginalUser`, устанавливает `targetUser` как `user`, устанавливает `targetAccountType` как `accountType`, ставит `isImpersonating = true`; доступен только если `isAdmin === true`;
    - `stopImpersonation()` — возвращает `adminOriginalUser` как `user`, сбрасывает `accountType = null`, `isImpersonating = false`, `adminOriginalUser = null`;
  - добавить утилиту `userRoleToAccountType(role: UserRole): AuthAccountType | null` — маппинг DB-роли в frontend accountType;
  - обновить `AUTH_STORE_DEFAULT_STATE` с новыми дефолтами (`isAdmin: false`, `isImpersonating: false`, `adminOriginalUser: null`);
  - расширить `partialize` на `isAdmin`, `isImpersonating`, `adminOriginalUser` — без этого новые поля не переживут перезагрузку страницы;
  - модифицировать `logout` — полный сброс всех полей включая admin/impersonation;
  - существующие actions (`login`, `register`) не должны ломаться.

- **Проверка:**
  - `adminLogin` устанавливает admin-сессию с `accountType = null`;
  - `startImpersonation` переключает `user` И `accountType` на целевого пользователя;
  - `stopImpersonation` полностью восстанавливает admin-сессию;
  - `logout` во время impersonation очищает всё;
  - новые поля персистятся в localStorage и восстанавливаются при перезагрузке.

- **Тесты:**
  - unit тесты на `adminLogin` — состояние после входа;
  - unit тесты на `startImpersonation` / `stopImpersonation` — переключение user И accountType;
  - тест что `startImpersonation` не работает если `isAdmin !== true`;
  - тест на полный `logout` при impersonation;
  - тест на persistence — rehydration новых полей;
  - тест на `userRoleToAccountType` — маппинг всех ролей;
  - regression тесты на обычный `login` / `register` / `logout` flow.

- **Ожидаемый результат:**
  - auth store поддерживает параллельный admin-трек и impersonation без изменения существующего auth-механизма (`AuthAccountType` остаётся `'provider' | 'athlete'`).

### Step 17.3: Страница входа `/service-portal` и admin auth guard

- **Действие:**
  - создать страницу `/service-portal` (`src/app/service-portal/page.tsx`) с формой логин/пароль;
  - форма работает как **фейк-вход** (аналог текущей AuthModal): реальная серверная проверка не производится; при "входе" клиент вызывает `adminLogin()` с hardcoded данными admin-пользователя (id=3) — любой валидный email проходит (консистентно с основным фейк-auth);
  - после "успешного входа" — редирект на `/service-portal/dashboard`;
  - создать client-side layout guard через route group `(admin)` (`src/app/service-portal/(admin)/layout.tsx`) — все вложенные страницы доступны только при `isAuthenticated && isAdmin` из auth store;
  - если неавторизованный пользователь пытается открыть `/service-portal/dashboard` — редирект на `/service-portal`;
  - `/service-portal` использует свой минимальный layout (НЕ AppShell с основной навигацией);
  - страница `/service-portal` не должна быть доступна через основную навигацию (header, footer) — это скрытый маршрут;
  - создать компонент формы `src/components/admin/ServicePortalLoginForm.tsx`.

- **Проверка:**
  - фейк-вход работает для любого валидного email (консистентно с основным auth);
  - guard защищает все вложенные страницы в route group `(admin)`;
  - страница не видна в навигации.

- **Тесты:**
  - тест на фейк-вход admin (seed email);
  - тест на фейк-вход admin (произвольный email — тоже работает);
  - тест на guard redirect для неавторизованного доступа к dashboard;
  - render тест формы.

- **Ожидаемый результат:**
  - admin-панель защищена фейк-auth guard'ом и не пересекается с пользовательскими маршрутами.

### Step 17.4: Dashboard — список пользователей, фильтры, поиск

- **Действие:**
  - создать server page `/service-portal/(admin)/dashboard/page.tsx` — загрузка данных через `Promise.all` (паттерн из profile pages);
  - создать client component `src/components/admin/DashboardPage.tsx`;
  - загрузить список всех пользователей (кроме самого admin id=3) из `users.json` через server component;
  - для каждого пользователя показать карточку:
    - ID аккаунта (`#1`, `#2`);
    - имя;
    - роль (athlete / provider);
    - статус (`active` / `banned` / `suspended`);
    - краткая статистика из существующих данных:
      - для athlete: количество активных записей (через `getAthleteActiveFutureBookings` из `athlete-bookings.ts`);
      - для provider: количество публикаций (через `getProviderClubs` / `getProviderTrainers` из `provider-helpers.ts`);
  - реализовать расширенный поиск с комбинируемыми фильтрами:
    - **базовое текстовое поле** — поиск по ID, имени или email одной строкой (универсальный quick search);
    - **кнопка «Фильтры»** — при клике динамически раскрывает дополнительные поля:
      - фильтр по роли (Все / Спортсмены / Провайдеры) — табы или select;
      - фильтр по статусу (Все / Активные / Заблокированные / Приостановленные) — select;
    - фильтры **комбинируются**: можно искать по одному параметру (только ID), по двум (имя + роль), или по всем сразу (email + роль + статус);
    - при выборе дополнительных фильтров поля появляются/скрываются динамически без перезагрузки;
    - результаты фильтрации обновляются в реальном времени при вводе;
  - в карточке — кнопка «Войти как пользователь»;
  - статистику переиспользовать из существующих хелперов — НЕ дублировать логику.

- **Проверка:**
  - dashboard показывает всех пользователей (кроме admin) с корректными данными;
  - текстовый поиск находит по ID, имени и email;
  - фильтр по ролям работает отдельно и в комбинации с текстовым поиском;
  - фильтр по статусу работает отдельно и в комбинации;
  - комбинация всех фильтров одновременно корректно сужает выборку;
  - динамическое раскрытие/скрытие фильтров работает без ошибок;
  - статистика соответствует реальным данным в JSON.

- **Тесты:**
  - render тесты на dashboard с пользователями;
  - тест на текстовый поиск по ID, имени, email;
  - тесты на фильтрацию по ролям;
  - тесты на фильтрацию по статусу;
  - тест на комбинированный поиск (текст + роль + статус одновременно);
  - тест на динамическое раскрытие панели фильтров;
  - тесты на статистику (0 записей, N записей);
  - empty-state тест (нет результатов по фильтру).

- **Ожидаемый результат:**
  - admin видит полную картину пользователей платформы с возможностью быстрого поиска.

### Step 17.5: Impersonation flow — вход под пользователем и admin-плашка

- **Действие:**
  - при клике «Войти как пользователь» в dashboard:
    - из полного `User` объекта (полученного через server component) конструируется `AuthSessionUser` (без password, role, favoriteClubIds);
    - вычисляется `targetAccountType` через `userRoleToAccountType(user.role)`;
    - вызвать `startImpersonation(targetSessionUser, targetAccountType)`;
    - редирект на ЛК соответствующего пользователя (`/profile/athlete` или `/profile/provider`);
  - создать компонент `src/components/admin/ImpersonationBanner.tsx`, который отображается при `isImpersonating === true`:
    - размещается в `AppShell.tsx` **ПЕРЕД** `<Header />` внутри общей sticky-обёртки (`sticky top-0 z-40`) → виден на ВСЕХ страницах, не перекрывает Header при скролле;
    - текст: «Вы работаете от имени [Имя Фамилия] #[ID] — [Вернуться в панель]»;
    - кнопка «Вернуться в панель» вызывает `stopImpersonation()` и редирект на `/service-portal/dashboard`;
  - расширить `Header.tsx`: если `isAdmin && !isImpersonating` → показывать «Панель управления» со ссылкой на `/service-portal/dashboard` вместо стандартной ссылки на кабинет;
  - добавить ссылку «Открыть сайт» → `/` в admin layout (sidebar/header admin-панели) — для навигации из dashboard на основной сайт;
  - **блокировка AuthModal для admin:** если `isAdmin === true`, основная AuthModal не открывается (или показывает предупреждение «Вы авторизованы как администратор»). Это предотвращает случайную потерю admin-сессии при попытке войти через пользовательский auth-flow;
  - при активном impersonation все существующие действия в ЛК (edit publication, cancel booking, и т.д.) работают от имени target-пользователя — без изменения текущих API и компонентов (API получают userId из request body → при impersonation это id целевого пользователя);
  - admin-плашка должна быть визуально заметной и не перекрывать UI (баннер и Header в общей sticky-обёртке);
  - кнопка «Выйти» в Header при активном impersonation вызывает `stopImpersonation()` + redirect в `/service-portal/dashboard` вместо полного `logout()` (сохраняет admin-сессию);
  - **полный маршрут навигации admin:** dashboard → «Открыть сайт» → главная/каталоги (Header: «Панель управления») → dashboard → «Войти как пользователь» → ЛК (плашка: «Вернуться в панель») → dashboard.

- **Проверка:**
  - после impersonation админ видит ЛК выбранного пользователя (accountType переключён корректно);
  - все действия в ЛК работают корректно от имени target-пользователя;
  - admin-плашка видна на всех страницах;
  - Header показывает "Панель управления" для admin без impersonation;
  - возврат в панель работает стабильно;
  - после возврата currentUser снова admin, accountType снова null;
  - ссылка «Открыть сайт» ведёт на главную;
  - AuthModal не открывается при активной admin-сессии;
  - полный маршрут навигации (dashboard → сайт → dashboard → ЛК → dashboard) работает без потери контекста.

- **Тесты:**
  - integration тест: impersonation → ЛК → действие → stopImpersonation;
  - render тест admin-плашки (видимость, данные, кнопка);
  - тест что плашка не показывается без impersonation;
  - тест на redirect при start/stop impersonation;
  - тест на Header: "Панель управления" для admin, стандартная навигация для обычных пользователей;
  - тест на блокировку AuthModal при admin-сессии;
  - тест на навигацию: admin layout → «Открыть сайт» → главная → «Панель управления» → dashboard.

- **Ожидаемый результат:**
  - impersonation работает как сквозной механизм — админ может выполнять любые пользовательские действия без дублирования кода.

### Step 17.6: Добавить ID аккаунта в ЛК спортсмена и провайдера

- **Действие:**
  - в блоке профиля ЛК спортсмена (`/profile/athlete`) добавить отображение ID аккаунта, например: `ID: #1`;
  - в блоке профиля ЛК провайдера (`/profile/provider`) добавить аналогичное отображение;
  - ID берётся из `currentUser.id`;
  - визуально — мелкий текст рядом с именем или в блоке информации, не навязчиво.

- **Проверка:**
  - ID отображается корректно в обоих ЛК;
  - ID соответствует реальному user.id;
  - не ломает текущий layout профиля.

- **Тесты:**
  - render тесты на наличие ID в athlete profile;
  - render тесты на наличие ID в provider profile.

- **Ожидаемый результат:**
  - пользователь может назвать свой ID для обращения в поддержку, админ может найти его по этому ID.

### Step 17.7: Заглушки для будущих admin-разделов (опционально)

- **Действие:**
  - создать placeholder-страницы внутри route group `/service-portal/(admin)/`:
    - `/service-portal/analytics` — «Аналитика — в разработке»;
    - `/service-portal/moderation` — «Модерация — в разработке»;
    - `/service-portal/finance` — «Финансы — в разработке»;
  - добавить навигацию внутри admin layout: sidebar или табы с ссылками на dashboard и заглушки;
  - заглушки — это просто layout + текст, без логики.

- **Проверка:**
  - все placeholder-страницы открываются без ошибок;
  - навигация внутри admin-панели работает;
  - guard защищает и placeholder-страницы (они внутри route group `(admin)`).

- **Тесты:**
  - render тесты на placeholder-страницы;
  - navigation тесты внутри admin layout.

- **Ожидаемый результат:**
  - структура admin-панели заложена модульно — новые разделы добавляются без изменения архитектуры.

### Step 17.8: Проверить сквозную интеграцию admin-flow

- **Действие:**
  - проверить полные сценарии:
    - admin входит через `/service-portal` (фейк-вход);
    - видит dashboard с пользователями;
    - фильтрует по ролям, ищет по ID;
    - входит под provider — редактирует публикацию — возвращается в панель;
    - входит под athlete — отменяет запись — возвращается в панель;
  - отдельно проверить edge-cases:
    - попытка входа с произвольным email через `/service-portal`;
    - прямой доступ к `/service-portal/dashboard` без auth;
    - logout во время impersonation;
    - перезагрузка страницы во время impersonation (проверка persistence);
    - повторный impersonation без возврата (если такое возможно);
    - попытка открыть AuthModal при активной admin-сессии (должна блокироваться);
    - навигация admin: dashboard → сайт → dashboard → ЛК через impersonation → dashboard;
  - убедиться, что существующий flow (каталоги, booking, ЛК, auth) не затронут.

- **Проверка:**
  - admin-flow работает сквозным сценарием;
  - impersonation не ломает существующую функциональность;
  - guard-сценарии отрабатывают корректно;
  - persistence работает при перезагрузке.

- **Тесты:**
  - integration тесты на полный admin lifecycle;
  - guard-сценарии: не-admin вход, прямой доступ, logout при impersonation;
  - regression тесты на существующие flows (каталоги, booking, ЛК).

- **Ожидаемый результат:**
  - admin-функционал интегрирован в проект без побочных эффектов.

### Step 17.9: Финальная верификация и синхронизация документации

- **Действие:**
  - прогнать:
    - `npm run format`
    - `npm run lint`
    - `npm run test`
    - `npm run build`;
  - ручной сценарий:
    - войти как admin через `/service-portal`;
    - убедиться что dashboard показывает athlete и provider;
    - проверить поиск: найти по ID, по имени, по email;
    - проверить комбинированный фильтр: роль + текст одновременно;
    - перейти на основной сайт через «Открыть сайт», убедиться что Header показывает «Панель управления»;
    - вернуться в dashboard через Header;
    - попытаться открыть AuthModal — убедиться что блокируется;
    - войти под provider — проверить ЛК, отредактировать публикацию;
    - вернуться в панель;
    - войти под athlete — проверить ЛК, отменить запись;
    - вернуться в панель;
    - выйти из admin-панели;
  - синхронизировать:
    - `CLAUDE.md`;
    - `PHASES_OVERVIEW.md`;
    - `phase-17.md`;
    - `PROJECT_STATE.md`;
    - `README.md`;
    - `STACK_OVERVIEW.md`.

- **Проверка:**
  - вся фаза зелёная по командам и ручному сценарию;
  - документация отражает появление admin-функционала в проекте.

- **Ожидаемый результат:**
  - Super Admin доведён до рабочего MVP-состояния, impersonation позволяет выполнять сервисные действия от имени пользователей без дублирования кода.

### Чек-лист Phase 17

- [x] В `User` добавлен optional `status?: UserStatus`
- [x] Тип `UserStatus = 'active' | 'banned' | 'suspended'` экспортирован
- [x] Создан seed admin-пользователь `userId=3` с `role: 'admin'`
- [x] Существующие пользователи получили `status: 'active'`
- [x] `MVP_ADMIN_USER_ID = 3` экспортирован
- [x] Auth store расширен: `isAdmin`, `isImpersonating`, `adminOriginalUser`
- [x] Auth store actions: `adminLogin`, `startImpersonation(user, accountType)`, `stopImpersonation`
- [x] `partialize` расширен на новые поля (persistence)
- [x] `userRoleToAccountType()` утилита добавлена
- [x] `logout` очищает все admin/impersonation поля
- [x] Страница `/service-portal` содержит фейк-форму входа для admin
- [x] Client-side layout guard через route group `(admin)` защищает внутренние страницы
- [x] `/service-portal/dashboard` показывает список пользователей (без admin) с расширенным поиском
- [x] Текстовый поиск работает по ID, имени и email
- [x] Кнопка «Фильтры» динамически раскрывает дополнительные поля (роль, статус)
- [x] Фильтры комбинируются: один параметр, несколько одновременно
- [x] Карточки пользователей содержат ID, имя, роль, статус и базовую статистику (через существующие хелперы)
- [x] Кнопка «Войти как пользователь» запускает impersonation с корректным accountType и редирект в ЛК
- [x] Admin-плашка (ImpersonationBanner) отображается в AppShell перед Header при активном impersonation
- [x] Кнопка «Вернуться в панель» корректно завершает impersonation
- [x] Header показывает «Панель управления» для admin без impersonation
- [x] Ссылка «Открыть сайт» в admin layout ведёт на главную
- [x] AuthModal блокируется при активной admin-сессии
- [x] Полный маршрут навигации (dashboard → сайт → dashboard → ЛК → dashboard) работает без потери контекста
- [x] Все действия в ЛК при impersonation работают от имени target-пользователя
- [x] ID аккаунта отображается в ЛК спортсмена
- [x] ID аккаунта отображается в ЛК провайдера
- [x] Placeholder-страницы для analytics, moderation, finance доступны
- [x] Навигация внутри admin-панели работает
- [x] Logout при impersonation полностью очищает состояние
- [x] Перезагрузка страницы при impersonation сохраняет контекст (persistence)
- [x] Существующий auth-flow, каталоги, booking и ЛК не затронуты
- [x] Тесты покрывают auth store (adminLogin, impersonation, persistence), guard, dashboard, impersonation flow и регрессии
- [x] Документация синхронизирована

**Выполнено:** Step 17.1, Step 17.2, Step 17.3, Step 17.4, Step 17.5, Step 17.6, Step 17.7, Step 17.8, Step 17.9

**Следующий шаг:** — (фаза завершена)

**Статус Phase 17:** ✅ Завершена

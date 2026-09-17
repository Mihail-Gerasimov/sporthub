# Phase 06

> Этот файл содержит одну фазу проекта целиком. Главный вход в контекст — `CLAUDE.md`, навигация по фазам — через `PHASES_OVERVIEW.md`.
> В ежедневной работе открывай прежде всего активную фазу и не перечитывай все phase-файлы подряд без необходимости.
> Структура фазы сохраняется в исходном стиле: заголовок фазы, краткий результат, шаги по порядку, затем чеклист и статус.
> Перед стартом новой фазы проверь, что для неё уже есть отдельный `phase-XX.md`, и после завершения шагов или фазы синхронизируй статус здесь, в `PHASES_OVERVIEW.md`, `CLAUDE.md`, `README.md` и при необходимости в `STACK_OVERVIEW.md`.

## Phase 6. Auth-заглушка с выбором типа пользователя

> После этой фазы: пользователь может открыть auth-модалку, выбрать сценарий `Вход` или `Регистрация`, а также выбрать тип аккаунта:

- `Представитель спортивных услуг`
- `Спортсмен`

Авторизация на этом этапе остаётся MVP-заглушкой через Zustand + localStorage.  
Реальной серверной проверки пользователя пока нет.

Все шаги этой фазы выполнять в режиме **`test first -> code -> green`**.  
До реализации каждого шага сначала добавлять logical/component tests для store, модалки, валидации и реакции Header.

Важно:

- auth-flow вводит отдельный тип аккаунта: `provider` / `athlete`;
- этот тип **не равен** доменной роли `UserRole` из `src/types/index.ts`;
- для auth-flow использовать отдельный тип, например `AuthAccountType`;
- на этой фазе auth-state живёт только в Zustand + localStorage и **не** записывается в `users.json`.

### Step 6.1. Создать auth-store

- Создать `useAuthStore`.
- Хранить:
  - базовые данные авторизованного пользователя;
  - `accountType: provider | athlete`;
  - `isAuthenticated`.
- Добавить методы:
  - `login`;
  - `register`;
  - `logout`.
- Подключить persistence через localStorage.
- Не использовать store как постоянное бизнес-хранилище.
- На этом этапе store нужен только для auth-flow и связанного UI-состояния.

**Тесты до реализации:**

- unit tests на `login` и `register`:
  - сохраняют пользователя;
  - сохраняют `accountType`;
  - выставляют `isAuthenticated = true`;
- unit test на `logout`:
  - очищает пользователя;
  - очищает `accountType`;
  - сбрасывает `isAuthenticated`;
- unit test на восстановление состояния из persistence после перезагрузки;
- отдельная проверка, что `accountType` auth-flow не смешивается с `UserRole`.

**Проверка:**

- после login/register в store сохраняются пользователь и его тип аккаунта;
- после перезагрузки страницы состояние восстанавливается;
- после logout состояние очищается.

**Ожидаемый результат:**

- auth-store поддерживает временную авторизацию и выбранный тип пользователя.

**Реализация:**

- **Файлы:**
  - `src/stores/useAuthStore.ts` (103 строки) — Zustand store с persist через localStorage
- **Ключевые экспорты:**
  - State: `user: AuthSessionUser | null` (id?, name, email, phone?, avatarUrl?), `accountType: AuthAccountType | null` ('provider' | 'athlete'), `isAuthenticated: boolean`
  - Actions: `login(payload: AuthSessionPayload)`, `register(payload: AuthSessionPayload)`, `logout()`
  - Selectors: `selectAuthAccountType(state)`, `selectAthleteActionUserId(state)` — возвращает user.id если athlete
  - Helpers: `getPersonalCabinetConfig(accountType)` — маппит тип аккаунта на path и title кабинета
  - Константы: `AUTH_STORAGE_KEY` ('sporthub-auth-store'), `MVP_ATHLETE_USER_ID` (1), `AUTH_STORE_DEFAULT_STATE`, `PERSONAL_CABINET_CONFIG`
- **Паттерны:** Zustand `persist` middleware с custom storage (localStorage); `partialize` — сохраняются только user, accountType, isAuthenticated; `AuthAccountType` ≠ `UserRole` — строгое разделение auth-flow и доменной модели
- **Кто использует:**
  - `Header` → показывает имя/тип аккаунта/logout
  - `AuthModal` → вызывает login/register
  - `AthleteProfilePage` → проверяет isAuthenticated + accountType === 'athlete'
  - `ClubDetailPageClient` → selectAthleteActionUserId для athlete-only действий
- **Зависит от:** zustand@5.0.12, `src/types/index.ts` (AuthAccountType)

---

### Step 6.2. Обновить auth-модалку на базе универсальной Modal

- Использовать существующую универсальную `Modal` как контейнер.
- Внутри auth-модалки оставить 2 таба:
  - `Вход`
  - `Регистрация`
- В каждом табе добавить обязательный выбор типа аккаунта:
  - `Представитель спортивных услуг`
  - `Спортсмен`
- По умолчанию тип аккаунта не выбран.

**Тесты до реализации:**

- component test:
  - модалка открывается из UI-state;
  - модалка закрывается по кнопке и по overlay;
- component test на переключение табов;
- component test, что в обоих табах есть обязательный выбор `provider / athlete`;
- component test, что без выбранного типа аккаунта submit остаётся невалидным.

**Проверка:**

- модалка открывается и закрывается корректно;
- табы переключаются;
- в обоих табах доступен выбор типа аккаунта.

**Ожидаемый результат:**

- одна общая auth-модалка поддерживает оба сценария и оба типа пользователей.

**Реализация:**

- **Файлы:**
  - `src/components/auth/AuthModal.tsx` (200+ строк) — Client Component; единая auth-модалка
- **Ключевые экспорты:** `AuthModal`
- **Паттерны:** внутренний state — табы ('login' | 'register'), выбор accountType ('provider' | 'athlete'); обёртка через универсальную `Modal`; Chip-компоненты для табов и типа аккаунта (`AccountTypeSelector`); без выбранного типа submit заблокирован; форма валидируется через Zod-схемы (`getLoginValidationErrors()`, `getRegisterValidationErrors()`)
- **Кто использует:** `AppShell` — рендерится глобально, открывается через `useUIStore.openAuthModal()`
- **Зависит от:** `src/components/ui/` (Modal, Input, Button, Chip), `src/stores/useAuthStore.ts`, `src/stores/useUIStore.ts`

---

### Step 6.3. Обновить сценарий "Вход"

- В табе `Вход` показывать:
  - выбор типа аккаунта;
  - email;
  - пароль.
- Вход не выполняется без выбора роли.
- Валидировать:
  - корректность email;
  - пароль минимум 6 символов.
- Submit остаётся stub-flow:
  - spinner;
  - сохранение пользователя и `accountType` в auth-store;
  - закрытие модалки.

**Тесты до реализации:**

- logical/component test: без выбранного `accountType` submit не проходит;
- logical/component test: невалидный email показывает ошибку;
- logical/component test: пароль короче 6 символов показывает ошибку;
- logical/component test: при валидных данных вызывается login-flow и auth-store получает `accountType`;
- test на закрытие модалки и обновление Header после успешного входа;
- spinner-поведение проверять через fake timers, без реального ожидания в тестах.

**Проверка:**

- без выбранной роли вход не проходит;
- невалидный email не принимается;
- короткий пароль не принимается;
- при валидных данных модалка закрывается, Header обновляется.

**Ожидаемый результат:**

- вход работает отдельно для `provider` и `athlete` в рамках MVP-заглушки.

**Реализация:**

- **Файлы:**
  - `src/components/auth/AuthModal.tsx` — таб «Вход» внутри auth-модалки
- **Ключевые детали:**
  - Поля: email, пароль
  - Zod-валидация: email через `z.email()`, пароль min 6 символов
  - Хелпер `createLoginSessionUser(email, accountType)` — создаёт AuthSessionUser из local-part email
  - Spinner: `AUTH_SUBMIT_DELAY_MS = 600ms` (имитация серверного запроса)
  - После успеха: `useAuthStore().login(payload)` + `useUIStore().closeAuthModal()`
- **Паттерны:** Zod-схемы для валидации; ошибки отображаются под каждым полем; accountType обязателен; fake timers в тестах для spinner

---

### Step 6.4. Обновить сценарий "Регистрация"

- В табе `Регистрация` показывать:
  - выбор типа аккаунта;
  - имя;
  - email;
  - телефон с маской `+7`;
  - пароль.
- Регистрация не выполняется без выбора роли.
- Валидировать:
  - имя не пустое;
  - корректность email;
  - телефон через маску;
  - пароль минимум 6 символов.
- Submit остаётся stub-flow:
  - spinner;
  - сохранение пользователя и `accountType` в auth-store;
  - закрытие модалки.
- На этой фазе не делать серверную проверку уникальности email.

**Тесты до реализации:**

- logical/component test: без выбранного `accountType` регистрация не проходит;
- logical/component test: пустое имя показывает ошибку;
- logical/component test: email валидируется;
- logical/component test: телефон приводится к формату `+7` и не проходит при некорректном вводе;
- logical/component test: пароль валидируется по длине;
- logical/component test: при валидных данных register-flow сохраняет пользователя и `accountType` в auth-store;
- spinner-поведение проверять через fake timers.

**Проверка:**

- регистрация не проходит без роли;
- ошибки валидации отображаются у полей;
- при валидных данных пользователь считается зарегистрированным и авторизованным.

**Ожидаемый результат:**

- регистрация поддерживает оба типа аккаунта и сразу создаёт нужное auth-состояние.

**Реализация:**

- **Файлы:**
  - `src/components/auth/AuthModal.tsx` — таб «Регистрация» внутри auth-модалки
- **Ключевые детали:**
  - Поля: имя, email, телефон (с маской), пароль
  - Zod-валидация: имя non-empty, email, телефон (русский формат), пароль min 6 символов
  - Хелперы: `getNormalizedRussianPhoneDigits(value)` — валидация формата, `maskRussianPhoneInput(value)` — маска `+7 (XXX) XXX-XX-XX`
  - После успеха: `useAuthStore().register(payload)` + `useUIStore().closeAuthModal()`
- **Паттерны:** phone masking в реальном времени; без серверной проверки уникальности email (MVP); spinner через fake delay

---

### Step 6.5. Обновить Header под новый auth-flow

- Если пользователь не авторизован:
  - показывать кнопку `Войти`.
- Если пользователь авторизован:
  - показывать имя;
  - показывать аватар-заглушку;
  - показывать выход;
  - показывать тип аккаунта:
    - `Спортсмен`
    - `Представитель спортивных услуг`

**Тесты до реализации:**

- component test: в гостевом состоянии Header показывает кнопку `Войти`;
- component test: после login/register Header показывает имя пользователя;
- component test: Header показывает человекочитаемый тип аккаунта;
- component test: logout возвращает гостевое состояние Header.

**Проверка:**

- после login/register Header меняется;
- после logout Header возвращается в гостевое состояние.

**Ожидаемый результат:**

- Header отражает авторизацию и выбранную роль пользователя.

**Реализация:**

- **Файлы:**
  - `src/components/layout/Header.tsx` (113 строк) — обновлённый Header с auth-интеграцией
- **Ключевые детали:**
  - Гостевой режим: кнопка «Войти» → `useUIStore().openAuthModal()`
  - Авторизованный режим: имя пользователя (hidden на mobile), badge с типом аккаунта (hidden на mobile), аватар-круг с инициалом (кликабелен для athlete → `/profile/athlete`), кнопка «Выйти» → `useAuthStore().logout()`
  - Ссылка на кабинет: `getPersonalCabinetConfig(accountType)` → path + title
- **Паттерны:** Header реагирует на изменения auth-store в реальном времени; типы аккаунта отображаются через `AUTH_ACCOUNT_TYPE_LABELS`
- **Зависит от:** `src/stores/useAuthStore.ts`, `src/stores/useUIStore.ts`, `src/lib/constants.ts` → `AUTH_ACCOUNT_TYPE_LABELS`

---

### Step 6.6. Подготовить auth-flow к role-based личному кабинету

- Зафиксировать, что выбранная роль пользователя используется дальше как основа для личного кабинета:
  - `provider` -> кабинет представителя спортивных услуг;
  - `athlete` -> кабинет спортсмена.
- На текущем этапе достаточно сохранить и читать `accountType` из auth-store.
- Полная логика личных кабинетов будет реализовываться в следующих фазах.

**Тесты до реализации:**

- unit test на чтение `accountType` из auth-store после авторизации;
- unit/component test, что после восстановления состояния из localStorage UI всё ещё видит правильный `accountType`;
- если добавляется helper/selector для будущей role-based навигации, покрыть его отдельным unit test.

**Проверка:**

- тип аккаунта доступен после авторизации;
- UI может опираться на неё для дальнейшей маршрутизации и отображения.

**Ожидаемый результат:**

- auth-flow уже готов к разделению личных кабинетов по типу пользователя.

**Реализация:**

- **Файлы:**
  - `src/stores/useAuthStore.ts` — `selectAuthAccountType()` selector, `getPersonalCabinetConfig()` helper, `PERSONAL_CABINET_CONFIG`
- **Ключевые детали:**
  - `PERSONAL_CABINET_CONFIG` маппит: `provider` → { path: '/profile/provider', title: 'Кабинет представителя' }, `athlete` → { path: '/profile/athlete', title: 'Кабинет спортсмена' }
  - `selectAthleteActionUserId(state)` — возвращает user.id если athlete, else null; используется для athlete-only действий
  - Persistence через localStorage: accountType сохраняется и восстанавливается при перезагрузке
- **Паттерны:** selector-pattern для Zustand; конфиг кабинетов заготовлен для будущих фаз; `AuthAccountType` строго отделён от `UserRole`

---

### Чек-лист Phase 6

- [x] Кнопка `Войти` открывает auth-модалку
- [x] Auth-модалка использует универсальную `Modal`
- [x] Работают табы `Вход` / `Регистрация`
- [x] В обоих табах есть обязательный выбор типа аккаунта
- [x] Типы аккаунта: `Представитель спортивных услуг` / `Спортсмен`
- [x] Валидация email работает
- [x] Валидация пароля работает
- [x] Телефон в регистрации работает через маску `+7`
- [x] После входа/регистрации в auth-store сохраняется тип аккаунта
- [x] После входа Header показывает авторизованное состояние
- [x] После logout состояние сбрасывается
- [x] После перезагрузки состояние восстанавливается
- [x] Приложение остаётся доступным без логина

---


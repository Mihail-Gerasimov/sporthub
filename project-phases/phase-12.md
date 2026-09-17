# Phase 12

> Этот файл содержит одну фазу проекта целиком. Главный вход в контекст — `CLAUDE.md`, навигация по фазам — через `PHASES_OVERVIEW.md`.
> В ежедневной работе открывай прежде всего активную фазу и не перечитывай все phase-файлы подряд без необходимости.
> Структура фазы сохраняется в исходном стиле: заголовок фазы, краткий результат, шаги по порядку, затем чеклист и статус.
> Перед стартом новой фазы проверь, что для неё уже есть отдельный `phase-XX.md`, и после завершения шагов или фазы синхронизируй статус здесь, в `PHASES_OVERVIEW.md`, `CLAUDE.md`, `README.md` и при необходимости в `STACK_OVERVIEW.md`.

## Phase 12: ЛК представителя спортивных услуг (Provider Cabinet MVP)

> После этой фазы: пользователь с типом аккаунта `provider` имеет полноценный MVP-кабинет с публикациями, входящими записями, отзывами и настройками профиля. Все данные fake, без реального CRUD.

**Ключевые решения:**
- Отдельный fake-пользователь provider (id: 2) в `users.json`
- Поле `managedByUserId` в `Club` и `Trainer` для связи с провайдером
- 3 fake-букинга в `bookings.json` для наполнения блока входящих записей
- Кнопки «Опубликовать клуб/тренера» — заглушки с тостом, без модалок и форм
- Паттерн идентичен ЛК спортсмена: server fetch → client component → секции с useMemo

### Step 12.1 — Данные и типы provider-кабинета ✅

- [x] Добавить `managedByUserId?: EntityId` в интерфейсы `Club` и `Trainer` (`src/types/index.ts`)
- [x] Добавить provider user (id: 2) в `src/data/users.json`
- [x] Проставить `managedByUserId: 2` у клубов (ids 1, 2) и тренеров (ids 1, 3, 5)
- [x] Добавить `MVP_PROVIDER_USER_ID = 2` в `src/stores/useAuthStore.ts`
- [x] При регистрации/входе как provider назначать `user.id = MVP_PROVIDER_USER_ID` (сейчас `undefined`)
- [x] Добавить 3 fake-букинга в `src/data/bookings.json` (от athlete на клубы/тренеров провайдера; статусы: pending, confirmed, completed)
- [x] Тесты: `managedByUserId` присутствует в ожидаемых клубах/тренерах, provider получает id при auth
- [x] Верификация: format, lint, test, build

### Step 12.2 — Header: навигация для provider ✅

- [x] Обновить `Header.tsx`: заменить `athleteCabinetHref` на универсальный `cabinetHref` через `cabinetConfig?.profilePath`
- [x] Provider avatar ведёт на `/profile/provider` (сейчас non-clickable div)
- [x] Обновить `getPersonalCabinetConfig` для provider path если нужно
- [x] Тесты: header рендерит ссылку для provider
- [x] Верификация: format, lint, test, build

### Step 12.3 — Provider-хелперы (бизнес-логика) ✅

- [x] Создать `src/components/profile/provider-helpers.ts` с функциями:
  - `getProviderClubs(clubs, providerUserId)` — клубы по `managedByUserId`
  - `getProviderTrainers(trainers, providerUserId)` — тренеры по `managedByUserId`
  - `getProviderIncomingBookings(bookings, providerClubIds, providerTrainerIds)` — входящие записи
  - `getProviderReviews(reviews, providerClubIds, providerTrainerIds)` — отзывы на сущности провайдера
  - `getProviderSummary(...)` — сводка: кол-во публикаций, активных букингов, отзывов, средний рейтинг
- [x] Тесты: `src/test/profile/provider-helpers.test.ts` для каждой функции
- [x] Верификация: format, lint, test, build

### Step 12.4 — Маршрут /profile/provider + auth-гейт + шапка + сводка ✅

- [x] Создать `src/app/profile/provider/page.tsx` (Server Component, fetches данные через `db.ts`)
- [x] Создать `src/components/profile/ProviderProfilePage.tsx` (Client Component):
  - Auth-гейт: не авторизован или не `provider` → «Доступ ограничен» (по аналогии с athlete)
  - Шапка: аватар, имя, тип аккаунта, email, телефон, кнопка «Выйти»
  - Сводка: 4 KPI-карточки (публикации, активные записи, отзывы, средний рейтинг)
  - Быстрые действия: 2 кнопки-заглушки «Опубликовать клуб» / «Опубликовать тренера» → тост «Скоро будет доступно»
- [x] Тост: минимальная реализация (useState в компоненте), без over-engineering
- [x] Тесты: auth-гейт, рендер шапки и сводки
- [x] Верификация: format, lint, test, build

### Step 12.5 — Мои публикации ✅

- [x] Создать `src/components/profile/ProviderPublicationsSection.tsx`:
  - Клубы и тренеры провайдера в едином списке
  - Карточка: название, тип (Клуб/Тренер), рейтинг, кол-во отзывов, ссылка на детальную страницу
  - Пустое состояние: «У вас пока нет публикаций»
  - Адаптив: 1 колонка → md: 2 колонки
- [x] Тесты: рендер публикаций, пустое состояние
- [x] Верификация: format, lint, test, build

### Step 12.6 — Входящие записи + Отзывы + Настройки профиля ✅

- [x] Создать `src/components/profile/ProviderBookingsSection.tsx`:
  - Список входящих записей из `bookings.json`
  - Карточка: дата, клуб/тренер, статус, стоимость
  - Пустое состояние: «Нет входящих записей»
- [x] Создать `src/components/profile/ProviderReviewsSection.tsx`:
  - Отзывы на клубы/тренеров провайдера
  - Карточка: рейтинг, текст, целевая сущность, дата
  - Пустое состояние: «Нет отзывов»
- [x] Создать `src/components/profile/ProviderSettingsSection.tsx`:
  - Профиль: имя, email, телефон, аватар (read-only)
  - Пометка: «Редактирование будет доступно позже»
- [x] Тесты для каждой секции
- [x] Верификация: format, lint, test, build

### Step 12.7 — Финальная верификация и синхронизация документации ✅

- [x] `npm run format && npm run lint && npm run test && npm run build`
- [x] Ручная проверка: вход как provider → все секции рендерятся → навигация работает
- [x] Обновить `CLAUDE.md` (текущее состояние → Phase 12 завершена)
- [x] Обновить `PHASES_OVERVIEW.md` (статусы фаз и активную фазу для работы)
- [x] Обновить `project-phases/phase-12.md` (чеклист Phase 12 завершён)
- [x] Обновить `README.md` (прогресс, структура, «что работает»)
- [x] Обновить `STACK_OVERVIEW.md` (пользовательские поверхности: добавить `/profile/provider`)
- [x] Документация синхронизирована

---

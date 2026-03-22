# SportHub — План Реализации (MVP)

> Пошаговый план от пустой папки до работающего MVP.
> Все технологии и решения строго по STACK_OVERVIEW.md.
> План будет дополняться новыми фазами и задачами по мере развития проекта.
> Статусы: ⬜ не начато · 🔄 в работе · ✅ готово

> Сквозное требование для всех UI-фаз: вёрстка и компоненты должны быть адаптивными по принципу **mobile-first**. Базовые брейкпоинты проекта: `base` (<640px), `sm` (640px+), `md` (768px+), `lg` (1024px+), `xl` (1280px+), `2xl` (1536px+).

---

## Phase 1: Инициализация проекта и инфраструктура

> После этой фазы: проект создан, зависимости установлены, dev-сервер запускается, структура папок готова к работе.

### Step 1.1: Создать проект через create-next-app

- **Действие:** Сгенерировать Next.js-проект **в корне текущего репозитория**, чтобы документация и код жили в одной структуре. Базовый вариант: `npx create-next-app@latest .`. На промптах выбрать: TypeScript — Yes, ESLint — Yes, Tailwind CSS — Yes, `src/` directory — Yes, App Router — Yes, Turbopack — Yes, import alias — `@/*` (по умолчанию). Если корень уже содержит проектные документы и `create-next-app` отказывается инициализироваться в непустой директории, допустимо сначала сгенерировать шаблон во временную папку, затем перенести файлы проекта в корень репозитория без затрагивания `.git`.
- **Проверка:** В корне репозитория выполнить `npm run dev` → открыть `http://localhost:3000` — стартовая страница Next.js
- **Ожидаемый результат:** Проект запускается без ошибок, в браузере отображается дефолтная страница, все файлы Next.js лежат в корне репозитория

**Реализация:**

- **Файлы:**
  - `package.json` (37 строк) — манифест проекта, scripts, зависимости
  - `tsconfig.json` (34 строки) — strict: true, jsx: react-jsx, paths: `@/*` → `./src/*`
  - `next.config.ts` (8 строк) — минимальный конфиг Next.js 16
  - `src/app/layout.tsx` (22 строки) — корневой Server Component, metadata, AppShell-обёртка
  - `src/app/page.tsx` — точка входа главной страницы
  - `scripts/run-next.mjs` — обёртка запуска Next.js, фиксит определение корня проекта при копировании репозитория
- **Ключевые экспорты:**
  - `metadata: Metadata` (layout.tsx) — title «SportHub», description
  - `RootLayout` (layout.tsx) — корневой layout, оборачивает `children` в `AppShell`
- **Паттерны:** create-next-app в корень существующего репо; App Router; `scripts/run-next.mjs` как единая точка запуска dev/build/start
- **Зависит от:** Next.js 16.1.7, React 19.2.3, TypeScript 5.x

### Step 1.2: Проверить и зафиксировать версии зависимостей

- **Действие:** Открыть `package.json`, проверить версии next, react, react-dom, tailwindcss, typescript. Обновить STACK_OVERVIEW.md фактическими версиями если отличаются от запланированных.
- **Проверка:** Версии в STACK_OVERVIEW.md совпадают с `package.json`
- **Ожидаемый результат:** Документация отражает реальность

**Реализация:**

- **Файлы:**
  - `package.json` — фактические версии: next@16.1.7, react@19.2.3, react-dom@19.2.3, typescript@5, tailwindcss@4
  - `STACK_OVERVIEW.md` — обновлён фактическими версиями
- **Паттерны:** версии фиксируются в документации сразу после установки

### Step 1.3: Установить дополнительные зависимости

- **Действие:** Установить пакеты, которые не входят в create-next-app:
  - `npm install zustand` — стейт-менеджер
  - `npm install zod` — валидация данных
  - `npm install --save-dev prettier` — форматирование кода
- **Проверка:** `npm ls zustand zod prettier` — все три пакета в дереве зависимостей
- **Ожидаемый результат:** Пакеты установлены, `package.json` обновлён

**Реализация:**

- **Файлы:**
  - `package.json` — добавлены: zustand@5.0.12 (dependencies), zod@4.3.6 (dependencies), prettier@3.8.1 (devDependencies)
- **Паттерны:** zustand — клиентский стейт; zod — валидация API-запросов; prettier — единообразное форматирование

### Step 1.4: Настроить Prettier

- **Действие:** Создать `.prettierrc` в корне проекта с базовыми правилами (semi, singleQuote, tabWidth, trailingComma, printWidth). Добавить скрипт `"format": "prettier --write ."` в `package.json`.
- **Проверка:** `npm run format` — форматирует файлы без ошибок
- **Ожидаемый результат:** Код отформатирован единообразно

**Реализация:**

- **Файлы:**
  - `.prettierrc` (7 строк) — semi: true, singleQuote: true, tabWidth: 2, trailingComma: all, printWidth: 100
  - `package.json` — скрипт `"format": "prettier --write ."`
- **Кто использует:** `npm run format` — ручной запуск; верификация каждого шага

### Step 1.5: Создать структуру папок

- **Действие:** Внутри `src/` создать папки под архитектуру проекта:
  - `components/ui/` — базовые UI-компоненты
  - `components/clubs/` — компоненты клубов
  - `components/trainers/` — компоненты тренеров
  - `components/schedule/` — компоненты расписания
  - `components/booking/` — компоненты записи
  - `components/reviews/` — компоненты отзывов
  - `components/search/` — поиск и фильтры
  - `components/map/` — карта
  - `components/layout/` — Header, Footer, MobileNav
  - `components/auth/` — модалка авторизации
  - `lib/` — утилиты, абстракция БД, константы
  - `types/` — TypeScript типы и интерфейсы
  - `stores/` — Zustand сторы
  - `data/` — JSON-файлы (БД на MVP)
- **Проверка:** Структура соответствует плану
- **Ожидаемый результат:** Все папки созданы

**Реализация:**

- **Файлы (созданные директории):**
  - `src/components/ui/` — базовые UI-компоненты (Button, Card, Input, Modal, Badge, Rating, Skeleton, Chip)
  - `src/components/clubs/` — ClubCard, ClubList, ClubDetailPageClient, PopularNearby, filterClubs
  - `src/components/trainers/` — TrainerCard, TrainerList, PopularTrainers, TrainerMapView, TrainerAvailability, trainer-preview, filterTrainers
  - `src/components/schedule/` — UpcomingSessions, getUpcomingSessions
  - `src/components/booking/` — (зарезервировано)
  - `src/components/reviews/` — (зарезервировано)
  - `src/components/search/` — SearchBar, SportFilters, SearchControlsPreview
  - `src/components/map/` — MapView, MapPreviewSection
  - `src/components/layout/` — AppShell, Header, Footer, MobileNav
  - `src/components/auth/` — AuthModal
  - `src/components/profile/` — AthleteProfilePage и секции кабинета
  - `src/lib/` — db.ts, utils.ts, constants.ts, projectPaths.ts
  - `src/types/` — index.ts (все интерфейсы и типы)
  - `src/stores/` — useAuthStore, useFilterStore, useUIStore
  - `src/data/` — JSON-файлы (sports, clubs, trainers, offerings, schedule, bookings, reviews, users)
- **Паттерны:** модульная структура — каждый домен в отдельной папке components/*

### Step 1.6: Очистить дефолтный контент

- **Действие:** Очистить `src/app/page.tsx` от стартового шаблона Next.js — оставить минимальный компонент-заглушку. Очистить `src/app/globals.css` — оставить только Tailwind-импорт (`@import "tailwindcss"`) и базовые CSS-переменные для темы.
- **Проверка:** `npm run dev` → на главной пустая страница или текст-заглушка, без ошибок
- **Ожидаемый результат:** Чистый проект без дефолтного контента Next.js

**Реализация:**

- **Файлы:**
  - `src/app/page.tsx` — очищен от шаблона Next.js, минимальный компонент-заглушка
  - `src/app/globals.css` (83 строки) — оставлен `@import 'tailwindcss'`, добавлены CSS-переменные через `@theme inline`:
    - Шрифты: `--ui-font-display` (Avenir Next, SF Pro Display), `--ui-font-body`, `--ui-font-mono`
    - Цвета: `--ui-canvas` (#f4ead7), `--ui-panel` (#fff7eb), `--ui-ink` (#15232a), `--ui-accent` (#d85a32), `--ui-teal` (#0c6f73), `--ui-success`, `--ui-warning`, `--ui-danger`, `--ui-muted`, `--ui-line`
    - Размеры: `--ui-radius-card` (30px), `--ui-radius-pill` (999px)
    - Тени: `--ui-shadow-card`, `--ui-shadow-floating`
  - Глобальные стили: градиентный фон, стилизация selection, scrollbar-утилиты
- **Кто использует:** Tailwind 4 подхватывает `@theme` токены как утилиты; все компоненты используют `bg-ui-canvas`, `text-ui-ink`, `rounded-ui-radius-card` и т.д.

### Step 1.7: Настроить Git-репозиторий

- **Действие:** Проверить `.gitignore` (`node_modules`, `.next`, `.env.local` должны игнорироваться). Убедиться, что история Git ведётся по шагам проекта и каждый завершённый шаг зафиксирован отдельным коммитом.
- **Проверка:** `git log --oneline` — в истории есть отдельные коммиты по шагам Phase 1
- **Ожидаемый результат:** Репозиторий настроен корректно, история шагов зафиксирована и готова к дальнейшей работе

**Реализация:**

- **Файлы:**
  - `.gitignore` — node_modules, .next, .env.local, build-артефакты
  - `eslint.config.mjs` (18 строк) — ESLint 9 flat config: `nextVitals` + `nextTs` + `globalIgnores`
- **Паттерны:** каждый завершённый шаг = отдельный коммит; формат: `тип(модуль): Step X.Y — описание`

### Phase 1 — Чеклист

- [x] `npm run dev` запускает dev-сервер без ошибок
- [x] `http://localhost:3000` открывается
- [x] zustand, zod, prettier установлены
- [x] `npm run format` работает
- [x] Структура папок `src/` создана
- [x] Дефолтный контент очищен
- [x] Git — история шагов Phase 1 зафиксирована коммитами
- [x] STACK_OVERVIEW.md обновлён фактическими версиями

---

## Phase 2: Типы данных и моковая база

> После этой фазы: все сущности описаны TypeScript-интерфейсами, JSON-файлы с тестовыми данными заполнены, абстракция БД читает данные из файлов.

### Step 2.1: Описать TypeScript-интерфейсы всех сущностей

- **Действие:** Создать `src/types/index.ts` с интерфейсами: Sport, Club, Trainer, Schedule, Booking, Review, User. Каждая сущность с id, связями через внешние ключи (clubId, trainerId, sportId), датами (createdAt). Отдельно типы для ролей (UserRole), статусов букинга (BookingStatus), статусов оплаты (PaymentStatus).
- **Проверка:** `npm run build` — без ошибок типизации
- **Ожидаемый результат:** Все сущности типизированы

**Реализация:**

- **Файлы:**
  - `src/types/index.ts` (151 строка) — все интерфейсы и типы проекта
- **Ключевые экспорты:**
  - Типы-алиасы: `EntityId`, `ISODateString`, `ISODateTimeString`, `AuthAccountType` ('provider' | 'athlete'), `UserRole` ('athlete' | 'trainer' | 'club_owner' | 'admin'), `CatalogOwnerType` ('club' | 'trainer'), `BookingStatus`, `PaymentStatus`, `SessionLevel`, `OfferingFormat` ('group' | 'personal' | 'mini_group')
  - Интерфейсы: `Sport`, `Club` (20+ полей: coordinates, sportIds, rating, amenities, tags), `Trainer` (18+ полей: bio, experience, specialties, affiliatedClubId?), `Offering` (ownerType, ownerId, format, price, capacity), `Schedule` (date, startTime, endTime, capacity, bookedCount, ownerType), `Booking` (scheduleId, userId, status, paymentStatus), `Review` (rating 1-5, text, clubId/trainerId), `User` (role, favoriteClubIds)
- **Паттерны:** `AuthAccountType` ≠ `UserRole` — auth-flow и доменная модель разделены; `CatalogOwnerType` позволяет клубам и тренерам быть независимыми провайдерами услуг; все сущности наследуют `BaseEntity` (id, createdAt)
- **Кто использует:** все API routes, db.ts, компоненты через пропсы, stores
- **Зависит от:** только TypeScript (нет runtime-зависимостей)

### Step 2.2: Создать JSON-файлы с моковыми данными

- **Действие:** Заполнить JSON-файлы в `src/data/` реалистичными тестовыми данными:
  - `sports.json` — 8-10 видов спорта (Йога, Бокс, Плавание, Кроссфит, Танцы, Тренажёрный зал, Единоборства, Пилатес)
  - `clubs.json` — 6-8 клубов с фото-заглушками, координатами, рейтингами, списком видов спорта
  - `trainers.json` — 10-12 тренеров, привязанных к клубам и видам спорта
  - `schedule.json` — расписание на неделю для каждого клуба (3-5 занятий в день)
  - `reviews.json` — 15-20 отзывов к разным клубам и тренерам
  - `bookings.json` — пустой массив (заполняется при записи)
  - `users.json` — один тестовый юзер
- **Проверка:** Каждый JSON валидный, структура соответствует интерфейсам из Step 2.1
- **Ожидаемый результат:** Полный набор данных для отображения всех экранов

**Реализация:**

- **Файлы:**
  - `src/data/sports.json` (~50 строк) — 8 видов спорта: Йога, Бокс, Плавание, Кроссфит, Танцы, Тренажёрный зал, Единоборства, Пилатес; поля: id, name, slug, icon, description, imageUrl, isPopular
  - `src/data/clubs.json` (~400+ строк) — 6-8 клубов: coordinates, sportIds, images, amenities, tags, rating, priceFrom, distanceKm
  - `src/data/trainers.json` (~300+ строк) — 10-12 тренеров: bio, avatarUrl, experienceYears, specialties, rating, priceFrom, sportIds, city, address, coordinates, affiliatedClubId?
  - `src/data/offerings.json` — услуги клубов и тренеров: ownerType ('club'|'trainer'), ownerId, sportId, title, format, price, durationMinutes, capacity, address, coordinates
  - `src/data/schedule.json` (~500+ строк) — слоты расписания на неделю: date, startTime, endTime, capacity, bookedCount, price, level, привязка к offering/owner
  - `src/data/bookings.json` — записи пользователей (изначально пуст, заполняется через POST /api/bookings)
  - `src/data/reviews.json` (~200+ строк) — 15-20 отзывов: rating, text, userId, clubId/trainerId
  - `src/data/users.json` (~50 строк) — тестовые пользователи (MVP_ATHLETE_USER_ID = 1)
- **Паттерны:** JSON как MVP-хранилище; структура файлов повторяет TypeScript-интерфейсы из types/index.ts
- **Кто использует:** `src/lib/db.ts` — единственный потребитель через `readCollection()` / `writeCollection()`
- **Зависит от:** `src/types/index.ts` — схема данных

### Step 2.3: Создать абстракцию работы с данными (db.ts)

- **Действие:** Создать `src/lib/db.ts` — модуль чтения/записи JSON через `fs/promises`. Функции: getClubs(), getClubById(id), getTrainers(), getTrainerById(id), getSchedule(), getSports(), getReviews(), getBookings(), createBooking(), createReview(). Все функции типизированы, возвращают промисы. Комментарий `// STUB: заменить на Prisma при переходе на PostgreSQL`.
- **Проверка:** Импортировать функцию в тестовом API route — данные читаются
- **Ожидаемый результат:** Единая точка доступа к данным

**Реализация:**

- **Файлы:**
  - `src/lib/db.ts` (330 строк) — абстракция БД, async чтение/запись JSON через fs/promises
  - `src/lib/projectPaths.ts` (51 строка) — определение корня проекта и директории данных
- **Ключевые экспорты (db.ts):**
  - Чтение: `getClubs()`, `getClubById(id)`, `getTrainers()`, `getTrainerById(id)`, `getOfferings()`, `getOfferingById(id)`, `getClubOfferings(clubId)`, `getTrainerOfferings(trainerId)`, `getSchedule(options?)`, `getScheduleById(id)`, `getScheduleSlotContext(id)`, `getSports()`, `getReviews()`, `getBookings()`, `getUsers()`, `getUserById(id)`
  - Запись: `createBooking(input: CreateBookingInput)`, `createReview(input)`, `incrementScheduleBookedCount(scheduleId)`
  - Типы: `ScheduleSlotContext` (обогащённый слот с club, trainer, offering), `GetScheduleOptions` (ownerType-фильтр), `CreateBookingInput`
  - Внутренние: `normalizeTrainer()`, `normalizeSchedule()`, `readCollection<K>()`, `writeCollection<K>()`, `getNextEntityId()`, `createTimestamp()`
- **Ключевые экспорты (projectPaths.ts):**
  - `getProjectRoot()`, `getProjectDataDirectory()`
- **Паттерны:** async fs/promises; server-only; типобезопасный `DataCollectionMap`; нормализация данных через `normalizeTrainer()` / `normalizeSchedule()` для обратной совместимости; env-переменная `SPORT_HUB_DATA_DIRECTORY` для изоляции тестов; поиск корня проекта через восхождение по дереву каталогов (package.json + src/data)
- **Кто использует:**
  - `getClubs()` → `GET /api/clubs`, `src/app/page.tsx`, `src/app/clubs/[id]/page.tsx`, `src/app/profile/athlete/page.tsx`
  - `getTrainers()` → `GET /api/trainers`, `src/app/page.tsx`, `src/app/clubs/[id]/page.tsx`
  - `getSchedule()` → `GET /api/schedule`, `src/app/page.tsx`, `src/app/clubs/[id]/page.tsx`
  - `getScheduleSlotContext()` → `src/app/booking/[scheduleId]/page.tsx`
  - `createBooking()` → `POST /api/bookings`
  - `createReview()` → `POST /api/reviews`
  - `getOfferings()` → `GET /api/trainers`, `src/app/page.tsx`, `src/app/clubs/[id]/page.tsx`
- **Зависит от:**
  - `src/lib/projectPaths.ts` → `getProjectDataDirectory()`
  - `src/types/index.ts` — все интерфейсы сущностей
  - `src/data/*.json` — 8 JSON-файлов данных

### Step 2.4: Создать утилиты и константы

- **Действие:** Создать `src/lib/utils.ts` (formatDate, formatPrice, formatPhone, getTimeUntil), `src/lib/constants.ts` (роли, статусы букинга/оплаты, дефолтный город, лимиты).
- **Проверка:** `npm run build` — без ошибок
- **Ожидаемый результат:** Утилиты готовы к использованию

**Реализация:**

- **Файлы:**
  - `src/lib/utils.ts` (146 строк) — форматирование, работа с датами, хелперы сущностей
  - `src/lib/constants.ts` (32 строки) — настройки приложения, лимиты, справочники
- **Ключевые экспорты (utils.ts):**
  - Форматирование: `cn(...values)` — конкатенация classNames, `formatDate(value, options)` — Intl.DateTimeFormat с таймзоной, `formatPrice(value, currency?)` — Intl.NumberFormat RUB, `formatPhone(value)` — маска `+7 (XXX) XXX-XX-XX`
  - Время: `getDateKeyInTimeZone(date?, tz?)` — ключ YYYY-MM-DD в Europe/Samara, `getTimeUntil(value, now?)` — «через 2 д. 3 ч.»
  - Хелперы сущностей: `getTrainerAffiliatedClubId(trainer)`, `getTrainerSportIds(trainer)`, `getTrainerPrimarySportId(trainer)`, `getScheduleClubId(slot)`, `getScheduleTrainerId(slot)`, `getBookingClubId(booking)`, `getBookingTrainerId(booking)`
- **Ключевые экспорты (constants.ts):**
  - Настройки: `DEFAULT_CITY` ('Самара'), `DEFAULT_LOCALE` ('ru-RU'), `DEFAULT_TIME_ZONE` ('Europe/Samara')
  - Справочники: `USER_ROLES`, `AUTH_ACCOUNT_TYPE_LABELS`, `AUTH_ACCOUNT_TYPE_OPTIONS`, `BOOKING_STATUSES`, `PAYMENT_STATUSES`
  - Лимиты: `APP_LIMITS` — clubsPerPage: 12, featuredClubs: 6, upcomingSessions: 6, reviewsPreview: 6, searchSuggestions: 8, maxFavoriteClubs: 12, maxActiveBookingsPerUser: 5, reviewTextMaxLength: 1000
- **Паттерны:** Intl API для локализации (ru-RU); таймзона Europe/Samara по умолчанию; хелперы сущностей абстрагируют изменения схемы данных
- **Кто использует:**
  - `formatDate()` → AthleteProfilePage, UpcomingSessions, ClubDetailPageClient
  - `formatPrice()` → ClubCard, TrainerCard, booking page
  - `cn()` → все компоненты для условных классов
  - `APP_LIMITS` → getUpcomingSessions, getTrainerAvailability, PopularNearby, PopularTrainers
  - `getDateKeyInTimeZone()` → page.tsx (фильтрация расписания на сегодня), AthleteProfilePage
- **Зависит от:** `src/types/index.ts` — типы `EntityId`, `Trainer`, `Schedule`, `Booking`

### Phase 2 — Чеклист

- [x] `src/types/index.ts` содержит интерфейсы всех сущностей
- [x] Все JSON-файлы в `src/data/` заполнены
- [x] Структура JSON соответствует TypeScript-интерфейсам
- [x] `src/lib/db.ts` читает данные из всех JSON-файлов
- [x] Утилиты и константы созданы
- [x] `npm run build` проходит без ошибок

---

## Phase 3: API Routes

> После этой фазы: REST API работает, все эндпоинты возвращают данные из JSON, валидация через Zod, тестовая среда подключена.

### Step 3.1: Создать API для видов спорта

- **Действие:** `GET /api/sports` — список всех видов спорта. Формат ответа: `{ success: true, data: [...] }`.
- **Проверка:** `curl http://localhost:3000/api/sports`
- **Ожидаемый результат:** Список из `sports.json`

**Реализация:**

- **Файлы:**
  - `src/app/api/sports/route.ts` (25 строк) — GET handler
- **Ключевые экспорты:** `GET()` — возвращает `{ success: true, data: Sport[] }`
- **Паттерны:** простой read-only endpoint без фильтров; `NextResponse.json()`
- **Кто использует:** фронтенд (SportFilters, SearchControlsPreview) через fetch
- **Зависит от:** `src/lib/db.ts` → `getSports()`

### Step 3.2: Создать API для клубов

- **Действие:** `GET /api/clubs` — список с query-фильтрами (sportId, search, minRating). Zod-схема для валидации query. `GET /api/clubs/[id]` — детали клуба с тренерами, расписанием, отзывами.
- **Проверка:** `curl http://localhost:3000/api/clubs` и `curl http://localhost:3000/api/clubs/1`
- **Ожидаемый результат:** Список фильтруется, детальная карточка содержит связанные данные

**Реализация:**

- **Файлы:**
  - `src/app/api/clubs/route.ts` (93 строки) — GET с фильтрами
  - `src/app/api/clubs/[id]/route.ts` (~60 строк) — GET детали клуба
- **Ключевые экспорты:**
  - `GET(request: NextRequest)` (clubs/route.ts) — фильтры: sportId?, search?, minRating?; Zod-схема `clubsQuerySchema`
  - `GET(request, { params })` (clubs/[id]/route.ts) — клуб с тренерами, offerings, расписанием, отзывами
- **Паттерны:** Zod-валидация query params через `z.preprocess()`; серверная фильтрация по спорту, поиску (name/description), рейтингу; 400 на ошибку валидации, 404 если клуб не найден
- **Кто использует:** `src/app/clubs/[id]/page.tsx` (детальная страница клуба); фронтенд поиск
- **Зависит от:** `src/lib/db.ts` → `getClubs()`, `getClubById()`, `getTrainers()`, `getOfferings()`, `getSchedule()`, `getReviews()`

### Step 3.3: Создать API для тренеров

- **Действие:** `GET /api/trainers` — список с фильтром по clubId, sportId. `GET /api/trainers/[id]` — детали тренера.
- **Проверка:** `curl http://localhost:3000/api/trainers?clubId=1`
- **Ожидаемый результат:** Тренеры фильтруются по клубу и спорту

**Реализация:**

- **Файлы:**
  - `src/app/api/trainers/route.ts` (91 строка) — GET с фильтрами
  - `src/app/api/trainers/[id]/route.ts` (~92 строки) — GET детали тренера
- **Ключевые экспорты:**
  - `GET(request: NextRequest)` (trainers/route.ts) — фильтры: affiliatedClubId?, clubId? (fallback), sportId?; сортировка по rating DESC → reviewCount DESC; Zod-схема валидации
  - `GET(request, { params })` (trainers/[id]/route.ts) — обогащённый ответ: trainer, affiliatedClub, offerings (отсортированы по price), primarySport, sports[], schedule[], reviews[]
- **Паттерны:** `affiliatedClubId` приоритетнее `clubId`; тренер возвращается даже без аффилированного клуба; используется `getTrainerPrimarySportId()` из utils
- **Кто использует:** фронтенд каталог тренеров; `src/app/page.tsx` (через Server Component fetch)
- **Зависит от:** `src/lib/db.ts` → `getTrainers()`, `getTrainerById()`, `getOfferings()`, `getTrainerOfferings()`, `getSchedule()`, `getReviews()`, `getSports()`; `src/lib/utils.ts` → `getTrainerPrimarySportId()`

### Step 3.4: Подключить тестовую среду

- **Действие:** Подключить `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`. Добавить scripts `test` и `test:watch`, настроить базовый test setup и зафиксировать способ запуска тестов в документации. Подготовить базовые smoke tests для ключевых API-сценариев и минимального UI-сценария рендера. После этого шага для новой логики используется режим `test first -> code -> green`.
- **Проверка:** `npm run test` — тестовая среда стартует, smoke tests проходят
- **Ожидаемый результат:** Инфраструктура тестирования готова, способ запуска зафиксирован, новая логика дальше пишется через test-first подход

**Реализация:**

- **Файлы:**
  - `vitest.config.ts` (18 строк) — конфиг тестового фреймворка
  - `src/test/setup.ts` (8 строк) — setup-файл: jest-dom matchers + cleanup
  - `src/test/mocks/server-only.ts` — мок Next.js `server-only` маркера для тестов
  - `src/test/helpers/data-directory.ts` (~50 строк) — `createIsolatedDataDirectory()`, `removeIsolatedDataDirectory()` — изоляция тестовых данных через temp-директорию
  - `src/test/api/sports.route.test.ts` (23 строки) — smoke test GET /api/sports
  - `src/test/api/clubs.route.test.ts` — тесты фильтров клубов
  - `src/test/api/trainers.route.test.ts` — тесты списка и фильтров тренеров
  - `src/test/api/schedule.route.test.ts` — тесты расписания
  - `src/test/api/bookings.route.test.ts` — тесты GET/POST записей
  - `src/test/api/reviews.route.test.ts` — тесты GET/POST отзывов
  - `src/test/lib/db.test.ts` (200+ строк) — комплексные тесты db-абстракции
  - `package.json` — скрипты `"test": "vitest run"`, `"test:watch": "vitest"`
- **Ключевые экспорты:**
  - vitest.config.ts: alias `@/` → `./src/*`, alias `server-only` → mock, environment: jsdom, setupFiles
  - data-directory.ts: `createIsolatedDataDirectory()`, `removeIsolatedDataDirectory()`
- **Паттерны:** vitest@4.1.0 + @testing-library/react@16.3.2 + jsdom@29.0.0; изоляция данных через temp-директорию + env `SPORT_HUB_DATA_DIRECTORY`; smoke tests для каждого API endpoint; test-first подход для всей новой логики
- **Зависит от:** vitest, @testing-library/react, @testing-library/jest-dom, jsdom (devDependencies)

### Step 3.5: Создать API для расписания

- **Действие:** `GET /api/schedule` — расписание с фильтрами: clubId, trainerId, sportId, date. Возвращает слоты со свободными местами.
- **Проверка:** `curl http://localhost:3000/api/schedule?clubId=1&date=2026-03-18`
- **Ожидаемый результат:** Расписание фильтруется, показывает свободные места

**Реализация:**

- **Файлы:**
  - `src/app/api/schedule/route.ts` (~80 строк) — GET с фильтрами
- **Ключевые экспорты:** `GET(request: NextRequest)` — фильтры: ownerType? ('club' | 'trainer' | 'all'), date?, clubId?, trainerId?, sportId?; Zod-валидация
- **Паттерны:** `getSchedule({ ownerType })` нормализует слоты через offerings; фильтрация по дате и владельцу
- **Кто использует:** `src/app/page.tsx` (расписание на сегодня для club-mode и trainer-mode), `src/app/clubs/[id]/page.tsx`
- **Зависит от:** `src/lib/db.ts` → `getSchedule(options)`

### Step 3.6: Создать API для записей (bookings)

- **Действие:** `GET /api/bookings` — записи пользователя. `POST /api/bookings` — создание записи с Zod-валидацией (scheduleId, userId, date), проверка свободных мест, запись в JSON.
- **Проверка:** POST создаёт запись, GET возвращает её
- **Ожидаемый результат:** Записи создаются и читаются

**Реализация:**

- **Файлы:**
  - `src/app/api/bookings/route.ts` (198 строк) — GET + POST
- **Ключевые экспорты:**
  - `GET(request: NextRequest)` — фильтр: userId; сортировка по дате
  - `POST(request: Request)` — тело: `{ scheduleId, userId, date }`; Zod-схема `createBookingSchema`
- **Паттерны:** POST выполняет бизнес-проверки: существование пользователя, существование слота, совпадение даты, отсутствие дубля активной записи, наличие свободных мест; side-effect: `incrementScheduleBookedCount()`; HTTP: 201 при успехе, 400 валидация, 404 не найден, 409 конфликт (дубль/нет мест)
- **Кто использует:** booking page (будущая), AthleteProfilePage (GET записей пользователя)
- **Зависит от:** `src/lib/db.ts` → `getBookings()`, `createBooking()`, `getScheduleById()`, `getUserById()`, `incrementScheduleBookedCount()`

### Step 3.7: Создать API для отзывов

- **Действие:** `GET /api/reviews` — отзывы с фильтром по clubId, trainerId. `POST /api/reviews` — создание с Zod-валидацией (rating 1-5, text), запись в JSON.
- **Проверка:** POST создаёт отзыв, GET возвращает его
- **Ожидаемый результат:** Отзывы создаются и читаются

**Реализация:**

- **Файлы:**
  - `src/app/api/reviews/route.ts` (~80 строк) — GET + POST
- **Ключевые экспорты:**
  - `GET(request: NextRequest)` — фильтры: clubId?, trainerId?
  - `POST(request: Request)` — тело: `{ rating: 1-5, text, clubId | trainerId, userId }`; Zod-валидация
- **Паттерны:** раздельные сценарии: отзыв о клубе и отзыв о тренере; формат ответа единый `{ success, data }` | `{ success, error }`
- **Кто использует:** `src/app/clubs/[id]/page.tsx` (список отзывов + форма создания), `GET /api/trainers/[id]` (отзывы тренера), AthleteProfilePage (отзывы пользователя)
- **Зависит от:** `src/lib/db.ts` → `getReviews()`, `createReview()`

### Phase 3 — Чеклист

- [x] `GET /api/sports` работает
- [x] `GET /api/clubs` — список с фильтрами
- [x] `GET /api/clubs/[id]` — детали с тренерами и расписанием
- [x] `GET /api/trainers` — список с фильтрами
- [x] `GET /api/trainers/[id]` — детали тренера
- [x] Тестовая среда подключена
- [x] `npm run test` выполняется
- [x] `GET /api/schedule` — расписание с фильтрами
- [x] `POST /api/bookings` — создаёт запись, проверяет места
- [x] `GET /api/bookings` — записи пользователя
- [x] `POST /api/reviews` — создаёт отзыв
- [x] Все входные данные валидируются через Zod
- [x] Формат ответов единый: `{ success, data }` или `{ success, error }`

---

## Phase 4: Базовые UI-компоненты

> После этой фазы: библиотека переиспользуемых компонентов готова, визуальный стиль определён.

### Step 4.1: Определить дизайн-токены

- **Действие:** Настроить цвета, шрифты, скругления, тени в `globals.css` через `@theme` (Tailwind 4). Основные цвета бренда, акцентный цвет, серая шкала, цвета состояний (success, error, warning).
- **Проверка:** Визуально — цвета применяются
- **Ожидаемый результат:** Единообразная визуальная система

**Реализация:**

- **Файлы:**
  - `src/app/globals.css` (83 строки) — `@theme inline` блок с CSS-переменными
- **Ключевые токены:**
  - Шрифты: `--ui-font-display` (Avenir Next, SF Pro Display), `--ui-font-body` (Avenir Next, SF Pro Text), `--ui-font-mono` (SF Mono, JetBrains Mono)
  - Цвета бренда: `--ui-accent` (#d85a32 — оранжевый), `--ui-teal` (#0c6f73)
  - Фоны: `--ui-canvas` (#f4ead7), `--ui-panel` (#fff7eb), `--ui-panel-strong`
  - Текст: `--ui-ink` (#15232a), `--ui-muted` (#61717a)
  - Состояния: `--ui-success` (#1e7b56), `--ui-warning` (#cb8b24), `--ui-danger` (#b34536)
  - Модификаторы: `--ui-accent-strong`, `--ui-accent-soft`, `--ui-line`
  - Скругления: `--ui-radius-card` (30px), `--ui-radius-pill` (999px)
  - Тени: `--ui-shadow-card`, `--ui-shadow-floating`
- **Паттерны:** Tailwind 4 `@theme inline` — токены автоматически становятся Tailwind-утилитами (`bg-ui-canvas`, `text-ui-accent`, `rounded-ui-radius-card` и т.д.); gradient body background; custom selection styling
- **Кто использует:** все компоненты проекта через Tailwind-классы

### Step 4.2: Создать базовые UI-компоненты

- **Действие:** Создать в `src/components/ui/`:
  - Button — варианты (primary, secondary, outline, ghost), размеры (sm, md, lg), loading
  - Card — контейнер с тенью и скруглениями
  - Input — текстовое поле с label, error state, иконкой
  - Modal — модальное окно с оверлеем, закрытие по Escape и клику вне
  - Badge — метка/тег для категорий
  - Rating — звёзды (чтение + интерактивный режим)
  - Skeleton — загрузчик для карточек
  - Chip — кнопка-фильтр (active/inactive)
- **Проверка:** `npm run build` без ошибок
- **Ожидаемый результат:** Готовая библиотека UI-компонентов

**Реализация:**

- **Файлы:**
  - `src/components/ui/index.ts` — реэкспорт всех UI-компонентов
  - `src/components/ui/Button.tsx` (89 строк) — Client Component
  - `src/components/ui/Card.tsx` (16 строк) — Server Component
  - `src/components/ui/Input.tsx` (66 строк) — Client Component
  - `src/components/ui/Modal.tsx` (101 строка) — Client Component
  - `src/components/ui/Badge.tsx` (33 строки) — Server Component
  - `src/components/ui/Rating.tsx` (94 строки) — Client Component
  - `src/components/ui/Skeleton.tsx` (22 строки) — Server Component
  - `src/components/ui/Chip.tsx` (32 строки) — Client Component
- **Ключевые экспорты:**
  - `Button` — пропсы: variant (primary/secondary/outline/ghost), size (sm/md/lg), loading, leadingIcon, trailingIcon, fullWidth
  - `Card` — пропсы: elevated (boolean); простой контейнер с border + rounded + padding
  - `Input` — пропсы: label, error, icon; focus ring, отображение ошибки
  - `Modal` — пропсы: open, onClose, title, description, footer, children; закрытие по Escape и overlay; слоты title/description/footer
  - `Badge` — пропсы: tone (neutral/accent/teal/success/warning/danger/outline); inline span
  - `Rating` — пропсы: value, max, interactive, onChange, disabled; clickable звёзды + display mode; русские aria-labels
  - `Skeleton` — пропсы: rounded (card/pill); pulse-анимация
  - `Chip` — пропсы: active (boolean); toggle-кнопка с active state
- **Паттерны:** `'use client'` только для интерактивных компонентов (Button, Input, Modal, Rating, Chip); Server Components для статичных (Card, Badge, Skeleton); все пропсы типизированы через interface + extends
- **Кто использует:**
  - `Button` → Header, AuthModal, PopularNearby, SearchBar, MapPreviewSection, TrainerCard, ClubDetailPageClient, AthleteFeedbackSettingsSection (5+ компонентов)
  - `Card` → ClubCard, ClubDetailPageClient, PopularNearby, MapPreviewSection, page.tsx
  - `Input` → AuthModal, SearchBar
  - `Modal` → AuthModal (единственный потребитель)
  - `Badge` → ClubCard, TrainerCard, ClubDetailPageClient, PopularNearby, MapPreviewSection, UpcomingSessions, booking page
  - `Rating` → ClubCard, TrainerCard, ClubDetailPageClient
  - `Chip` → AuthModal (табы, выбор типа аккаунта), SportFilters, SearchControlsPreview (discovery mode)
  - `Skeleton` → (зарезервирован для loading states)
- **Зависит от:** `src/app/globals.css` — дизайн-токены через Tailwind-классы

### Phase 4 — Чеклист

- [x] Дизайн-токены определены через `@theme`
- [x] Все UI-компоненты созданы и типизированы
- [x] Modal закрывается по Escape и клику вне
- [x] Rating работает в обоих режимах
- [x] `npm run build` без ошибок

---

## Phase 5: Главная страница

> После этой фазы: пользователь видит полноценную главную — поиск, фильтры, карту, клубы, популярное, ближайшие занятия.

### Step 5.1: Создать layout-компоненты

- **Действие:** Header (лого, навигация, «Войти»), Footer (ссылки-заглушки, копирайт), MobileNav (нижняя панель: Главная, Поиск, Мои записи, Профиль). Подключить в корневой `layout.tsx`. MobileNav — только на мобильных.
- **Проверка:** Десктоп — хедер + футер. Мобилка — хедер + нижняя панель.
- **Ожидаемый результат:** Каркас приложения с навигацией

**Реализация:**

- **Файлы:**
  - `src/components/layout/AppShell.tsx` (23 строки) — обёртка: Header + main (flex-1) + AuthModal + Footer + MobileNav
  - `src/components/layout/Header.tsx` (113 строк) — Client Component; лого, навигация, auth-кнопка/профиль
  - `src/components/layout/Footer.tsx` (58 строк) — брендинг, навигационные ссылки, статус
  - `src/components/layout/MobileNav.tsx` (~120 строк) — нижняя панель навигации с иконками (только mobile)
- **Ключевые экспорты:** `AppShell`, `Header`, `Footer`, `MobileNav`
- **Паттерны:** AppShell подключается в корневом `layout.tsx`; Header интегрирует `useAuthStore` и `useUIStore`; навигация: hash-якоря (#results, #availability) + ссылки на страницы; MobileNav — `md:hidden`; Header nav — `hidden md:flex`
- **Кто использует:**
  - `AppShell` → `src/app/layout.tsx` (единственный потребитель)
  - `Header` → AppShell
  - `Footer` → AppShell
  - `MobileNav` → AppShell
- **Зависит от:** `src/stores/useAuthStore.ts`, `src/stores/useUIStore.ts`, `src/components/ui/` (Button, Badge)

### Step 5.2: Создать Zustand-сторы

- **Действие:** `useFilterStore` (выбранный спорт, поисковый запрос, методы: setSearch, setSport, resetFilters). `useUIStore` (isAuthModalOpen, openAuthModal, closeAuthModal).
- **Проверка:** Состояние реактивно обновляется в компонентах
- **Ожидаемый результат:** Клиентское состояние через Zustand

**Реализация:**

- **Файлы:**
  - `src/stores/useFilterStore.ts` (44 строки) — стор фильтров и режима discovery
  - `src/stores/useUIStore.ts` (24 строки) — стор UI-состояния (модалки)
- **Ключевые экспорты (useFilterStore):**
  - State: `discoveryMode` ('clubs' | 'trainers'), `searchQuery` (string), `selectedSportId` (number | null)
  - Actions: `setDiscoveryMode(mode)`, `setSearch(value)`, `setSport(sportId)`, `resetFilters()`
  - Type: `DiscoveryMode`
- **Ключевые экспорты (useUIStore):**
  - State: `isAuthModalOpen` (boolean)
  - Actions: `openAuthModal()`, `closeAuthModal()`
- **Паттерны:** Zustand без persist (фильтры не сохраняются между сессиями); discoveryMode по умолчанию 'clubs'
- **Кто использует:**
  - `useFilterStore` → SearchControlsPreview, SearchBar, SportFilters, MapPreviewSection, PopularNearby, UpcomingSessions, ClubList, TrainerList
  - `useUIStore` → Header (openAuthModal по клику «Войти»), AuthModal (closeAuthModal)
- **Зависит от:** zustand@5.0.12

### Step 5.3: Создать поиск и фильтры-чипсы

- **Действие:** SearchBar (строка поиска, плейсхолдер «Бокс, йога, бассейн...», иконка геолокации). Filters — горизонтальный скролл Chip-компонентов с иконками категорий. Оба подключены к useFilterStore.
- **Проверка:** Ввод в поиск и клик по чипсу обновляют стор
- **Ожидаемый результат:** Поиск и фильтры работают

**Реализация:**

- **Файлы:**
  - `src/components/search/SearchBar.tsx` (76 строк) — Client Component; поле поиска с иконкой + кнопка «Рядом»
  - `src/components/search/SportFilters.tsx` (48 строк) — Client Component; горизонтальный скролл Chip-компонентов
  - `src/components/search/SearchControlsPreview.tsx` (~100 строк) — Client Component; обёртка: toggle discovery mode + SearchBar + SportFilters
- **Ключевые экспорты:** `SearchBar`, `SportFilters`, `SearchControlsPreview`
- **Паттерны:** SearchBar использует `discoveryMode` для смены плейсхолдера (клубы/тренеры); SportFilters: Chip «Все» (sportId=null) + чипсы по каждому виду спорта; SearchControlsPreview содержит `DISCOVERY_MODE_COPY` — тексты для каждого режима; показывает badge с количеством элементов каталога
- **Кто использует:** `src/app/page.tsx` → `<SearchControlsPreview>` в hero-секции
- **Зависит от:** `src/stores/useFilterStore.ts`, `src/components/ui/` (Chip, Input, Badge)

### Step 5.4: Создать карточку клуба и список

- **Действие:** ClubCard (фото, название, рейтинг, расстояние, теги, цена). ClubList — маппит массив клубов, учитывает фильтры. Клик → `/clubs/[id]`.
- **Проверка:** Список отображается, фильтруется, карточки кликабельны
- **Ожидаемый результат:** Карточки клубов работают

**Реализация:**

- **Файлы:**
  - `src/components/clubs/ClubCard.tsx` (141 строка) — Server/Client Component; карточка клуба
  - `src/components/clubs/ClubList.tsx` (~50 строк) — Client Component; список с фильтрацией
  - `src/components/clubs/filterClubs.ts` (45 строк) — хелпер фильтрации клубов
- **Ключевые экспорты:** `ClubCard`, `ClubList`, `filterClubs()`
- **Паттерны:**
  - `ClubCard`: gradient cover (4 цветовые палитры по clubId % 4); секции — city badge, название, рейтинг, описание, теги, sport badges (max 3), цена + дистанция; variant: 'default' (hover -translate-y-1) | 'carousel' (hover -translate-y-0.5); `<Link href="/clubs/${club.id}">`
  - `ClubList`: фильтрация через `filterClubs({ searchQuery, selectedSportId, clubs, sports })` из стора; grid `lg:grid-cols-2`; highlighted prop для выбранного клуба; empty state
  - `filterClubs`: поиск по name, shortDescription, description, tags, sport names; нормализация `.trim().toLocaleLowerCase('ru-RU')`
- **Кто использует:**
  - `ClubCard` → ClubList, PopularNearby (variant='carousel')
  - `ClubList` → MapPreviewSection (основная зона карта+список)
  - `filterClubs()` → ClubList
- **Зависит от:** `src/stores/useFilterStore.ts`, `src/components/ui/` (Card, Badge, Rating), `src/types/index.ts` (Club, Sport)

### Step 5.5: Создать карту-заглушку

- **Действие:** MapView — стилизованный блок с точками-метками клубов. Метки кликабельны — подсвечивают карточку в списке. `// STUB: заменить на Яндекс.Карты / 2GIS`.
- **Проверка:** Метки отображаются, клик подсвечивает карточку
- **Ожидаемый результат:** Визуальное расположение клубов

**Реализация:**

- **Файлы:**
  - `src/components/map/MapView.tsx` (~60 строк) — Client Component; fake-карта клубов
- **Ключевые экспорты:** `MapView`
- **Паттерны:** CSS-based абстрактная карта (не Leaflet/Mapbox); маркеры позиционируются через нормализацию lat/lng в проценты; каждый маркер — кнопка с инициалами клуба; responsive grid background; выбранный клуб подсвечивается; `// STUB: заменить на Яндекс.Карты / 2GIS`
- **Кто использует:** `MapPreviewSection` (club-mode)
- **Зависит от:** `src/types/index.ts` (Club — coordinates)

### Step 5.6: Собрать основную зону (карта + список)

- **Действие:** Десктоп — карта слева (40%), список справа (60%). Мобилка — карта сверху (сворачиваемая), список под ней. Tailwind responsive.
- **Проверка:** Адаптивный layout на разных размерах экрана
- **Ожидаемый результат:** Адаптивная основная зона

**Реализация:**

- **Файлы:**
  - `src/components/map/MapPreviewSection.tsx` (~60 строк) — Client Component; контейнер карта + список
- **Ключевые экспорты:** `MapPreviewSection`
- **Паттерны:** dual-mode — если `discoveryMode === 'clubs'`: MapView + ClubList; если `discoveryMode === 'trainers'`: TrainerMapView + TrainerList; state для selectedClubId / selectedTrainerId; id="results" для hash-навигации из Header
- **Кто использует:** `src/app/page.tsx` — основная зона главной страницы
- **Зависит от:** `src/stores/useFilterStore.ts` (discoveryMode), `MapView`, `ClubList`, `TrainerMapView`, `TrainerList`

### Step 5.7: Создать «Популярное рядом»

- **Действие:** Горизонтальный скролл 4-6 карточек ClubCard, топ по рейтингу. «Рядом» на MVP — просто по рейтингу без геолокации.
- **Проверка:** Секция отображается, скроллится
- **Ожидаемый результат:** Популярные клубы видны

**Реализация:**

- **Файлы:**
  - `src/components/clubs/PopularNearby.tsx` (126 строк) — Client Component; карусель популярных клубов
- **Ключевые экспорты:** `PopularNearby`
- **Паттерны:** dual-mode — если `discoveryMode === 'trainers'`, рендерит `<PopularTrainers>` вместо клубов; топ-6 клубов по rating → reviewCount → distanceKm; горизонтальная карусель с кнопками scroll (шаг 360px, smooth scroll); ClubCard variant='carousel'; scroll container ref
- **Кто использует:** `src/app/page.tsx` — секция «Популярное рядом»
- **Зависит от:** `src/stores/useFilterStore.ts`, `ClubCard`, `PopularTrainers` (trainers/), `src/types/index.ts`

### Step 5.8: Создать «Ближайшие занятия»

- **Действие:** Список 5-6 карточек: название занятия, клуб, время, свободные места. Данные из расписания на сегодня, сортировка по времени. Клик → страница записи.
- **Проверка:** Занятия на сегодня отображаются отсортированными
- **Ожидаемый результат:** Ближайшие занятия видны

**Реализация:**

- **Файлы:**
  - `src/components/schedule/UpcomingSessions.tsx` (~137 строк) — Client Component; ближайшие занятия / слоты тренеров
  - `src/components/schedule/getUpcomingSessions.ts` (77 строк) — хелпер подготовки данных
- **Ключевые экспорты:**
  - `UpcomingSessions` — пропсы: sessions[], dateLabel, trainerDateLabel, trainerSlots[]
  - `getUpcomingSessions({ clubs, schedule, targetDate, limit? })` → `UpcomingSessionItem[]`
  - Тип: `UpcomingSessionItem` — id, title, clubName, date, startTime, availableSpots, price, room
- **Паттерны:** dual-mode — если `discoveryMode === 'trainers'`, рендерит `<TrainerAvailability>` вместо клубных занятий; grid md:grid-cols-2 xl:grid-cols-3; каждая карточка → `<Link href="/booking/${session.id}">`; русская плюрализация мест; `getUpcomingSessions()` фильтрует по дате + capacity > bookedCount, сортирует по datetime → title, ограничивает по `APP_LIMITS.upcomingSessions`; id="availability" для hash-навигации
- **Кто использует:** `src/app/page.tsx` — секция «Ближайшие занятия»
- **Зависит от:** `src/stores/useFilterStore.ts`, `TrainerAvailability` (trainers/), `src/lib/constants.ts` → `APP_LIMITS`

### Step 5.9: Собрать главную целиком

- **Действие:** В `page.tsx` собрать: SearchBar → Filters → MapView + ClubList → PopularNearby → UpcomingSessions. Server Component для данных, Client Components для интерактива.
- **Проверка:** Полная страница рендерится, все секции, адаптивность
- **Ожидаемый результат:** Главная страница готова

**Реализация:**

- **Файлы:**
  - `src/app/page.tsx` (209 строк) — Server Component; главная страница, async data fetching
- **Ключевые экспорты:** default export `HomePage`
- **Паттерны:** Server Component загружает все данные: `getClubs()`, `getSchedule()`, `getSchedule({ ownerType: 'trainer' })`, `getOfferings()`, `getSports()`, `getTrainers()`; строит `trainerDirectory` через `buildTrainerDirectory()` и `trainerAvailability` через `getTrainerAvailability()`; определяет `featuredClub` и `featuredTrainer` (топ по rating → reviewCount); вычисляет `todaySchedule` через `getDateKeyInTimeZone()` + `getUpcomingSessions()`
- **Структура секций:**
  1. Hero: badges (город, кол-во клубов/тренеров), h1, описание, 5 иконок популярных видов спорта, CTA-кнопки, sidebar (сегодня в фокусе + лидер каталога)
  2. `<SearchControlsPreview>` — toggle discovery + поиск + фильтры
  3. `<MapPreviewSection>` — карта + список (dual-mode)
  4. `<PopularNearby>` — карусель популярных (dual-mode)
  5. `<UpcomingSessions>` — ближайшие занятия / слоты тренеров (dual-mode)
- **Зависит от:** `src/lib/db.ts` (все get-функции), `src/lib/utils.ts` (`getDateKeyInTimeZone`), `src/components/schedule/getUpcomingSessions.ts`, `src/components/trainers/trainer-preview.ts` (`buildTrainerDirectory`, `getTrainerAvailability`), все layout/search/map/clubs/trainers/schedule компоненты

### Phase 5 — Чеклист

- [x] Header с «Войти» на всех страницах
- [x] Footer на всех страницах
- [x] MobileNav только на мобилках
- [x] Поиск фильтрует клубы по названию
- [x] Чипсы фильтруют по виду спорта
- [x] Карточки клубов: фото, рейтинг, теги, цена
- [x] Клик по карточке → страница клуба
- [x] Карта-заглушка с метками
- [x] Десктоп: карта + список. Мобилка: карта сверху + список под ней
- [x] «Популярное рядом» — горизонтальный скролл
- [x] «Ближайшие занятия» — список на сегодня
- [x] Адаптивность (мобилка, планшет, десктоп)

---

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

## Phase 7. Страница: Личный кабинет спортсмена

После этой фазы: авторизованный пользователь с типом аккаунта `athlete` получает личный кабинет спортсмена.  
Личный кабинет на этом этапе выступает как центр активности пользователя:

- профиль;
- краткая сводка;
- предстоящие записи;
- ачивки;
- история;
- избранное;
- отзывы и базовые настройки.

Ачивки в рамках MVP реализуются как отдельный функциональный блок, который подгружается в личный кабинет спортсмена, а не встраивается как разрозненная логика прямо в страницу профиля.

### Step 7.1. Создать страницу личного кабинета спортсмена

- Создать отдельную страницу личного кабинета для пользователя с ролью `athlete`.
- Использовать текущий auth-flow как источник данных о пользователе.
- На этом этапе кабинет открывается только для авторизованного пользователя с типом `athlete`.

**Проверка:**

- страница кабинета спортсмена доступна после входа как `athlete`;
- данные пользователя читаются из текущего auth-state;
- UI не смешивается с кабинетом представителя услуг.

**Ожидаемый результат:**

- у спортсмена появляется отдельный личный кабинет в рамках MVP.

**Реализация:**

- **Файлы:**
  - `src/app/profile/athlete/page.tsx` (~25 строк) — Server Component (async); маршрут `/profile/athlete`
  - `src/components/profile/AthleteProfilePage.tsx` (492 строки) — Client Component; основной контейнер кабинета
- **Ключевые экспорты:**
  - `AthleteProfileRoute` (page.tsx) — fetches все данные: bookings, clubs, reviews, schedule, trainers, users
  - `AthleteProfilePage` — пропсы: bookings[], clubs[], reviews[], schedule[], trainers[], users[]; auth guard (isAuthenticated + accountType === 'athlete')
  - `AthleteAccessDeniedState` — компонент для неавторизованных / не-athlete
  - Хелперы: `getAthleteSummary()`, `getUpcomingProfileBookings()`
- **Паттерны:** Server Component загружает данные → передаёт Client Component через props; Client Component фильтрует данные для текущего пользователя через `useAuthStore`; `useMemo` для derived data (summary, achievements, history, favorites, reviews); auth guard рендерит `AthleteAccessDeniedState` если не athlete
- **Кто использует:** Header → ссылка на `/profile/athlete` для авторизованных athlete
- **Зависит от:** `src/lib/db.ts` (getBookings, getClubs, getReviews, getSchedule, getTrainers, getUsers), `src/stores/useAuthStore.ts`, `src/stores/useUIStore.ts`, все profile-секции и хелперы

---

### Step 7.2. Добавить верхний блок профиля и краткой сводки

- В верхней части страницы показать:
  - имя;
  - email;
  - телефон;
  - аватар-заглушку;
  - кнопку `Выйти`.
- Добавить краткую сводку:
  - ближайшие записи;
  - количество посещений;
  - количество отзывов;
  - количество открытых ачивок.

**Проверка:**

- верхний блок отображает пользователя корректно;
- краткая сводка отображается отдельными метриками;
- logout работает и сбрасывает состояние.

**Ожидаемый результат:**

- спортсмен видит основные данные профиля и быстрый обзор своей активности.

**Реализация:**

- **Файлы:**
  - `src/components/profile/AthleteProfilePage.tsx` — верхний блок профиля (внутри основного компонента)
- **Ключевые детали:**
  - Профиль: имя, email, телефон, аватар-заглушка (круг с инициалом), кнопка «Выйти»
  - Краткая сводка (`getAthleteSummary()`): ближайшие записи (count), количество посещений (completed), количество отзывов, количество открытых ачивок
  - `getPersonalCabinetConfig(accountType)` — отображает тип кабинета
- **Паттерны:** метрики вычисляются через useMemo из props-данных; кнопка logout вызывает `useAuthStore().logout()`

---

### Step 7.3. Добавить блок "Предстоящие записи"

- Вывести ближайшие записи пользователя.
- Для каждой записи показывать:
  - тип занятия;
  - клуб или тренера;
  - дату и время;
  - статус записи.
- Использовать уже существующие данные о записях.

**Проверка:**

- отображаются только будущие или актуальные записи;
- пустое состояние обработано;
- список не ломает страницу при отсутствии данных.

**Ожидаемый результат:**

- личный кабинет показывает, что у пользователя запланировано дальше.

**Реализация:**

- **Файлы:**
  - `src/components/profile/AthleteProfilePage.tsx` — секция «Предстоящие записи» (внутри основного компонента)
- **Ключевые детали:**
  - `getUpcomingProfileBookings()` — фильтрует записи: status !== 'cancelled' && status !== 'completed', дата >= сегодня
  - Для каждой записи: тип занятия, клуб/тренер (через `getBookingClubId()` / `getBookingTrainerId()`), дата и время, статус
  - Пустое состояние обработано
- **Паттерны:** `getDateKeyInTimeZone()` для сравнения дат в Europe/Samara; привязка записи к клубу/тренеру через хелперы из utils.ts

---

### Step 7.4. Добавить отдельный блок ачивок

- Реализовать ачивки как отдельный функциональный блок, подключаемый в кабинет спортсмена.
- На странице показать:
  - количество открытых ачивок;
  - открытые ачивки;
  - ачивки в процессе;
  - общий прогресс.
- На этом этапе использовать MVP-набор ачивок, связанных с активностью пользователя.

**MVP-набор ачивок:**

- `Вовремя` — 5 посещений подряд без отмен
- `Неделя без пропусков` — 3 занятия за 7 дней
- `Первый отзыв` — первый отзыв
- `Голос сообщества` — 3 отзыва
- `Исследователь` — 2 разных клуба
- `Возвращение в зал` — 3 завершённых занятия
- `На спорте всерьёз` — 10 завершённых занятий

**Проверка:**

- блок ачивок отображается отдельно от остальных секций кабинета;
- открытые и прогрессируемые ачивки считаются корректно по текущим данным;
- отсутствие достижений не ломает UI.

**Ожидаемый результат:**

- ачивки становятся самостоятельной частью MVP-функционала и подгружаются в ЛК спортсмена как отдельный блок.

**Реализация:**

- **Файлы:**
  - `src/components/profile/AthleteAchievementsSection.tsx` (128 строк) — Client Component; отображение ачивок
  - `src/components/profile/athlete-achievements.ts` (183 строки) — логика расчёта ачивок
- **Ключевые экспорты:**
  - `AthleteAchievementsSection` — отображает: общий прогресс (%), открытые ачивки, ачивки в процессе
  - `getAthleteAchievements(params)` → `AthleteAchievement[]`
  - `getOverallProgressPercent()` — процент прогресса
  - Типы: `AthleteAchievementId`, `AthleteAchievement`
- **MVP-набор ачивок (7 штук):**
  - `on-time` — 5 посещений подряд без отмен
  - `week-without-skips` — 3 занятия за 7 дней
  - `first-review` — первый отзыв
  - `community-voice` — 3 отзыва
  - `explorer` — 2 разных клуба
  - `back-to-the-gym` — 3 завершённых занятия
  - `serious-about-sport` — 10 завершённых занятий
- **Паттерны:** ачивки реализованы как отдельный модуль с чистой функцией; прогресс рассчитывается из bookings/reviews; UI отделён от логики
- **Кто использует:** `AthleteProfilePage` → рендерит `<AthleteAchievementsSection>`
- **Зависит от:** данные bookings и reviews из props AthleteProfilePage

---

### Step 7.5. Добавить блок "История"

- Показать прошедшие занятия пользователя.
- В истории отображать:
  - завершённые занятия;
  - посещённые клубы;
  - персональные тренировки;
  - связь с отзывами, если применимо.

**Проверка:**

- история не смешивается с предстоящими записями;
- корректно отображается список завершённых активностей;
- пустое состояние поддержано.

**Ожидаемый результат:**

- спортсмен видит, что уже посещал, и может ориентироваться по прошлой активности.

**Реализация:**

- **Файлы:**
  - `src/components/profile/AthleteHistorySection.tsx` (97 строк) — Client Component; блок истории
  - `src/components/profile/athlete-history.ts` (101 строка) — логика подготовки данных
- **Ключевые экспорты:**
  - `AthleteHistorySection` — отображает: завершённые записи, кол-во посещённых клубов, кол-во персональных тренировок
  - `getAthleteHistoryItems(params)` → `AthleteHistoryItem[]`
  - `getPersonalTrainingLabel()` — русская плюрализация
  - Тип: `AthleteHistoryItem`
- **Паттерны:** фильтрация bookings по `status === 'completed'`; определение формата (personal если capacity ≤ 2, иначе group); проверка наличия отзыва для каждой записи; сортировка по дате DESC
- **Кто использует:** `AthleteProfilePage` → рендерит `<AthleteHistorySection>`
- **Зависит от:** данные bookings, schedule, clubs, reviews из props

---

### Step 7.6. Добавить блок "Избранное"

- Показать избранные сущности пользователя:
  - избранные клубы;
  - избранные тренеры.
- Блок должен быть отдельной секцией кабинета.

**Проверка:**

- избранные клубы и тренеры отображаются отдельно;
- если данных нет, отображается пустое состояние;
- карточки не ломают сетку кабинета.

**Ожидаемый результат:**

- в личном кабинете появляется удобный доступ к сохранённым вариантам.

**Реализация:**

- **Файлы:**
  - `src/components/profile/AthleteFavoritesSection.tsx` (95 строк) — Client Component; блок избранного
  - `src/components/profile/athlete-favorites.ts` (134 строки) — логика подбора избранного
- **Ключевые экспорты:**
  - `AthleteFavoritesSection` — два столбца: избранные клубы и избранные тренеры
  - `getAthleteFavorites(params)` → `AthleteFavorites`
  - Типы: `AthleteFavoriteTrainer`, `AthleteFavorites`
- **Паттерны:**
  - Клубы: из `user.favoriteClubIds`
  - Тренеры: скоринг — reviews × 10 + bookings × 4; топ-4 тренера с пояснением причины
  - Причины: «Есть отзыв», «Есть записи», «В каталоге»
  - Пустое состояние для обоих списков
- **Кто использует:** `AthleteProfilePage` → рендерит `<AthleteFavoritesSection>`
- **Зависит от:** данные clubs, trainers, bookings, reviews из props; `user.favoriteClubIds`

---

### Step 7.7. Добавить блок "Отзывы / базовые настройки"

- В нижней части кабинета показать:
  - отзывы пользователя;
  - базовые настройки профиля в формате MVP.
- Настройки на этом этапе могут быть заглушкой без глубокой редактируемости.

**Проверка:**

- блок существует как отдельная секция;
- если отзывов нет, UI корректно это отражает;
- базовые настройки не конфликтуют с auth-flow.

**Ожидаемый результат:**

- кабинет завершён как целостная страница с основными сценариями спортсмена.

**Реализация:**

- **Файлы:**
  - `src/components/profile/AthleteFeedbackSettingsSection.tsx` (163 строки) — Client Component; блок отзывов + настройки
  - `src/components/profile/athlete-review-items.ts` — логика подготовки отзывов
- **Ключевые экспорты:**
  - `AthleteFeedbackSettingsSection` — отзывы (expand/collapse: первые 3, затем все) + базовые настройки
  - `getAthleteReviewItems(params)` → `AthleteReviewItem[]`
  - Константа: `INITIAL_VISIBLE_REVIEWS_COUNT = 3`
  - Тип: `AthleteReviewItem`
- **Паттерны:** state `isExpanded` для показа/скрытия полного списка отзывов; настройки read-only (MVP): тип кабинета, email, телефон, storage key; отзывы в формате карточек с рейтингом
- **Кто использует:** `AthleteProfilePage` → рендерит `<AthleteFeedbackSettingsSection>`
- **Зависит от:** данные reviews из props; `useAuthStore` для данных профиля

---

### Чек-лист Phase 7

- [x] У пользователя с ролью `athlete` есть отдельный личный кабинет
- [x] Верхний блок профиля отображает основные данные пользователя
- [x] Краткая сводка показывает ключевые метрики
- [x] Есть блок предстоящих записей
- [x] Есть отдельный блок ачивок
- [x] Ачивки не зашиты в профиль напрямую, а подключаются как самостоятельный блок
- [x] В MVP используются выбранные ачивки спортсмена
- [x] Есть блок истории
- [x] Есть блок избранного
- [x] Есть блок отзывов / базовых настроек
- [x] Пустые состояния обработаны
- [x] Страница не ломается без данных

---

## Phase 8: Архитектурное разделение каталогов клубов и тренеров

> После этой фазы: MVP поддерживает две независимые предметные модели:
> 1) клубы и услуги клуба;
> 2) тренеры и услуги тренера.
> Маршрут `/booking/[scheduleId]` остаётся единым входом в запись, но больше не завязан жёстко только на клубный сценарий.

> Сквозное требование для всех шагов Phase 8:
> сначала обновляются или добавляются тесты, затем пишется реализация, затем обязательная полная проверка:
> `npm run test` → `npm run lint` → `npm run build` → runtime / curl / ручная проверка по сценарию шага.

### Step 8.1: Пересобрать доменную модель тренеров и услуг

- Обновить типы данных так, чтобы тренер стал самостоятельной сущностью услуг, а не только вложением клуба.
- Ввести отдельную сущность услуги, например `Offering`:
  - `ownerType: 'club' | 'trainer'`
  - `ownerId`
  - `sportId`
  - `title`
  - `description`
  - `format`
  - `price`
  - `durationMinutes`
  - `capacity`
  - `address`
  - `coordinates`
  - `affiliatedClubId?`
- Обновить `Trainer`:
  - собственные `city`, `address`, `coordinates`;
  - собственные данные по услугам и позиционированию;
  - связь с клубом сделать опциональной: `affiliatedClubId?`.
- Подготовить обновлённые типы `Schedule` и `Booking`, чтобы они опирались на услугу и слот, а не только на клуб.

**Проверка:**

- TypeScript-типы отражают новую модель без временных заглушек.
- Тесты на типизированные контракты и бизнес-форму данных обновлены.
- Старая логика не опирается на обязательный `trainer.clubId`.

**Ожидаемый результат:**

- В проекте появляется нейтральная модель услуг, на которой можно одинаково строить каталог клубов и каталог тренеров.

**Реализация:**

- **Файлы:**
  - `src/types/index.ts` (151 строка) — обновлённые типы
- **Ключевые изменения:**
  - Добавлен тип `CatalogOwnerType = 'club' | 'trainer'`
  - Добавлен интерфейс `Offering`: ownerType, ownerId, sportId, title, description, format ('group' | 'personal' | 'mini_group'), price, durationMinutes, capacity, address, coordinates, affiliatedClubId?
  - `Trainer` обновлён: собственные city, address, coordinates; `affiliatedClubId?` (опциональная связь с клубом); `clubId` deprecated
  - `Schedule` обновлён: опирается на ownerType + offering, а не только на клуб
  - `Booking` обновлён: scheduleId как основа записи, без обязательного clubId
  - Добавлен тип `OfferingFormat = 'group' | 'personal' | 'mini_group'`
- **Паттерны:** `Offering` как нейтральная модель услуг — ownerType абстрагирует провайдера; тренер стал самостоятельной сущностью с собственной геолокацией
- **Кто использует:** все API routes, db.ts, компоненты каталога, booking page
- **Зависит от:** только TypeScript

---

### Step 8.2: Обновить JSON-данные и абстракцию БД под новую модель

- Добавить новую коллекцию данных услуг, например `src/data/offerings.json`.
- Разнести текущие данные так, чтобы:
  - профили тренеров жили отдельно;
  - услуги клуба и услуги тренера жили отдельно;
  - расписание ссылалось на услугу;
  - записи могли ссылаться на услугу и слот без обязательной привязки только к клубу.
- Обновить `lib/db.ts`:
  - чтение новой коллекции услуг;
  - выборка клубных услуг;
  - выборка тренерских услуг;
  - получение слота вместе с его владельцем и метаданными.

**Проверка:**

- JSON-структуры читаются без ошибок.
- `lib/db.ts` покрывает новые сценарии чтения.
- Тестовые фикстуры и isolated data directory обновлены под новую схему.

**Ожидаемый результат:**

- Данные клубов, тренеров, услуг и слотов разделены и доступны через единую абстракцию.

**Реализация:**

- **Файлы:**
  - `src/data/offerings.json` — новая коллекция услуг: ownerType, ownerId, sportId, title, format, price, durationMinutes, capacity, address, coordinates, affiliatedClubId
  - `src/data/trainers.json` — обновлён: собственные city, address, coordinates; affiliatedClubId опционален
  - `src/data/schedule.json` — обновлён: ссылки на offering/ownerType
  - `src/lib/db.ts` (330 строк) — обновлён новыми функциями
- **Ключевые экспорты (новые в db.ts):**
  - `getOfferings()` → Offering[]
  - `getOfferingById(id)` → Offering | null
  - `getClubOfferings(clubId)` → Offering[] (фильтр ownerType === 'club' && ownerId === clubId)
  - `getTrainerOfferings(trainerId)` → Offering[] (фильтр ownerType === 'trainer' && ownerId === trainerId)
  - `getSchedule({ ownerType? })` — нормализует слоты через offerings; фильтрация по ownerType ('club' | 'trainer' | 'all')
  - `getScheduleSlotContext(id)` → `ScheduleSlotContext` — обогащённый слот: { affiliatedClub, club, offering, schedule, trainer }
  - Тип: `GetScheduleOptions = { ownerType?: 'club' | 'trainer' | 'all' }`
- **Паттерны:** `normalizeSchedule()` резолвит owner info из offerings; `DataCollectionMap` расширен коллекцией offerings; тестовые фикстуры обновлены через `createIsolatedDataDirectory()`
- **Кто использует:** все API routes, page.tsx, booking page, profile page
- **Зависит от:** `src/lib/projectPaths.ts`, `src/types/index.ts`, `src/data/*.json`

---

### Step 8.3: Пересобрать API-контракты каталога, расписания и записи

- Обновить API так, чтобы они работали поверх новой модели:
  - `GET /api/trainers`;
  - `GET /api/trainers/[id]`;
  - `GET /api/schedule`;
  - `GET /api/bookings`;
  - `POST /api/bookings`;
  - `GET /api/reviews`;
  - `POST /api/reviews`.
- Для `bookings` перевести контракт на слот и услугу:
  - запись создаётся по `scheduleId`;
  - внутри сохраняются нейтральные данные о владельце услуги;
  - `clubId` перестаёт быть обязательной основой записи.
- Для `reviews` сохранить раздельные сценарии:
  - отзыв о клубе;
  - отзыв о тренере.
- Для `trainers/[id]` вернуть независимую карточку тренера с его услугами, слотами и отзывами без обязательности клуба.

**Проверка:**

- API smoke tests обновлены и проходят.
- `POST /api/bookings` создаёт запись как для клубной, так и для тренерской услуги.
- `GET /api/trainers/[id]` возвращает тренера даже при отсутствии аффилированного клуба.

**Ожидаемый результат:**

- API перестаёт быть клубо-центричным и поддерживает оба каталога как равноправные.

**Реализация:**

- **Файлы:**
  - `src/app/api/trainers/route.ts` (91 строка) — обновлён: фильтр по affiliatedClubId, sportId; сортировка rating → reviewCount
  - `src/app/api/trainers/[id]/route.ts` (92 строки) — обновлён: независимая карточка тренера с offerings, slots, reviews
  - `src/app/api/schedule/route.ts` — обновлён: ownerType-фильтр
  - `src/app/api/bookings/route.ts` (198 строк) — обновлён: запись по scheduleId без обязательного clubId
  - `src/app/api/reviews/route.ts` — сохранены раздельные сценарии: отзыв о клубе и отзыв о тренере
- **Ключевые изменения:**
  - `GET /api/trainers/[id]` возвращает: trainer, affiliatedClub (может быть null), offerings (sorted by price), primarySport, sports[], schedule[], reviews[]
  - `POST /api/bookings` создаёт запись через scheduleId — внутри сохраняются нейтральные данные о владельце
  - `GET /api/schedule` поддерживает `ownerType` query param
- **Паттерны:** API нейтральны к типу каталога; Zod-схемы обновлены; тесты обновлены

---

### Step 8.4: Нейтрализовать страницу записи под slot-based сценарий

- Обновить `/booking/[scheduleId]`, чтобы страница записи открывала любой слот:
  - клубной услуги;
  - тренерской услуги.
- На странице показать:
  - владельца услуги;
  - тип услуги;
  - дату и время;
  - адрес;
  - стоимость;
  - доступные места.
- Не делать пока отдельную публичную страницу тренера — этот сценарий выносится в будущую фазу.

**Проверка:**

- Из клубного сценария запись открывается как раньше.
- Из тренерского сценария запись открывается на том же маршруте.
- UI не падает, если у тренера нет клуба.

**Ожидаемый результат:**

- Маршрут записи становится общей точкой входа для обоих типов услуг.

**Реализация:**

- **Файлы:**
  - `src/app/booking/[scheduleId]/page.tsx` (168 строк) — Server Component; страница записи
- **Ключевые экспорты:** default export — async Server Component
- **Паттерны:**
  - Route param: `scheduleId` (валидация: positive integer)
  - Данные: `getScheduleSlotContext(scheduleId)` → `ScheduleSlotContext` { affiliatedClub, club, offering, schedule, trainer }
  - 404 если слот не найден
  - Отображение: badges (ownerType label, дата, свободные места), title + description, 3-колоночная сетка (владелец, дата/время, стоимость/формат), 2-колоночная сетка (адрес, тренер/ведущий), карточка описания
  - Константы: `OWNER_TYPE_LABELS` { club → 'Услуга клуба', trainer → 'Услуга тренера' }, `OFFERING_FORMAT_LABELS` (маппинг формата в русский текст)
  - Read-only на MVP (форма записи — будущая фаза)
- **Кто использует:** UpcomingSessions → `<Link href="/booking/${session.id}">`, TrainerAvailability → `<Link href="/booking/${slot.id}">`
- **Зависит от:** `src/lib/db.ts` → `getScheduleSlotContext()`, `src/components/ui/` (Badge, Card)

---

### Чек-лист Phase 8

- [x] Тренер больше не является только вложением клуба
- [x] В проекте есть отдельная сущность услуги
- [x] Услуги клуба и услуги тренера разделены
- [x] Расписание опирается на услугу и слот
- [x] Запись на слот не зависит жёстко от клуба
- [x] `/booking/[scheduleId]` работает для обоих типов услуг
- [x] API-контракты обновлены под новую модель
- [x] Тестовые фикстуры и API tests обновлены
- [x] `npm run test` выполняется
- [x] `npm run lint` выполняется
- [x] `npm run build` выполняется

---

## Phase 9: Главная страница и каталог тренеров

> После этой фазы: пользователь может на главной переключаться между двумя независимыми режимами:
> 1) поиск по клубам и услугам клуба;
> 2) поиск по тренерам и услугам тренера.
> Главная страница перестраивает карту, выдачу, подборки и блок доступных слотов под выбранный режим.

> Сквозное требование для всех шагов Phase 9:
> сначала обновляются или добавляются тесты, затем пишется реализация, затем обязательная полная проверка:
> `npm run test` → `npm run lint` → `npm run build` → ручная проверка сценариев главной страницы.

### Step 9.1: Добавить режимы discovery на главной странице

- Расширить `useFilterStore` новым состоянием `discoveryMode: 'clubs' | 'trainers'`.
- В search-блоке добавить два переключателя:
  - `По клубам и направлениям`;
  - `По тренерам и направлениям`.
- По умолчанию активен режим клубов.
- Обновить копирайт и статусы блока под выбранный режим.

**Проверка:**

- Главная по умолчанию открывается в режиме клубов.
- Переключение меняет заголовки, описания и UI-состояния.
- Тесты на store и search controls обновлены.

**Ожидаемый результат:**

- У главной появляется два независимых режима поиска.

**Реализация:**

- **Файлы:**
  - `src/stores/useFilterStore.ts` (44 строки) — добавлен `discoveryMode: 'clubs' | 'trainers'`
  - `src/components/search/SearchControlsPreview.tsx` (~100 строк) — обновлён: toggle discovery mode
- **Ключевые экспорты:**
  - `useFilterStore` → state: `discoveryMode`, action: `setDiscoveryMode(mode)`
  - Тип: `DiscoveryMode = 'clubs' | 'trainers'`
- **Ключевые детали (SearchControlsPreview):**
  - Два Chip-переключателя: «По клубам и направлениям» / «По тренерам и направлениям»
  - `DISCOVERY_MODE_COPY` — тексты (заголовки, описания) для каждого режима
  - Badge с количеством элементов каталога (clubs.length / trainers.length)
  - При переключении: обновляется заголовок, описание, плейсхолдер поиска
- **Паттерны:** по умолчанию 'clubs'; discoveryMode не persist'ится (сбрасывается при перезагрузке); все компоненты главной реагируют на discoveryMode через useFilterStore
- **Кто использует:** MapPreviewSection, PopularNearby, UpcomingSessions — переключают club/trainer контент
- **Зависит от:** zustand@5.0.12, Chip component

---

### Step 9.2: Реализовать карту и список тренеров

- Собрать отдельную trainer-выдачу на основе новых данных:
  - fake-карта с маркерами тренеров;
  - список карточек тренеров;
  - пустые состояния для trainer-mode.
- Карточка тренера показывает:
  - имя;
  - направления;
  - стаж;
  - рейтинг;
  - стоимость;
  - адрес / район;
  - признаки доступных услуг.
- Отдельную публичную страницу тренера пока не делать.

**Проверка:**

- В режиме `trainers` карта и список перестраиваются полностью.
- Поиск и sport-фильтр работают по тренерам и услугам тренера.
- Пустая trainer-выдача обрабатывается корректно.

**Ожидаемый результат:**

- Главная поддерживает полноценный каталог тренеров.

**Реализация:**

- **Файлы:**
  - `src/components/trainers/TrainerCard.tsx` (215 строк) — Client Component; карточка тренера
  - `src/components/trainers/TrainerList.tsx` (74 строки) — Client Component; список с фильтрацией
  - `src/components/trainers/TrainerMapView.tsx` (150 строк) — Client Component; fake-карта тренеров
  - `src/components/trainers/filterTrainers.ts` (29 строк) — хелпер фильтрации
  - `src/components/trainers/trainer-preview.ts` (244 строки) — сборка директории тренеров и слотов
  - `src/components/trainers/index.ts` — реэкспорт всех компонентов, функций и типов
- **Ключевые экспорты:**
  - `TrainerCard` — пропсы: trainer (TrainerDirectoryItem), variant ('default' | 'carousel'), highlighted?; gradient cover (8 цветовых палитр по trainerId); initials avatar; секции: city, experience, format, bio, rating, price, distance, venue, specialties, sports badges, next slot, booking link
  - `TrainerList` — фильтрация через `filterTrainers()` из стора; grid `lg:grid-cols-2`; highlighted prop; empty state
  - `TrainerMapView` — CSS-based абстрактная карта; маркеры: порядковый номер + имя (усечённое); selection state; хелперы: `getMarkerPositions()` (нормализация координат в %), `getMarkerLabel()`
  - `filterTrainers({ searchQuery, selectedSportId, trainers })` — фильтрация по sportIds.includes() + searchText.includes(); нормализация `.trim().toLocaleLowerCase('ru-RU')`
  - `buildTrainerDirectory({ clubs, offerings, schedule, sports, trainers })` → `TrainerDirectoryItem[]` — обогащённые тренеры: offerings, slots, venue, search text, next slot; сортировка: rating → reviewCount → name (кириллица)
  - `getTrainerAvailability({ schedule, trainers, limit? })` → `TrainerAvailabilityItem[]` — свободные слоты тренеров; сортировка: date → startTime → trainerName
  - Типы: `TrainerDirectoryItem` (30+ полей), `TrainerAvailabilityItem` (8+ полей), `TrainerPreviewSport`
- **Паттерны:** `buildTrainerDirectory()` — полная агрегация: группировка offerings/schedule по trainerId, определение primary offering (min price → title), venue (из offering или trainer), searchText (name + bio + specialties + sports + offerings + venue); фильтрация тренеров без coordinates/address
- **Кто использует:**
  - `TrainerCard` → TrainerList, PopularTrainers (variant='carousel')
  - `TrainerList` → MapPreviewSection (trainer-mode)
  - `TrainerMapView` → MapPreviewSection (trainer-mode)
  - `buildTrainerDirectory()` → `src/app/page.tsx` (Server Component)
  - `getTrainerAvailability()` → `src/app/page.tsx`
- **Зависит от:** `src/stores/useFilterStore.ts`, `src/components/ui/` (Badge, Card, Rating), `src/types/index.ts`, `src/lib/constants.ts` → `APP_LIMITS`

---

### Step 9.3: Добавить блок популярных тренеров и доступных слотов тренеров

- В режиме `trainers` заменить блок `Популярное рядом` на блок `Популярные тренеры`.
- Нижний блок `Ближайшие занятия` в trainer-mode перестроить в сценарий доступных слотов тренеров:
  - ближайшие свободные окна;
  - переход в запись через `/booking/[scheduleId]`.
- Для club-mode сохранить текущую логику.

**Проверка:**

- Club-mode сохраняет текущие блоки.
- Trainer-mode показывает популярную выдачу тренеров и слоты тренерских услуг.
- Переходы в запись работают из обоих режимов.

**Ожидаемый результат:**

- Trainer-mode выглядит как самостоятельный полноценный каталог, а не как урезанная версия клубного режима.

**Реализация:**

- **Файлы:**
  - `src/components/trainers/PopularTrainers.tsx` (114 строк) — Client Component; карусель популярных тренеров
  - `src/components/trainers/TrainerAvailability.tsx` (120 строк) — Client Component; слоты тренеров
- **Ключевые экспорты:**
  - `PopularTrainers` — топ-6 тренеров по rating → reviewCount → distanceKm ASC; горизонтальная карусель с кнопками scroll (шаг 360px, smooth scroll); TrainerCard variant='carousel'; scroll container ref
  - `TrainerAvailability` — grid md:grid-cols-2 xl:grid-cols-3; каждый слот: trainer name, title, availability, time, cost, venue; `<Link href="/booking/${slot.id}">`; хелпер `getPlacesLabel(value)` для русской плюрализации; empty state
- **Паттерны:** PopularTrainers аналогичен PopularNearby по UX; TrainerAvailability аналогичен UpcomingSessions (club-mode) по UX; оба интегрированы через discoveryMode в parent-компонентах
- **Кто использует:**
  - `PopularTrainers` → `PopularNearby` (рендерится когда discoveryMode === 'trainers')
  - `TrainerAvailability` → `UpcomingSessions` (рендерится когда discoveryMode === 'trainers')
- **Зависит от:** `TrainerCard`, `src/components/ui/` (Badge, Card, Button), `src/lib/constants.ts`

---

### Step 9.4: Нейтрализовать якоря, навигацию и тестовый контракт главной

- Обновить якоря и названия секций в Header и на главной так, чтобы они подходили и клубному, и тренерскому режиму.
- Пересобрать все тесты главной страницы, поиска, карты, списков, подборок и слотов под новый контракт.
- Синхронизировать документацию по новым пользовательским поверхностям MVP.

**Проверка:**

- Header ведёт в корректные секции в обоих режимах.
- Component tests и smoke tests главной страницы зелёные.
- Документация отражает два режима поиска.

**Ожидаемый результат:**

- Новая логика главной страницы зафиксирована в коде, тестах и документации.

**Реализация:**

- **Файлы:**
  - `src/components/layout/Header.tsx` (113 строк) — обновлены якоря навигации: «Подборки», «Выдача», «Слоты» (нейтральны к режиму)
  - `src/components/map/MapPreviewSection.tsx` — обновлён: dual-mode rendering (MapView + ClubList / TrainerMapView + TrainerList)
  - `src/components/clubs/PopularNearby.tsx` — обновлён: если trainers-mode → рендерит PopularTrainers
  - `src/components/schedule/UpcomingSessions.tsx` — обновлён: если trainers-mode → рендерит TrainerAvailability
  - `src/test/` — обновлены тесты: store tests, component tests, smoke tests главной
  - `CLAUDE.md`, `IMPLEMENTATION_PLAN.md`, `README.md`, `STACK_OVERVIEW.md` — синхронизированы
- **Паттерны:** якоря (#results, #availability) работают в обоих режимах; Header не содержит mode-specific текстов; component tests покрывают оба режима discovery; документация отражает dual discovery

---

### Чек-лист Phase 9

- [x] На главной есть два режима discovery
- [x] По умолчанию активен режим клубов
- [x] Есть отдельная trainer-выдача
- [x] Есть fake-карта тренеров
- [x] Есть список карточек тренеров
- [x] Есть блок популярных тренеров
- [x] Есть блок доступных слотов тренеров
- [x] Переход в запись работает из обоих режимов
- [x] Header и якоря нейтральны к типу каталога
- [x] Пустые состояния обработаны
- [x] `npm run test` выполняется
- [x] `npm run lint` выполняется
- [x] `npm run build` выполняется

---

## Phase 10: Личный кабинет (детализация позже)

> После этой фазы: залогиненный пользователь видит записи, историю и избранное.

- Страница `/profile` — доступна залогиненным
- Предстоящие записи
- История посещений
- Избранные клубы
- Профиль (имя, email, телефон) — редактирование заглушка
- Кнопка «Выйти»

> Степы будут детализированы перед началом работы над фазой.

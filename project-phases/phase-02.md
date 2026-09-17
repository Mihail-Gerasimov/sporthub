# Phase 02

> Этот файл содержит одну фазу проекта целиком. Главный вход в контекст — `CLAUDE.md`, навигация по фазам — через `PHASES_OVERVIEW.md`.
> В ежедневной работе открывай прежде всего активную фазу и не перечитывай все phase-файлы подряд без необходимости.
> Структура фазы сохраняется в исходном стиле: заголовок фазы, краткий результат, шаги по порядку, затем чеклист и статус.
> Перед стартом новой фазы проверь, что для неё уже есть отдельный `phase-XX.md`, и после завершения шагов или фазы синхронизируй статус здесь, в `PHASES_OVERVIEW.md`, `CLAUDE.md`, `README.md` и при необходимости в `STACK_OVERVIEW.md`.

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


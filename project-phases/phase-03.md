# Phase 03

> Этот файл содержит одну фазу проекта целиком. Главный вход в контекст — `CLAUDE.md`, навигация по фазам — через `PHASES_OVERVIEW.md`.
> В ежедневной работе открывай прежде всего активную фазу и не перечитывай все phase-файлы подряд без необходимости.
> Структура фазы сохраняется в исходном стиле: заголовок фазы, краткий результат, шаги по порядку, затем чеклист и статус.
> Перед стартом новой фазы проверь, что для неё уже есть отдельный `phase-XX.md`, и после завершения шагов или фазы синхронизируй статус здесь, в `PHASES_OVERVIEW.md`, `CLAUDE.md`, `README.md` и при необходимости в `STACK_OVERVIEW.md`.

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


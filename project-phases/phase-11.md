# Phase 11

> Этот файл содержит одну фазу проекта целиком. Главный вход в контекст — `CLAUDE.md`, навигация по фазам — через `PHASES_OVERVIEW.md`.
> В ежедневной работе открывай прежде всего активную фазу и не перечитывай все phase-файлы подряд без необходимости.
> Структура фазы сохраняется в исходном стиле: заголовок фазы, краткий результат, шаги по порядку, затем чеклист и статус.
> Перед стартом новой фазы проверь, что для неё уже есть отдельный `phase-XX.md`, и после завершения шагов или фазы синхронизируй статус здесь, в `PHASES_OVERVIEW.md`, `CLAUDE.md`, `README.md` и при необходимости в `STACK_OVERVIEW.md`.

## Phase 11: Внутренняя карточка тренера (`/trainers/[id]`)

> После этой фазы: у каждого тренера есть полноценная публичная страница с hero, инфо, услугами, расписанием, отзывами и формой записи.

### Step 11.1: Server Component `src/app/trainers/[id]/page.tsx`

- Создать Server Component по аналогии с `src/app/clubs/[id]/page.tsx`
- Валидация `id` (положительное целое), `notFound()` если невалидный
- `getTrainerById(id)`, `notFound()` если не найден
- Параллельная загрузка: `getOfferings()`, `getSports()`, `getSchedule()`, `getReviews()`, `getUsers()`
- Фильтрация: offerings, schedule, reviews, sports по trainer
- Определение `affiliatedClub` из offerings → `getClubById(affiliatedClubId)`
- Формирование `reviewAuthors` map
- Передача в `TrainerDetailPageClient`

### Step 11.2: Client Component — Hero + Info + Специализации + Связанный клуб

- Создать `TrainerDetailPageClient` со статическими секциями
- Вынести `getCoverPalette` и `getTrainerInitials` из TrainerCard в `trainer-utils.ts`
- Обновить импорты в TrainerCard
- Hero section — gradient cover с инициалами, badges: city, experience, reviewCount
- Info card — имя, rating, bio, address, priceFrom. Grid `xl:grid-cols-[1.15fr_0.85fr]`
- Специализации — badges specialties + sports (icon + name)
- «Работает в» — мини-карточка affiliatedClub с Link на `/clubs/[id]`

### Step 11.3: Client Component — Услуги + Расписание + Auth-gated booking

- Offerings section — title, description, format badge, price, duration. Grid `md:grid-cols-2`
- Schedule section — `buildScheduleGroups` (sport name). Слоты по дням. Grid `xl:grid-cols-2`
- Auth-gated booking — isAthlete → Link, иначе → Button + notice + ActionNotice

### Step 11.4: Client Component — Отзывы + Форма отзыва

- Reviews list с authorName, Rating, text, date
- Review form — Zod-валидация, POST `/api/reviews` с `{ userId, trainerId, rating, text }`
- Auth check — athlete видит форму, guest/provider видят сообщение

### Step 11.5: TrainerCard — ссылка на `/trainers/[id]`

- Обернуть имя тренера в `<Link href="/trainers/{trainer.id}">`
- Добавить hover-эффект на имя
- Booking link в footer остаётся как есть

### Step 11.6: ClubDetailPageClient — ссылки на тренеров

- В секции «Тренеры клуба» обернуть имя тренера в `<Link href="/trainers/{trainer.id}">`
- Hover-эффект (text-accent-strong)

### Step 11.7: Финальная верификация и синхронизация документации

- `npm run format`, `npm run lint`, `npm run test`, `npm run build`
- Визуальная проверка: `/trainers/1`, каталог тренеров, страница клуба, booking flow
- Синхронизация: CLAUDE.md, PHASES_OVERVIEW.md, project-phases/phase-11.md, README.md, STACK_OVERVIEW.md

### Чек-лист Phase 11

- [x] Server Component `trainers/[id]/page.tsx` с валидацией и notFound
- [x] Client Component: Hero + Info + Specializations
- [x] Client Component: Affiliated Club мини-карточка
- [x] Client Component: Offerings section
- [x] Client Component: Schedule + auth-gated booking
- [x] Client Component: Reviews + Review form
- [x] `getCoverPalette` и `getTrainerInitials` вынесены в `trainer-utils.ts`
- [x] TrainerCard — ссылка на `/trainers/[id]`
- [x] ClubDetailPageClient — ссылки на тренеров
- [x] Тесты зелёные (161 тестов)
- [x] `npm run lint` green
- [x] `npm run build` green
- [x] Документация синхронизирована

---

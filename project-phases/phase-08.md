# Phase 08

> Этот файл содержит одну фазу проекта целиком. Главный вход в контекст — `CLAUDE.md`, навигация по фазам — через `PHASES_OVERVIEW.md`.
> В ежедневной работе открывай прежде всего активную фазу и не перечитывай все phase-файлы подряд без необходимости.
> Структура фазы сохраняется в исходном стиле: заголовок фазы, краткий результат, шаги по порядку, затем чеклист и статус.
> Перед стартом новой фазы проверь, что для неё уже есть отдельный `phase-XX.md`, и после завершения шагов или фазы синхронизируй статус здесь, в `PHASES_OVERVIEW.md`, `CLAUDE.md`, `README.md` и при необходимости в `STACK_OVERVIEW.md`.

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


# Phase 09

> Этот файл содержит одну фазу проекта целиком. Главный вход в контекст — `CLAUDE.md`, навигация по фазам — через `PHASES_OVERVIEW.md`.
> В ежедневной работе открывай прежде всего активную фазу и не перечитывай все phase-файлы подряд без необходимости.
> Структура фазы сохраняется в исходном стиле: заголовок фазы, краткий результат, шаги по порядку, затем чеклист и статус.
> Перед стартом новой фазы проверь, что для неё уже есть отдельный `phase-XX.md`, и после завершения шагов или фазы синхронизируй статус здесь, в `PHASES_OVERVIEW.md`, `CLAUDE.md`, `README.md` и при необходимости в `STACK_OVERVIEW.md`.

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
  - `CLAUDE.md`, `PHASES_OVERVIEW.md`, `project-phases/phase-09.md`, `README.md`, `STACK_OVERVIEW.md` — синхронизированы
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

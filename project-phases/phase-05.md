# Phase 05

> Этот файл содержит одну фазу проекта целиком. Главный вход в контекст — `CLAUDE.md`, навигация по фазам — через `PHASES_OVERVIEW.md`.
> В ежедневной работе открывай прежде всего активную фазу и не перечитывай все phase-файлы подряд без необходимости.
> Структура фазы сохраняется в исходном стиле: заголовок фазы, краткий результат, шаги по порядку, затем чеклист и статус.
> Перед стартом новой фазы проверь, что для неё уже есть отдельный `phase-XX.md`, и после завершения шагов или фазы синхронизируй статус здесь, в `PHASES_OVERVIEW.md`, `CLAUDE.md`, `README.md` и при необходимости в `STACK_OVERVIEW.md`.

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


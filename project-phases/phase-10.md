# Phase 10

> Этот файл содержит одну фазу проекта целиком. Главный вход в контекст — `CLAUDE.md`, навигация по фазам — через `PHASES_OVERVIEW.md`.
> В ежедневной работе открывай прежде всего активную фазу и не перечитывай все phase-файлы подряд без необходимости.
> Структура фазы сохраняется в исходном стиле: заголовок фазы, краткий результат, шаги по порядку, затем чеклист и статус.
> Перед стартом новой фазы проверь, что для неё уже есть отдельный `phase-XX.md`, и после завершения шагов или фазы синхронизируй статус здесь, в `PHASES_OVERVIEW.md`, `CLAUDE.md`, `README.md` и при необходимости в `STACK_OVERVIEW.md`.

## Phase 10: Обновление дизайна ✅

> Визуал проекта обновлён в соответствии с дизайн-философией (минималистичный, спортивный, современный). Tailwind CSS остаётся. Дизайн-стандарт: `.claude/skills/frontend-design/SKILL.md`.

### Step 10.1: Обновить дизайн-токены и глобальные стили ✅

- Ревизия CSS-переменных в `globals.css`: радиусы, тени, body gradient.
- Обновить типографику (line-height, letter-spacing).
- Упростить body background: 3 radial-gradient → 1 linear-gradient.

**Реализация:**
- `src/app/globals.css` — radius 30→16px, shadow-card/floating облегчены, body gradient упрощён, line-height: 1.6, letter-spacing: -0.01em, утилита `.scrollbar-hidden`

**Проверка:** `npm run build`, визуальная проверка.

---

### Step 10.2: Обновить базовые UI-компоненты ✅

- Button, Badge, Chip, Modal — убрать лишние тени, уменьшить tracking.

**Реализация:**
- `src/components/ui/Button.tsx` — убран shadow-floating с primary, shadow-card с secondary, tracking loading 0.18→0.10em
- `src/components/ui/Badge.tsx` — tracking 0.16→0.08em
- `src/components/ui/Chip.tsx` — убран shadow-card из active state
- `src/components/ui/Modal.tsx` — leading-7→leading-relaxed

**Проверка:** тесты зелёные, компоненты рендерятся корректно.

---

### Step 10.3: Обновить layout-компоненты ✅

- Header, Footer — уменьшить tracking, убрать декоративные тени.

**Реализация:**
- `src/components/layout/Header.tsx` — убран shadow-floating с logo, tracking 0.26→0.12em, 0.18→0.12em
- `src/components/layout/Footer.tsx` — tracking 0.28→0.12em, 0.18→0.12em, leading-7→leading-relaxed

**Проверка:** навигация работает, адаптивность сохранена.

---

### Step 10.4: Обновить карточки ✅

- ClubCard, TrainerCard — убрать декоративные элементы, унифицировать tracking/leading.

**Реализация:**
- `src/components/clubs/ClubCard.tsx` — tracking 0.18→0.10em, 0.24→0.10em, 0.16→0.08em
- `src/components/trainers/TrainerCard.tsx` — убраны декоративные круги, убран shadow-floating с аватара, tracking→0.10em, leading-7→leading-relaxed
- `src/components/clubs/PopularNearby.tsx` — tracking 0.22→0.10em
- `src/components/trainers/PopularTrainers.tsx` — tracking 0.22→0.10em
- `src/components/trainers/TrainerAvailability.tsx` — tracking 0.22/0.2/0.18→0.10em

**Проверка:** выдача клубов и тренеров работает, тесты зелёные.

---

### Step 10.5: Обновить страницы ✅

- Hero-секция, списки, детальные страницы — унифицировать tracking/leading, убрать декоративные градиенты.

**Реализация:**
- `src/app/page.tsx` — убран radial-gradient overlay из hero, tracking/leading унифицированы
- `src/app/booking/[scheduleId]/page.tsx` — tracking/leading
- `src/components/clubs/ClubDetailPageClient.tsx` — tracking 0.24/0.18→0.10em, leading-7/8→leading-relaxed
- `src/components/profile/AthleteProfilePage.tsx` — tracking 0.18→0.10em, leading→relaxed
- `src/components/search/SearchControlsPreview.tsx` — tracking/leading
- `src/components/map/MapPreviewSection.tsx` — tracking/leading
- `src/components/schedule/UpcomingSessions.tsx` — tracking/leading
- 10 дополнительных файлов (AthleteFeedbackSettingsSection, AthleteFavoritesSection, AthleteHistorySection, AthleteAchievementsSection, TrainerMapView, TrainerList, MapView, ClubList, StoreShowcase, UiShowcase)

**Проверка:** все маршруты работают, тесты зелёные.

---

### Step 10.6: Финальная верификация и документация ✅

- `npm run format`, `npm run lint`, `npm run test`, `npm run build` — всё зелёное.
- Синхронизация: CLAUDE.md, PHASES_OVERVIEW.md, project-phases/phase-10.md, README.md, STACK_OVERVIEW.md.

---

### Step 10.7: Скрыть скроллбар спорт-фильтров ✅

- Горизонтальный скролл кнопок спорта (Все, Йога, Бокс...) показывает некрасивый системный скроллбар на мобильном и десктопе.

**Реализация:**
- `src/components/search/SportFilters.tsx` — добавлен класс `scrollbar-hidden` к контейнеру с `overflow-x-auto`
- Утилита `.scrollbar-hidden` уже была в `globals.css` (Step 10.1)
- Один компонент обслуживает оба режима (clubs и trainers), поэтому фикс работает везде

**Проверка:** скроллбар не виден, чипы скроллятся горизонтально свайпом/мышью. Тесты зелёные.

---

### Step 10.8: ClubCard — цена и расстояние в компактную строку ✅

- Блок «от X ₽ / X км» в карточках клубов плавал — не выровнен с описанием, цена и расстояние на разных уровнях.

**Реализация:**
- `src/components/clubs/ClubCard.tsx` — переверстана нижняя секция:
  - Убран обёрточный `flex flex-wrap items-center justify-between` для описания + цены
  - Вынесен блок цена/расстояние наверх как inline строка: `от X ₽ · X.X км`
  - Убрана обрамляющая карточка (`rounded-card border border-line bg-canvas`)
  - Описание и рейтинг идут следом
- Автоматически применяется к PopularNearby (используется `ClubCard variant="carousel"`)

**Проверка:** цена и расстояние в 1 строку, выше описания, одинаково на всех карточках. Тесты зелёные.

---

### Step 10.9: TrainerCard — вертикальный layout (фото сверху, контент снизу)

- Карточки тренеров имеют горизонтальный grid `md:grid-cols-[0.88fr_1.12fr]` (фото слева, контент справа). На мобильном громоздко, на десктопе некрасиво. Нужен вертикальный layout как у ClubCard: фото сверху, контент снизу.

**Файл:** `src/components/trainers/TrainerCard.tsx`

**Что делаем:**
1. Убрать `grid md:grid-cols-[0.88fr_1.12fr]` → заменить на `flex flex-col`
2. Cover-секция (gradient + фото placeholder) — сверху, уменьшить `min-h-72` → `min-h-52` (как у ClubCard)
3. Фото placeholder уменьшить: `size-44` → `size-32`
4. Контент-секция снизу: опыт, описание, рейтинг, площадка, специализации
5. Цена/расстояние — в одну строку `от X ₽ · X.X км` (как в ClubCard, Step 10.8)
6. Убрать отдельный bordered блок цены (`rounded-card border border-line bg-canvas`)

**Проверка:**
- `npm run test` — тесты зелёные (обновить дизайн-тесты если меняется структура)
- Визуально: карточка тренера вертикальная, фото сверху, контент снизу, цена в строку

---

### Step 10.10: PopularTrainers — корректировка ширин карусели после переверстки TrainerCard

- После переверстки TrainerCard (Step 10.9) карусельный вариант может потребовать корректировки ширины карточек.

**Файл:** `src/components/trainers/PopularTrainers.tsx`

**Что делаем:**
1. Проверить ширины `w-[19.5rem] sm:w-[22rem]` — скорректировать при необходимости
2. Проверить что вертикальный layout корректно работает в карусели (min-h, content-start и прочие carousel-specific стили)

**Проверка:**
- Визуально: карусель популярных тренеров — карточки вертикальные, не плывут, ширина адекватная
- `npm run test` — тесты зелёные

---

### Step 10.11: Профиль спортсмена — разделить «Отзывы и настройки» на 2 секции

- Секция «Отзывы и базовые настройки» объединяет 2 логических блока под одним заголовком в grid `xl:grid-cols-[1.15fr_0.85fr]`. Нужно: сверху блок «Базовые настройки», снизу блок «Мои отзывы», каждый со своим заголовком.

**Файл:** `src/components/profile/AthleteFeedbackSettingsSection.tsx`

**Что делаем:**
1. Убрать общий заголовок «Отзывы и базовые настройки» с бейджами
2. Разбить на 2 `<section>`:
   - **Секция 1 «Базовые настройки»** — свой `h2`, бейдж «Auth MVP», карточка с настройками (тип кабинета, email, телефон, хранилище)
   - **Секция 2 «Мои отзывы»** — свой `h2`, бейдж с количеством отзывов, карточка с отзывами и кнопкой expand/collapse
3. Убрать `xl:grid-cols-[1.15fr_0.85fr]` — секции стакаются вертикально с gap-6
4. Обновить data-testid если нужно

**Проверка:**
- `npm run test` — тесты зелёные (обновить тесты профиля при изменении testid-структуры)
- Визуально: на странице профиля 2 отдельных блока, настройки сверху, отзывы снизу

---

### Step 10.12: ClubDetailPage — на мобильном инфо сверху, галерея снизу

- На мобильном страница клуба показывает фото сверху, инфо снизу. Нужно наоборот: инфо клуба сверху, галерея ниже. Плюс уменьшить галерею на мобильном.

**Файл:** `src/components/clubs/ClubDetailPageClient.tsx` (строки 270–338)

**Что делаем:**
1. Поменять порядок JSX: инфо-карточка первая, галерея вторая
2. На xl+ вернуть галерею влево через CSS order: галерея `xl:order-first`, инфо `xl:order-last`
3. Уменьшить `min-h` главного фото на мобильном: `min-h-72 md:min-h-[26rem]` → `min-h-48 md:min-h-72 xl:min-h-[26rem]`
4. Уменьшить secondary фото: `min-h-40 sm:min-h-48` → `min-h-32 sm:min-h-40 xl:min-h-48`

**Проверка:**
- `npm run test` — тесты зелёные
- Визуально: мобильный — инфо клуба сверху, галерея ниже и компактнее; десктоп (xl+) — без изменений (галерея слева, инфо справа)

---

### Step 10.13: Auth-гейт — запретить запись без авторизации

- Через «Ближайшие занятия» (UpcomingSessions) и «Свободные окна тренеров» (TrainerAvailability) на главной можно перейти на `/booking/[scheduleId]` без авторизации. На странице клуба (ClubDetailPageClient) проверка `isAthlete` есть, а в этих компонентах — нет.

**Файлы:**
- `src/components/schedule/UpcomingSessions.tsx` — прямые `<Link>` на booking без проверки auth
- `src/components/trainers/TrainerAvailability.tsx` — прямые `<Link>` на booking без проверки auth
- `src/app/booking/[scheduleId]/page.tsx` — Server Component, нет client-side auth проверки

**Что делаем:**
1. В `UpcomingSessions` — заменить `<Link href="/booking/...">` на клиентский обработчик:
   - Если `isAuthenticated && accountType === 'athlete'` → `router.push('/booking/...')`
   - Иначе → показать notice «Чтобы записаться, войдите или зарегистрируйтесь как спортсмен» (аналогично паттерну из ClubDetailPageClient: `showActionNotice()`)
2. В `TrainerAvailability` — аналогичная замена `<Link>` на auth-проверку
3. На booking page — добавить клиентский auth-банер:
   - Создать `BookingAuthGate` (client component) который проверяет `useAuthStore`
   - Если `!isAuthenticated || accountType !== 'athlete'` → показать предупреждение + кнопку открытия AuthModal
   - Если авторизован — показать контент как есть

**Проверка:**
- `npm run test` — тесты зелёные (написать тест на auth-гейт поведение)
- Вручную: без авторизации кликнуть на слот → видим notice «войдите/зарегистрируйтесь», не попадаем на booking
- Авторизованный athlete → переходит на booking нормально

---

### Step 10.14: Финальная верификация и синхронизация документации

**Что делаем:**
1. `npm run format` — форматирование
2. `npm run lint` — линтер
3. `npm run test` — все тесты зелёные
4. `npm run build` — production-сборка
5. Визуальная проверка всех затронутых страниц: главная (clubs/trainers), карточка клуба, профиль спортсмена, booking
6. Синхронизация документации: CLAUDE.md (текущее состояние), README.md (прогресс, «Что уже работает»), STACK_OVERVIEW.md (при необходимости)

**Проверка:** все 4 команды зелёные, документы синхронизированы, Phase 10 ✅.

---

### Чек-лист Phase 10

- [x] Дизайн-токены обновлены (radius, shadows, body gradient, typography)
- [x] UI-компоненты обновлены (Button, Badge, Chip, Modal)
- [x] Layout-компоненты обновлены (Header, Footer)
- [x] Карточки обновлены (ClubCard, TrainerCard, Popular*, Availability)
- [x] Страницы обновлены (главная, booking, club detail, profile)
- [x] Скроллбар спорт-фильтров скрыт
- [x] ClubCard — цена/расстояние в строку
- [x] TrainerCard — вертикальный layout (фото сверху, контент снизу)
- [x] PopularTrainers — ширины карусели скорректированы
- [x] Профиль — настройки и отзывы разделены на 2 блока
- [x] ClubDetail — на мобильном инфо сверху, галерея снизу
- [x] Auth-гейт на записи (UpcomingSessions, TrainerAvailability, booking page)
- [x] `npm run test` выполняется (144 тестов)
- [x] `npm run lint` выполняется
- [x] `npm run build` выполняется

---

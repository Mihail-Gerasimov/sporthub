# Phase 30

> Этот файл содержит одну фазу проекта целиком. Главный вход в контекст — `CLAUDE.md`.
> Навигация по фазам — через `PHASES_OVERVIEW.md`.
> В ежедневной работе открывай прежде всего активную фазу и не перечитывай все phase-файлы подряд без необходимости.
> Структура фазы сохраняется в исходном стиле: заголовок фазы, краткий результат, шаги по порядку, затем чеклист и статус.
> Перед стартом новой фазы проверь, что для неё уже есть отдельный `phase-XX.md`, и после завершения шагов или фазы синхронизируй статус здесь, в `PHASES_OVERVIEW.md`, `CLAUDE.md`, `README.md` и при необходимости в `STACK_OVERVIEW.md`.

## Phase 30: Багфиксы перед демо — auth-flow, навигация, фильтры, прошедшие слоты, главная

> После этой фазы: залипания после login admin / impersonation / logout исчезают (везде корректные `router.refresh()` и редирект на `/`); навигация ЛК и админ-панели не «висит белым» — отдаёт skeleton через `loading.tsx`; фильтр «Город» в `/service-portal/analytics` корректно отрезает Записи / Расписание / Отзывы / Графики / Загрузку слотов / topEntities через резолв до `Club.city`/`Trainer.city`; прошедшие сегодняшние слоты больше не светятся в «Ближайшие занятия» / «Свободные окна тренеров» / «Расписание клуба|тренера» — вводится единый pure-helper `isSlotUpcoming(slot, now)` с TZ-aware сравнением через `getDateKeyInTimeZone`; ChipMarquee на главной не «отваливается» (rAF паузится по `IntersectionObserver`), у чипов явно `cursor: default`; CTA «К записи» в `SlotCard` приведён к primary-стилю (lime-fill + cursor-pointer + rounded-pill).

Phase 30 — серия точечных багфиксов по итогам ручного прохождения Phase 29 перед демо клиенту. Никаких новых фич — только устранение визуальных и логических затыков, которые мешают воспринимать MVP как готовый продукт. Фаза не вводит новых архитектурных слоёв и не трогает бизнес-логику booking / auth / admin — все правки укладываются в 1-3 строки на фикс плюс несколько новых `loading.tsx` файлов и один pure-helper.

**Пререквизит:** Phase 29 (микро-улучшения) завершена. Активная ветка `phase-29` содержит все коммиты Phase 29; для Phase 30 создаётся новая ветка `phase-30` от `phase-29`.

**Скиллы, обязательные к использованию по ходу фазы:**

- `.claude/skills/frontend-design/SKILL.md` — все UI-правки (loading-skeleton'ы, SlotCard CTA, ChipMarquee cursor) проверяются по чек-листу перед коммитом UI-компонента.
- `.claude/skills/e2e-playwright/SKILL.md` — каждый шаг имеет конкретный E2E-сценарий через Playwright MCP (browser_navigate / browser_click / browser_snapshot / browser_take_screenshot) для подтверждения зелёного результата на live-приложении.
- `.claude/skills/tdd/SKILL.md` — для шагов с бизнес-логикой (30.4 city-фильтр, 30.7 isSlotUpcoming) — Red-Green-Refactor: сначала падающий тест, потом фикс.

---

### Ключевые решения

**Auth-flow rerender (Step 30.1, 30.5, 30.6):**

- После `adminLogin()` / `startImpersonation()` / `logout()` в `useAuthStore` обновляется только клиентский state и cookie. `syncAuthCookie()` (`useAuthStore.ts:125-131`) — **синхронная** функция (`document.cookie = ...`), Zustand `set()` и `createJSONStorage(localStorage)` тоже синхронные. Поэтому **гипотеза про микрозадачу `await Promise.resolve()` опровергнута перепроверкой** — `set()` + `syncAuthCookie()` отрабатывают до `router.push()` атомарно. Реальная проблема — RSC-кэш Next.js не инвалидируется, а в dev-mode добавляется первичная компиляция Server Component'а (1-5 секунд белого экрана) — что пользователь и воспринимает как «бесконечный рендеринг».
- **Step 30.1**: `ServicePortalLoginForm.tsx` после `router.push('/service-portal/dashboard')` НЕ вызывает `router.refresh()` → если RSC-кэш содержит гостевую разметку — она будет показана до первого user-инициированного refresh. Лечится одним `router.refresh()` после push'а. Дополнительно — dev-compile белый экран снимается через `loading.tsx` в Step 30.3.
- **Step 30.5**: `DashboardPage.handleImpersonate` — порядок `startImpersonation → fetch (fire-and-forget) → router.push(profilePath) → router.refresh()` **уже корректен** (Phase 27.15). Реальная причина периодического залипания — dev-mode компиляция `/profile/{role}/dashboard` при первом обращении. Никакого `await Promise.resolve()` НЕ требуется. Step сводится к: подтвердить корректность порядка через regression-test и обеспечить smooth-loading (покрывается Step 30.2 loading.tsx).
- **Step 30.6**: после `logout()` в `Header.handleLogout` (else-ветка, не impersonation) пользователь остаётся на `/profile/*/dashboard` и схлопывается в `AccessDeniedCard` внутри узкого `ProfileLayoutShell` — выглядит криво. Решение: `router.push('/')` + `router.refresh()` в `Header.handleLogout` сразу после `logout()` (без `await Promise.resolve()` — не нужно). Пользователь возвращается на главную, layout цел, RSC-кэш инвалидирован.

**Smooth-loading для ЛК и админки (Step 30.2, 30.3):**

- Все подмаршруты ЛК (`/profile/{athlete,provider}/[section]`) и админки (`/service-portal/(admin)/[section]`) — `dynamic = 'force-dynamic'` (проверено: 7 athlete + 10 provider + 4 admin страниц; `service-portal/(admin)/finance/page.tsx` — placeholder без `force-dynamic`, и не критично, поскольку фактических данных нет). В dev mode Next.js компилирует страницу при первом обращении (1-5 секунд белого экрана). В prod это ускорится, но UX-пробел всё равно будет на холодном кэше.
- Решение: создать `loading.tsx` рядом с `page.tsx` для каждого подмаршрута. Файл рендерит skeleton в стилистике Phase 28 (rounded-card + bg-card + animate-pulse) — пользователь сразу видит каркас, не белый фон. На горячем кэше loading.tsx не показывается. Этот же приём — production-ready и не зависит от dev/prod.
- Реиспользуем существующий `Skeleton`-компонент (`src/components/ui/Skeleton.tsx` — `animate-pulse bg-panel-strong/80 rounded-card|pill`).

**Фильтр «Город» в Analytics (Step 30.4):**

- В `src/app/api/analytics/route.ts` фильтр по `city` применяется только к `clubs` и `trainers` (строки 98-103). После него `bookings` (строки 111-118), `schedule` (строки 120-124) и `reviews` (строки 126-130) фильтруются только по `period`/`sportId` — поэтому числа «Записи / Отзывы / Загрузка слотов» и графики продолжают показывать данные всех городов.
- Дополнительно: `topEntities` (строки 188-212) использует `allClubs`/`allTrainers` (исходные неотфильтрованные коллекции) — даже если bookings отфильтровать, в топ попадут города, которых уже нет в основной выборке.
- Решение: после `clubs`/`trainers` city-filter построить `Set<EntityId>` по их id'шникам; фильтровать `bookings`/`schedule`/`reviews` по принадлежности `clubId`/`trainerId` к Set; в `topEntities` заменить `allClubs.find` / `allTrainers.find` на `clubs.find` / `trainers.find` (отфильтрованные).
- В тестах добавить кейсы `city='Москва'` (cross-city данные) — сейчас тест `city='Москва'` проверяет только `kpi.totalClubs`/`totalTrainers`, но не `bookings`/`reviews`/`schedule`/`topEntities`.

**Время-фильтр прошедших слотов (Step 30.7) — TZ-safe через строковое сравнение:**

- Phase 28.24 ввёл фильтр `slot.date === today` для тренерских блоков на главной — но не учитывает `endTime > now-time`. Слот 18:00–18:40 виден в 23:00.
- Та же проблема в `getUpcomingSessions.ts:33` (главная — клубы), `trainer-preview.ts:166` + `:278` (главная — тренеры), `ClubDetailPageClient.tsx:238` (расписание клуба), `TrainerDetailPageClient.tsx:251` (расписание тренера).
- **Перепроверка нашла критичный TZ-риск**: `DEFAULT_TIME_ZONE = 'Europe/Samara'` (UTC+4, `src/lib/constants.ts`). Если использовать `Date.setHours(endH, endM)` — часы интерпретируются в **локальном TZ исполнителя кода** (не в `DEFAULT_TIME_ZONE`). На сервере в UTC `slotEnd.setHours(18, 0)` даст `18:00 UTC = 22:00 Samara`, а реальный slot.endTime `'18:00'` подразумевает Samara → ошибка в 4 часа. Кроме того — hydration mismatch если server TZ ≠ client TZ.
- **Решение** — pure-helper через **строковое сравнение** (TZ-immune):
  ```ts
  // src/lib/slot-time.ts
  import type { Schedule } from '@/types';
  import { getDateKeyInTimeZone, getTimeKeyInTimeZone } from './utils';

  export function isSlotUpcoming(
    slot: Pick<Schedule, 'date' | 'endTime'>,
    now: Date = new Date(),
  ): boolean {
    const todayKey = getDateKeyInTimeZone(now);
    if (slot.date > todayKey) return true;
    if (slot.date < todayKey) return false;
    const nowTimeKey = getTimeKeyInTimeZone(now); // 'HH:MM' в DEFAULT_TIME_ZONE
    return slot.endTime > nowTimeKey;
  }
  ```
- Дополнительно — добавить в `src/lib/utils.ts` helper `getTimeKeyInTimeZone(date, timeZone = DEFAULT_TIME_ZONE)` через `Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone })` — возвращает `'HH:MM'` в нужном TZ. Лексикографическое сравнение `'08:30' < '21:00'` совпадает с числовым для формата HH:MM. Никаких `setHours`, никаких `Date`-арифметик в локальном TZ.
- Подставить в 5 фильтров. Будущие даты — `true`, прошлые — `false`, сегодня — проверка по `endTime`.
- Тесты `club-detail-page-client.test.tsx` (line 129-147) и `trainer-detail-page-client.test.tsx` (line 131-144) фиксируют время `2026-03-18T10:00:00.000Z` и используют слот с `endTime='08:30'` — после фикса оба будут отсечены (10:00 UTC = 14:00 Samara, `'08:30' < '14:00'` → past). Тесты должны явно проверять «прошедшие слоты не появляются». Это валидирует сам фикс.

**ChipMarquee fix (Step 30.8) — dual-flag pause + IO mock:**

- Аудит показал: `cursor: grab` стоит inline на `.chip-track` (строка 232) — наследуется чипами, выглядит как drag-handle. Хотя drag реализован на самой полосе, для отдельных чипов это неуместно. На `.no-loop` режиме CSS уже выставляет `cursor: default` — значит на is-loop режиме нужно явно прописать `cursor: default` на чипах (`<span>`).
- rAF не паузится когда контейнер вне viewport → если пользователь уехал scroll'ом в соседнюю секцию, marquee продолжает считать. При возврате может «зависать» из-за накопившейся delta или просто тратить ресурсы.
- ChipMarquee рендерится в `ClubCard`, `TrainerCard`, `ClubDetailPageClient`, `TrainerDetailPageClient` (на главной — внутри карточек слайдеров). Когда полоса далеко offscreen, rAF продолжает крутиться → накопление dt → возможный jump при возврате.
- **Перепроверка нашла критичный риск конфликта pause-flag**: сейчас один `paused` boolean меняется по `mouseenter/leave`. Если добавить IO в тот же flag — при scroll out → in IO выставит `paused=false`, даже если мышь всё ещё над marquee (browser не шлёт `mouseleave` при scroll). **Решение: 2 отдельных флага** `pausedByHover` и `pausedByVisibility`; активная пауза = `pausedByHover || pausedByVisibility`.
- **Перепроверка нашла второй риск**: jsdom (Vitest env) **не имеет `IntersectionObserver` нативно** → существующий `chip-marquee.test.tsx` упадёт с `ReferenceError`. **Обязательно добавить mock в `src/test/setup.ts`** перед тем как использовать IO в коде:
  ```ts
  global.IntersectionObserver = class IntersectionObserver {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
  ```
- Решение: на чипах (`<span>`) явно `cursor: default` + явно убрать hover-эффект; добавить `IntersectionObserver` на marquee-контейнер с **двумя флагами pause**; сбросить `lastT = 0` при возврате во viewport, чтобы избежать большого `dt`; mock IO в `src/test/setup.ts` ДО внесения изменений в компонент.

**SlotCard CTA (Step 30.9) — primary fill + сохранённая микро-анимация:**

- Кнопка «К записи» в `src/components/ui/SlotCard.tsx:160-168` имеет стили `bg-transparent` + `border-0` + `p-0` + `text-[var(--ui-lime)]` + `hover:gap-2.5` — выглядит как text-link. Пользователь не воспринимает как primary CTA.
- Решение: переписать className на primary solid по `frontend-design/SKILL.md`:
  - удалить: `bg-transparent`, `border-0`, `p-0`, `text-[var(--ui-lime)]`, `hover:text-[var(--ui-lime-hov)]`
  - добавить: `rounded-pill bg-lime px-3.5 py-2 text-bg cursor-pointer hover:bg-lime-hov`
  - **сохранить** `hover:gap-2.5` + `transition-[color,gap,background-color]` — микро-анимация стрелочки на hover приятный детальчик, потеря не оправдана.
- Перепроверка подтвердила: `rounded-pill` (через `--radius-pill: 999px` в `@theme inline`) и `text-bg` (через `--color-bg`) работают через Tailwind 4 `@theme` — risk нет.
- Аналог из `DetailScheduleWeek.tsx:164-170` (там CTA уже primary, но без hover:gap — у нас будет красивее).

**Область работы (Scope-Guard):**

В Phase 30 входит:

- Auth-flow корректный rerender в 3 точках (`adminLogin`, `startImpersonation`, `logout`).
- `loading.tsx` skeleton для ЛК (17 файлов) и админ-панели (5 файлов).
- Фильтр город в `/api/analytics` (bookings + schedule + reviews + topEntities fix).
- Фильтр прошедших слотов через единый pure-helper `isSlotUpcoming` (5 точек).
- Стиль ChipMarquee (cursor + IntersectionObserver) и SlotCard CTA по `frontend-design/SKILL.md`.

В Phase 30 **НЕ** входит:

- Новые фичи (никаких новых сущностей, API, страниц).
- Изменение бизнес-логики booking-FSM, reliability, notifications, FavoriteEntities.
- Перевёрстка существующих компонентов вне Step 30.8 / 30.9 scope.
- Перевод password на bcrypt (отложено в Phase 29, не в зоне фазы).
- Migration `data-map-theme` логики (стабильно работает после Phase 29 fix-коммита).

---

### Step 30.1: Login admin — `router.refresh()` после `adminLogin()`

- **Скилл:** `e2e-playwright/SKILL.md` обязательно для верификации (UI-правок нет → frontend-design не требуется).

- **Действие:**
  - в `src/components/admin/ServicePortalLoginForm.tsx:75-91` (`handleSubmit`), сразу после `router.push('/service-portal/dashboard')` (строка 91) добавить `router.refresh()`.
  - паттерн идентичен Phase 27.15 impersonation — RSC-кэш страницы `/service-portal/dashboard` инвалидируется, layout перерисуется со state «admin authenticated» → редирект автоматически.

- **Проверка (manual + Playwright MCP):**
  - чистый logout (или невалидная сессия) → переход на `/service-portal` → форма видна.
  - ввод admin email/пароль → submit → сразу редирект на `/service-portal/dashboard` без зависания и без ручного F5.
  - Playwright: `browser_navigate('/service-portal')` → `browser_fill_form` (email/password admin) → `browser_click(submit)` → `browser_wait_for(url contains '/dashboard')` → `browser_snapshot` (видим dashboard'ный контент).

- **Тесты:**
  - `src/test/admin/service-portal-login.test.tsx` — добавить проверку что `mockRefresh` вызывается **после** `mockPush` (порядок через `mock.invocationCallOrder`).
  - regression: existing login-form test — должен пройти; `router.refresh()` уже мокается через `next/navigation`.

- **Ожидаемый результат:**
  - после успешного login админа происходит мгновенный переход в Dashboard без ручного refresh.

### Step 30.2: `loading.tsx` skeleton для ЛК подмаршрутов

- **Скилл:** `frontend-design/SKILL.md` обязательно (mobile-first skeleton по Phase 28 палитре, `--ui-*` токены, `rounded-card`, `animate-pulse`); `e2e-playwright/SKILL.md` для верификации.

- **Действие:**
  - создать общий компонент `src/components/profile/ProfileSectionLoading.tsx` — skeleton-каркас в Phase 28 dark-стилистике:
    - sec-head: пара `Skeleton` блоков (eyebrow 80×12 + title 240×32) с `flex justify-between` + `Skeleton rounded="pill"` справа на месте бейджа.
    - body: одна `Card`-обёртка с `rounded-[18px] border border-line bg-card p-6 sm:p-7`, внутри grid с 4 `Skeleton`-блоками (60vh высотой суммарно).
  - создать `loading.tsx` для каждого подмаршрута (re-export по умолчанию):
    - athlete (7 файлов): `dashboard`, `schedule`, `stats`, `favorites`, `reviews`, `settings`, `notifications`.
    - provider (10 файлов): `dashboard`, `bookings`, `clients`, `stats`, `links`, `publications`, `reviews`, `settings`, `finance`, `notifications`.
  - содержимое каждого `loading.tsx` — однострочный re-export: `export { default } from '@/components/profile/ProfileSectionLoading';`.

- **Проверка (manual + Playwright MCP):**
  - в dev mode (горячая компиляция) клик по любому подмаршруту в ЛК на холодном кэше → сразу skeleton, а не белый экран → через 1-5с реальный контент.
  - Playwright: `browser_navigate('/profile/athlete/dashboard')` → `browser_click(link 'Расписание')` → быстро `browser_snapshot` (увидим pulse-skeleton) → `browser_wait_for(text: 'Расписание')` (контент появился).
  - `browser_take_screenshot` skeleton-фазы для подтверждения визуала по SKILL.md.

- **Тесты:**
  - smoke-тест на `ProfileSectionLoading.tsx` (рендерится без падений, имеет `data-testid="profile-section-loading"`).
  - loading.tsx файлы — без тестов (стандартный Next.js feature, не имеет логики).

- **Ожидаемый результат:**
  - переключение вкладок ЛК в dev/prod выглядит плавно, без белого фона.

### Step 30.3: `loading.tsx` skeleton для админ-панели

- **Скилл:** `frontend-design/SKILL.md` обязательно (палитра `--ui-*`, `bg-card`, `border-line`, `animate-pulse`); `e2e-playwright/SKILL.md` для верификации.

- **Действие:**
  - создать общий компонент `src/components/admin/AdminSectionLoading.tsx` со skeleton-каркасом (sec-head + filter-row + KPI-grid + card-grid) в Phase 28 dark-стилистике:
    - sec-head Skeleton (eyebrow + title).
    - filter-row Skeleton (3-4 pill-Skeleton'а через `flex gap-2`).
    - KPI-grid Skeleton (`grid sm:grid-cols-2 lg:grid-cols-4 gap-3`, 4 Skeleton'а).
    - main grid Skeleton (`grid lg:grid-cols-[1fr_440px] gap-6` для DashboardPage / `grid sm:grid-cols-2 gap-4` для остальных).
  - создать `loading.tsx` для подмаршрутов `src/app/service-portal/(admin)/`:
    - `dashboard`, `analytics`, `moderation`, `logs`, `finance` (5 файлов).
  - каждый `loading.tsx` — однострочный re-export: `export { default } from '@/components/admin/AdminSectionLoading';`.

- **Проверка (manual + Playwright MCP):**
  - смена admin-табов на холодном кэше показывает skeleton → реальный контент.
  - Playwright: `browser_navigate('/service-portal/dashboard')` → `browser_click(link 'Аналитика')` → быстрый `browser_snapshot` (skeleton) → `browser_wait_for(text 'KPI')` (контент).
  - `browser_take_screenshot` для визуального подтверждения skeleton по SKILL.md.

- **Тесты:**
  - smoke-тест `AdminSectionLoading.tsx` (renders, has `data-testid="admin-section-loading"`).

- **Ожидаемый результат:**
  - админ-панель в dev/prod переключается плавно.

### Step 30.4: Фильтр «Город» в `/api/analytics` (+ `topEntities`-fix)

- **Скилл:** `tdd/SKILL.md` (Red-Green-Refactor — тесты на 4 кейса до фикса); `e2e-playwright/SKILL.md` для подтверждения через UI; frontend-design не требуется (бэкенд).

- **Действие:**
  - в `src/app/api/analytics/route.ts` после строки 103 (где `clubs`/`trainers` уже отфильтрованы по city) добавить блок построения set'ов и city-фильтра для bookings/schedule/reviews:
    ```ts
    const ownedClubIds = new Set(clubs.map((c) => c.id));
    const ownedTrainerIds = new Set(trainers.map((t) => t.id));
    if (city) {
      bookings = bookings.filter((b) =>
        (b.clubId && ownedClubIds.has(b.clubId)) ||
        (b.trainerId && ownedTrainerIds.has(b.trainerId))
      );
      schedule = schedule.filter((s) =>
        (s.clubId && ownedClubIds.has(s.clubId)) ||
        (s.trainerId && ownedTrainerIds.has(s.trainerId))
      );
      filteredReviews = filteredReviews.filter((r) =>
        (r.clubId && ownedClubIds.has(r.clubId)) ||
        (r.trainerId && ownedTrainerIds.has(r.trainerId))
      );
    }
    ```
  - в `topEntities` (строки 188-212) заменить `allClubs.find(...)` → `clubs.find(...)` и `allTrainers.find(...)` → `trainers.find(...)` — чтобы топ строился по отфильтрованным сущностям.
  - проверить порядок объявления переменных: `bookings`/`schedule`/`filteredReviews` должны быть `let` а не `const` (чтобы их можно было переприсваивать city-фильтром); если они уже `let` (по существующей фильтрации `period`/`sportId`) — изменений не нужно.

- **Проверка (manual + Playwright MCP):**
  - `/service-portal/analytics` → city=Самара → числа как раньше.
  - city=Казань (где нет ничего) → KPI Записи / Отзывы / Загрузка слотов = 0, графики пустые, top-Entities пуст.
  - смена sport (без city) — работает как раньше; sport+city — пересечение.
  - Playwright: `browser_navigate('/service-portal/analytics')` → `browser_select_option(city, 'Москва')` → `browser_wait_for(...)` → `browser_snapshot` (KPI и графики обновились) → `browser_select_option(city, 'Казань')` → KPI = 0 / 0 / 0.

- **Тесты:**
  - расширить `src/test/api/analytics.route.test.ts`:
    - `city='Москва' (cross-city данные)` → `bookings`/`schedule`/`reviews` пусты, `topEntities` пуст.
    - `city + sportId` (комбинация) → пересечение по обоим условиям.
    - `topEntities при city-фильтре` (фикстура: clubs Самара + Москва, bookings обоих городов; результат — только Москвы).

- **Ожидаемый результат:**
  - все KPI, графики и `topEntities` реагируют на смену города.

### Step 30.5: Impersonation — подтверждение корректности порядка (no-op + regression)

- **Скилл:** `e2e-playwright/SKILL.md` для верификации; frontend-design не требуется.

- **Контекст после перепроверки:**
  - изначальная гипотеза «нужна микрозадача `await Promise.resolve()`» — **опровергнута**. `syncAuthCookie()` (`useAuthStore.ts:125-131`) синхронный (`document.cookie = ...`), Zustand `set()` синхронный, `createJSONStorage(localStorage)` тоже. Никаких async race'ов нет.
  - Phase 27.15 уже добавил `router.refresh()` после `router.push()` — порядок `startImpersonation → fetch (fire-and-forget) → router.push → router.refresh` корректен.
  - Реальная причина «бывает долгий рендеринг» — dev-mode компиляция Server Component'а `/profile/{role}/dashboard` при первом обращении (1-5 секунд белого экрана). Решается через `loading.tsx` (Step 30.2) — оно покажет skeleton вместо белого фона. **Отдельный код в Step 30.5 не нужен.**

- **Действие:**
  - в `src/components/admin/DashboardPage.tsx:249-267` (`handleImpersonate`) — **изменений в коде НЕТ**. Подтверждаем регрессионным тестом и Playwright'ом.
  - если выяснится что порядок где-то иной (например в моках Vitest) — поправить порядок там, не в production-коде.

- **Проверка (manual + Playwright MCP):**
  - клик «Войти как пользователь» в `/service-portal/dashboard` сразу редиректит в `/profile/{role}/dashboard`. Если loading.tsx из Step 30.2 уже работает — пользователь увидит skeleton, потом контент.
  - повторить 5 раз подряд — стабильно (не обязательно мгновенно — допускается dev-compile задержка с покрытием loading.tsx).
  - Playwright: `browser_navigate('/service-portal/dashboard')` → `browser_click('Войти как пользователь' для атлета)` → `browser_wait_for(url contains '/profile/athlete/dashboard')` → `browser_snapshot` (видим личный кабинет атлета без AccessDeniedCard).

- **Тесты:**
  - regression: `src/test/admin/impersonation-flow.test.tsx` — переменная `mockRefresh` уже есть; добавить assert что `mockPush.mock.invocationCallOrder[0] < mockRefresh.mock.invocationCallOrder[0]` (push перед refresh) и оба вызваны после `startImpersonation`.

- **Ожидаемый результат:**
  - стабильный редирект при impersonation; визуальное «залипание» исчезает за счёт `loading.tsx` Step 30.2.

### Step 30.6: Logout — редирект на главную

- **Скилл:** `e2e-playwright/SKILL.md` для верификации; frontend-design не требуется.

- **Действие:**
  - в `src/components/layout/Header.tsx` `handleLogout` (строки 43-50) обычный logout (else-ветка, не impersonation) НЕ вызывает редирект — после `logout()` пользователь остаётся на `/profile/*/dashboard` и видит `AccessDeniedCard` в кривом узком layout'е.
  - **синхронная** правка после `logout()` (`await Promise.resolve()` НЕ нужен — `logout()` синхронный):
    ```ts
    } else {
      logout();
      router.replace('/');   // replace, не push — logout не должен оставлять ЛК в history
      router.refresh();      // инвалидируем RSC-кэш
    }
    ```
  - `router.replace('/')` предпочтительнее `push('/')`: при logout history-back не должен возвращать на AccessDeniedCard.
  - функция `handleLogout` остаётся синхронной (никаких async-ошибок).
  - в impersonation-ветке (`stopImpersonation()` + `router.push('/service-portal/dashboard')`) проверить `router.refresh()` — если нет, добавить.
  - проверить `src/components/admin/ImpersonationBanner.tsx` `handleStop` — там после Phase 27.15 уже должен быть `router.refresh()`; если нет — добавить.

- **Проверка (manual + Playwright MCP):**
  - login athlete → `/profile/athlete/dashboard` → клик «Выйти» → сразу `/` (главная), без AccessDeniedCard в кривой колонке.
  - browser-back → НЕ возвращает на dashboard (replace).
  - то же для provider.
  - то же при logout из admin (`/service-portal/dashboard`) → `/`.
  - то же при stopImpersonation → `/service-portal/dashboard` (admin-back-flow), без зависания.
  - Playwright: `browser_navigate('/profile/athlete/dashboard')` (после login) → `browser_click('Выйти')` → `browser_wait_for(url '/')` → `browser_navigate_back` → проверить URL не равен `/profile/athlete/dashboard` → `browser_snapshot` (главная).

- **Тесты:**
  - `src/test/layout/header.test.tsx` (если есть) — добавить assert что `mockReplace('/')` и `mockRefresh()` вызваны после `mockLogout`.
  - regression: existing Header test проходит.

- **Ожидаемый результат:**
  - logout из любого ЛК всегда возвращает на главную с целым layout, без AccessDeniedCard и без возможности вернуться через browser-back на ЛК.

### Step 30.7: Helper `isSlotUpcoming` + фильтр прошедших слотов

- **Скилл:** `tdd/SKILL.md` (Red-Green-Refactor — unit-тест helper'a первым); `e2e-playwright/SKILL.md` для подтверждения через UI; frontend-design не требуется.

- **Действие:**
  - **сначала** добавить в `src/lib/utils.ts` новый helper `getTimeKeyInTimeZone(date, timeZone = DEFAULT_TIME_ZONE)`:
    ```ts
    /**
     * Возвращает время дня в формате 'HH:MM' в указанной TZ.
     * Используется для TZ-safe сравнения с slot.endTime / slot.startTime.
     */
    export function getTimeKeyInTimeZone(date = new Date(), timeZone = DEFAULT_TIME_ZONE): string {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date);
    }
    ```
    Это **TZ-safe** — никаких `setHours()` (которые работают в локальном TZ исполнителя кода). `'en-GB'` локаль гарантирует формат `'HH:MM'` с zero-pad.
  - создать новый файл `src/lib/slot-time.ts` с pure-helper'ом:
    ```ts
    import type { Schedule } from '@/types';
    import { getDateKeyInTimeZone, getTimeKeyInTimeZone } from './utils';

    /**
     * Проверяет, что слот ещё не прошёл относительно `now`.
     * Сравнение строко́вое (TZ-immune): дата YYYY-MM-DD, время HH:MM.
     */
    export function isSlotUpcoming(
      slot: Pick<Schedule, 'date' | 'endTime'>,
      now: Date = new Date(),
    ): boolean {
      const todayKey = getDateKeyInTimeZone(now);
      if (slot.date > todayKey) return true;
      if (slot.date < todayKey) return false;
      const nowTimeKey = getTimeKeyInTimeZone(now);
      return slot.endTime > nowTimeKey;
    }
    ```
  - подставить в 5 мест:
    - `src/components/schedule/getUpcomingSessions.ts:33` — после `slot.date === targetDate` фильтр (`&& isSlotUpcoming(slot, new Date())`).
    - `src/components/trainers/trainer-preview.ts:166` — `buildTrainerDirectory.availableSlots`.
    - `src/components/trainers/trainer-preview.ts:278` — `getTrainerAvailability`.
    - `src/components/clubs/ClubDetailPageClient.tsx:238` — `weekSlots` useMemo, после `s.date >= mondayIso && s.date <= sundayIso`.
    - `src/components/trainers/TrainerDetailPageClient.tsx:251` — `weekSlots` useMemo, аналогично.
  - в `DetailScheduleWeek` фильтр оставить только по неделе; точечный time-фильтр — на стороне вызывающего useMemo (он формирует список перед передачей).

- **Проверка (manual + Playwright MCP):**
  - на главной (`/`) слоты «Ближайшие занятия» / «Свободные окна тренеров» которые уже прошли today (по `endTime`) — не светятся.
  - в `/clubs/[slug]` и `/trainers/[slug]` расписание текущего дня — только будущие слоты.
  - вчерашних/завтрашних слотов фильтр не касается (предыдущий behavior сохранён).
  - Playwright: запустить `browser_evaluate` с `vi.setSystemTime`-аналогом не сработает (это runtime), вместо этого — взять любой club/trainer с известным расписанием на сегодня, прокликать `browser_navigate('/clubs/[slug]')` → `browser_snapshot` → проверить, что прошедшие времена не отображаются.

- **Тесты:**
  - unit `src/test/lib/slot-time.test.ts` — 4 кейса: будущая дата / прошлая / сегодня до now / сегодня после now + 1 кейс для timezone-cross (slot 2026-05-08 при now=2026-05-07 23:30 UTC).
  - integration: `src/test/clubs/club-detail-page-client.test.tsx` (line 129-147) и `src/test/trainers/trainer-detail-page-client.test.tsx` (line 131-144) — обновить фикстуру: либо `endTime='20:00'` (после 10:00 UTC = валидный), либо добавить assert «слот с endTime='08:30' (до 10:00 UTC) не виден». Выбираем второе — валидирует фикс напрямую.
  - `src/test/schedule/get-upcoming-sessions.test.ts` (line 218-238) — добавить кейс «прошедший слот today не попал».
  - integration: `vi.setSystemTime` уже используется для week-anchor — добавить контроль времени дня в фикстурах.

- **Ожидаемый результат:**
  - прошедшие сегодняшние слоты не показываются нигде.

### Step 30.8: ChipMarquee — cursor + IntersectionObserver (dual-flag pause)

- **Скилл:** `frontend-design/SKILL.md` обязательно (правка cursor/hover на UI-компоненте — должна соответствовать чек-листу: токены, mobile-first, no-shadow); `e2e-playwright/SKILL.md` для верификации.

- **Действие:**
  - **сначала** в `src/test/setup.ts` добавить mock `IntersectionObserver` (jsdom его не имеет нативно — иначе `chip-marquee.test.tsx` упадёт с `ReferenceError`):
    ```ts
    if (typeof globalThis.IntersectionObserver === 'undefined') {
      globalThis.IntersectionObserver = class {
        constructor() {}
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() { return []; }
      } as unknown as typeof IntersectionObserver;
    }
    ```
  - в `src/components/ui/ChipMarquee.tsx`:
    - **dual-flag pause**: заменить единственный `paused` flag на два — `pausedByHover` и `pausedByVisibility`. Активная пауза — `if (!pausedByHover && !pausedByVisibility && !dragging)`. Это исключает race-condition при scroll-in пока мышь над marquee.
    - mouseenter/leave handler'ы переключают `pausedByHover` (без изменений).
    - на `.chip-track` оставить `cursor: grab` (drag реально работает); на статике (`.no-loop`) — уже `cursor: default` через CSS.
    - на чипах (`<span>`) явно прописать `cursor: default` через className/style (overlay-rule сильнее inheritance от трэка).
    - убрать (если есть) hover-эффект на чипе (transition / opacity / color на `:hover`) — чип не интерактив.
    - добавить `IntersectionObserver`:
      ```ts
      const observer = new IntersectionObserver(
        ([entry]) => {
          pausedByVisibility = !entry.isIntersecting;
          if (entry.isIntersecting) lastT = 0; // сброс delta для плавного resume
        },
        { threshold: 0 }
      );
      observer.observe(marqueeRef.current);
      // cleanup:
      observer.disconnect();
      ```
  - проверить в `src/app/globals.css` правило для `.chip-track` — `cursor: default` на no-loop уже есть.

- **Проверка (manual + Playwright MCP):**
  - на главной прокрутить страницу так чтобы CardSlider'ы (с marquee внутри карточек клубов/тренеров) ушли из viewport → вернуться → анимация продолжается плавно, без рывка.
  - при попытке кликнуть чип — без cursor:pointer, без визуального hover-feedback'а.
  - на `/clubs/[slug]` и `/trainers/[slug]` chips наверху hero — то же поведение.
  - Playwright: `browser_navigate('/')` → `browser_evaluate(() => window.scrollTo(0, 5000))` → `browser_evaluate(() => window.scrollTo(0, 0))` → `browser_snapshot` (marquee на месте, без рывка). Проверка cursor через `browser_hover` + `browser_evaluate(() => getComputedStyle(...).cursor)`.

- **Тесты:**
  - `src/test/ui/chip-marquee.test.tsx` — добавить тест: после mount у каждого чипа в DOM `cursor === 'default'` (через `getComputedStyle` мок или просто проверка inline-style).
  - тест pause/resume при `IntersectionObserver` — мокнуть `IntersectionObserver` через `vi.stubGlobal`, эмитировать `entries: [{ isIntersecting: false }]`, проверить что rAF не двигает offset.

- **Ожидаемый результат:**
  - marquee стабильно работает при scroll out-of-viewport, чипы не выглядят кликабельными.

### Step 30.9: SlotCard CTA — primary-стиль

- **Скилл:** `frontend-design/SKILL.md` обязательно (primary CTA правила: `rounded-pill bg-lime text-bg uppercase font-bold tracking-[0.14em] hover:bg-lime-hov`); `e2e-playwright/SKILL.md` для верификации.

- **Действие:**
  - в `src/components/ui/SlotCard.tsx:160-168` найти `<button class="slot-cta ...">К записи</button>`.
  - заменить className:
    - **удалить:** `bg-transparent`, `border-0`, `p-0`, `text-[var(--ui-lime)]`, `hover:text-[var(--ui-lime-hov)]`, `text-[12px]`, `tracking-[0.10em]`.
    - **оставить:** `slot-cta inline-flex items-center gap-1.5 flex-shrink-0 whitespace-nowrap font-body font-bold uppercase`.
    - **сохранить (микро-анимация стрелочки):** `transition-[color,gap,background-color]`, `hover:gap-2.5`.
    - **добавить:** `rounded-pill bg-lime px-3.5 py-2 text-[10px] tracking-[0.14em] text-bg cursor-pointer hover:bg-lime-hov`.
  - финальный className:
    ```
    slot-cta inline-flex flex-shrink-0 items-center gap-1.5 rounded-pill bg-lime px-3.5 py-2 font-body text-[10px] font-bold uppercase tracking-[0.14em] text-bg whitespace-nowrap cursor-pointer transition-[color,gap,background-color] hover:gap-2.5 hover:bg-lime-hov
    ```
  - аналог из `src/components/detail-shared/DetailScheduleWeek.tsx:164-170` (primary CTA + наш hover:gap-2.5 как бонус).

- **Проверка (manual + Playwright MCP):**
  - блок «Свободные окна тренеров» / «Ближайшие занятия» на главной → CTA «К записи» — заметная lime-кнопка, hover темнеет до lime-hov, курсор — pointer.
  - стилистика идентична `DetailScheduleWeek` CTA.
  - Playwright: `browser_navigate('/')` → найти SlotCard → `browser_hover(slot-cta)` → `browser_evaluate(() => getComputedStyle(btn).backgroundColor)` (= lime), `browser_take_screenshot` для визуальной проверки.

- **Тесты:**
  - создать smoke-тест `src/test/ui/slot-card.test.tsx` (его нет согласно аудиту):
    - render SlotCard с минимальными props → CTA-кнопка имеет class `bg-lime` и `rounded-pill`.
    - click CTA → `onSelect(slotId)` вызывается с правильным id.
    - hover проверить через `getComputedStyle` (или snapshot).

- **Ожидаемый результат:**
  - визуально кнопка читается как кликабельная primary CTA, неотличима от CTA в DetailScheduleWeek.

---

### Чеклист

**Step 30.1 — Login admin (router.push без refresh):** ✅ commit `c10b2e5` → fix-коммит `0f68df5`

- [x] Изначально добавили `router.refresh()` после push (commit `c10b2e5`).
- [x] Playwright MCP на холодном `.next` показал регрессию: refresh отменял начатый push в dev-mode → URL застревал на `/service-portal`. Откат `0f68df5` — оставлен только `router.push()`. Реальное лечение «бесконечного rendering'а» — это cold-compile dev-mode, покрывается через `loading.tsx` (Step 30.3) и не воспроизводится на prod-сборке.
- [x] `service-portal-login.test.tsx` обновлён: проверяет `mockPush('/service-portal/dashboard')` и `mockRefresh` НЕ вызывается.
- [x] Playwright MCP (cold cache `rm -rf .next`): login admin → dashboard за ~1 сек.

**Step 30.2 — `loading.tsx` для ЛК (skill: frontend-design):** ✅ commit `2e32c5a`

- [x] Общий `ProfileSectionLoading.tsx` по Phase 28 палитре (`--ui-*`, `bg-card`, `border-line`, `animate-pulse`)
- [x] 7 athlete-loading.tsx + 10 provider-loading.tsx файлов (re-export)
- [x] Smoke-тест `ProfileSectionLoading`
- [x] Playwright MCP: переключение табов в ЛК — cold-compile <1 сек, контент появляется без зависания

**Step 30.3 — `loading.tsx` для админки (skill: frontend-design):** ✅ commit `4c0a9a5`

- [x] Общий `AdminSectionLoading.tsx` с KPI-grid + filter-row + main-grid skeletons
- [x] 5 loading.tsx для admin-подмаршрутов (`dashboard|analytics|moderation|logs|finance`)
- [x] Smoke-тест `AdminSectionLoading`
- [x] Playwright MCP: переключение admin-табов — мгновенно

**Step 30.4 — Фильтр город в `/api/analytics` + `topEntities` fix (skill: tdd):** ✅ commit `a467c2f`

- [x] `Set<EntityId> ownedClubIds` / `ownedTrainerIds` после city-фильтра clubs/trainers
- [x] `bookings` / `schedule` / `filteredReviews` фильтруются по city через резолв `clubId`/`trainerId`
- [x] `topEntities` использует `clubs.find` / `trainers.find` (не `allClubs`/`allTrainers`)
- [x] +2 теста: `city='Москва' (cross-city)`, `city + sportId`
- [x] Playwright MCP: Москва → KPI 0/0/0/0/0/0%, графики «Нет данных», topEntities пуст; Самара → 4/4/30/3/14% возвращается

**Step 30.5 — Impersonation regression-only:** ✅ commit `d67aa59`

- [x] Production-кода в `DashboardPage.handleImpersonate` НЕ меняли (порядок уже правильный, теория microtask опровергнута)
- [x] `impersonation-flow.test.tsx` — assert `mockPush.invocationCallOrder < mockRefresh.invocationCallOrder`
- [x] Playwright MCP: «Войти как пользователь» → ЛК атлета мгновенно

**Step 30.6 — Logout redirect (sync, через replace):** ✅ commit `98f77f4`

- [x] `Header.handleLogout` остаётся sync; обычный logout → `router.replace('/') + router.refresh()`
- [x] `replace`, не `push` — browser-back не возвращает на ЛК
- [x] Impersonation-ветка получила `router.refresh()` после `router.push('/service-portal/dashboard')`
- [x] `impersonation-flow.test.tsx` обновлён под `mockReplace('/')` + `mockRefresh()` для обычного logout
- [x] Playwright MCP: logout с `/profile/athlete/settings` → главная мгновенно, без AccessDeniedCard

**Step 30.7 — Helper `isSlotUpcoming` + фильтр прошедших (skill: tdd, TZ-safe):** ✅ commit `9e4b69c`

- [x] `getTimeKeyInTimeZone(date, tz)` добавлен в `src/lib/utils.ts` через `Intl.DateTimeFormat('en-GB', ...)` (TZ-safe `'HH:MM'`)
- [x] `src/lib/slot-time.ts` с pure-helper'ом `isSlotUpcoming` через **строковое** сравнение
- [x] Unit-тест `src/test/lib/slot-time.test.ts` — 5 кейсов (future / past / today-before / today-after / TZ-edge)
- [x] Применён в `getUpcomingSessions.ts`, `trainer-preview.ts` × 2, `ClubDetailPageClient.tsx`, `TrainerDetailPageClient.tsx`
- [x] Тестовые фикстуры `club-detail-page-client.test.tsx`, `trainer-detail-page-client.test.tsx`, `club-detail-page.test.tsx`, `trainer-detail-page.test.tsx`, `get-upcoming-sessions.test.ts`, `publish-catalog-flow.test.tsx` сдвинуты в будущее или используют fake-timers
- [x] Playwright MCP: главная «Ближайшие занятия» пуст, `/clubs/амстафф` empty week-schedule, «Свободные окна тренеров» пусто

**Step 30.8 — ChipMarquee (skill: frontend-design, dual-flag pause):** ✅ commit `86f3302`

- [x] `IntersectionObserver` mock добавлен в `src/test/setup.ts`
- [x] Dual-flag `pausedByHover` + `pausedByVisibility` заменил `paused` в `ChipMarquee.tsx`
- [x] Чипы (`<span>`) — явно `style={{ cursor: 'default' }}`, transition-colors снят
- [x] `IntersectionObserver` управляет `pausedByVisibility`, сбрасывает `lastT = 0` при resume
- [x] `observer.disconnect()` в useEffect-cleanup
- [x] +2 теста: cursor:default на чипах + IO observe/disconnect через подменённый mock
- [x] Playwright MCP: 38 чипов на главной, все `cursor: default`; marquee внутри карточек в `.no-loop` (короткие списки)

**Step 30.9 — SlotCard CTA (skill: frontend-design):** ✅ commit `fe5f15a`

- [x] CTA-кнопка → primary-стиль `rounded-pill bg-lime text-bg cursor-pointer hover:bg-lime-hov`
- [x] Микро-анимация `hover:gap-2.5` + `transition-[gap,background-color]` сохранена
- [x] +2 теста в `slot-card.test.tsx` (всего 19): primary classes + hover:gap-2.5
- [x] SlotCard на live-странице не виден (нет данных слотов на 8 мая) — unit-тесты подтверждают classes

**Step 30.10 — Hero sport-marquee (skill: frontend-design):** ✅ commit `0d3ddc6`

- [x] Новый Client-компонент `src/components/home/HeroSportMarquee.tsx` — рендерит дублированный список спорт-чипов; чипы без `cursor-pointer`/hover, явный `style={{ cursor: 'default' }}`; второй блок `aria-hidden="true"`
- [x] CSS в `src/app/globals.css`: `@keyframes hero-marquee-x` (translateX 0 → -50%, 40s linear infinite) + `.hero-sport-marquee-viewport` с edge-маской + `prefers-reduced-motion: reduce` отключает анимацию
- [x] `src/app/page.tsx:175-189` — заменили inline статичный блок на `<HeroSportMarquee sports={searchFilterSports.slice(0, 16)} />`
- [x] 5 unit-тестов в `src/test/home/hero-sport-marquee.test.tsx`
- [x] Playwright MCP (cold cache): 18 чипов (9×2), `cursor: default` на всех, animation-name `hero-marquee-x`, transform двинулся `-702 → -746` за 1.5 сек ≈ 30 px/sec; `browser_hover` упал «element is not stable» — лента не останавливается на hover

---

### Статус

**Выполнено:** Step 30.1 ✅, Step 30.2 ✅, Step 30.3 ✅, Step 30.4 ✅, Step 30.5 ✅, Step 30.6 ✅, Step 30.7 ✅, Step 30.8 ✅, Step 30.9 ✅, Step 30.10 ✅

**Следующий шаг:** ждём команду пользователя на следующую фазу / merge `phase-30` в main / demo.

**Статус Phase 30:** ✅ ЗАВЕРШЕНА (11 коммитов: 30.1–30.10 + fix-коммит `0f68df5` для 30.1; полный E2E-прогон через MCP на холодном `.next`; 1451/1451 unit-тестов).

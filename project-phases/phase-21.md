# Phase 21

> Этот файл содержит одну фазу проекта целиком. Главный вход в контекст — `CLAUDE.md`.
> Навигация по фазам — через `PHASES_OVERVIEW.md`.
> В ежедневной работе открывай прежде всего активную фазу и не перечитывай все phase-файлы подряд без необходимости.
> Структура фазы сохраняется в исходном стиле: заголовок фазы, краткий результат, шаги по порядку, затем чеклист и статус.
> Перед стартом новой фазы проверь, что для неё уже есть отдельный `phase-XX.md`, и после завершения шагов или фазы синхронизируй статус здесь, в `PHASES_OVERVIEW.md`, `CLAUDE.md`, `README.md` и при необходимости в `STACK_OVERVIEW.md`.

## Phase 21: Аналитика платформы

> После этой фазы: placeholder-страница аналитики в админ-панели заменена полноценным дашбордом с KPI-карточками, интерактивными графиками (Recharts) и фильтрами. Админ видит ключевые метрики платформы: количество пользователей, публикаций, записей, отзывов, загрузку слотов. Графики показывают динамику записей за период, популярные виды спорта, топ клубов/тренеров и активность платформы (на основе логов из Phase 20). Все визуализации динамически обновляются при смене фильтров (период, город, вид спорта).

Phase 21 — чисто read-only фаза. Не меняет существующие данные и flows, только агрегирует и визуализирует то, что уже есть. Зависит от Phase 20 (логи используются для графика активности).

**Пререквизит:** Phase 20 (логи) завершена.

---

### Ключевые решения

**Библиотека графиков:**

- Recharts — React-компонентная библиотека, декларативный API, хорошо работает с Tailwind.
- Устанавливается как npm-зависимость. Перед установкой проверить совместимость с React 19: `npm info recharts peerDependencies`. Если peer dependency указывает React ≤18, установить с `--legacy-peer-deps` или найти совместимую версию (Recharts 2.14+ или 3.x).
- Recharts использует DOM API — все компоненты с графиками строго `'use client'`. При hydration-ошибках — обернуть chart wrapper в `next/dynamic(() => import('./...'), { ssr: false })`.

**Источники данных:**

- Все метрики агрегируются на сервере из существующих JSON-коллекций: `getUsers()`, `getClubs()`, `getTrainers()`, `getBookings()`, `getReviews()`, `getSchedule()`, `getSports()`, `getLogs()` (Phase 20).
- Один API route `GET /api/analytics` — принимает фильтры, возвращает полную структуру для дашборда (KPI + данные для графиков).
- На клиенте — только рендеринг, без тяжёлых вычислений.
- Для MVP чтение 8 JSON-файлов на каждый запрос допустимо. При переходе на PostgreSQL — SQL-агрегации с GROUP BY, COUNT, AVG.

**Формулы метрик:**

- **averageSlotLoad:** `sum(bookedCount) / sum(capacity)` для всех schedule-слотов где `capacity > 0`. Результат 0.0–1.0, отображать как процент. Если нет слотов с `capacity > 0` — значение 0.
- **sportPopularity:** по количеству БУКИНГОВ по виду спорта (через `booking.sportId`), НЕ по количеству публикаций. Это реальный спрос.
- **bookingsByDate:** группировка по `booking.createdAt` (дата создания записи), НЕ по `booking.date` (дата занятия). Показывает динамику активности записей.
- **topEntities:** ранжирование по количеству букингов (primary), рейтинг — вторичный критерий. Топ 10.

**Фильтры:**

- Период: сегодня / неделя / месяц / всё время. «Сегодня» определяется по `DEFAULT_TIME_ZONE = 'Europe/Samara'` из `src/lib/constants.ts`.
- Город: все или конкретный из `AVAILABLE_CITIES` (`src/lib/constants.ts`). Фильтрация клубов по `club.city`. Тренеров — по `trainer.city` (опциональное поле; тренер без city показывается во всех городах).
- Вид спорта: все или конкретный из `getSports()` (`src/lib/db.ts`).
- При смене любого фильтра — повторный запрос к API, графики перерисовываются.
- Состояние фильтров — локальный `useState` компонента (без Zustand).

**Защита от hidden-сущностей (Phase 22):**

- API route аналитики фильтрует `status !== 'hidden'` с самого начала. Даже если Phase 22 ещё не реализована — это no-op, а при реализации скрытые сущности не будут искажать метрики.

---

### Что НЕ входит в Phase 21 (запланировано на будущее)

| Функционал | Когда |
|-----------|-------|
| Custom date range (date picker вместо пресетов) | Следующая итерация admin-панели |
| Экспорт аналитики (PDF/CSV) | Следующая итерация |
| Real-time обновление графиков (WebSocket) | Когда будет серверная инфраструктура |
| Кэширование агрегатов | При переходе на PostgreSQL + Redis |
| Аналитика по конкретному провайдеру | Следующая фаза ЛК провайдера |
| Сравнение периодов (текущая неделя vs прошлая) | Следующая итерация |
| Воронка конверсии (просмотр → запись → отзыв) | Требует событий просмотра, которых нет в логах |

---

### Step 21.1: Установка Recharts и подготовка

> **Примечание:** Recharts 2.x поддерживает React 16–18. Для React 19 необходим Recharts 2.14+ или 3.x. Перед установкой проверить актуальную версию: `npm info recharts peerDependencies`. Все компоненты с графиками — строго `'use client'`. Если возникнут hydration-ошибки при SSR, обернуть chart wrapper в `next/dynamic(() => import('./ChartComponent'), { ssr: false })`.

- **Действие:**
  - проверить совместимость: `npm info recharts peerDependencies`;
  - установить Recharts: `npm install recharts` (или `npm install recharts --legacy-peer-deps` при несовпадении peer deps);
  - создать минимальный smoke-компонент `src/components/admin/analytics/TestChart.tsx` (`'use client'`) с `<ResponsiveContainer>` + `<LineChart>` — убедиться что рендерится без ошибок;
  - после подтверждения — удалить smoke-компонент.

- **Проверка:**
  - Recharts установлен, `package.json` содержит зависимость;
  - `import { LineChart, ResponsiveContainer } from 'recharts'` работает;
  - базовый `'use client'` компонент с графиком рендерится без ошибок;
  - `npm run build` проходит.

- **Тесты:**
  - smoke-тест: `'use client'` компонент с `<ResponsiveContainer>` + `<LineChart>` рендерится (render тест, mock `ResizeObserver` если нужен);
  - проверка что Recharts не ломает существующие тесты.

- **Ожидаемый результат:**
  - Recharts установлен, совместим с React 19, базовый client component с графиком рендерится.

### Step 21.2: API route для аналитических данных

> **Архитектурное решение:** API route читает все JSON-коллекции (`getUsers()`, `getClubs()`, `getTrainers()`, `getBookings()`, `getReviews()`, `getSchedule()`, `getSports()`, `getLogs()`) при каждом запросе и агрегирует в памяти. Для MVP это допустимо. При переходе на PostgreSQL — SQL-агрегации. При росте данных — кэширование в Redis.

- **Действие:**
  - создать файл `src/app/api/analytics/route.ts` — GET handler;
  - Zod-схема для query-параметров:
    - `period`: `'today' | 'week' | 'month' | 'all'` (default `'all'`);
    - `city`: опциональная строка;
    - `sportId`: опциональное число;
  - типизация ответа (определить в файле или в `src/types/index.ts`):
    ```
    AnalyticsResponse {
      kpi: {
        totalUsers: number;        // общее кол-во пользователей
        totalAthletes: number;     // из них спортсменов
        totalProviders: number;    // из них провайдеров
        totalClubs: number;        // опубликованных клубов
        totalTrainers: number;     // опубликованных тренеров
        totalBookings: number;     // записей
        totalReviews: number;      // отзывов
        averageSlotLoad: number;   // 0.0–1.0
      };
      bookingsByDate: Array<{ date: string; count: number }>;
      sportPopularity: Array<{ sportId: number; sportName: string; count: number }>;
      topEntities: Array<{ id: number; name: string; type: 'club' | 'trainer'; bookings: number; rating: number }>;
      platformActivity: Array<{ date: string; count: number }>;
    }
    ```
  - логика агрегации:
    - загрузить все коллекции через `Promise.all([getUsers(), getClubs(), getTrainers(), ...])`;
    - применить фильтры: `period` → вычислить `fromDate` по `DEFAULT_TIME_ZONE` (today = `new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Samara' })`); `city` → фильтровать clubs по `club.city`, trainers по `trainer.city` (тренер без city — не фильтруется); `sportId` → фильтровать по `sportIds.includes(sportId)`;
    - фильтрация hidden-сущностей: `entity.status !== 'hidden'` (defense-in-depth для Phase 22);
    - KPI: подсчёт по отфильтрованным массивам; `averageSlotLoad` по формуле;
    - `bookingsByDate`: `booking.createdAt` → извлечь дату, сгруппировать, подсчитать; применить period-фильтр;
    - `sportPopularity`: count bookings по `sportId`, join с `sports` для имён; top по count;
    - `topEntities`: count bookings по `clubId` / `trainerId`, join с clubs/trainers для имён и рейтингов; top 10 по booking count (secondary: rating);
    - `platformActivity`: из `getLogs()`, group by date из `log.createdAt`, count; применить period-фильтр;
  - формат ответа: `{ success: true, data: AnalyticsResponse }`;
  - при пустых данных (нет клубов, нет букингов): все KPI = 0, все массивы пусты — НЕ ошибка.

- **Проверка:**
  - endpoint возвращает корректную структуру;
  - фильтры влияют на результат;
  - пустые данные не ломают ответ (нули, пустые массивы);
  - `averageSlotLoad` считается корректно.

- **Тесты:**
  - тест: GET /api/analytics без фильтров → полная структура, все поля;
  - тест: KPI подсчёт с фикстурными данными (totalUsers, totalBookings, averageSlotLoad);
  - тест: `averageSlotLoad` с `capacity > 0` → корректный расчёт;
  - тест: `averageSlotLoad` без слотов → 0;
  - тест: фильтрация по `period=today` → только данные за сегодня;
  - тест: фильтрация по `city=Самара` → только сущности из Самары;
  - тест: фильтрация по `sportId` → только связанные сущности;
  - тест: `bookingsByDate` группировка — корректные даты и counts;
  - тест: `sportPopularity` — виды спорта отсортированы по count desc;
  - тест: `topEntities` — top 10 по booking count;
  - тест: `platformActivity` — данные из логов, группировка по дате;
  - тест: пустые коллекции → все KPI = 0, массивы пусты, без ошибок.

- **Ожидаемый результат:**
  - API endpoint возвращает полную аналитическую структуру с KPI и данными для графиков, фильтры работают.

### Step 21.3: KPI-карточки

- **Действие:**
  - создать компонент `src/components/admin/analytics/KpiCards.tsx` (`'use client'`):
    - принимает props: `kpi: AnalyticsResponse['kpi']`, `isLoading: boolean`;
    - список карточек:
      - «Пользователи» — `totalUsers` с подписью `{totalAthletes} спортсменов / {totalProviders} провайдеров`;
      - «Клубы» — `totalClubs`;
      - «Тренеры» — `totalTrainers`;
      - «Записи» — `totalBookings`;
      - «Отзывы» — `totalReviews`;
      - «Загрузка слотов» — `averageSlotLoad` отформатированный как процент (например, `73%`);
    - каждая карточка: иконка/label, значение крупным шрифтом, подпись мелким;
    - при `isLoading` — `Skeleton` компонент из `src/components/ui/`;
    - адаптивная сетка: 2 колонки mobile → 3 колонки md → 6 колонок xl.

- **Проверка:**
  - карточки отображают актуальные числа;
  - при `isLoading` — skeleton;
  - адаптивная сетка корректна на разных экранах.

- **Тесты:**
  - render тест `KpiCards` с данными — все метрики отображаются;
  - render тест `KpiCards` с `isLoading: true` — skeleton;
  - render тест `KpiCards` с нулевыми значениями — отображает нули, не крашит.

- **Ожидаемый результат:**
  - KPI-карточки отображают актуальные числа из API, реагируют на фильтры, skeleton при загрузке.

### Step 21.4: Фильтры аналитики

- **Действие:**
  - создать компонент `src/components/admin/analytics/AnalyticsFilters.tsx` (`'use client'`):
    - props: `filters: { period, city, sportId }`, `onFiltersChange`, `sports: Sport[]`, `isLoading: boolean`;
    - **Период:** кнопки-чипы (сегодня / неделя / месяц / всё время). Активный чип подсвечивается через `cn()`;
    - **Город:** select из `AVAILABLE_CITIES` (`src/lib/constants.ts`) + опция «Все города» (значение `''`);
    - **Вид спорта:** select + опция «Все виды спорта» (значение `''`). Список спортов получен с сервера и передан через props;
    - при смене любого фильтра — `onFiltersChange` callback, родитель делает повторный `fetch` к API;
    - состояние фильтров — в родительском компоненте (страница аналитики), `useState`;
  - на странице аналитики `src/app/service-portal/(admin)/analytics/page.tsx`: передать список спортов как props через server-side `getSports()`.

- **Проверка:**
  - фильтры отображаются и работают;
  - при смене — данные и графики обновляются;
  - select с городами содержит все города из `AVAILABLE_CITIES`.

- **Тесты:**
  - render тест `AnalyticsFilters` — все фильтры рендерятся;
  - тест: клик по чипу периода вызывает `onFiltersChange`;
  - тест: смена города вызывает `onFiltersChange`;
  - тест: смена спорта вызывает `onFiltersChange`.

- **Ожидаемый результат:**
  - фильтры аналитики работают, при смене — повторный fetch, все визуализации обновляются.

### Step 21.5: Графики — записи за период и популярные виды спорта

> **Примечание:** при свежей установке без данных (нет клубов, тренеров, букингов) массивы `bookingsByDate` и `sportPopularity` будут пусты. Компоненты НЕ должны падать — рендерить пустое состояние с сообщением «Нет данных за выбранный период».

- **Действие:**
  - создать компонент `src/components/admin/analytics/BookingsChart.tsx` (`'use client'`):
    - props: `data: Array<{ date: string; count: number }>`, `isLoading: boolean`;
    - `<ResponsiveContainer>` + `<LineChart>` (или `<BarChart>`) из Recharts;
    - ось X — даты, ось Y — количество записей;
    - `<Tooltip>` при наведении;
    - при пустом `data` — текст «Нет данных за выбранный период»;
    - при `isLoading` — skeleton;
    - адаптивность: `<ResponsiveContainer width="100%" height={300}>`;
  - создать компонент `src/components/admin/analytics/SportPopularityChart.tsx` (`'use client'`):
    - props: `data: Array<{ sportName: string; count: number }>`, `isLoading: boolean`;
    - `<ResponsiveContainer>` + `<BarChart>` (horizontal или vertical);
    - ось X — виды спорта, ось Y — количество букингов;
    - `<Tooltip>` при наведении;
    - при пустом `data` — пустое состояние;
    - при `isLoading` — skeleton;
    - адаптивность аналогична;
  - цветовая палитра графиков — из Tailwind-переменных проекта (accent, brand) через CSS custom properties или прямые hex-значения.

- **Проверка:**
  - графики рендерятся с данными;
  - при смене фильтра — перерисовываются;
  - пустое состояние корректно;
  - адаптивность на mobile и desktop.

- **Тесты:**
  - render тест `BookingsChart` с данными — график рендерится;
  - render тест `BookingsChart` с пустым `data: []` — пустое состояние;
  - render тест `SportPopularityChart` с данными;
  - render тест `SportPopularityChart` с пустым `data: []`.

- **Ожидаемый результат:**
  - графики записей и популярных видов спорта рендерятся с данными и пустым состоянием.

### Step 21.6: Графики — активность платформы и топ публикаций

- **Действие:**
  - создать компонент `src/components/admin/analytics/PlatformActivityChart.tsx` (`'use client'`):
    - props: `data: Array<{ date: string; count: number }>`, `isLoading: boolean`;
    - `<ResponsiveContainer>` + `<AreaChart>` (или `<LineChart>`) — количество действий по дням на основе логов Phase 20;
    - ось X — даты, ось Y — количество действий;
    - `<Tooltip>` при наведении;
    - пустое состояние и skeleton аналогично другим графикам;
  - создать компонент `src/components/admin/analytics/TopEntitiesTable.tsx` (`'use client'`):
    - props: `data: Array<{ id: number; name: string; type: 'club' | 'trainer'; bookings: number; rating: number }>`, `isLoading: boolean`;
    - HTML `<table>` с колонками: №, Название, Тип (badge «Клуб» / «Тренер»), Записи, Рейтинг;
    - сортировка по booking count уже применена серверно;
    - при пустом `data` — пустое состояние «Нет данных»;
    - при `isLoading` — skeleton;
    - адаптивность: на mobile — горизонтальный скролл или stack-layout;
  - интегрировать оба компонента на страницу аналитики.

- **Проверка:**
  - график активности отображает данные из логов;
  - таблица-рейтинг корректно показывает top сущности;
  - пустое состояние корректно.

- **Тесты:**
  - render тест `PlatformActivityChart` с данными и без;
  - render тест `TopEntitiesTable` с данными и без;
  - render тест `TopEntitiesTable` — корректный порядок (по bookings desc).

- **Ожидаемый результат:**
  - график активности (из логов Phase 20) и таблица-рейтинг работают, пустые состояния обработаны.

### Step 21.7: Финальная верификация и синхронизация документации

- **Действие:**
  - прогнать:
    - `npm run format`
    - `npm run lint`
    - `npm run test`
    - `npm run build`
  - ручной сценарий:
    - открыть `/service-portal/analytics` — убедиться что KPI карточки и графики загружаются;
    - переключить период (сегодня → неделя → месяц → всё время) — проверить что данные обновляются;
    - выбрать конкретный город — проверить что метрики и графики фильтруются;
    - выбрать вид спорта — аналогично;
    - проверить при пустых данных (нет букингов, нет логов) — все KPI = 0, графики показывают пустое состояние, ничего не крашит;
    - проверить адаптивность графиков: dev tools → toggle device toolbar → mobile / tablet / desktop;
    - проверить skeleton при загрузке (throttle network в dev tools);
    - убедиться что существующие admin flows (dashboard, импёрсонация, логи) не сломаны;
  - синхронизировать документацию:
    - `CLAUDE.md` — обновить «Текущее состояние»;
    - `PHASES_OVERVIEW.md` — статус Phase 21;
    - `phase-21.md` — чек-лист;
    - `PROJECT_STATE.md` — новые файлы, API routes, компоненты;
    - `README.md` — прогресс;
    - `STACK_OVERVIEW.md` — добавить Recharts в стек;
    - `feature-docs/admin.md` — добавить секцию «Аналитика», убрать «Нет аналитики» из ограничений.

- **Проверка:**
  - всё работает, ничего не сломано, графики адаптивны.

- **Ожидаемый результат:**
  - placeholder-страница полностью заменена рабочим дашбордом, аналитика доступна из навигации admin-панели.

---

### Чек-лист Phase 21

**Recharts (Step 21.1):**
- [x] Recharts установлен и совместим с React 19
- [x] Базовый `'use client'` компонент с графиком рендерится
- [x] `npm run build` проходит

**API аналитики (Step 21.2):**
- [x] GET /api/analytics возвращает KPI и данные для графиков
- [x] Фильтры period / city / sportId работают
- [x] `averageSlotLoad` считается по формуле `sum(bookedCount)/sum(capacity)` для `capacity > 0`
- [x] `sportPopularity` считается по количеству букингов
- [x] `bookingsByDate` группирует по `booking.createdAt`
- [x] `topEntities` ранжирует по booking count, top 10
- [x] `platformActivity` использует данные из `getLogs()` (Phase 20)
- [x] Период «сегодня» использует `DEFAULT_TIME_ZONE`
- [x] Тренер без `city` не фильтруется (показывается во всех городах)
- [x] Фильтрация `status !== 'hidden'` (defense-in-depth для Phase 22)
- [x] Пустые данные: нули и пустые массивы, не ошибки

**KPI и фильтры (Steps 21.3–21.4):**
- [x] KPI-карточки отображают актуальные метрики
- [x] Фильтры работают (период, город, спорт)
- [x] При смене фильтра — все визуализации обновляются
- [x] Skeleton при загрузке
- [x] Адаптивная сетка карточек

**Графики (Steps 21.5–21.6):**
- [x] График записей за период (`BookingsChart`) рендерится корректно
- [x] График популярных видов спорта (`SportPopularityChart`) рендерится корректно
- [x] График активности платформы (`PlatformActivityChart`, из логов Phase 20) рендерится
- [x] Таблица-рейтинг `TopEntitiesTable` работает (top 10 по bookings)
- [x] Пустые состояния обработаны для всех графиков и таблицы
- [x] Графики адаптивны (mobile / desktop)
- [x] `<Tooltip>` при наведении на точки графиков

**Финализация (Step 21.7):**
- [x] Placeholder-страница `/service-portal/analytics` полностью заменена
- [x] format / lint / test / build проходят
- [x] Ручной сценарий — ожидает подтверждения от пользователя
- [x] Существующий функционал не сломан
- [x] Документация синхронизирована (`STACK_OVERVIEW` содержит Recharts)

**Выполнено:** Steps 21.1–21.7

**Следующий шаг:** —

**Статус Phase 21:** ✅ ЗАВЕРШЕНА

### Принцип масштабирования

- Агрегация из JSON → SQL-запросы с GROUP BY, COUNT, AVG в PostgreSQL
- API route → контроллер аналитики в NestJS
- Recharts остаётся на фронтенде — не меняется при смене бэкенда
- При росте данных — кэширование агрегатов в Redis, TTL по периодам
- Custom date range вместо пресетов — следующая итерация
- Экспорт в CSV/PDF — следующая итерация

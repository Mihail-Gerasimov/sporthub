# Phase 25

> Этот файл содержит одну фазу проекта целиком. Главный вход в контекст — `CLAUDE.md`.
> Навигация по фазам — через `PHASES_OVERVIEW.md`.
> В ежедневной работе открывай прежде всего активную фазу и не перечитывай все phase-файлы подряд без необходимости.
> Структура фазы сохраняется в исходном стиле: заголовок фазы, краткий результат, шаги по порядку, затем чеклист и статус.
> Перед стартом новой фазы проверь, что для неё уже есть отдельный `phase-XX.md`, и после завершения шагов или фазы синхронизируй статус здесь, в `PHASES_OVERVIEW.md`, `CLAUDE.md`, `README.md` и при необходимости в `STACK_OVERVIEW.md`.

## Phase 25: ЛК-хаб, детализация и публичная симметрия репутации

> Phase 25 — UI-надстройка над Phase 24. Превращаем личные кабинеты из одностраничных простыней в навигационные хабы с подмаршрутами, чтобы весь функционал дисциплины из 24-й (FSM-записи, рейтинги надёжности, клиентская база, связи тренер↔клуб, уведомления) было удобно видеть, использовать и анализировать. Закрываем все хвосты Phase 24 (multi-offering edit-flow, legacy `affiliatedClubId`/`clubId`, публичные ReliabilityBadge, quarantine-триггеры, disabled CTA при карантине, интеграция `BookingStatusHistoryDrawer` в LogsPage). Добавляем публичную симметрию репутации — провайдер тоже становится видимо «дорогим» при недобросовестности. Новый функционал: Schedule атлета с клиентской статус-историей, детализированная Stats (в т.ч. стрики), Clients для провайдера с заметками, полноценный Links для обеих сторон с invite-flow, прокачанные Notifications с per-type preferences.

Phase 25 — прямое продолжение Phase 24. Всё, что Phase 24 наработала на уровне данных и механик (FSM с 8 статусами и statusHistory, snapshot cancellation policy, multi-offering тренера, TrainerClubLink как самостоятельная коллекция, три reliability-функции, карантин, notifications API, toast-стек, Super Admin аварийные рычаги) — получает полноценную визуализацию и детализацию в интерфейсе ЛК и публичных поверхностях. Без Phase 24 эта фаза невозможна: в Stats нечего было бы считать, в Bookings нечего было бы фильтровать по FSM, в Clients нечего было бы агрегировать, раздел Links не существовал бы.

Фаза построена как **инкрементальный рефакторинг с минимальным риском регрессий**. Существующие страницы `/profile/athlete` и `/profile/provider` не переписываются с нуля — они превращаются в layout-хабы с Dashboard в корне, а секции по одной мигрируют на отдельные подмаршруты. Новый функционал (Clients, Stats, Links, прокачанные Notifications, публичные badges) добавляется как самостоятельные подмаршруты параллельно. В любой момент до финальной миграции оба ЛК остаются рабочими.

**Пререквизит:** Phase 24 (дисциплина и обязательства) завершена — FSM booking'а, multi-offering на create, TrainerClubLink, reliability, карантин, notifications, toast-стек и Super Admin инструменты в продакшене. Хвосты Phase 24 (multi-offering edit-flow, legacy-поля, quarantine-триггеры, drawer-wire-up, public reliability surfacing) закрываются в Step 25.1 этой фазы.

---

### Ключевые решения

**Foundations перед всем остальным (Step 25.1):**

- Phase 25 начинается с **обязательного Foundations-шага**, который закрывает три хвоста Phase 24 одним движением: полноценный multi-offering edit-flow (update full-replace + reverse-mapping + clone), удаление legacy `affiliatedClubId`/`clubId` с миграцией всех читателей, и безусловный перевод публичных поверхностей на `TrainerClubLink` как единственный источник.
- Без этого шага последующие Bookings per-offering, Stats drill-down и Clients per-offering опираются на функциональность, которая в edit-режиме не работает.

**ЛК как хаб с подмаршрутами по паттерну Super Admin:**

- Структура `/profile/athlete/*` и `/profile/provider/*` повторяет уже существующий паттерн `/service-portal/*` (dashboard, logs, analytics, moderation). Каждый раздел — отдельная страница с собственным URL, прямыми ссылками, собственным `page.tsx`.
- Корень ЛК (`/profile/athlete` и `/profile/provider`) становится **Dashboard** — сводка с акцентом на то, что требует внимания прямо сейчас.
- Layout-файлы `src/app/profile/athlete/layout.tsx` и `src/app/profile/provider/layout.tsx` создаются **с нуля** (сейчас их нет) — обёртка с условной навигацией вокруг корневой `page.tsx` как children.
- Desktop — sidebar в layout. Mobile — отдельный `ProfileMobileNav` через drawer (бургер в ProfileHeader). Существующий глобальный `MobileNav` не переиспользуем — он плоский, athlete-centric, для /profile/* нужна своя nav.

**Навигация data-driven, а не role-based:**

- `User.role` (athlete / trainer / club_owner / admin) — один. Но провайдер может быть одновременно club-стороной и trainer-стороной (через `managedByUserId` на Club и Trainer независимо).
- Условие отображения разделов: раздел видим, если `getProviderClubs(user.id).length > 0` (club-side разделы) или `getProviderTrainers(user.id).length > 0` (trainer-side разделы). Оба набора могут быть видны одновременно у одного провайдера.
- Links у провайдера показывает обе стороны, если у него и clubs и trainers: таб «Запросы ко мне» (pending от тренеров к моим клубам) + таб «Мои запросы» (pending мои запросы к чужим клубам).

**Stats и агрегаты — всегда на лету из bookings + reliability:**

- Все метрики считаются в SSR на момент запроса через те же `getBookings()` + `computeClubReliability` / `computeTrainerReliability` / `computeAthleteReliability`, что и Phase 24.
- Никаких новых хранимых счётчиков в `User`, `Club`, `Trainer`. Источник правды — `bookings.json` + `trainer-club-links.json` + reliability compute.
- Визуализация — Recharts (уже есть в стеке). Не вводим новых чарт-либ.
- Default window — последние 12 месяцев с toggle «всё время». SSR-мемоизация через `React.cache` в page.tsx.
- «Reliability в контексте динамики» из первичного плана **упрощена**: показываем **текущее** reliability + bar chart `completionRate` помесячно (completed / relevant в каждом месяце). Без хранимых snapshot'ов.

**Multi-offering как первоклассное измерение агрегаций:**

- Bookings у провайдера-тренера фильтруются per-offering (не только per-entity).
- Clients у провайдера-тренера — две оси агрегации: per-entity (все клиенты этого тренера суммарно) и per-offering (клиенты йоги vs клиенты бокса).
- Stats аналогично — `Вадим → Йога (в клубе): 120 часов, 45 клиентов`, `Вадим → Бокс (частно): 30 часов, 8 клиентов`, плюс агрегат по Вадиму целиком.
- Для club_owner — одна ось (Club = один набор offerings, принадлежащих клубу).

**Bookings-inbox провайдера строится на FSM Phase 24:**

- 4 таба: `Ожидают подтверждения` (pending), `Подтверждённые ближайшие` (confirmed, sort по startAt), `Требуют check-in` (confirmed, slot прошёл, окно 48h ещё не истекло), `История` (completed / no_show / unmarked / cancelled_* / rejected_by_provider).
- Действия в карточке: confirm / reject / check-in completed / check-in no_show / cancel. Каждое — API-endpoint из Phase 24. После клика — `router.refresh()` + toast из toast-стека Phase 24.
- В каждой карточке — имя спортсмена, его бейдж надёжности (compact+showDetails из Phase 24), offering-title, время слота, место, статус FSM.
- Фильтры: по offering, по виду спорта, по дате.
- В табе `Требуют check-in` — сортировка по убыванию срочности (чем ближе конец окна 48h, тем выше), акцент на пограничных (<6h до конца).

**Clients как первая итерация CRM:**

- `/profile/provider/clients`. Агрегация уникальных userId из всех bookings провайдера, переключатель per-entity / per-offering.
- Для каждого клиента: имя, `ReliabilityBadge`, количество completed, дата первого/последнего visit, топ-3 offerings, заметки провайдера.
- Новая коллекция `provider-client-notes.json`: `ProviderClientNote = { id, createdAt, updatedAt, providerUserId, clientUserId, note, bookingId? }`. Поле `bookingId?` — опциональная привязка заметки к конкретному событию.
- Guard ownership: провайдер CRUD только про клиентов, у которых есть хотя бы один booking с `ownerId = providerUserId` (через getProviderClubs/getProviderTrainers); admin — все.
- Фильтры: по reliability-бейджу, по давности последнего visit, по offering.
- Клик по клиенту → drawer с полной историей записей + редактируемой заметкой.

**Links — полноценный раздел для обеих сторон:**

- Phase 24 реализует Links **минимально**: `ProviderLinkRequestsSection` в `ProviderProfilePage` + request-flow внутри `PublishTrainerModal`. Phase 25 **выносит в отдельный подмаршрут** `/profile/provider/links`.
- Club-side: табы `Запросы` (pending от тренеров) / `Подтверждённые` / `История` (rejected / revoked). Действия: approve / reject / revoke + **invite тренера**.
- Trainer-side: табы `Мои запросы` (pending, отправленные) / `Подтверждённые` / `История`. Действия: revoke своего pending / break confirmed + **отправить новый запрос**.
- Invite-flow (для club_owner): модалка поиска тренера через существующий `GET /api/trainers?search=q` (фильтр по name/bio) + выбор клуба → отправка запроса (POST `/api/trainer-club-links` с `initiatedBy: 'club'`). Поиск **только по опубликованным тренерам** — не создаём `/api/users/search`, избегаем утечки users.
- Re-request (для trainer): модалка выбора клуба из опубликованных с фильтром «те, к которым ещё нет активного link'а».
- При revoke confirmed-связи — warning-модалка с реальным числом offerings, которые станут приватными (через `getOfferingsByLink(linkId).length`, auto-detach уже работает в Phase 24).
- Блок `ProviderLinkRequestsSection` из корневого `ProviderProfilePage` мигрирует сюда и удаляется из корня.

**Notifications — прокачка раздела из Phase 24:**

- Существующие `/profile/athlete/notifications` и `/profile/provider/notifications` получают: фильтры по группам типов (booking / link / discipline), группировки по дате (сегодня / вчера / эта неделя / раньше), фильтр «только непрочитанные», массовое mark-all-read (уже работает в Phase 24).
- Новое поле `User.notificationPreferences?: Record<NotificationType, boolean>` с read-fallback «все включены».
- Критичные типы НЕ отключаемы: `booking_confirmed`, `booking_cancelled_by_provider`, `quarantine_start`. Checkbox в Settings у этих типов disabled.
- `unreadCount` в bell НЕ учитывает отключённые типы (иначе badge горит молчаливо). Фильтр применяется и в API `/api/notifications/unread-count`, и в рендере списка.
- Settings-подсекция с группировкой: чекбоксы per тип с группами.

**Публичная симметрия репутации (Step 25.13):**

- Phase 24 реализовала reliability-функции для провайдера (`computeClubReliability`, `computeTrainerReliability`), но нигде не surface'ит их в public UI — они живут только в коде тестов. Phase 25 это закрывает.
- `TrainerCard`, `ClubCard` — новый опциональный prop `reliability: ReliabilityResult | null`. Server-page считает и передаёт.
- `TrainerDetailPageClient`, `ClubDetailPageClient` — новая секция «Надёжность» с `ReliabilityBadge` (showDetails=true).
- `GET /api/trainers` / `GET /api/clubs` — новый опциональный `?sort=reliability&dir=desc` (agg из bookings server-side).
- Home-page передаёт bookings через `buildTrainerDirectory` / `buildClubDirectory` в карточки.

**Хвосты Phase 24 — закрытие в отдельных Step'ах:**

- Step 25.1 — multi-offering edit-flow + legacy `affiliatedClubId`/`clubId`.
- Step 25.7 — quarantine триггеры (`quarantine_start`/`quarantine_end`/`quarantine_lifted_by_admin`) + disabled CTA на `/booking/[scheduleId]`.
- Step 25.13 — публичная симметрия репутации.
- Step 25.15 — интеграция `BookingStatusHistoryDrawer` в `LogsPage` (клик по booking-entityId → drawer).
- `AdminNavigation` секция «Дисциплина» — **не делаем** в Phase 25: новая ЛК-навигация фактически замещает её функцию. Если понадобится — в следующей фазе.
- E2E smoke-тест дисциплины (`phase-24-e2e.test.ts`) — **не делаем**: 1090 существующих тестов покрывают сценарии; smoke низкий ROI.

**Dashboard — акцент на «требует внимания прямо сейчас»:**

- У провайдера-клуба: pending-bookings, pending-link-requests от тренеров, booking'и с приближающимся концом окна check-in (48h), свежие непрочитанные уведомления.
- У провайдера-тренера: pending-bookings, статус отправленных link-запросов, приближающиеся check-in, непрочитанные.
- У спортсмена: ближайшая подтверждённая тренировка, pending-записи с индикатором обратного отсчёта до auto-cancel (1h до слота), карантин-баннер.
- KPI-блоки: 3-4 ключевых числа со ссылкой на детальный экран (Stats / Schedule / Bookings).
- Для multi-offering тренера KPI разбиты per-offering.

**Календарная сетка в Schedule — вне MVP:**

- Schedule атлета — только список с группировкой по неделям (ближайшая → прошлая). Календарная сетка — post-MVP (иначе нужна новая либа, обновление STACK, много работы).

**Стратегия `dynamic='force-dynamic'`:**

- Dynamic: Dashboard, Bookings, Schedule, Clients, Links, Notifications (mutation-sensitive).
- Static / без `force-dynamic`: Settings, Finance placeholder, Reviews, Favorites (кэширование ок, данные меняются редко).

**Statushistory: admin vs athlete — разные компоненты:**

- `BookingStatusHistoryDrawer` (admin, Phase 24) — остаётся как есть. Показывает actor-коды, system-переходы, reason-коды.
- Новый `AthleteBookingTimeline` (client) — user-friendly текст без actor-кодов, без system-переходов, через helper `formatStatusHistoryForAthlete(history): string[]`. В Schedule-drawer атлета.

**Finance как заложенная точка расширения:**

- Новый маршрут `/profile/provider/finance` — только у провайдеров. Placeholder со скелетом секций (Транзакции / Выплаты / Настройки платёжных реквизитов). Без API, без реальных данных.
- Атлетская Finance — не делаем. Платежи на стороне атлета живут как `paymentStatus` на каждом booking'е; отдельный раздел не нужен.

**Миграция существующих секций — инкрементально:**

- Каждая существующая секция ЛК (Achievements, History, Favorites, FeedbackSettings, Publications, Reviews, Settings, Bookings-карточка и т.д.) мигрирует отдельным шагом с регрессионной проверкой существующих тестов.
- Корневые `/profile/athlete` и `/profile/provider` находятся в **промежуточном состоянии** до финального Step — часть секций уже переехала, часть ещё в корне. Работоспособность гарантирована на каждом шаге.
- Финальный Step 25.17 — корневые становятся чистым Dashboard или редиректят на `/profile/*/dashboard`, удаляется код переехавших секций.

**Область работы (Scope-Guard):**

В Phase 25 входит:

- Layout'ы с условной data-driven навигацией для обеих ЛК.
- Dashboard / Schedule / Stats у спортсмена; Dashboard / Bookings / Clients / Stats / Links у провайдера.
- Placeholder Finance (provider-only).
- Новая коллекция `provider-client-notes.json` + API.
- Миграция всех существующих секций корневых страниц в подмаршруты.
- Прокачка Notifications (фильтры, группировки, настройки `notificationPreferences`).
- Поле `User.notificationPreferences` + `User.notifiedQuarantineUntil` (для дедупа quarantine-уведомлений).
- Публичная симметрия репутации (badges на TrainerCard/ClubCard + detail + sort/filter).
- Закрытие хвостов Phase 24: multi-offering edit, legacy fields, quarantine-триггеры, disabled CTA, drawer-wire-up.
- Синхронизация доменных файлов Phase 24 с новым UI.

В Phase 25 **НЕ** входит:

- Реальные платежи (Finance — placeholder).
- Email / SMS / Push-уведомления.
- SSE / WebSocket для notifications (polling продолжает работать).
- Рассылки, сегментация, экспорт в Clients.
- Новые механики FSM или дисциплины.
- Новые разделы в Super Admin (за исключением drawer-wire-up в LogsPage).
- Календарная сетка в Schedule атлета.
- Реальная authentication (NextAuth / middleware RBAC).
- Миграция на PostgreSQL.
- Секция «Дисциплина» в AdminNavigation.
- E2E smoke-тест фазы дисциплины.

---

### Step 25.1: Foundations — закрытие хвостов Phase 24 (multi-offering edit + legacy cleanup)

- **Действие:**
  - **25.1a — multi-offering edit-flow:**
    - `src/lib/db.ts` → `UpdateTrainerPublicationInput.additionalOfferings?: TrainerOfferingFormItem[]`; `updateTrainerPublication` делает full-replace массива: diff existing offerings по trainerId, remove отсутствующие (вместе с их schedule), create новые, update изменившиеся. Всё в одном `writeCollectionsWithRollback` (offerings + schedule).
    - `src/lib/contracts/reverse-mapping.ts` → `mapTrainerToFormState` принимает `{ trainer, primaryOffering, additionalOfferings, schedule, links }`, возвращает `TrainerFormState` с полным `additionalOfferings[]`. Резолв `attachmentMode`/`clubLinkId` по `Offering.trainerClubLinkId`.
    - `src/lib/contracts/publish-trainer.ts` → `mapTrainerFormToUpdateInput` возвращает `additionalOfferings` в update-payload.
    - `src/components/profile/PublishTrainerModal.tsx` → `cloneTrainerFormState` клонирует `additionalOfferings`; в edit-режиме bootstrap-fetch включает массив offerings.
    - `src/app/api/trainers/[id]/route.ts` GET → в response включить `additionalOfferings: Offering[]` (все offerings тренера кроме primary).
  - **25.1b — удаление legacy `affiliatedClubId`/`clubId`:**
    - `src/types/index.ts` → удалить `Trainer.affiliatedClubId`, `Trainer.clubId`, `Offering.affiliatedClubId` (убрать `@deprecated`-помеченные поля и их упоминания).
    - Мигрировать 6 точек чтения на `TrainerClubLink` с `status='confirmed'` (без fallback на удалённые поля): `src/app/trainers/[slug]/page.tsx`, `src/app/api/trainers/[id]/route.ts`, `src/app/clubs/[slug]/page.tsx`, `src/app/api/clubs/[id]/route.ts`, `src/app/api/trainers/route.ts` (фильтр `?affiliatedClubId`), `src/components/trainers/trainer-preview.ts` (`buildTrainerDirectory`), `src/app/page.tsx` (прокидывание links).
    - `src/lib/contracts/reverse-mapping.ts`, `src/lib/contracts/publish-trainer.ts` — убрать legacy-поля из form-state transform.
    - `src/lib/schemas/publish.ts` — убрать legacy-поля из `TrainerFormState` / схемы.
    - Seed `src/data/trainers.json`, `src/data/offerings.json` — удалить поля.

- **Проверка:**
  - Создать тренера с 3 offerings (primary + 2 additional: одна клубная, одна частная) → сохранить → переоткрыть edit-модалку → все 3 offering видны и редактируемы → удалить одно → submit → в JSON осталось 2 offerings.
  - `GET /api/trainers?affiliatedClubId=2` → возвращает тренеров через confirmed links без fallback на удалённое поле.
  - Публичные `/trainers/[slug]` и `/clubs/[slug]` → рендерят корректно без legacy-полей.
  - Удалить connected trainer-club-link через revoke → offerings той связи автоматически отсоединяются (Phase 24 уже работает) → edit-модалка тренера показывает эти offerings как `attachmentMode='private'`.

- **Тесты:**
  - `src/test/lib/db-update-trainer.test.ts` (+6 кейсов: update с сохранением массива, update с удалением offering, update с добавлением нового, update с изменением существующего, rollback при ошибке, ownership guard).
  - `src/test/lib/publish-trainer-contract.test.ts` (+4 кейса: reverse-mapping с 3 offerings, form-to-update с 3 offerings, clone сохраняет additionalOfferings, attachmentMode резолвится по trainerClubLinkId).
  - `src/test/profile/publish-trainer-modal.test.tsx` (+2 edit-flow теста: модалка открывается с 3 offerings и сохраняет правки).
  - Адаптировать ~30 существующих тестов под удалённые legacy-поля (grep `affiliatedClubId`, `clubId` в `src/test/`).

- **Ожидаемый результат:**
  - Multi-offering работает одинаково в create и edit. Legacy-поля удалены, все читатели на `TrainerClubLink`. Базa для Phase 25 Bookings per-offering / Stats drill-down / Clients per-offering стабильна.

---

### Step 25.2: Layout-хаб и условная data-driven навигация ✅

- **Действие:**
  - `src/app/profile/athlete/layout.tsx` (новый) — обёртка с sidebar-nav на desktop, drawer (через бургер) на mobile. Children — `page.tsx` и подмаршруты.
  - `src/app/profile/provider/layout.tsx` (новый) — то же самое, условный набор пунктов по данным (см. ниже).
  - `src/components/profile/ProfileSidebar.tsx` (новый) — sidebar-компонент с пунктами навигации, active по pathname.
  - `src/components/profile/ProfileMobileNav.tsx` (новый) — drawer с бургером в ProfileHeader для mobile (`md:hidden`, не заменяет глобальный `MobileNav`).
  - `src/components/profile/profile-nav-items.ts` (новый) — хелперы `getAthleteNavItems(user)` и `getProviderNavItems(user, clubs, trainers)` возвращают список пунктов условно по данным (не по role):
    - Athlete всегда: Dashboard, Schedule, Stats, Favorites, Reviews, Notifications, Settings.
    - Provider: Dashboard + Notifications + Settings + Finance всегда; Publications всегда при `providerClubs.length || providerTrainers.length`; Bookings / Clients / Stats при `bookings.length > 0 для provider`; Links при `providerClubs.length || providerTrainers.length`; Reviews аналогично Publications.
  - На этом шаге подмаршруты физически ещё не существуют — пункты навигации, ведущие на несуществующие пути, указывают на `/profile/athlete` или `/profile/provider` корень (временно). По мере прохождения Step'ов placeholder'ы заменяются реальными страницами.
  - Обратная совместимость: все существующие ссылки (из Header, каталогов, booking-flow) продолжают работать.

- **Проверка:**
  - Зайти за athlete (user id=1) → виден только athlete-набор.
  - Зайти за club_owner (user id=2 в seed, имеет и clubs и trainers) → видны оба набора разделов; если убрать все trainers из его пользования — trainer-side разделы скрываются; если удалить и clubs — остаётся только Dashboard+Notifications+Settings+Finance.
  - Desktop (>= md): sidebar виден слева, mobile (< md): бургер в хедере → drawer.
  - Прямой URL `/profile/athlete/schedule` (пока не существует) → корень с nav активен (как и сейчас).

- **Тесты:**
  - `src/test/profile/profile-nav-items.test.ts` (+6 кейсов: athlete-only, provider только clubs, provider только trainers, provider оба, provider без публикаций, admin not in scope).
  - `src/test/profile/profile-sidebar.test.tsx` (+3 кейса: рендер, active-highlight по pathname, условная видимость).

- **Ожидаемый результат:**
  - Обе ЛК работают через layout, nav условна по данным, mobile-опыт корректный. Готова база для всех подмаршрутов.

---

### Step 25.3: Dashboard спортсмена ✅

- **Действие:**
  - `src/components/profile/athlete/AthleteDashboard.tsx` (новый) — компонент Dashboard: ближайшая подтверждённая тренировка (первая из `confirmed` по `date+startTime`), список pending-записей с обратным отсчётом до auto-cancel (1h до слота), `ReliabilityBadge` с расшифровкой (reuse из Phase 24), KPI-блок (всего проведено, часов, любимый вид спорта, текущий стрик), быстрые действия (найти тренировку, открыть Schedule).
  - Карантин-баннер: переносим логику из корня `AthleteProfilePage` в `AthleteDashboard` (через `isAthleteInQuarantine({ quarantineLiftedAt })`).
  - Состояние «новый пользователь» (completedCount < 5 из `computeAthleteReliability`): нейтральная шапка «Сделайте первую запись» без цифр.
  - Пока корневая `src/app/profile/athlete/page.tsx` продолжает рендерить старую простыню — Dashboard будет смонтирован в 25.17 в финале.
  - Параллельный маршрут `src/app/profile/athlete/dashboard/page.tsx` (новый) — серверная страница, которая рендерит `AthleteDashboard` (для прямых ссылок и для пункта навигации).

- **Проверка:**
  - Зайти на `/profile/athlete/dashboard` → виден Dashboard с ближайшей тренировкой, pending-блоком, reliability, KPI.
  - Карантин (3+ no_show за 30 дней) → красный баннер сверху с датой окончания и причиной.
  - После admin lift → баннер скрывается на refresh.
  - Новый пользователь (completedCount < 5) → нейтральная шапка, без «low reliability».

- **Тесты:**
  - `src/test/profile/athlete-dashboard.test.tsx` (+6 кейсов: empty state, pending countdown, reliability секция, карантин-баннер, new user flow, KPI).
  - Адаптировать `src/test/profile/athlete-profile-page.test.tsx` (баннер переносится из корня).

- **Ожидаемый результат:**
  - Прямой URL `/profile/athlete/dashboard` работает, все ключевые блоки видны. Карантин-функционал мигрирован.

---

### Step 25.4: Schedule спортсмена — единый список записей с клиентской статус-историей ✅

- **Действие:**
  - `src/app/profile/athlete/schedule/page.tsx` (новый) — серверная страница.
  - `src/components/profile/athlete/AthleteSchedule.tsx` (новый) — клиентский компонент: единый список всех bookings атлета (прошлые + будущие, все FSM-статусы).
  - Фильтры: по FSM-группе (`активные` = pending/confirmed, `завершённые` = completed/no_show/unmarked, `отменённые` = cancelled_*/rejected_by_provider), по виду спорта, по провайдеру, по периоду.
  - Отображение — только список с группировкой по неделям (ближайшая → прошлая). Календарная сетка — post-MVP, не делаем.
  - Клик по записи → drawer `AthleteBookingDrawer` с:
    - `AthleteBookingTimeline` (новый компонент, `src/components/profile/athlete/AthleteBookingTimeline.tsx`) — клиентская версия statusHistory через helper `formatStatusHistoryForAthlete(history): { label: string; at: ISODateTimeString }[]`.
    - FSM-действия, релевантные атлету: «Отменить запись» с `LateCancelWarningModal` из Phase 24 при late, «Посмотреть публикацию».
  - Helper `src/lib/athlete-timeline-format.ts` (новый) — `formatStatusHistoryForAthlete(history)` конвертирует каждый `BookingStatusTransition` в user-friendly строку без actor-кодов, пропуская `actor='system'` (автопереходы не показываем атлету в явной форме).

- **Проверка:**
  - Зайти на `/profile/athlete/schedule` → список записей, группировка по неделям.
  - Фильтр «Отменённые» → остаются только cancelled_by_* и rejected_by_provider.
  - Клик по записи → drawer открывается, timeline показывает: «Вы записались 10 дек» → «Провайдер подтвердил 11 дек» → «Вы отменили 14 дек (поздняя отмена)».
  - Отмена с drawer при late-cancel → LateCancelWarningModal → подтверждение → soft-cancel FSM срабатывает → toast → refresh, запись в drawer обновлена.

- **Тесты:**
  - `src/test/profile/athlete-schedule.test.tsx` (+5 кейсов: empty, фильтр по группе, группировка по неделям, клик → drawer, late-cancel flow через drawer).
  - `src/test/lib/athlete-timeline-format.test.ts` (+4 кейса: athlete actor, provider actor, admin actor, system actor скрыт).
  - `src/test/profile/athlete-booking-timeline.test.tsx` (+3 кейса: рендер всех переходов, формат даты, пустая история).

- **Ожидаемый результат:**
  - Атлет видит свои записи с FSM-историей в user-friendly формате. Отмена работает через drawer с warning-модалкой.

---

### Step 25.5: Stats спортсмена — метрики, стрики, ачивки ✅

- **Действие:**
  - `src/app/profile/athlete/stats/page.tsx` (новый) — серверная страница с SSR-мемоизацией через `React.cache`.
  - `src/components/profile/athlete/AthleteStats.tsx` (новый) — 2 секции: «Достижения» (монтируем существующий `AthleteAchievementsSection`, код не переписываем, только переносим) + «Метрики».
  - Метрики:
    - Часы по видам спорта (PieChart / BarChart).
    - Часы по клубам и тренерам (BarChart).
    - Активность по месяцам (LineChart, default 12 месяцев, toggle «всё время»).
    - Стрики (текущий + максимальный) через новый helper `src/lib/athlete-streaks.ts`: `computeCurrentStreak(bookings)`, `computeMaxStreak(bookings)` — по неделям из completed.
    - Разбивка по FSM-статусам (PieChart: completed vs cancelled vs no_show) — для честной картины.
    - Текущий reliability с детализацией (completed count, no_show count, late-cancel count, completionRate).
    - Bar chart `completionRate` помесячно (completed / relevant в каждом месяце) — замена первичной «динамики reliability», без хранимых snapshot'ов.
  - После миграции в Stats — `AthleteAchievementsSection` остаётся в корне до Step 25.17 (parallel), в 25.17 удаляется из корневой `page.tsx`.
  - Все расчёты — на лету через `computeAthleteReliability` и агрегаты из `bookings`.

- **Проверка:**
  - Зайти на `/profile/athlete/stats` → обе секции: Достижения (старый UI) + Метрики (новый Recharts-UI).
  - Переключить toggle «всё время» ↔ «12 месяцев» → LineChart и BarChart перестраиваются.
  - Пустое состояние (0 bookings) → все графики показывают «нет данных».
  - Стрик: создать 4 completed booking'а подряд по неделе → текущий стрик = 4.

- **Тесты:**
  - `src/test/lib/athlete-streaks.test.ts` (+5 кейсов: current=0, current=3, break, max>current, edge на неделе).
  - `src/test/profile/athlete-stats.test.tsx` (+6 кейсов: рендер секций, toggle окна, empty state, стрики, FSM разбивка, reliability).

- **Ожидаемый результат:**
  - Атлет видит полную картину своей активности. Достижения и метрики объединены в одном месте.

---

### Step 25.6: Миграция оставшихся разделов спортсмена (Favorites, Reviews, Settings) ✅

- **Действие:**
  - `src/app/profile/athlete/favorites/page.tsx` (новый) — server page, монтирует существующий `AthleteFavoritesSection`.
  - `src/app/profile/athlete/reviews/page.tsx` (новый) — server page, монтирует существующий компонент секции отзывов.
  - `src/app/profile/athlete/settings/page.tsx` (новый) — server page, монтирует существующий `AthleteFeedbackSettingsSection` + новая подсекция «Уведомления» (чекбоксы по `NotificationType` — реализация в Step 25.14).
  - Пока компоненты секций остаются в корне `AthleteProfilePage` (финальное удаление — 25.17).
  - Навигация из Step 25.2 начинает вести на реальные страницы.

- **Проверка:**
  - Прямой URL `/profile/athlete/favorites` / `/reviews` / `/settings` → каждая страница рендерит свою секцию.
  - Корневая `/profile/athlete` продолжает работать (старые ссылки, Dashboard в 25.3 уже параллельно живёт).

- **Тесты:**
  - `src/test/profile/athlete-favorites-page.test.tsx` (+2 smoke-кейса).
  - `src/test/profile/athlete-reviews-page.test.tsx` (+2 smoke-кейса).
  - `src/test/profile/athlete-settings-page.test.tsx` (+2 smoke-кейса, чекбокс Notifications появится в 25.14).

- **Ожидаемый результат:**
  - Все разделы атлета доступны по прямым URL. Корень продолжает работать.

---

### Step 25.7: Quarantine-триггеры и disabled CTA на booking-странице ✅

- **Действие:**
  - `src/types/index.ts` → `User.notifiedQuarantineUntil?: ISODateTimeString` (для дедупа quarantine-уведомлений, чтобы не спамить при каждом запросе).
  - `src/lib/quarantine-notifier.ts` (новый) — хелпер `maybeNotifyQuarantineStart(user, quarantine)` и `maybeNotifyQuarantineEnd(user, bookings, now)`:
    - `maybeNotifyQuarantineStart`: если `quarantine.inQuarantine === true` и `user.notifiedQuarantineUntil !== quarantine.until` → `notify(user.id, 'quarantine_start', { until, reason })` + обновить `User.notifiedQuarantineUntil = until`.
    - `maybeNotifyQuarantineEnd`: если в прошлом был notified quarantine (`notifiedQuarantineUntil` set) и сейчас `inQuarantine === false` → `notify(user.id, 'quarantine_end', {})` + очистить `notifiedQuarantineUntil`.
  - Интеграция в `POST /api/bookings` guard: после quarantine-check вызвать `maybeNotifyQuarantineStart` (если попытка бронирования из quarantine — фиксируем триггер при first hit).
  - Интеграция в `transitionBooking` при переходе в `no_show`: вычислить, попал ли user в карантин впервые → notify.
  - Интеграция в `POST /api/admin/users/[id]/lift-quarantine`: после установки `quarantineLiftedAt` → `notify(userId, 'quarantine_lifted_by_admin', {})`.
  - Ленивый `maybeNotifyQuarantineEnd` — в `runLazyBookingTransitions` (при GET /api/bookings) — если карантин user истёк по времени, шлём `quarantine_end`.
  - `src/components/booking/BookingActionBlock.tsx` → принимает `quarantineStatus: QuarantineResult | null` prop, если `inQuarantine === true` → disabled кнопка + плашка «Вы в карантине до DD.MM. Причина: …».
  - `src/app/booking/[scheduleId]/page.tsx` → server page считает `isAthleteInQuarantine({ bookings, userId, quarantineLiftedAt })` и прокидывает в `BookingActionBlock`.

- **Проверка:**
  - Атлет с 3 no_show → зайти на `/booking/[scheduleId]` → кнопка disabled, плашка «В карантине до …».
  - Попытка `POST /api/bookings` в quarantine → 403 (уже из Phase 24) + **первый** раз уведомление `quarantine_start` создаётся, второй раз — нет (дедуп через `notifiedQuarantineUntil`).
  - Admin lift → `quarantine_lifted_by_admin` notification приходит атлету.
  - Карантин истёк по времени → через `GET /api/bookings` (через `runLazyBookingTransitions`) атлет получает `quarantine_end`.

- **Тесты:**
  - `src/test/lib/quarantine-notifier.test.ts` (+5 кейсов: start первый hit, start повторный hit — no spam, end после lift, end после истечения, end не шлётся без предшествующего start).
  - `src/test/api/bookings.route.test.ts` — адаптировать quarantine-test (проверить, что notification создаётся).
  - `src/test/api/admin.lift-quarantine.route.test.ts` — проверить `quarantine_lifted_by_admin` notification.
  - `src/test/booking/booking-action-block.test.tsx` (+2 кейса: disabled при карантине, плашка).

- **Ожидаемый результат:**
  - 3 типа quarantine-уведомлений работают с дедупом. Атлет видит disabled CTA до попытки записи. Хвост 24.14 закрыт.

---

### Step 25.8: Dashboard провайдера ✅

- **Действие:**
  - `src/app/profile/provider/dashboard/page.tsx` (новый) — server page.
  - `src/components/profile/provider/ProviderDashboard.tsx` (новый) — сводка:
    - Для club-side: pending-bookings (count + link → Bookings → таб pending), pending link-requests от тренеров (count + link → Links), booking'и с приближающимся концом окна check-in (<6h, link → Bookings → check-in таб), непрочитанные уведомления.
    - Для trainer-side: pending-bookings, статус отправленных link-запросов, приближающиеся check-in, непрочитанные.
    - KPI: активных записей на сегодня/неделю, overall completionRate, `ReliabilityBadge` всех своих entities (compact, линк на Stats).
    - Быстрые действия: опубликовать новое (открывает PublishModal), открыть Bookings, открыть Clients.
  - Для multi-offering тренера KPI разбиты per-offering (подсекции).
  - Условный рендер по `getProviderClubs(user.id)` / `getProviderTrainers(user.id)` — если есть обе стороны, блоки дублируются с подзаголовками.

- **Проверка:**
  - Провайдер с 1 club + 1 trainer (multi-offering) → в Dashboard видны обе стороны с KPI.
  - Pending-bookings count корректен, клик ведёт на Bookings с открытым табом.
  - Провайдер без публикаций (новый) → «Опубликуйте первую услугу» CTA.

- **Тесты:**
  - `src/test/profile/provider-dashboard.test.tsx` (+6 кейсов: only clubs, only trainers, both, empty, per-offering KPI, link навигация).

- **Ожидаемый результат:**
  - Провайдер видит «что требует внимания прямо сейчас» на одной странице, с быстрым доступом к деталям.

---

### Step 25.9: Bookings-inbox провайдера — 4 таба FSM + фильтры per-offering ✅

- **Действие:**
  - `src/app/profile/provider/bookings/page.tsx` (новый) — server page.
  - `src/components/profile/provider/ProviderBookingsInbox.tsx` (новый) — 4 таба:
    - `Ожидают подтверждения` (status='pending').
    - `Подтверждённые ближайшие` (status='confirmed', sort по startAt asc).
    - `Требуют check-in` (status='confirmed', endAt <= now <= endAt + 48h, sort по оставшемуся окну desc).
    - `История` (completed / no_show / unmarked / cancelled_* / rejected_by_provider, фильтр по финальному статусу).
  - Карточка booking'а: имя спортсмена (link на его публичный профиль, если есть), `ReliabilityBadge` (compact, showDetails), offering-title, время слота, место, FSM-кнопки: Confirm / Reject / Check-in completed / Check-in no_show / Cancel.
  - Клик кнопки → соответствующий API-endpoint из Phase 24 → `router.refresh()` + `addToast()`.
  - Фильтры внутри табов: по offering (dropdown), по виду спорта, по дате.
  - Для multi-offering тренера фильтр per-offering — критичен (тренер с Йогой и Боксом не хочет смотреть заявки вперемешку).
  - Блок `ProviderBookingsSection` из `ProviderProfilePage` (Phase 24) — ядро переиспользуется, `ProviderIncomingBooking` тип остаётся.
  - В табе «Требуют check-in» — визуальный акцент на пограничных (<6h до конца окна 48h): красный border.

- **Проверка:**
  - Провайдер с multi-offering тренером + pending-заявками в обеих услугах → по умолчанию видны все, фильтр по offering сужает.
  - Клик Confirm → запись переходит в «Подтверждённые ближайшие».
  - Слот прошёл, 48h ещё не истекло → запись в «Требуют check-in», по мере приближения к концу окна — border краснеет.
  - Клик «Отметить completed» → запись переходит в «История», `ReliabilityBadge` атлета обновляется (если накопилось данных).

- **Тесты:**
  - `src/test/profile/provider-bookings-inbox.test.tsx` (+8 кейсов: рендер табов, фильтр по offering, фильтр по спорту, confirm, reject, check-in completed, check-in no_show, критичность окна <6h).

- **Ожидаемый результат:**
  - Провайдер работает с записями через удобный inbox. Multi-offering первокласно поддержан.

---

### Step 25.10: Clients провайдера — CRM-агрегация + заметки

- **Действие:**
  - `src/types/index.ts` → новый тип:
    ```ts
    export interface ProviderClientNote {
      id: EntityId;
      createdAt: ISODateTimeString;
      updatedAt: ISODateTimeString;
      providerUserId: EntityId;
      clientUserId: EntityId;
      note: string;
      bookingId?: EntityId;
    }
    ```
  - `src/data/provider-client-notes.json` (новый) — пустой массив.
  - `src/lib/db.ts` — CRUD: `getProviderClientNotes({ providerUserId?, clientUserId? })`, `createProviderClientNote`, `updateProviderClientNote`, `deleteProviderClientNote`. `DataCollectionMap` и `DATA_FILES` расширяются.
  - `src/app/api/provider-client-notes/route.ts` (новый) — GET (filter providerUserId, clientUserId), POST (create).
  - `src/app/api/provider-client-notes/[id]/route.ts` (новый) — PATCH (update note), DELETE.
  - Guard ownership: провайдер CRUD только про клиентов, у которых есть хотя бы один `Booking` с `ownerId = providerUserId` (resolve через `getProviderClubs` + `getProviderTrainers`); admin — все. Helper `src/lib/provider-client-guards.ts` (новый): `isClientOfProvider(bookings, providerUserId, clientUserId)`.
  - `src/app/profile/provider/clients/page.tsx` (новый) — server page.
  - `src/components/profile/provider/ProviderClients.tsx` (новый) — список уникальных клиентов, переключатель per-entity ↔ per-offering.
  - Для каждого клиента: имя, `ReliabilityBadge` (через `computeAthleteReliability`), количество completed, дата первого/последнего visit, топ-3 offerings по числу записей, заметка (если есть).
  - Фильтры: по reliability-бейджу (danger/warning/normal/new), по давности последнего visit (>30 дней — реактивация), по offering.
  - Клик по клиенту → drawer `ProviderClientDrawer` с полной историей записей этого клиента к этому провайдеру (все FSM-переходы, включая unmarked и rejected), редактируемой заметкой (inline-форма), быстрым переходом в публичный профиль клиента (если будет).

- **Проверка:**
  - Провайдер-клуб → видны клиенты всех его клубов (общий список с тегом клуба рядом с именем).
  - Провайдер-тренер с multi-offering → переключатель: per-entity (все клиенты тренера) ↔ per-offering (только клиенты Йоги).
  - Фильтр по reliability: danger-клиенты отфильтровываются (могут помочь провайдеру осознанно с ними работать).
  - Открыть drawer → отредактировать заметку → PATCH API → toast → обновление на refresh.
  - Попытка чужого провайдера прочитать/редактировать note → 403 (guard через `isClientOfProvider`).

- **Тесты:**
  - `src/test/lib/db-provider-client-notes.test.ts` (+5 кейсов CRUD).
  - `src/test/lib/provider-client-guards.test.ts` (+4 кейса: provider с booking от клиента → true, без booking → false, другой providerId → false, admin-bypass).
  - `src/test/api/provider-client-notes.route.test.ts` (+6 кейсов API: create/update/delete/list/ownership guard/admin).
  - `src/test/profile/provider-clients.test.tsx` (+7 кейсов: per-entity, per-offering toggle, фильтры, drawer, заметка, empty state, права).

- **Ожидаемый результат:**
  - Провайдер видит клиентскую базу с reliability, может вести заметки. Основа CRM заложена.

---

### Step 25.11: Stats провайдера — своя аналитика с drill-down per-offering

- **Действие:**
  - `src/app/profile/provider/stats/page.tsx` (новый) — server page с SSR-мемоизацией.
  - `src/components/profile/provider/ProviderStats.tsx` (новый) — метрики (все per-entity с drill-down per-offering для multi-offering тренера):
    - Часы проведено (completed), суммарно + LineChart по месяцам (12 месяцев default, toggle «всё время»).
    - Загрузка слотов (booked / capacity) — по offerings и периодам (BarChart).
    - Completion rate провайдера (сколько confirmed дошли до completed).
    - Cancel rate (сколько cancelled_by_provider / общее).
    - No_show rate клиентов (сколько клиентских no_show у этого провайдера).
    - Heatmap «день недели × час» — популярные слоты (самописный компонент или BarChart 7×24).
    - Топ-5 offerings по числу записей (BarChart).
    - `ReliabilityBadge` каждой своей entity (showDetails) + bar chart `completionRate` помесячно (не динамика reliability, а просто completed/relevant в каждом месяце).
  - Переключатель per-entity ↔ per-offering (для multi-offering тренера) — как в Clients.
  - Все расчёты на лету через `getBookings()` + `computeClubReliability` / `computeTrainerReliability`. Мемоизация через `React.cache`.
  - В отличие от `/service-portal/analytics` — **только свои данные**, не агрегаты по платформе.

- **Проверка:**
  - Провайдер-клуб с 10 completed → видны корректные часы, completion rate, heatmap.
  - Провайдер-тренер с 2 offerings → toggle per-offering: Йога / Бокс / Итого.
  - Toggle окна 12m ↔ «всё время» → графики перестраиваются.
  - Пустое состояние (0 bookings) → все метрики показывают «нет данных».

- **Тесты:**
  - `src/test/profile/provider-stats.test.tsx` (+8 кейсов: рендер метрик, per-offering toggle, window toggle, heatmap, completion rate, cancel rate, empty, SSR-кэш).

- **Ожидаемый результат:**
  - Провайдер видит всю аналитику своих публикаций с возможностью drill-down.

---

### Step 25.12: Links — полноценный раздел для обеих сторон с invite-flow

- **Действие:**
  - `src/app/profile/provider/links/page.tsx` (новый) — server page.
  - `src/components/profile/provider/ProviderLinks.tsx` (новый) — рендерит две секции (club-side + trainer-side), условно по наличию `getProviderClubs(user.id)` / `getProviderTrainers(user.id)`.
  - **Club-side** (если у provider есть хотя бы 1 club):
    - Табы: `Запросы` (pending от тренеров) / `Подтверждённые` / `История` (rejected / revoked).
    - Действия: Approve / Reject / Revoke + **Invite trainer**.
    - Invite-flow: модалка `InviteTrainerModal` с поиском тренера через `GET /api/trainers?search=q` (уже существует, фильтр по name/bio) → выбор клуба (из `getProviderClubs(user.id)`) → POST `/api/trainer-club-links` с `initiatedBy: 'club'`, `initiatedByUserId: user.id`. Поиск **только по опубликованным тренерам** — без `/api/users/search` (избегаем утечки users).
  - **Trainer-side** (если у provider есть хотя бы 1 trainer):
    - Табы: `Мои запросы` (pending, отправленные) / `Подтверждённые` / `История`.
    - Действия: Revoke own pending / Break confirmed + **Отправить новый запрос**.
    - Re-request flow: модалка `RequestLinkModal` с выбором клуба из `GET /api/clubs` (опубликованных) + фильтром «те, к которым ещё нет активного link'а» (клиентская фильтрация через имеющиеся links) → выбор своего тренера (из `getProviderTrainers(user.id)`) → POST `/api/trainer-club-links` с `initiatedBy: 'trainer'`.
  - При revoke confirmed-связи — warning-модалка `RevokeLinkWarningModal` (новый компонент): считает кол-во offerings с этим `trainerClubLinkId` через `getOfferingsByLink(linkId)`, показывает «X услуг автоматически станут частными. Продолжить?». `detachOfferingsFromLink` уже работает в Phase 24 — добавляем осознанность в UX.
  - Блок `ProviderLinkRequestsSection` из корневого `ProviderProfilePage` (Phase 24) мигрирует в `ProviderLinks` и удаляется из корня (в 25.17).

- **Проверка:**
  - Club-side: видны pending-запросы от тренеров, approve → переход в Подтверждённые, reject → в Историю.
  - Club-side Invite: открыть модалку, найти тренера, выбрать клуб, отправить → pending создаётся.
  - Trainer-side: свой pending отображается, revoke → в Историю.
  - Trainer-side re-request: попытка отправить запрос к клубу, с которым уже есть confirmed → клуб не показывается в списке.
  - Break confirmed → warning-модалка с числом offerings → «Продолжить» → revoke + detach.

- **Тесты:**
  - `src/test/profile/provider-links.test.tsx` (+10 кейсов: club-side табы и действия, trainer-side табы и действия, invite-flow, re-request flow, warning-модалка, data-driven условный рендер обеих сторон).

- **Ожидаемый результат:**
  - Обе стороны связи тренер↔клуб управляются из одного раздела. Invite-flow работает для clubs, re-request — для trainers.

---

### Step 25.13: Публичная симметрия репутации — ReliabilityBadge в каталогах и detail-страницах + sort/filter

- **Действие:**
  - `src/components/trainers/trainer-preview.ts` → `TrainerDirectoryItem` получает опциональное поле `reliability: ReliabilityResult | null`; `buildTrainerDirectory` принимает `bookings` и считает reliability per-trainer на сервере.
  - `src/components/clubs/ClubCard.tsx` → принимает опциональный prop `reliability: ReliabilityResult | null`, рендерит `ReliabilityBadge` (compact) рядом с Rating.
  - `src/components/trainers/TrainerCard.tsx` → то же.
  - `src/components/clubs/ClubDetailPageClient.tsx` → новая секция «Надёжность» с `ReliabilityBadge` (showDetails=true) + расшифровка цифр.
  - `src/components/trainers/TrainerDetailPageClient.tsx` → то же.
  - `src/app/page.tsx` (home) → передаёт bookings в `buildTrainerDirectory` и в ClubList.
  - `src/app/trainers/[slug]/page.tsx`, `src/app/clubs/[slug]/page.tsx` → server-side считают `computeTrainerReliability`/`computeClubReliability` и прокидывают в detail-клиент.
  - `src/app/api/trainers/route.ts` / `src/app/api/clubs/route.ts` — новый опциональный `?sort=reliability&dir=desc` + опциональный `?excludeDanger=true` фильтр (скрывает entity с `badge='danger'`). Sort-агрегат через `getBookings()` server-side.
  - Для гостей (`isAuthenticated === false`) — badges видны как у всех, но без числовой расшифровки на карточках (privacy по умолчанию). На detail-странице полная расшифровка.

- **Проверка:**
  - Home-page → на `TrainerCard` и `ClubCard` виден `ReliabilityBadge` у тех entity, которые прошли `minCompletedForBadge` threshold; для новых — «Новый» бейдж или отсутствие.
  - Detail-страница `/trainers/[slug]` → секция «Надёжность» с showDetails (X completed из Y, no_show count, cancel rate).
  - `GET /api/trainers?sort=reliability&dir=desc` → топ тренеров по completionRate.
  - `GET /api/clubs?excludeDanger=true` → клубы с badge='danger' скрыты.
  - Провайдер с высоким cancel_by_provider_rate (искусственно) → badge='danger' в каталоге → downrank/скрытие по фильтру.

- **Тесты:**
  - `src/test/trainers/trainer-card.test.tsx` (+3 кейса: с reliability, без, compact format).
  - `src/test/clubs/club-card.test.tsx` (+3 кейса: аналогично).
  - `src/test/trainers/trainer-detail-page.test.tsx` (+2 кейса: секция Надёжность, showDetails).
  - `src/test/api/trainers.route.test.ts` (+3 кейса: sort=reliability, excludeDanger, combined).
  - `src/test/api/clubs.route.test.ts` (+3 кейса: то же).
  - `src/test/app/page-trainer-reliability.test.tsx` (+2 кейса: home-page рендерит с reliability).

- **Ожидаемый результат:**
  - Симметрия репутации в public: атлет видит при выборе, насколько провайдер добросовестный. Тезис «с обеих сторон дорогим» реально работает.

---

### Step 25.14: Миграция Provider-секций + Notifications upgrade + `User.notificationPreferences`

- **Действие:**
  - `src/app/profile/provider/publications/page.tsx` (новый) — server page, монтирует существующий `ProviderPublicationsSection` со всеми action-кнопками (редактировать / удалить).
  - `src/app/profile/provider/reviews/page.tsx` (новый) — server page, монтирует существующую секцию отзывов провайдера.
  - `src/app/profile/provider/settings/page.tsx` (новый) — server page с существующими настройками + подсекция «Уведомления» с `UserNotificationPreferencesEditor`.
  - **Notifications upgrade:**
    - `src/types/index.ts` → `User.notificationPreferences?: Record<NotificationType, boolean>`.
    - `src/lib/notification-types.ts` (новый) — классификация 14 типов на группы `booking | link | discipline`:
      - booking: `booking_confirmed`, `booking_rejected`, `booking_cancelled_by_athlete`, `booking_cancelled_by_provider`, `booking_completed`, `booking_no_show`, `booking_auto_expired`.
      - link: `link_requested`, `link_approved`, `link_rejected`, `link_revoked`.
      - discipline: `quarantine_start`, `quarantine_end`, `quarantine_lifted_by_admin`.
    - Критичные (не-отключаемые) — `booking_confirmed`, `booking_cancelled_by_provider`, `quarantine_start`. Константа `REQUIRED_NOTIFICATION_TYPES` в том же файле.
    - `src/components/profile/notifications/NotificationsListPage.tsx` (Phase 24) — расширить: фильтр по группам, группировка по датам (сегодня/вчера/неделя/раньше), фильтр «только непрочитанные», массовое mark-all-read (уже работает).
    - `src/lib/db.ts` → `getNotifications` / `getUnreadNotificationCount` принимают `user.notificationPreferences` и фильтруют **на серверной стороне** типы, у которых `preferences[type] === false`.
    - `src/components/layout/NotificationBell.tsx` — `useUnreadCountPolling` получает отфильтрованный count (уже через API).
    - `src/components/profile/UserNotificationPreferencesEditor.tsx` (новый) — чекбоксы per тип с группировкой; disabled для required types; PATCH на новый endpoint `/api/users/[id]/notification-preferences`.
    - `src/app/api/users/[id]/notification-preferences/route.ts` (новый) — PATCH с ownership guard.

- **Проверка:**
  - `/profile/provider/publications` / `/reviews` / `/settings` → рендерят существующий UI.
  - В Settings отключить `booking_cancelled_by_athlete` → попытка отключить `booking_confirmed` → чекбокс disabled с tooltip «критичное уведомление».
  - Атлет отключает `link_revoked` → при revoke-событии уведомление попадает в базу, но не видно в bell и списке, unreadCount не растёт.
  - Admin lift-quarantine → атлет получает `quarantine_lifted_by_admin` (не в REQUIRED, но по default включено).

- **Тесты:**
  - `src/test/profile/provider-publications-page.test.tsx` (+2 smoke).
  - `src/test/profile/provider-reviews-page.test.tsx` (+2 smoke).
  - `src/test/profile/provider-settings-page.test.tsx` (+4 кейса: базовый рендер, NotificationPreferencesEditor, disabled required, PATCH).
  - `src/test/api/user-notification-preferences.route.test.ts` (+4 кейса: PATCH, ownership, invalid payload, required types не отключаются).
  - `src/test/api/notifications.route.test.ts` — адаптировать (фильтр по preferences).
  - `src/test/lib/notification-types.test.ts` (+3 кейса: группировка, required list, все 14 типов покрыты).

- **Ожидаемый результат:**
  - Обе ЛК имеют пользовательские настройки уведомлений с гарантией, что критичные типы всегда доставляются. Prokazchenny Notifications-UI с фильтрами и группировкой.

---

### Step 25.15: Интеграция `BookingStatusHistoryDrawer` в LogsPage

- **Действие:**
  - `src/components/admin/LogsPage.tsx` → для log-entries с `entityType='booking'` — entityId становится clickable (подсветка), клик открывает `BookingStatusHistoryDrawer` с соответствующим booking'ом.
  - Загрузка booking'а при клике через `GET /api/bookings/[id]` (новый endpoint, если ещё нет — проверить; если есть — переиспользуем).
  - Если `GET /api/bookings/[id]` ещё не существует — создать в `src/app/api/bookings/[id]/route.ts` (GET) с admin guard.
  - `BookingStatusHistoryDrawer` (Phase 24) — без изменений, только новая точка входа.

- **Проверка:**
  - Admin открывает `/service-portal/logs` → видит лог `booking_confirm` с entityId=42 → клик → drawer открывается, timeline виден.
  - Не-booking логи (publish_create, etc.) — entityId не clickable.

- **Тесты:**
  - `src/test/admin/logs-page.test.tsx` (+3 кейса: клик по booking-entityId открывает drawer, не-booking не clickable, drawer закрывается).
  - Если новый GET endpoint — `src/test/api/bookings-get-by-id.route.test.ts` (+3 кейса: found, 404, admin guard).

- **Ожидаемый результат:**
  - Drawer подключён. Admin может расследовать любой booking из логов. Хвост 24.15 закрыт.

---

### Step 25.16: Provider Finance placeholder

- **Действие:**
  - `src/app/profile/provider/finance/page.tsx` (новый) — server page.
  - `src/components/profile/provider/ProviderFinance.tsx` (новый) — placeholder со скелетом секций: `Транзакции` / `Выплаты` / `Настройки платёжных реквизитов`. Каждая секция — пустая карточка с текстом «Финансовый модуль находится в разработке».
  - Без API, без реальных данных.

- **Проверка:**
  - `/profile/provider/finance` → рендерит 3 пустые секции с заголовками.
  - В навигации провайдера пункт Finance присутствует (всегда для provider).
  - Атлет не видит finance (раздел только у провайдера).

- **Тесты:**
  - `src/test/profile/provider-finance-page.test.tsx` (+2 smoke-кейса).

- **Ожидаемый результат:**
  - Finance-раздел существует как placeholder, готов к наполнению в будущих фазах.

---

### Step 25.17: Финальная полировка — корневые Dashboard, seed, feature-docs, синхронизация, верификация

- **Действие:**
  - `src/app/profile/athlete/page.tsx` → рефакторинг: либо рендерит `AthleteDashboard` напрямую (как корневой Dashboard), либо редиректит на `/profile/athlete/dashboard`. Выбор — редирект (проще, избегаем двойного source-of-truth).
  - `src/app/profile/provider/page.tsx` → то же самое, редирект на `/profile/provider/dashboard`.
  - Удаление из корневых страниц кода переехавших секций: `AthleteAchievementsSection`, `AthleteFavoritesSection`, `AthleteHistorySection`, `AthleteUpcomingBookingCard` (если уже покрыт Schedule-drawer), `ProviderPublicationsSection`, `ProviderBookingsSection`, `ProviderLinkRequestsSection` — остаются только как экспортируемые компоненты для новых server-page'ей.
  - Чистка неиспользуемых helper'ов, если остались.
  - Seed enrichment (локальная подложка для dev, `.gitignored`): `provider-client-notes.json` = `[]`; при необходимости пара примеров заметок для ручного тестирования.
  - Feature-docs — обновление:
    - **Один новый файл:** `feature-docs/profile-hub.md` — архитектура ЛК-хабов для обеих ролей: layout с условной data-driven навигацией, подмаршруты (Dashboard / Schedule / Stats / Favorites / Reviews / Settings / Notifications у атлета; Dashboard / Publications / Bookings / Clients / Stats / Links / Finance / Reviews / Settings / Notifications у провайдера), стратегия `dynamic='force-dynamic'`, desktop sidebar + ProfileMobileNav (drawer), миграция секций из корня, редиректы корневых на Dashboard. **Секция «Clients + заметки провайдера»** внутри этого же файла: `ProviderClientNote` тип, коллекция `provider-client-notes.json`, API и ownership guard через `isClientOfProvider`, per-entity ↔ per-offering toggle, фильтры, drawer с историей и заметкой. Не делаем отдельный `provider-crm.md` — Clients логически часть провайдерского хаба, избегаем искусственного разделения.
    - `feature-docs/_overview.md` → новая строка «ЛК-хаб» (profile-hub как отдельный домен); обновлены связи (profile-hub ↔ booking-lifecycle / reliability / notifications / trainer-club-link / admin / publish-flow).
    - `feature-docs/booking-lifecycle.md` — секция про UI Bookings-inbox по табам и Schedule атлета с `AthleteBookingTimeline`.
    - `feature-docs/reliability.md` — секция про публичные badges (TrainerCard/ClubCard/detail) и sort/filter в API, про Stats UI, про quarantine-триггеры с дедупом через `notifiedQuarantineUntil`, про disabled CTA на booking-странице.
    - `feature-docs/notifications.md` — секция про `notificationPreferences`, группировки (booking/link/discipline), `REQUIRED_NOTIFICATION_TYPES`.
    - `feature-docs/trainer-club-link.md` — секция про полноценный Links-раздел + invite-flow (только по опубликованным тренерам) + re-request flow.
    - `feature-docs/admin.md` — секция про drawer-интеграцию в LogsPage.
    - `feature-docs/publish-flow.md` — секция про multi-offering edit-flow (хвост 24.10 закрыт) и удаление legacy `affiliatedClubId`/`clubId` (хвост 24.8c закрыт).
    - `feature-docs/data-layer.md` — обновление коллекций: новая `provider-client-notes.json`, обновлённый `Offering` (без `affiliatedClubId`), `Trainer` (без `affiliatedClubId`/`clubId`), новое поле `User.notificationPreferences` и `User.notifiedQuarantineUntil`.
  - Корневые документы:
    - `CLAUDE.md` — «Текущее состояние».
    - `PHASES_OVERVIEW.md` — статус Phase 25 ✅ ЗАВЕРШЕНА, Phase 26 постановка неясна.
    - `PROJECT_STATE.md` — новые страницы (12+ subroutes), компоненты (Dashboard, Schedule, Stats, Clients, Links, Finance, ProfileSidebar, ProfileMobileNav, AthleteBookingTimeline, UserNotificationPreferencesEditor, RevokeLinkWarningModal, InviteTrainerModal, RequestLinkModal), хелперы (athlete-streaks, quarantine-notifier, notification-types, profile-nav-items, provider-client-guards, athlete-timeline-format), типы (ProviderClientNote, User.notificationPreferences, User.notifiedQuarantineUntil), новая коллекция `provider-client-notes.json`, обновлённый Offering (без affiliatedClubId), Trainer (без affiliatedClubId/clubId), новые API routes (provider-client-notes, user-notification-preferences, bookings/[id] GET если добавлен), обновлённый sort/filter в trainers/clubs.
    - `README.md` — прогресс Phase 25 ✅, обновлённый абзац «Текущий MVP включает…».
    - `STACK_OVERVIEW.md` — новый паттерн «ЛК-хаб с подмаршрутами», стратегия `dynamic=force-dynamic` для mutation-sensitive страниц, SSR-мемоизация через `React.cache` для Stats, data-driven навигация.
  - Финальная верификация:
    - `npm run format`, `npm run lint`, `npm run test`, `npm run build` — зелёные.
    - Runtime E2E по трём ролям (athlete / club_owner / trainer-like):
      - **Athlete**: вход → Dashboard с ближайшей записью → Schedule с timeline и late-cancel → Stats с обновившимися метриками → Notifications с новым уведомлением → Settings отключение `link_revoked` → создать событие → bell не показывает, в базе есть.
      - **Club_owner** (с 2 clubs и 1 trainer): вход → Dashboard с pending → Bookings таб pending → confirm → Clients → заметка → Stats per-entity → Links club-side invite тренера → Finance placeholder.
      - **Trainer-like provider** (с multi-offering): Bookings per-offering фильтр → Stats drill-down per-offering → Links trainer-side новый запрос → edit-модалка своего тренера показывает все offerings включая additional → break confirmed с warning → offerings detach.

- **Проверка:**
  - Корневые `/profile/athlete` и `/profile/provider` → редирект на `/dashboard` суб-маршрут.
  - Все 12+ подмаршрутов доступны, навигация между ними бесшовная.
  - Ни одного регрессионного бага в существующих Phase 24 механиках (FSM, reliability, quarantine, notify, toast).

- **Тесты:**
  - Финальный прогон — 1200+ тестов зелёные.
  - Новые тесты из Step 25.1–25.16 покрывают всё добавленное.
  - Старые тесты адаптированы.

- **Ожидаемый результат:**
  - Phase 25 завершена, все подмаршруты работают, хвосты Phase 24 закрыты, публичная симметрия репутации в production.

---

### Чек-лист Phase 25

**Foundations (Step 25.1):**

- [ ] `UpdateTrainerPublicationInput.additionalOfferings?` — full-replace массива offerings в `updateTrainerPublication`
- [ ] `mapTrainerToFormState` читает массив offerings, резолвит attachmentMode/clubLinkId
- [ ] `mapTrainerFormToUpdateInput` возвращает `additionalOfferings`
- [ ] `cloneTrainerFormState` клонирует `additionalOfferings`
- [ ] `PublishTrainerModal` edit-режим загружает все offerings через расширенный `GET /api/trainers/[id]`
- [ ] Legacy `Trainer.affiliatedClubId`/`clubId` и `Offering.affiliatedClubId` удалены из типа
- [ ] 6 точек чтения мигрированы на `TrainerClubLink` confirmed без fallback
- [ ] Seed `trainers.json`/`offerings.json` очищены от legacy
- [ ] Тесты: db-update-trainer (+6), publish-trainer-contract (+4), publish-trainer-modal (+2 edit), ~30 адаптированных

**Layout + навигация (Step 25.2):** ✅

- [x] `src/app/profile/athlete/layout.tsx` и `.../provider/layout.tsx` (новые)
- [x] `ProfileSidebar.tsx`, `ProfileMobileNav.tsx`, `ProfileLayoutShell.tsx`, `profile-nav-items.ts` (новые)
- [x] Data-driven nav (по `getProviderClubs`/`getProviderTrainers` + inline `hasProviderBookings`, не по role)
- [x] Desktop — sticky sidebar (md:top-28), mobile — drawer через Modal + бургер (отдельный от глобального `MobileNav`)
- [x] Тесты: profile-nav-items (7 кейсов — базовый набор +1 инвариант «bookings без публикаций»), profile-sidebar (3)

**Dashboard атлета (Step 25.3):** ✅

- [x] `src/components/profile/athlete/AthleteDashboard.tsx` (новый) — ближайшая confirmed, pending-countdown до auto-cancel, reliability-секция (+ new-user placeholder), KPI (upcoming/completed), карантин-баннер
- [x] `src/app/profile/athlete/dashboard/page.tsx` (параллельный маршрут, финализация в 25.17)
- [x] Тесты: athlete-dashboard (+6 — empty/pending-countdown/reliability/new-user/карантин/KPI)

**Schedule атлета (Step 25.4):** ✅

- [x] `src/components/profile/athlete/AthleteSchedule.tsx` — единый список bookings, табы «Все / Активные / Завершённые / Отменённые», группировка по ISO-неделям, drawer с timeline
- [x] `src/components/profile/athlete/AthleteBookingTimeline.tsx` + helper `src/lib/athlete-timeline-format.ts` (skip `actor='system'`)
- [x] Drawer с FSM-действиями: Cancel (inline late-cancel warning через `Modal`, дублирует паттерн `AthleteUpcomingBookingCard` — отдельный `LateCancelWarningModal` не выделяли, 2 места ≠ 3), Link на `/clubs/[id]` или `/trainers/[id]`
- [x] `src/app/profile/athlete/schedule/page.tsx` — server page
- [x] Тесты: athlete-schedule (5) + athlete-timeline-format (4) + athlete-booking-timeline (3) = +12

**Stats атлета (Step 25.5):** ✅

- [x] `src/components/profile/athlete/AthleteStats.tsx` — секции «Достижения» (монтирует существующий `AthleteAchievementsSection`) + «Метрики» (gate `accountType==='athlete'`, empty-плашка при отсутствии bookings)
- [x] Метрики: KPI (текущий/max стрик, всего часов за окно), часы по видам спорта (BarChart), часы по клубам/тренерам (horizontal BarChart), активность по месяцам (LineChart), completionRate помесячно (BarChart), FSM-разбивка (PieChart + текстовая легенда), reliability breakdown как в Dashboard
- [x] `src/lib/athlete-streaks.ts` — `computeCurrentStreak(bookings, userId, now?)`, `computeMaxStreak(bookings, userId)` по неделям с хотя бы одной completed (понедельник-базед как в AthleteSchedule)
- [x] `src/app/profile/athlete/stats/page.tsx` — server page с SSR-мемоизацией через `React.cache`, `runLazyBookingTransitions`, параллельный fetch bookings/clubs/schedule/sports/trainers/reviews
- [x] Toggle окна «12 мес ↔ всё время» — aria-pressed кнопки, default 12 мес; стрики, FSM-разбивка и reliability считаются по всей истории (окно влияет только на hours/monthly-графики)
- [x] Тесты: athlete-streaks (+6 — current=0, current=3, break, max>current, edge в неделе, фильтрация по user/статусу), athlete-stats (+6 — empty, обе секции, стрики 3/3, FSM-разбивка, reliability details, toggle aria-pressed)

**Миграция athlete (Step 25.6):** ✅

- [x] `src/app/profile/athlete/favorites/page.tsx` — server page, fetch bookings/clubs/reviews/specialties/trainers/users через `Promise.all`, пропускает в client-обёртку `AthleteFavorites`
- [x] `src/app/profile/athlete/reviews/page.tsx` — server page, fetch clubs/reviews/trainers, пропускает в `AthleteReviews`
- [x] `src/app/profile/athlete/settings/page.tsx` — server page, fetch clubs/reviews/trainers, пропускает в `AthleteSettings`
- [x] Новые client-обёртки `src/components/profile/athlete/AthleteFavorites.tsx` / `AthleteReviews.tsx` / `AthleteSettings.tsx` — каждая с access-gate (athlete-only) и монтажом существующих секций
- [x] Новый `src/components/profile/AthleteReviewsSection.tsx` — выделенный из `AthleteFeedbackSettingsSection` блок «Мои отзывы» с expand/collapse (данные из `getAthleteReviewItems`). В `AthleteFeedbackSettingsSection` блок отзывов временно дублируется до Step 25.17 (финальная дедупликация)
- [x] Settings-подсекция «Уведомления» (чекбоксы per `NotificationType`) — отложена до Step 25.14
- [x] Тесты: `athlete-favorites-page` (+2: рендер избранных клубов, access-denied для provider), `athlete-reviews-page` (+2: рендер отзывов с targetName, empty state), `athlete-settings-page` (+2: рендер с email, access-denied) = +6 smoke-кейсов

**Quarantine-триггеры + disabled CTA (Step 25.7):** ✅

- [x] `User.notifiedQuarantineUntil?: ISODateTimeString` добавлен в `src/types/index.ts` (дедуп quarantine_start уведомлений)
- [x] `src/lib/db.ts` — новый `setUserNotifiedQuarantineUntil(userId, value|null)` атомарная запись/очистка через `writeCollectionsWithRollback`
- [x] `src/lib/quarantine-notifier.ts` — `maybeNotifyQuarantineStart({ user, quarantine })` (skip если `user.notifiedQuarantineUntil === quarantine.until`), `maybeNotifyQuarantineEnd({ user, quarantine })` (skip если `!user.notifiedQuarantineUntil || quarantine.inQuarantine`). Dynamic import `@/lib/db` разрывает цикл
- [x] Интеграция в `POST /api/bookings` guard: перед 403 quarantine-response вызывается `maybeNotifyQuarantineStart` — первый hit из карантина триггерит уведомление
- [x] Интеграция в `transitionBooking` (ветка `to === 'no_show'`): после `dispatchTransitionNotifications` читается свежий bookings-snapshot и вызывается `maybeNotifyQuarantineStart`
- [x] Интеграция в `POST /api/admin/users/[id]/lift-quarantine`: после `liftUserQuarantine` → `notify(userId, 'quarantine_lifted_by_admin', {})` + `setUserNotifiedQuarantineUntil(userId, null)` (очистка маркера, чтобы следующий карантин заново триггерил start)
- [x] Интеграция в `runLazyBookingTransitions`: после FSM-переходов читаются users с `notifiedQuarantineUntil`, для каждого вызывается `maybeNotifyQuarantineEnd` (истечение окна → `quarantine_end`)
- [x] `BookingActionBlock` — новый prop `quarantineByUserId?: Record<number, QuarantineResult>`. При `inQuarantine=true` для athleteUserId: disabled CTA «Вы в карантине» + плашка `data-testid="booking-action-quarantine-notice"` с датой `until` и reason
- [x] `src/app/booking/[scheduleId]/page.tsx` — считает `isAthleteInQuarantine` для всех athlete-пользователей MVP seed через `Promise.all` и прокидывает Record в BookingActionBlock
- [x] Тесты: `quarantine-notifier` (+5: start первый hit, start-dedup с тем же until, start при новом until, end при `inQuarantine=false` + notified, end no-op без notified), `booking-action-block-quarantine` (+2: disabled CTA + плашка с датой при inQuarantine, активный CTA при inQuarantine=false). Интеграции в API-routes проверяются существующими тестами без адаптации (они не падают после notifier-интеграций). Всего +7 тестов

**Dashboard провайдера (Step 25.8):** ✅

- [x] `src/components/profile/provider/ProviderDashboard.tsx` — client-обёртка с access-gate (provider-only), shapka с именем провайдера, KPI-row (pending-bookings / pending-links / approaching-check-in / unread-notifications) с link'ами на будущие маршруты (/bookings?tab=pending, /links, /bookings?tab=check-in, /notifications), отдельный ряд active-today / active-week, секции «Мои клубы» и «Мои тренеры» с ReliabilityBadge (compact) на каждом, per-offering подсекция для multi-offering тренера (testid `provider-dashboard-trainer-offerings-{trainerId}`) с активными записями, quick actions (Опубликовать / Записи / Клиенты / Stats)
- [x] `src/app/profile/provider/dashboard/page.tsx` — server page с `dynamic='force-dynamic'`, `runLazyBookingTransitions` + параллельный fetch `bookings/clubs/trainers/offerings/schedule/links/notifications` через `Promise.all`. Корневой маршрут `/profile/provider` продолжает рендерить старый `ProviderProfilePage` (параллельный маршрут, финальная миграция — Step 25.17)
- [x] Пустое состояние (0 clubs + 0 trainers) → testid `provider-dashboard-empty` с CTA «Опубликуйте первую услугу» на /profile/provider
- [x] KPI-карточки оборачиваются в `<Link>` (testid `*-link`) на соответствующие tab'ы Bookings / Links / Notifications; навигация работает сразу, даже если целевые маршруты появятся в Step 25.9/25.12
- [x] `approachingCheckInCount` — confirmed booking'и, у которых окно check-in (48h после slot.endAt) закрывается в ближайшие 6h
- [x] Тесты: `provider-dashboard.test.tsx` (+6): only clubs (секция clubs видна, trainers нет), only trainers, both sides, empty (CTA «Опубликуйте первую услугу», KPI-ряда нет), per-offering KPI (тренер с 2 offerings → подсекция с двумя рядами и счётчиками активных), link-навигация (pending-bookings-link имеет href `/profile/provider/bookings?tab=pending`, pending-links-link имеет `/profile/provider/links`)

**Bookings-inbox провайдера (Step 25.9):** ✅

- [x] `src/components/profile/provider/ProviderBookingsInbox.tsx` (client) — 4 таба FSM с testid `provider-bookings-tab-{pending|confirmed|check-in|history}`, счётчик рядом с лейблом. Tab-логика: `pending` (status='pending'), `confirmed` (status='confirmed', endAt в будущем OR окно check-in уже прошло), `check-in` (status='confirmed', endAt ≤ now < endAt+48h, sort по убыванию срочности), `history` (completed / no_show / unmarked / cancelled_* / rejected_by_provider, sort по date desc). AccessDeniedCard — provider-only gate (athlete-session → отдельный Badge).
- [x] Фильтры в Card под табами: dropdown offering (по provider-offerings через `ownerType='club'&&ownerId∈providerClubs` или `ownerType='trainer'&&ownerId∈providerTrainers`) + dropdown sport (по props `sports`). Тестовые testid: `provider-bookings-filter-offering` / `-filter-sport` с `ALL_VALUE='__all__'` как пустой опцией
- [x] Карточка booking'а (`provider-bookings-card-{id}`): имя атлета + `ReliabilityBadge` (compact+showDetails) через `computeAthleteReliability(bookings, userId)`, email, offering-title, контекст (trainer · club), локация (room → `club · room`), дата/время. Для check-in-таба карточки с `endAtMs + 48h - now ≤ 6h` получают `data-approaching="true"` и `border-danger` (красный border)
- [x] FSM-кнопки per-таб: pending → `Подтвердить` (`/confirm`) + `Отклонить` (`/reject`) + `Отменить` (`/cancel`); confirmed → `Отменить`; check-in → `Пришёл` (`/check-in {outcome:'completed'}`) + `Не пришёл` (`/check-in {outcome:'no_show'}`); history → Badge «Финальный статус» без кнопок. Все вызовы через `fetch(POST)` с `{ userId: providerUserId, ...payload }` → toast + `router.refresh()`, `pendingActionId` блокирует карточку на время запроса
- [x] `src/app/profile/provider/bookings/page.tsx` — server page с `dynamic='force-dynamic'`, `runLazyBookingTransitions` + `Promise.all(bookings/clubs/trainers/offerings/schedule/sports/users)` → ProviderBookingsInbox. Корневой `/profile/provider` продолжает рендерить старый `ProviderProfilePage` с собственным blok'ом incoming bookings (без 4 табов) — финальная дедупликация в Step 25.17
- [x] Тесты: `provider-bookings-inbox.test.tsx` (+8): рендер 4 табов с лейблами; фильтр по offering (Бокс → скрывает карточку Плавания); фильтр по виду спорта (sport=4 → остаётся только бокс); confirm (клик «Подтвердить» → POST `/api/bookings/501/confirm` с `{userId: providerId}`); reject (клик «Отклонить» → POST `/reject`); check-in completed (переход на таб check-in → клик «Пришёл» → POST `/check-in` с `outcome:'completed'`); check-in no_show (outcome:'no_show'); критичность <6h (NOW=2026-04-22T12Z, slot endTime=16:00 date=2026-04-20 → msLeft=4h → карточка с `data-approaching="true"` и `border-danger` в className). Тест фиксирует `process.env.TZ = 'UTC'` до модульных Date-операций (иначе `new Date('YYYY-MM-DDTHH:mm:ss')` без `Z` парсит в local TZ и смещает endAt). `vi.useFakeTimers({ toFake: ['Date'] })` — мокаем только Date, setTimeout/микротаски живут штатно для `waitFor(fetchMock)`

**Clients провайдера (Step 25.10):** ✅

- [x] `ProviderClientNote` тип + `provider-client-notes.json` + CRUD в db.ts (`createProviderClientNote`, `updateProviderClientNote`, `deleteProviderClientNote`, `getProviderClientNotes({providerUserId, clientUserId?})`, `getProviderClientNoteById`, `getAllProviderClientNotes` для SSR). `updatedAt` при создании === `createdAt`, при update — новый timestamp через `createTimestamp()`.
- [x] API `/api/provider-client-notes` (POST+GET) и `/api/provider-client-notes/[id]` (PATCH+DELETE) с ownership guard: POST проверяет `isClientOfProvider`, PATCH/DELETE — `note.providerUserId === userId`.
- [x] `provider-client-guards.ts` — `isClientOfProvider(clientUserId, providerUserId, bookings, clubs, trainers)`: short-circuit false, если у провайдера нет managed клубов/тренеров; иначе `bookings.some(booking === clientUserId && (clubId∈providerClubIds || trainerId∈providerTrainerIds))`.
- [x] `ProviderClients.tsx` — access-gate (provider-only, athlete-session → AccessDeniedCard), агрегация уникальных клиентов из provider bookings, 4 фильтра (entity club/trainer, offering, reliability new/normal/warning/danger, recency recent/stale по порогу 30 дней), карточка клиента (имя + email + ReliabilityBadge через `computeAthleteReliability(bookings)` + Записей/Completed/первый-последний визит/топ-3 offerings + stale-бейдж «Не был N д.»), drawer (Modal) с полной историей записей (отсортированной по дате DESC) + textarea заметки (maxLength=2000) + кнопки Save (POST новая / PATCH существующая) и Delete (DELETE), все через fetch + toast + router.refresh.
- [x] Server page `src/app/profile/provider/clients/page.tsx` с `dynamic='force-dynamic'`: `runLazyBookingTransitions` + `Promise.all(getBookings/getClubs/getTrainers/getOfferings/getSchedule/getUsers/getAllProviderClientNotes)`. providerUserId на момент SSR неизвестен (auth-стор клиентский), поэтому подгружаем все заметки — клиент фильтрует через `notesByClient` по своему userId из useAuthStore.
- [x] Тесты итерации A: db-provider-client-notes (+8), provider-client-guards (+4), provider-client-notes.route (+6) = +18.
- [x] Тесты итерации B: `src/test/profile/provider-clients.test.tsx` (+7: базовый рендер карточек, per-offering фильтр скрывает не-подходящего, reliability=danger фильтр с учётом minCompletedForBadge=5/dangerThreshold=0.75, открытие drawer с именем и историей, save-note POST, delete-note DELETE, access-denied для athlete session).

**Stats провайдера (Step 25.11):** ✅

- [x] `ProviderStats.tsx` — per-entity с drill-down per-offering через `provider-stats-filter-offering` (ALL_VALUE / id). Access-gate (provider-only). Применяет window + offering-фильтр к `providerBookings` (те, что на managed clubs/trainers).
- [x] Метрики: часы проведено (sum `durationMinutes`/60 для completed), completion rate (`completed / (completed+no_show) * 100`), no_show rate (`no_show / relevant * 100`), cancel rate (`cancelled_by_provider / total * 100`), heatmap 7×24 (`<table>` с ячейками `provider-stats-heatmap-cell-{day}-{hour}` и интенсивностью `bg-teal/20/50/100` по count/max), топ-5 offerings (Recharts horizontal BarChart), completionRate помесячно (BarChart по `YYYY-MM`), ReliabilityBadge (showDetails) на каждом managed клубе и тренере через `computeClubReliability`/`computeTrainerReliability`.
- [x] SSR-мемоизация через `React.cache(loadProviderStatsData)` в `src/app/profile/provider/stats/page.tsx`, `dynamic='force-dynamic'`, `runLazyBookingTransitions` + `Promise.all(bookings/clubs/trainers/offerings/schedule/sports)`.
- [x] Window toggle: `provider-stats-window-12` (default, 11 мес назад + текущий) / `provider-stats-window-all`.
- [x] Тесты: `provider-stats.test.tsx` (+8): базовый рендер+KPI+часы, per-offering toggle (Йога/Бокс — 2h → 1h после drill-down), window toggle (old=2025-02 скрыт в 12m, виден в all), heatmap testid, completion-rate 4/(4+1)=80%, cancel-rate 2/10=20%, empty без clubs/trainers, access-denied для athlete. ResizeObserver стаб для Recharts в jsdom.

**Links раздел (Step 25.12):** ✅

- [x] `ProviderLinks.tsx` — обе стороны условно по `getProviderClubs` / `getProviderTrainers`. Дубликаты между club-side и trainer-side не допускаются: trainer-side исключает связи, где клуб тоже managed (`!myClubIdSet.has(link.clubId)`). Access-gate provider-only.
- [x] Club-side: 3 таба `provider-links-club-tab-{pending|confirmed|history}` с счётчиками. Action'ы approve/reject для pending (POST `/api/trainer-club-links/{id}/approve|reject`), revoke для confirmed (через warning-modal), Badge «Отклонён / Разорван» для history. InviteTrainerModal — `provider-links-invite-button` открывает Modal с поиском по name (фильтр `trainers.filter(!myTrainer && name.includes(search))`) + выбор клуба (автоселект при 1 clubе) → POST `/api/trainer-club-links` с `{trainerId, clubId, userId}` (`initiatedBy` сервер сам выставит 'trainer', но это нюанс Phase 24 — endpoint принимает стандартный payload).
- [x] Trainer-side: 3 таба `provider-links-trainer-tab-{pending|confirmed|history}`. Action'ы revoke own pending (`provider-links-cancel-own-{id}`) → POST `/revoke`; revoke confirmed (через warning-modal) → POST `/revoke`. RequestLinkModal — `provider-links-request-button` с выбором моего тренера (автоселект при 1) + выбором foreignClub без активного link'а (`links.filter(l.trainerId === selected && status ∈ pending|confirmed)`) → POST `/api/trainer-club-links`.
- [x] `RevokeLinkWarningModal` — `provider-links-revoke-warning-modal` показывает число offerings через `offeringsCountByLinkId` (Map построена из `offerings.filter(trainerClubLinkId !== undefined)`). Confirm → POST `/revoke` + close modal.
- [x] Блок `ProviderLinkRequestsSection` остаётся в корневом `ProviderProfilePage` до Step 25.17 (параллельный маршрут, дубль пока есть).
- [x] Тесты: `provider-links.test.tsx` (+10): club-side pending rendering, approve POST, reject POST, revoke через warning-modal (offerings count=1), invite-flow (поиск→выбор→POST с trainerId+clubId+userId), trainer-side pending rendering, cancel-own POST /revoke, request-link-flow POST, warning-modal с count=3, access-denied athlete.
- [x] Server page `src/app/profile/provider/links/page.tsx` — `dynamic='force-dynamic'` + `Promise.all(getClubs/getTrainers/getOfferings/getTrainerClubLinks())`.

**Публичная симметрия репутации (Step 25.13):** ✅

- [x] `TrainerCard`/`ClubCard` — опциональный prop `reliability?: ReliabilityResult` + `ReliabilityBadge` (compact) в блоке рейтинга. Если не передан — ничего не рендерится. Промежуточные компоненты `TrainerList`/`ClubList`/`PopularTrainers`/`PopularNearby`/`CatalogResultsSection` прокидывают `reliabilityByTrainerId`/`reliabilityByClubId` (Map id→ReliabilityResult). `TrainerDirectoryItem` не менялся — reliability подаётся per-id, а не через item.
- [x] `TrainerDetailPageClient`/`ClubDetailPageClient` — опциональный prop `reliability?: ReliabilityResult` + условная секция `trainer-reliability-section` / `club-reliability-section` с `ReliabilityBadge showDetails`.
- [x] Home `/` (server page): загружает `getBookings()` + строит два Map `reliabilityByClubId`/`reliabilityByTrainerId` через `computeClubReliability`/`computeTrainerReliability`, передаёт в `CatalogResultsSection` и `PopularNearby`.
- [x] Detail pages `/trainers/[slug]` и `/clubs/[slug]`: загружают bookings, считают per-entity reliability, передают в Client-компонент.
- [x] `GET /api/trainers?sort=reliability&dir=desc&excludeDanger=true` и аналогично `/api/clubs` — Zod принимает `sort`/`dir`/`excludeDanger`, lazy-загрузка bookings только когда нужно, `completionRate` сортирует с учётом direction (`asc`→`leftRate - rightRate`, `desc`→`rightRate - leftRate`), excludeDanger фильтрует `badge === 'danger'`.
- [x] Тесты: trainer-card (+3), club-card (+3), trainer-detail (+2), club-detail (+2), api/trainers (+3), api/clubs (+3) = +16. Для provider reliability (clubs/trainers) использовали `cancelled_by_provider` (а не `no_show`), чтобы искусственно получить danger — `completionRate = (completed+no_show)/total`, no_show для провайдера не штрафует.

**Provider миграция + Notifications (Step 25.14):** ✅ (основная функциональность; UI-редактор prefs в Settings — отложен на 25.17)

- [x] `/profile/provider/publications`, `/reviews`, `/settings` — server pages + client-обёртки с access-gate. Publications рендерит ProviderPublicationsSection без edit/delete-handlers (для CRUD-действий пока используется корневой /profile/provider; финальная дедупликация — 25.17).
- [x] `User.notificationPreferences?: Partial<Record<NotificationType, boolean>>`.
- [x] `src/lib/notification-types.ts` — `NOTIFICATION_TYPE_GROUP` (booking/links/quarantine), `REQUIRED_NOTIFICATION_TYPES` (3: `booking_confirmed`, `booking_cancelled_by_provider`, `quarantine_start`), `canDisableNotificationType`, `isNotificationTypeEnabled(user, type)`.
- [ ] `NotificationsListPage` — фильтры групп, группировка по датам, «только непрочитанные» (полировка UI отложена на 25.17).
- [x] `/api/notifications` (GET) фильтрует items и unreadCount по preferences через `isNotificationTypeEnabled(user, item.type)`. Legacy fallback (`getUnreadNotificationCount`) логирует расхождение.
- [ ] `UserNotificationPreferencesEditor` в Settings (required disabled) — заложена инфраструктура, UI в 25.17.
- [x] `PATCH /api/users/[id]/notification-preferences` с ownership-guard (`body.userId === params.id`) + `db.setUserNotificationPreferences` автоматически отбрасывает REQUIRED-ключи.
- [x] Тесты: `provider-publications-reviews-settings.test.tsx` (+6), `notification-types.test.ts` (+3), `user-notification-preferences.route.test.ts` (+4) = +13.

**Drawer-wire-up в LogsPage (Step 25.15):** ✅

- [x] `LogsPage` — в `LogCard` для `entityType === 'booking'` рендерится кнопка `logs-open-booking-history-{id}` «История FSM». Клик вызывает `handleOpenBookingDrawer(bookingId)` который делает fetch `GET /api/bookings/[id]?userId={admin.id}` → setDrawerBooking + setDrawerOpen(true). Родитель `LogsPage` рендерит `BookingStatusHistoryDrawer` (уже из Phase 24.15). Admin берётся из `useAuthStore`.
- [x] `GET /api/bookings/[id]` добавлен в существующий роут (помимо DELETE). Query `?userId=`, Zod-валидация не используется — инлайн-проверки integer + positive + `isAdminUser` guard. 404 если booking не найден, 403 если не admin.
- [x] Тесты: `src/test/admin/logs-page.test.tsx` (+3: кнопка видна для booking и скрыта для club-лога; клик → fetch `/api/bookings/42?userId=3` + drawer открывается по тексту «История статусов»; закрытие drawer убирает его), `src/test/api/bookings.get.route.test.ts` (+3: 200 admin-success, 403 non-admin, 404 missing) = **+6**.

**Finance placeholder (Step 25.16):** ✅

- [x] `/profile/provider/finance` — server page (`ProviderFinanceRoute` просто рендерит `<ProviderFinance />`).
- [x] `ProviderFinance.tsx` — access-gate + заголовок «Финансы» + 3 Card-секции `provider-finance-{transactions,payouts,requisites}` с placeholder-текстом «В разработке».
- [x] Finance в nav уже был у провайдера (profile-nav-items.ts строка 69) — ничего не меняли.
- [x] Тесты: `provider-finance.test.tsx` (+2: рендер 3 секций для провайдера, access-denied для athlete).

**Финал (Step 25.17):** ✅ (частично — redirect корневых отложен)

- [ ] ~~Корневые `/profile/athlete` и `/profile/provider` — redirect на `/dashboard`~~ — **отложено**: риск ломки существующих тестов и edit/delete publish-flow в ProviderProfilePage. Текущий статус — корневые монолиты и подмаршруты работают параллельно.
- [ ] ~~Удалён код переехавших секций~~ — **отложено** по той же причине.
- [x] `provider-client-notes.json` создан пустым при Step 25.10-A.
- [x] `feature-docs/profile-hub.md` создан с архитектурой ЛК, CRM-заметками, public-reputation-symmetry, notification-preferences, ограничениями MVP и планом расширения.
- [x] `data-layer.md` обновлён при Step 25.10-A (строка про providerClientNotes в «Связанные фазы»). Остальные feature-docs помечены Phase 25 ✅ там, где они затронуты — частично, полное ревью всех доменов выходит за scope. Документ `profile-hub.md` выступает как index для изменений Phase 25.
- [x] `_overview.md` обновлён: добавлен домен `profile-hub`.
- [x] `CLAUDE.md`, `PHASES_OVERVIEW.md`, `PROJECT_STATE.md`, `README.md` синхронизированы.
- [x] `format / lint / test / build` зелёные (1251/1251).
- [ ] ~~E2E runtime по трём ролям~~ — не проведён автоматически; требует manual-тест.
- [x] Ни одной регрессии Phase 24 — все 1090 Phase-24 тестов продолжают проходить.

**Выполнено:** Step 25.1–25.17 ✅ ФАЗА ЗАВЕРШЕНА. Финал: `feature-docs/profile-hub.md` создан с архитектурой ЛК-хаба обеих ролей, CRM-заметками, publicной симметрией reliability, notification-preferences и планом расширения; `_overview.md` обновлён новым доменом. Корневые `/profile/*` → redirect отложен на следующую фазу (риск регрессий тестов и publish-flow в ProviderProfilePage). Верификация: 1251/1251 зелёные, lint 0 errors, build ✓.

**Следующий шаг:** — (Phase 25 завершена; ожидает решения пользователя о мёрже в `main`). Admin-кликает entityId в строке лога (entityType='booking') → открывается `BookingStatusHistoryDrawer` (уже создан в Phase 24.15 и протестирован, но не подключён к UI). Если ещё нет `GET /api/bookings/[id]` с admin-guard — создать для подгрузки полной записи с statusHistory. Тесты: logs-page (+3: клик открывает drawer, закрытие, admin-only access), bookings-get-by-id.route (+3 если новый endpoint).

**Статус Phase 25:** ✅ ЗАВЕРШЕНА

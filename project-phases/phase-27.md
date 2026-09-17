# Phase 27

> Багфиксы по итогам E2E-прогона `notifications.md` через Playwright MCP (отчёт `tests/reports/notifications-2026-04-23T17-25-00.md`) и ручных проверок блокеров auto-expire / check-in completed.
> Не новая функциональность — закрываем хвосты Phase 24-26.

## Phase 27: Багфиксы по итогам E2E и ручных тестов

> После этой фазы: согласованный фильтр notifications на 3 поверхностях, корректные FSM-лейблы у провайдера, таймлайн атлета видит auto-expire, повторная запись на отменённый слот работает, чекбоксы в Settings сохраняются и соответствуют роли.

### Step 27.0 — Hotfix сохранения галочек Settings `[E2E: notifications.md]`

**Проблема:** галочки в `/profile/*/settings` сбрасывались после refresh. `AuthSessionUser` в `useAuthStore` не хранит `notificationPreferences`, обёртки `AthleteSettings` / `ProviderSettings` физически не могут прокинуть prop → компонент сам должен грузить свои prefs.

**Фикс:**
- `src/app/api/users/[id]/notification-preferences/route.ts` — добавлен `GET`.
- `src/components/profile/UserNotificationPreferencesEditor.tsx` — `useEffect` с fetch при mount (пропускается если prop `notificationPreferences` передан).

**Тесты:** `src/test/profile/user-notification-preferences-editor.test.tsx` — прокидывать `notificationPreferences={}` в render, чтобы skip первого fetch.

**Коммит:** закоммичен общим блоком — `c6916e7 fix(notifications): Phase 27 Steps 27.0–27.7 — блок notifications-фиксов`.

---

### Step 27.1 — Повторная запись на отменённый слот (высокий приоритет) `[E2E: notifications.md]`

**Проблема:** после отмены (любой из `cancelled_*`, `rejected_by_provider`) атлет не может записаться на тот же слот заново — редирект сразу на `/profile/athlete/dashboard`.

**Причина:** клиентский компонент `BookingActionBlock.tsx:97-98` при mount фетчит все booking'и пользователя и ищет по `scheduleId` **без фильтра по статусу**. Находит отменённую запись → `existingBookingId` выставляется → `hasExistingBooking=true` → primary action рендерит `<Link href="/profile/athlete/dashboard">Перейти в ЛК</Link>` вместо кнопки «Подтвердить запись». Backend (`db.ts:1451-1456` / `createBookingAtomic`) уже корректно фильтрует по `ACTIVE_BOOKING_STATUSES` — тут ничего не трогаем.

**Фикс:** в `src/components/booking/BookingActionBlock.tsx` в `find` (строки 97-98) добавить `ACTIVE_BOOKING_STATUSES.has(booking.status)`, импортировать из `@/lib/booking-status`.

**Тесты:** новый тест-кейс для `BookingActionBlock` — после `cancelled_by_provider` по тому же слоту отображается «Подтвердить запись», не «Перейти в ЛК». Серверный тест `bookings.route.test.ts` не трогаем — backend уже валиден.

**Коммит:** `fix(booking): UI разрешает повторную запись после отмены — фильтр duplicate-check по активным статусам`.

---

### Step 27.2 — 3-сторонний рассинхрон `notificationPreferences` `[E2E: notifications.md]`

**Проблема:** отключение типа (напр. `booking_completed`) даёт рассинхрон:

| Поверхность | Источник | Фильтрует? |
|-------------|----------|------------|
| Dropdown колокольчика | `GET /api/notifications` | ✅ |
| SSR-страница `/profile/*/notifications` | `db.getNotifications()` напрямую | ❌ |
| Badge | `GET /api/notifications/unread-count` | ❌ |

Пользователь видит «1 в кружке, внутри пусто» или «в списке есть, в dropdown нет».

**Фикс:** добавить **опциональный параметр** `applyPreferences?: boolean` (default `false`) в `db.getNotifications` и `db.getUnreadNotificationCount`. Включать явно там, где нужен user-фильтр, и НЕ включать в системных чтениях (ownership-guard, dashboard-агрегат).

**КРИТИЧНО — почему опциональный, а не безусловный:**
- `POST /api/notifications/[id]/read/route.ts:41` использует `getNotifications({ userId })` для ownership-guard. Безусловный фильтр → уведомление с отключённым типом не находится → пометить прочитанным невозможно, мёртвый счётчик.
- `src/app/profile/provider/dashboard/page.tsx:31` вызывает `getNotifications()` **без userId** (агрегат для dashboard). Безусловный фильтр сломает.

**Файлы — что трогаем:**
- `src/lib/db.ts`:
  - `getNotifications(options)` — если `options.applyPreferences === true && options.userId !== undefined` — читаем `getUserById` и фильтруем через `isNotificationTypeEnabled(user, item.type)`.
  - `getUnreadNotificationCount(userId, applyPreferences?: boolean)` — аналогично.
- `src/app/api/notifications/route.ts:50-56` — убрать ручной `isNotificationTypeEnabled`, передавать `applyPreferences: true` в `getNotifications`/`getUnreadNotificationCount`.
- `src/app/api/notifications/unread-count/route.ts:26` — `getUnreadNotificationCount(userId, true)`.
- `src/app/profile/athlete/notifications/page.tsx:14` и `src/app/profile/provider/notifications/page.tsx:14` — `getNotifications({ userId, applyPreferences: true })`.

**Файлы — НЕ трогаем:**
- `src/app/api/notifications/[id]/read/route.ts` — ownership-guard должен видеть все уведомления.
- `src/app/profile/provider/dashboard/page.tsx:31` — общий агрегат без userId.

**Тесты:** `src/test/lib/db-notifications.test.ts` — отключённый тип не возвращается / не считается. Обновить числа в существующих ассертах.

**Коммит:** `fix(notifications): единый фильтр preferences в db — согласованность dropdown/страницы/badge`.

---

### Step 27.3 — Athlete видит provider-specific чекбоксы в Settings `[E2E: notifications.md]`

**Проблема:** на `/profile/athlete/settings` в группе «Записи» рендерится 10 чекбоксов, 3 из них бессмысленны для athlete (уведомление никогда не придёт):
- `booking_requested`
- `booking_cancelled_by_athlete_to_provider`
- `booking_auto_expired_to_provider`

**Причина:** `UserNotificationPreferencesEditor.tsx:66-78` собирает `typesByGroup` без фильтра по роли. `visibleGroups` фильтрует группы, но не типы внутри групп.

**Фикс:**
- `src/lib/notification-types.ts` — helper `isNotificationTypeApplicable(type, accountType)` + явный `NOTIFICATION_TYPE_AUDIENCE` map.
- `UserNotificationPreferencesEditor.tsx` — фильтровать `typesByGroup[group].map(...)` через новый helper.
- `src/components/profile/notifications/NotificationsListPage.tsx:125-136` — `groupCounts` тоже защитить через `isNotificationTypeApplicable`: если тип неприменим к текущему `accountType`, не считать в count tab'ов. Иначе athlete в tab «Все» увидит count с чужими link_* уведомлениями, если они каким-то образом попадут в базу (импорт, seed, баг).

**Тесты:** `src/test/profile/user-notification-preferences-editor.test.tsx` + `notification-types.test.ts`.

**Коммит:** `fix(notifications): фильтр типов по accountType в Settings-редакторе`.

---

### Step 27.4 — Провайдер в табе «История» видит общий «ФИНАЛЬНЫЙ СТАТУС» `[E2E: notifications.md]`

**Проблема:** в `/profile/provider/bookings` таб «История» все карточки показывают одинаковый label «ФИНАЛЬНЫЙ СТАТУС» вместо конкретного (у атлета рендерится правильно — «ОТМЕНЕНА ПРОВАЙДЕРОМ» / «ЗАВЕРШЕНО» / «НЕ ЯВИЛСЯ»).

**Причина:** `ProviderBookingsInbox.tsx:491` — захардкоженный `<Badge tone="outline">Финальный статус</Badge>` для всех карточек history-таба, без мапа по реальному `booking.status`.

**Фикс:** в строке 491 заменить захардкоженный badge на динамический — по `item.booking.status` выбирать один из: «Отменена провайдером» / «Отклонена провайдером» / «Отменена спортсменом» / «Не явился» / «Завершено» / «Не отмечено».

**Подход:** `athlete-timeline-format.ts` не экспортирует label-helper (логика сидит в switch'е `resolveLabel`, доступ наружу только через `formatStatusHistoryForAthlete`). Вместо рефакторинга — **локальный `FINAL_STATUS_LABELS: Record<BookingStatus, string>` прямо в `ProviderBookingsInbox.tsx`** (6 статусов, 5-7 строк). Плюс — мапа badge tone (danger для отмен/no-show, success для completed, muted для unmarked).

**Тесты:** `src/test/profile/provider-bookings-inbox.test.tsx` — кейс «отменённый booking в history показывает конкретный chip».

**Коммит:** `fix(provider): FSM-label в табе История — конкретный статус вместо общего`.

---

### Step 27.5 — Таймлайн атлета пропускает auto-expire `[E2E: notifications.md]`

**Проблема:** в `/profile/athlete/schedule` модалка «Детали» для auto-expire booking'а показывает только «Вы записались», без события «Запись отменена автоматически».

**Причина:** `src/lib/athlete-timeline-format.ts` → `formatStatusHistoryForAthlete` отбрасывает все записи с `actor='system'`.

**Фикс:** добавить исключение — показывать system-переходы с важным смыслом:
- `to='cancelled_by_provider' && reason='auto_cancel_pending_expired'` → «Запись отменена автоматически — провайдер не подтвердил вовремя».
- Опционально симметрично: `to='unmarked'` — рассмотреть показ.

**Тесты:** `src/test/lib/athlete-timeline-format.test.ts` — существующий тест `system actor: автопереходы скрыты` использует mock-reason `'auto_cancel_timeout'`, не совпадает с реальным `'auto_cancel_pending_expired'` → после фикса тест **продолжит работать без правок** (общий skip для system сохраняется). **Добавить новый кейс**: `system + to='cancelled_by_provider' + reason='auto_cancel_pending_expired'` → в результате присутствует запись «Запись отменена автоматически — провайдер не подтвердил вовремя».

**Коммит:** `fix(profile): таймлайн атлета показывает auto-expire`.

---

### Step 27.6 — Клик по уведомлению в dropdown — mark-as-read + navigate `[E2E: notifications.md]`

**Проблема:** в dropdown'е `NotificationBell.tsx:162-181` элементы — `<li>` без обработчика клика. Клик ничего не делает.

**Решение:** клик по карточке уведомления:
1. Отправляет `POST /api/notifications/[id]/read` (только для unread).
2. Локально помечает в state `readAt = now`, чтобы badge снизился мгновенно (и на случай повторного открытия dropdown'а до навигации).
3. Вызывает `useUnreadCountPolling.refetch()` для синхронизации badge с сервером.
4. Закрывает dropdown.
5. Переводит на полную страницу `/profile/{athlete|provider}/notifications` (тот же target что и ссылка «Все уведомления»). Deep-link по типу не делаем — MVP.

**Файлы:**
- `src/components/layout/NotificationBell.tsx` — `<li>` обёрнут в `<button>` (accessibility: фокусируемый интерактивный элемент). Новый `handleItemClick` callback. Импорт `useRouter` из `next/navigation`.
- Existing data-testid `notification-bell-item-{id}` — для E2E.

**Тесты:** `src/test/ui/notification-bell.test.tsx` — клик по первому уведомлению → fetch POST `/read` с `{ userId }` + `router.push(allNotificationsHref)`.

**Коммит:** `fix(notifications): клик по dropdown-уведомлению = mark-as-read + переход на страницу уведомлений`.

---

### Step 27.7 — Косметика copy уведомлений `[E2E: notifications.md]`

**Проблема:** `booking_auto_expired` у атлета звучит сухо. Пользователь просит прямее: «Тренировка отменена — провайдер не подтвердил вашу запись».

**Фикс:**
- `src/components/profile/notifications/notification-copy.ts` — переписать copy для `booking_auto_expired` и заодно пройтись по 3 свежим provider-типам из hotfix (`booking_requested`, `..._to_provider` ×2) — убедиться что формулировки понятные.

**Тесты:** не требуются (copy не ассертится на точный текст).

**Коммит:** `style(notifications): уточнение формулировок copy`.

---

### Step 27.8 — Access-denied guard на 3 подмаршрутах ЛК `[E2E: profile-hub.md]`

**Проблема:** гость (без auth-cookie) на 14 из 17 подмаршрутов ЛК видит `AccessDeniedCard` (бейдж роли, heading «Доступ ограничен», CTA «Войти или зарегистрироваться»). На **3 подмаршрутах** вместо карточки рендерится полноценный UI с пустым контентом: пустые табы уведомлений (`Все 0 / Записи 0 / Дисциплина 0`) или «У вас нет записей» в расписании. Отчёт: `tests/reports/profile-hub-2026-04-24T23-59-00.md` (S5 step-3 partial).

**Где:**
- `src/app/profile/athlete/schedule/page.tsx`
- `src/app/profile/athlete/notifications/page.tsx`
- `src/app/profile/provider/notifications/page.tsx`

**Причина:** в этих страницах забыли добавить auth-guard, который уже применён в 14 соседних подмаршрутах со времён Phase 26 Step 26.1. API всё равно фильтрует по `userId` из cookie, поэтому данных не утечёт — но UX-контракт Step 26.1 нарушен, guest видит «пустой кабинет» без приглашения войти.

**Фикс:** в начале каждой из 3 страниц вставить auth-guard по паттерну соседей:

```tsx
const userId = await getAuthUserIdFromCookies();
const user = userId ? await getUserById(userId) : null;
if (!user || user.accountType !== 'athlete') {
  return <AccessDeniedCard requiredRole="athlete" />;
}
```

Для `provider/notifications` — `requiredRole="provider"` и проверка `accountType !== 'provider'`.

**Тесты:** smoke-тесты серверных страниц у нас не покрывают access-denied рендер (проверяется E2E через Playwright). Новых unit-тестов не требуется — повторный прогон `profile-hub.md` должен дать 25/25 и `AccessDeniedCard` на всех 17 маршрутах.

**Коммит:** `fix(profile): access-denied guard на schedule/notifications страницах`.

---

### Step 27.9 — Club-side invite в trainer-club-links `[E2E: trainer-club-links.md]`

**Проблема:** в `/profile/provider/links` кнопка «Пригласить тренера» (club-side) возвращает **403 «Недостаточно прав»**. Cross-provider приглашение (главный кейс кнопки — клуб зовёт стороннего тренера) заблокировано. Отчёт: `tests/reports/trainer-club-links-2026-04-25T01-00-00.md` (S1 step-5 FAILED).

**Причина:** `POST /api/trainer-club-links` в `src/app/api/trainer-club-links/route.ts:54` проверяет только `isManagerOfTrainer(trainerId, userId)` → club-владелец, не управляющий тренером, никогда не проходит. Entity на line 74-79 всегда пишет захардкоженное `initiatedBy: 'trainer'`, при этом тип `TrainerClubLink` уже умеет `initiatedBy: 'trainer' | 'club'` (`src/types/index.ts:445-461`) и UI в `ProviderLinks.tsx:334` уже рендерит разные label'ы.

**Что уже готово (не трогать):**
- `isManagerOfClub` существует в `src/lib/link-guards.ts`.
- `createTrainerClubLink` в `src/lib/db.ts:886-901` принимает `initiatedBy` через `Omit<TrainerClubLink, 'id' | 'createdAt'>`.
- UI label «Запрос от тренера» / «Приглашён вами» уже подключён.

**Фикс:**

1. `src/app/api/trainer-club-links/route.ts`:
   - **Zod-схема** — поле `initiatedBy: z.enum(['trainer', 'club']).optional()`. **Обязательно optional** — схема помечена `.strict()`, любое жёсткое добавление обязательного поля сломает старые клиенты (тесты + trainer-side вызов, который сейчас не шлёт initiatedBy).
   - **Guard** — заменить на `isManagerOfTrainer(trainerId, userId) || isManagerOfClub(clubId, userId)` (оба). Если ни один — 403.
   - **Fallback для initiatedBy** когда body не передал: `initiatedBy = isClubManager && !isTrainerManager ? 'club' : 'trainer'`. Dual-role кейс (user = manager обеих сторон) решается приоритетом `trainer` — сохраняет обратную совместимость для существующих self-invite сценариев в тестах.
   - **Условное уведомление**: `club-initiated` → `notify(trainer.managedByUserId, 'link_requested', { initiatedBy: 'club', ... })`; `trainer-initiated` → как сейчас, `notify(club.managedByUserId, ...)`. **Иначе club-owner получает link_requested о своём же приглашении**.
   - Передать `initiatedBy` в `createTrainerClubLink`.

2. `src/components/profile/notifications/notification-copy.ts` — `link_requested` сделать dynamic'ным:
   ```ts
   link_requested: (payload) => {
     const fromClub = payload.initiatedBy === 'club';
     return {
       title: fromClub ? 'Клуб приглашает к сотрудничеству' : 'Новый запрос от тренера',
       description: fromClub
         ? 'Клуб предложил вам привязаться. Откройте раздел «Связи», чтобы принять или отклонить.'
         : 'Тренер попросил привязаться к вашему клубу — подтвердите в кабинете.',
     };
   },
   ```

3. `src/components/profile/provider/ProviderLinks.tsx:170-194` — в `submitNewLink` **передавать явно** `initiatedBy` в зависимости от активной модалки (`InviteTrainerModal` → `'club'`; `RequestLinkModal` → `'trainer'`). Сейчас body шлёт только `{ trainerId, clubId, userId }`.

**Тесты:**
- `src/test/api/trainer-club-links.route.test.ts`:
  - `club-owner создаёт link со сторонним тренером → 200, запись с initiatedBy='club', notification уходит trainer.managedByUserId` (главный новый кейс).
  - `ни trainer-manager, ни club-manager → 403` (негатив).
  - `dual-role manager без initiatedBy в body → fallback 'trainer'` (обратная совместимость).
  - `body без initiatedBy, user = только club-manager → fallback 'club'`.
- `src/test/profile/provider-links.test.tsx:283-322` — обновить существующий `'club-side invite ... шлёт POST с initiatedBy=club'`: добавить `expect(body.initiatedBy).toBe('club')` (сейчас название обещает проверку, а ассерт её не делает → ложное PASS).
- `src/test/profile/notification-copy.test.ts` (если есть) / `src/test/ui/notification-bell.test.tsx` — кейс «club-initiated payload → title `Клуб приглашает к сотрудничеству`».

**Коммит:** `fix(trainer-club-links): Step 27.9 — club-side invite через расширенный API-guard`.

---

### Step 27.10 — Seed: offering Anna с `trainerClubLinkId` `[E2E: trainer-club-links.md]`

**Проблема:** warning-модалка revoke показывает `«0 услуг станут частными»` — в seed нет ни одной offering, привязанной к какому-либо `trainerClubLinkId`. Кейс ненулевого счётчика не покрыт E2E. Отчёт: S4 step-1 partial.

**Важно — корректное поле:** в типе `Offering` (`src/types/index.ts:258`) поле называется **`trainerClubLinkId: EntityId | undefined`** (ссылка на confirmed link), а НЕ `attachmentMode: 'club'`. Установлено → offering «клубная»; `undefined` → частная. При revoke link'а `trainerClubLinkId` сбрасывается в `undefined` (`src/lib/db.ts:937-950` — функция detach).

**Фикс:** в `src/data/offerings.json` добавить запись после id=8:

```json
{
  "id": 9,
  "createdAt": "2026-04-24T12:00:00.000Z",
  "ownerType": "trainer",
  "ownerId": 4,
  "trainerClubLinkId": 4,
  "sportId": 1,
  "title": "Йога для начинающих в Невесомости",
  "description": "Оздоровительная йога для начинающих в клубе Невесомость",
  "format": "group",
  "price": 1200,
  "durationMinutes": 60,
  "capacity": 10,
  "address": "Ново-Садовая ул., 106, корп. З",
  "coordinates": { "lat": 53.21771, "lng": 50.148585 },
  "cancellationPolicy": "free_until_24h"
}
```

**Ключевые id:**
- `ownerType: 'trainer' + ownerId: 4` — trainer entity (managedByUserId=5 = Anna).
- `trainerClubLinkId: 4` — confirmed link #4 (Anna ↔ Club #3 «Невесомость»).

**Валидация после добавления:**
- `getClubOfferings(3)` (`src/lib/db.ts:497-502`) — фильтр по `ownerType='club' && ownerId=clubId`. Наша запись `ownerType='trainer'` → **не ломает** club-offerings.
- `ProviderLinks.tsx:239` — счётчик revoke считает `offerings.filter(o => o.trainerClubLinkId === linkId).length`. После seed этот счётчик вернёт 1 для link #4.
- Существующие тесты (`db.test.ts`, `trainer-club-links.route.test.ts`) используют собственные fixtures, не seed напрямую → регрессий нет.
- После revoke link #4 offering #9 сбросит `trainerClubLinkId` в `undefined` — станет личной услугой Анны на публичной странице тренера. Это и есть проверяемое поведение.

**Тесты:** не требуются — изменение seed. Повторный E2E-прогон `trainer-club-links.md` S4 step-1 должен показать `«1 услуга станет частной»`.

**Коммит:** одним блоком с 27.9 — `fix(trainer-club-links): Step 27.9 — club-side invite через расширенный API-guard` (опционально — отдельным `chore(seed): Step 27.10 — offering Anna с trainerClubLinkId для warning-counter`).

---

### Step 27.11 — Симметричный approve/reject для club-initiated pending `[E2E: trainer-club-links.md]`

**Проблема:** Step 27.9 открыл `POST /api/trainer-club-links` (create) для обеих сторон, но handler'ы `POST /api/trainer-club-links/[id]/approve` и `.../reject` по-прежнему разрешают действие только manager'у **клуба**. Как следствие, после club-initiated invite (link с `initiatedBy='club'`) trainer-owner получает уведомление, но:
- клик «Подтвердить» → **HTTP 403 «Недостаточно прав»**;
- клик «Отклонить» → **HTTP 403 «Недостаточно прав для отказа»**;
- в UI `ProviderLinks.tsx` trainer-side секция «Мои запросы» рендерит карточку с кнопкой **«Отозвать»** (как если бы запрос был свой) вместо пары **«Подтвердить / Отклонить»**.

Отчёт: `tests/reports/trainer-club-links-2026-04-25T01-30-00.md` (S2 step-3 FAIL, S3 step-1 FAIL). Эффект открыт именно потому, что Step 27.9 сделал club-side invite достижимым — раньше этот код-путь просто никто не проверял.

**Причина:** guard в обоих handler'ах проверяет только роль по клубу:
- `src/app/api/trainer-club-links/[id]/approve/route.ts` → `isManagerOfClub(link.clubId, userId)`;
- `src/app/api/trainer-club-links/[id]/reject/route.ts` → то же.

Для club-initiated pending решение принимает **противоположная сторона** — trainer-owner. Guard должен читать `link.initiatedBy` и выбирать проверку по нему.

**Фикс:**

1. `src/app/api/trainer-club-links/[id]/approve/route.ts`:
   - Загрузить `link` (уже делается в существующей логике — сверить).
   - Выбрать guard по `link.initiatedBy`:
     - `'trainer'` → `isManagerOfClub(link.clubId, userId)` (как сейчас);
     - `'club'` → `isManagerOfTrainer(link.trainerId, userId)` (новое).
   - **Негатив:** инициатор не может сам же и подтверждать (club-owner не approve'ит свой club-initiated invite, trainer-owner — свой trainer-initiated request). Существующий guard это уже даёт по дизайну — инициатору нужна противоположная сторона.
   - Уведомление `link_approved` уходит manager'у **инициатора** — т.е. `link.initiatedBy === 'club' ? club.managedByUserId : trainer.managedByUserId`. Сейчас в коде проверить текущее направление: если уже так — не трогать, иначе обновить.

2. `src/app/api/trainer-club-links/[id]/reject/route.ts` — аналогично: guard по `link.initiatedBy`, notify противоположной стороне.

3. `src/components/profile/provider/ProviderLinks.tsx` — trainer-side секция для `pending`:
   - если `link.initiatedBy === 'club'` → рендерить пару кнопок **«Подтвердить» / «Отклонить»** с действиями `approve` / `reject`, плюс подпись карточки «Приглашение от клуба»;
   - если `link.initiatedBy === 'trainer'` → оставить существующую **«Отозвать»** + подпись «Мой запрос».
   - Симметрично: club-side `pending` для `initiatedBy='club'` (мой invite, жду ответа тренера) → **«Отозвать»** вместо «Подтвердить/Отклонить».

**Тесты:**
- `src/test/api/trainer-club-links.route.test.ts`:
  - `approve: trainer-owner подтверждает club-initiated pending → 200 confirmed, notify manager клуба`;
  - `approve: club-owner пытается approve свой club-initiated pending → 403`;
  - `reject: trainer-owner отклоняет club-initiated pending → 200 rejected`;
  - Существующие trainer-initiated кейсы должны остаться зелёными.
- `src/test/profile/provider-links.test.tsx`:
  - pending с `initiatedBy='club'` в trainer-side → видны `provider-links-approve-*` и `provider-links-reject-*` testid'ы (пока test-компонент использует `provider-links-cancel-own-*` для «Отозвать»);
  - pending с `initiatedBy='club'` в club-side → карточка с «Отозвать» (инициатор сам может отменить своё приглашение).

**Коммит:** `fix(trainer-club-links): Step 27.11 — симметричный guard approve/reject для club-initiated pending`.

---

### Step 27.12 — Hidden публикации не уходят с главной `[E2E: admin-panel.md]`

**Проблема:** admin скрывает тренера через `/service-portal/moderation` (`status='hidden'`), но публикация остаётся на главной `/` в трёх секциях: «Тренеры под текущие фильтры», «Популярные тренеры», «Свободные окна тренеров». Счётчик «N тренеров в каталоге» (Badge в hero) не пересчитывается. Аналогичный риск для клубов — код-путь тот же, в отчёте не воспроизводился потому что тестировщик скрывал только тренера. Отчёт: `tests/reports/admin-panel-2026-04-27T12-35-00.md` (S5 step-3 FAIL).

**Где сейчас работает корректно (контракт Phase 22):**
- `GET /api/trainers` — `src/app/api/trainers/route.ts:75`: `trainers.filter((trainer) => trainer.status !== 'hidden')`.
- `GET /api/clubs` — `src/app/api/clubs/route.ts:74`: `clubs.filter((club) => club.status !== 'hidden')`.
- Detail-страницы (`/clubs/[slug]`, `/trainers/[slug]`) — `getClubBySlug`/`getTrainerBySlug` возвращают всё, а сама страница в `clubs/[slug]/page.tsx:45-47` (и симметрично в trainers) делает `if (entity.status === 'hidden') return <HiddenPublicationNotice />`.
- Provider в `/profile/provider/publications` видит свои hidden с badge «Скрыто администратором» — это правильно, **не трогаем**.
- Admin в `/service-portal/moderation` и `/service-portal/dashboard` видит весь список — **не трогаем**.

**Причина:** SSR главной `src/app/page.tsx:40,47` зовёт `getClubs()` и `getTrainers()` напрямую (`src/lib/db.ts:453,469`). Обе функции — голый `readCollection('clubs')` / `readCollection('trainers')` без фильтра по `status`. API-роуты применяют фильтр у себя, а `app/page.tsx` мимо API ходит сразу в `db.ts` (это осознанный выбор Phase 5 — `force-dynamic` + прямой db для SSR-консистентности).

**Семантика фильтра — точно как в API:** `t.status !== 'hidden'` (через `!==`, не `=== 'published'`). Причина — поле `status?: EntityStatus` опциональное (`src/types/index.ts:201,239`); записи без status не должны выпадать с витрины. Также `'draft'` сейчас попадает в публичный каталог через API — это поведение Phase 22, его в Step 27.12 **не меняем** (симметрия с `route.ts`).

**Фикс:**

1. `src/lib/db.ts` (после строки 472, под `getTrainers`):
   ```ts
   // Phase 27 Step 27.12: публичные SSR-поверхности используют этот хелпер,
   // чтобы hidden публикации не утекали на главную и в карточные секции.
   // Симметрия с фильтром в /api/clubs и /api/trainers route.ts.
   export async function getPublishedClubs(): Promise<Club[]> {
     const clubs = await getClubs();
     return clubs.filter((club) => club.status !== 'hidden');
   }

   export async function getPublishedTrainers(): Promise<Trainer[]> {
     const trainers = await getTrainers();
     return trainers.filter((trainer) => trainer.status !== 'hidden');
   }
   ```
   - Существующие `getClubs`/`getTrainers` НЕ трогаем — на них завязаны admin/provider/seed-тесты, любая ломка контракта прорастёт по всей кодовой базе.

2. `src/app/page.tsx`:
   - Импорты (строки 12,19): `getClubs` → `getPublishedClubs`, `getTrainers` → `getPublishedTrainers`.
   - В `Promise.all` (строки 40,47): соответствующие вызовы.
   - Никаких переменных переименовывать не нужно — `clubs` и `trainers` в локальной области остаются под теми же именами, отфильтрованные коллекции автоматически утекают во все 7 потребителей ниже:
     - `<Badge>{clubs.length} клубов в каталоге</Badge>` (строка 116) и `{trainerDirectory.length} тренеров` (117) — пересчитают.
     - `featuredClub` через `[...clubs].sort(...)` (84) — hidden больше не попадёт в «Лидер каталога».
     - `featuredTrainer` через `[...trainerDirectory].sort(...)` (99) — то же.
     - `reliabilityByClubId` / `reliabilityByTrainerId` (Map'ы на строках 54-59) — hidden больше не считаются (это ок, они не показываются).
     - `<MapSection clubs={clubs} trainers={trainerDirectory} />` (252) — маркеры hidden исчезают с карты.
     - `<CatalogResultsSection>` (253), `<PopularNearby>` (261) — выдача и популярные.
     - `<UpcomingSessions trainerSlots={trainerAvailability} />` через `getTrainerAvailability({ trainers: trainerDirectory })` (80-83) — свободные окна.

3. **Явно out of scope (не трогаем в Step 27.12):**
   - `src/app/service-portal/(admin)/dashboard/page.tsx` — admin видит все (включая hidden).
   - `src/app/profile/provider/**` (8 страниц) — provider видит свои hidden с badge «Скрыто».
   - `src/app/profile/athlete/{favorites,settings,reviews}/page.tsx` — текущее поведение (избранное hidden, отзывы про hidden) Phase 27 не трогает; отдельный кейс, если всплывёт в `profile-hub.md`.
   - `src/app/clubs/[slug]/page.tsx:66` зовёт `getTrainers()` без фильтра для секции «Тренеры клуба» — теоретически hidden-тренер в confirmed-link может попасть в этот список. **В отчёте admin-panel это не зафейлено**, scope бага S5.3 — только главная. Если при следующем прогоне `trainer-club-links.md` или detail-теста всплывёт — закрываем отдельным шагом.
   - `src/lib/db.ts:535-536` (внутренний агрегатор для logs/analytics) — admin-only, не трогаем.

**Тесты:**

1. `src/test/lib/db.test.ts` — два новых кейса:
   - `getPublishedClubs() — отфильтровывает status='hidden', оставляет 'published' / 'draft' / undefined` (3 записи в фикстуре с разными статусами + одна без поля).
   - `getPublishedTrainers() — то же для trainers`.

2. Интеграционный SSR-тест на главную (если уже есть `src/test/integration/home-page.test.tsx` — расширить его, иначе создать). Через мок `@/lib/db` подсунуть массив тренеров `[{...status:'published'}, {...status:'hidden'}]`, отрендерить `await Home()` → `screen.queryByText('<имя hidden тренера>')` === null, счётчик в Badge показывает количество без hidden. Симметричный кейс для клуба.

3. Existing тесты `getClubs`/`getTrainers` (`db.test.ts`) — должны остаться зелёными (мы их не трогаем).

**E2E повтор:** прогон `admin-panel.md`. S5.3 после фикса:
- Тренер: hidden-тренер исчезает из «Тренеров под фильтры», «Популярных», «Свободных окон», счётчик `N тренеров в каталоге` уменьшается, маркер на карте пропадает (если карта доступна — иначе валидируется DOM-проверкой).
- Клуб: тестировщик дополнительно скрывает один club через `/service-portal/moderation` и проверяет те же 4 поверхности (выдача + популярные + лидер + счётчик `N клубов`).

**Регрессионный анализ (что НЕ должно сломаться):**

Прошёл grep'ом по всем тестам, использующим `getClubs/getTrainers`/`@/lib/db`/`Home`. Зелёных тестов, которые могут упасть — НЕТ. Подтверждение по группам:

| Тест | Зависит от чего | Почему остаётся зелёным |
|------|-----------------|-------------------------|
| `src/test/api/hidden-filter.test.ts` (8 кейсов, в т.ч. кейс «status: undefined в ответе») | `GET /api/clubs`+`/api/trainers` | API-роуты НЕ трогаем; кейс «undefined проходит» — наш ориентир для семантики `!== 'hidden'` |
| `src/test/api/clubs.route.test.ts`, `src/test/api/trainers.route.test.ts` | API-роуты | Не трогаем |
| `src/test/lib/db-*.test.ts` (8 файлов: db, db-publish, db-moderation, db-logs, db-dictionaries, db-booking, db-trainer-club-links, db-notifications) | Существующие `getClubs/getTrainers` | Контракт функций не меняем — добавляем НОВЫЕ функции рядом |
| `src/test/ui/home-page.test.tsx` тест 1 | `Home()` на production seed | Ассертит ТОЛЬКО заголовки секций, не имена клубов/тренеров и не счётчики |
| `src/test/ui/home-page.test.tsx` тест 2 | `Home()` на isolated empty dir | Пишет `[]` в clubs.json/trainers.json — фильтр пустого массива даёт пустой массив, `0 клубов`/`0 тренеров` остаётся |
| `src/test/design/pages-design.test.tsx` | `Home()` для проверки дизайна | Ассертит DOM hero-блока, не контент сущностей |
| `src/test/ui/runtime-dynamic-pages.test.ts` | `dynamic = 'force-dynamic'` | Константу не трогаем |
| `src/test/clubs/popular-nearby.test.tsx` | Локальная фикстура `clubs`/`trainers` через props в `<PopularNearby>` | Не вызывает `db.ts` |
| `src/test/schedule/upcoming-sessions.test.tsx` + `get-upcoming-sessions.test.ts` | Чистая функция `getUpcomingSessions({clubs, ...})` через props | Не вызывает `db.ts` |
| `src/test/profile/provider-data.test.ts` | `getClubs/getTrainers` для provider-агрегации | Контракт функций не меняется |
| `src/test/integration/phase-26-smoke.test.ts` | Auth + db smoke | Не проверяет hidden-логику главной |
| `src/test/ui/publish-catalog-flow.test.tsx` | Publish-flow в кабинете | Не зависит от main page hidden-фильтра |

**Защитные меры внутри фикса (обязательные шаги перед коммитом):**

1. **Baseline тестов до фикса:** `npm run test` → зафиксировать число `passed` (например, `213/213 passed`). После фикса — ТО ЖЕ число `passed` + 2 новых db-кейса = `215/215`. Если упало хоть одно из старых — откат, разбор причины.
2. **Pre-flight grep на consumers:** `grep -rn "getClubs\|getTrainers" src/` после внесения новых хелперов в `db.ts` — чтобы убедиться, что в `src/` всего ОДНА точка миграции (`src/app/page.tsx`), и нет случайно затронутых других мест.
3. **Snapshot-проверка:** убедиться что нет `__snapshots__/` рядом с `home-page.test.tsx` или `pages-design.test.tsx` (`ls src/test/ui/__snapshots__/ 2>/dev/null`). Если есть — обновлять snapshot ТОЛЬКО после ручной верификации, что новый DOM правильный.
4. **Запрет на правку существующих тестов:** В рамках Step 27.12 РАЗРЕШЕНО:
   - добавлять новые ассерты в `src/test/lib/db.test.ts` (новые describe-блоки для `getPublishedClubs/Trainers`).
   - опционально расширять `src/test/ui/home-page.test.tsx` отдельным describe «hidden не показывается» через мок `db.ts`.
   ЗАПРЕЩЕНО:
   - менять существующие ассерты в любом из перечисленных выше тестов.
   - переименовывать описания тестов/describe-блоков.
   - удалять кейсы.
5. **Edge-case `featuredClub`/`featuredTrainer === undefined`:** Если все клубы или все тренеры скрыты — `[...clubs].sort(...)` вернёт `[]`, `featuredClub === undefined` → hero-блок отрендерит fallback «Клубы появятся после первой публикации…» (page.tsx:206-209). Это уже работающее поведение для пустого каталога — наш фикс просто чаще туда попадёт. Не баг, не регрессия.
6. **Production seed:** `src/data/clubs.json` и `src/data/trainers.json` находятся в `.gitignore` и могут содержать любую комбинацию hidden-записей у разных разработчиков. Тест 1 `home-page.test.tsx` устойчив к этому (см. таблицу выше). НЕ требуется чистить или править production seed.
7. **Финальный verification checklist (по контракту фазы):**
   - `npm run format` — green
   - `npm run lint` — green
   - `npm run test` — `passed` ≥ baseline + 2 новых
   - `npm run build` — green
   - Ручная проверка: dev-сервер, скрыть тренера через `/service-portal/moderation`, открыть `/` в инкогнито — нет в выдаче / популярных / окнах / счётчике; админ в `/service-portal/dashboard` всё ещё видит; провайдер в `/profile/provider/publications` видит свой с badge.

**Что мы гарантируем после Step 27.12:**
- Все ранее зелёные тесты остаются зелёными (по таблице выше — risk = 0).
- Существующее API-поведение не меняется ни на одной поверхности кроме главной.
- Admin/provider/athlete-кабинеты, detail-страницы клубов/тренеров, booking-flow, notifications, reliability — не затрагиваются.

**Коммит:** `fix(home): Step 27.12 — getPublishedClubs/Trainers исключают hidden из SSR главной`.

---

### Step 27.13 — Модалка причины при reject booking провайдером `[E2E: booking-fsm.md]`

**Проблема:** в `/profile/provider/bookings` кнопка «Отклонить» (`ProviderBookingsInbox.tsx:452-467`) шлёт `POST /api/bookings/[id]/reject` с пустым payload — без `reason`. Атлет получает уведомление `booking_rejected`, но без объяснения причины. Backend и copy уведомления УЖЕ умеют работать с reason — нужна только UI-обвязка.

**Что уже готово:**
- API `POST /api/bookings/[id]/reject` принимает `reason: z.string().trim().min(1).optional()` и кладёт его в `meta.reason` уведомления.
- `notification-copy.ts:24-32`: если `payload.reason` есть → описание становится `«Причина: <текст>»`, иначе fallback «Провайдер отклонил запись. Попробуйте другой слот.».

**Фикс:**

1. Новый компонент `src/components/profile/provider/RejectBookingReasonModal.tsx` (по образцу `src/components/admin/HideReasonModal.tsx`, но причина **опциональная** — кнопка «Отклонить» активна и без текста):
   - `Modal` с заголовком «Отклонить запись» и описанием с именем атлета.
   - `<textarea>` для причины, placeholder «Например: время не подходит, нет свободного места…».
   - Две кнопки: «Отмена» / «Отклонить» (последняя — `tone='danger'`).
   - Submit: если `reason.trim()` непуст — передаёт строку, иначе — `null/undefined`.
   - testid'ы: `provider-reject-reason-modal`, `provider-reject-reason-textarea`, `provider-reject-reason-submit`.

2. `src/components/profile/provider/ProviderBookingsInbox.tsx`:
   - Импортировать новый компонент.
   - State `rejectingItem: EnrichedBooking | null` (вместо `boolean` — нужен контекст имени атлета и id для submit).
   - Кнопка «Отклонить» (line 452-467): убрать прямой `transition({...})`, заменить на `onClick={() => setRejectingItem(item)}`.
   - В JSX добавить `<RejectBookingReasonModal open={rejectingItem !== null} item={rejectingItem} onClose={() => setRejectingItem(null)} onConfirm={(reason) => { transition({ item: rejectingItem, endpoint, payload: reason ? { reason } : {}, ... }); setRejectingItem(null); }} />` (один монтаж под список).

3. **НЕ трогаем:**
   - `transition()` функцию — её сигнатура и поведение остаются.
   - API endpoint — уже работает.
   - `notification-copy.ts` — уже умеет рендерить `payload.reason`.
   - Кнопки confirm/check-in/cancel — отдельные FSM-действия, не связаны с этой задачей.

**Тесты:**

1. `src/test/profile/provider-bookings-inbox.test.tsx` (расширить):
   - Кейс «Клик «Отклонить» открывает модалку с textarea» — `screen.getByTestId('provider-reject-reason-modal')` появляется только после клика, до клика нет.
   - Кейс «Submit с причиной → fetch POST /reject с body содержит reason» — заполнить textarea, нажать «Отклонить», ассертить `JSON.parse(fetch.mock.calls[N][1].body).reason === '<текст>'`.
   - Кейс «Submit без причины → body НЕ содержит reason» — открыть модалку, сразу submit, ассертить `body.reason === undefined` (или поля нет).
   - Кейс «Отмена закрывает модалку без вызова fetch» — клик на «Отмена» → модалки нет, `fetch` не вызывался.

2. Notification copy — НЕ трогаем (уже зелёный кейс с reason покрыт `notification-copy.test.ts` если есть; иначе copy визуально валидируется в E2E booking-fsm).

**Регрессионный анализ (что не должно сломаться):**

- Существующий тест `provider-bookings-inbox.test.tsx` («провайдер отклоняет pending → POST /reject») — теперь два варианта: с reason и без. Старый сценарий «click reject → fetch /reject» **меняется**: между кликом и fetch'ем добавляется промежуточный submit модалки. Нужно явно обновить ОДИН существующий ассерт: добавить открытие модалки + submit перед ожиданием fetch.
- `ProviderBookingsInbox` JSX-структура остаётся прежней: модалка добавляется одним монтажом вне map'а карточек, layout не сдвигается.
- `transition()` — без изменений.
- API контракт — без изменений.
- E2E `booking-fsm.md` Scenario 2.3 (reject) после фикса должен **остаться зелёным**, плюс открыть возможность ввести причину.

**E2E повтор:** прогон `booking-fsm.md` Scenario 2.3 («Provider click 'Отклонить' с причиной») — после фикса доступна модалка, текст причины передаётся атлету в notification description «Причина: …».

**Коммит:** `fix(booking-fsm): Step 27.13 — модалка причины при reject booking провайдером`.

---

### Step 27.14 — Причина отказа/отмены провайдера в таймлайне атлета `[E2E: booking-fsm.md]`

**Проблема:** после Step 27.13 провайдер пишет причину при reject → она попадает в `booking.statusHistory[].reason` (свободной строкой) и корректно отображается в dropdown'е колокольчика и на `/profile/athlete/notifications`. НО в модалке «Детали» внутри `/profile/athlete/schedule` (`AthleteBookingTimeline`) причины нет — таймлайн показывает только сухой лейбл «Провайдер отклонил».

**Где работает корректно (после Step 27.13):**
- Dropdown колокольчика — `notification-copy.ts:24-32` рендерит «Причина: …».
- `/profile/athlete/notifications` — то же.
- API `/api/bookings/[id]/reject` принимает `reason` и пишет в `statusHistory`.

**Причина:** `src/lib/athlete-timeline-format.ts` → `buildLabel()` для `actor='provider'` + `to='rejected_by_provider'` (line 39-41) возвращает только строку `'Провайдер отклонил'`, не используя `transition.reason`. Аналогично для `to='cancelled_by_provider'` (line 35-37) — провайдер может отменить confirmed с произвольной причиной (cancel-роут тоже её принимает), но таймлайн её скрывает.

**Семантика — где причину добавлять, где НЕ добавлять:**

| Кейс | Действие |
|------|----------|
| `provider` + `rejected_by_provider` + reason='Время не подходит' | ✅ дописать «. Причина: Время не подходит» |
| `provider` + `cancelled_by_provider` + reason='Тренер заболел' | ✅ дописать «. Причина: Тренер заболел» |
| `athlete` + `cancelled_by_athlete` + reason='late' | ❌ НЕ дописывать — `late` это служебный CancelReason, уже в лейбле «Вы отменили (поздняя отмена)» |
| `system` + `cancelled_by_provider` + reason='auto_cancel_pending_expired' | ❌ НЕ дописывать — служебный код, уже в лейбле |
| Любой actor + reason=`undefined` или пустая строка | ❌ Старое поведение — без суффикса |

**Фикс:**

1. `src/lib/athlete-timeline-format.ts`:
   - Helper `function appendReasonIfPresent(label: string, reason?: string): string` — если `reason` непустой и непробельный → возвращает `${label}. Причина: ${reason.trim()}`, иначе возвращает `label` без изменений.
   - В `buildLabel()` для `actor === 'provider'` обернуть возврат для `to === 'rejected_by_provider'` и `to === 'cancelled_by_provider'`:
     ```ts
     if (to === 'cancelled_by_provider') {
       return appendReasonIfPresent('Провайдер отменил', reason);
     }
     if (to === 'rejected_by_provider') {
       return appendReasonIfPresent('Провайдер отклонил', reason);
     }
     ```
   - Не трогать ветку `actor === 'athlete'` (там `reason='late'` — служебный код).
   - Не трогать ветку `actor === 'system'` (там `auto_cancel_pending_expired` — служебный код).
   - Не трогать ветку `actor === 'admin'` — у админа нет UI для ввода причины (отдельный кейс если всплывёт).

2. **Сборка строки:** `'Провайдер отклонил. Причина: Время не подходит'` (точка → «Причина:» с заглавной буквы, как в notification-copy). Симметрия с уведомлением, чтобы атлет видел одинаковый формат.

**НЕ трогаем:**
- `notification-copy.ts` — там уже всё правильно, формат «Причина: …» взят оттуда.
- API endpoint'ы reject/cancel — `reason` уже принимается и пишется в `statusHistory`.
- `RejectBookingReasonModal` (Step 27.13) — UI ввода причины для cancel модалки не делаем в рамках 27.14 (cancel сейчас идёт без модалки причины — это отдельный возможный шаг 27.15, не сейчас).
- `AthleteBookingTimeline.tsx` — компонент-рендерер берёт уже готовый label из `formatStatusHistoryForAthlete()`, изменения внутри функции автоматически отразятся в UI.

**Тесты:**

`src/test/lib/athlete-timeline-format.test.ts` — добавить кейсы:
1. `provider + rejected_by_provider + reason='Время не подходит'` → label содержит «Провайдер отклонил. Причина: Время не подходит».
2. `provider + rejected_by_provider` БЕЗ reason → label «Провайдер отклонил» (без суффикса) — обратная совместимость с существующим зелёным тестом.
3. `provider + cancelled_by_provider + reason='Тренер заболел'` → label «Провайдер отменил. Причина: Тренер заболел».
4. `provider + cancelled_by_provider` БЕЗ reason → label «Провайдер отменил».
5. `provider + reason='   '` (пробелы) → label без суффикса (trim в helper'е).
6. **Регрессия:** существующий кейс `athlete + cancelled_by_athlete + reason='late'` → остаётся «Вы отменили (поздняя отмена)» БЕЗ дополнительного «. Причина: late» (служебный код не должен утечь в UI).

**Регрессионный анализ:**
- Существующие 5 тест-кейсов в `athlete-timeline-format.test.ts` — все остаются зелёными: ни в одном из них для provider'а нет передачи `reason` в фикстуре (line 22 `reason: 'late'` только у athlete-кейса).
- `AthleteBookingTimeline.tsx` — структура entry неизменна (`{ label, at }`), только содержимое label другое.
- Снапшотов на этом компоненте нет.

**E2E повтор:** `booking-fsm.md` Scenario 2 — после reject с причиной открыть «Детали» в `/profile/athlete/schedule` → в таймлайне рядом с «Провайдер отклонил» видна «Причина: <текст>». Симметрично проверить `cancelled_by_provider`.

**Коммит:** `fix(booking-fsm): Step 27.14 — причина отказа/отмены провайдера в таймлайне атлета`.

---

### Step 27.15 — `router.refresh()` после impersonation start/stop `[E2E: admin-panel.md]`

**Проблема:** супер-админ через `/service-portal/dashboard` нажимает «Войти как» у провайдера → `router.push('/profile/provider')` → страница либо долго висит «Rendering…», либо рендерится со старым userId, либо пустой контент. Помогает только ручной F5. Симметрично при «Вернуться в панель» из `ImpersonationBanner` — после возврата в admin dashboard данные могут быть устаревшими. Жалоба пользователя 2026-04-28 со скриншотом долгого «Rendering…».

**Корень проблемы (после диагностики):**
- `useAuthStore.startImpersonation/stopImpersonation` пишут cookie `sh-auth-user-id` СИНХРОННО через `syncAuthCookie(targetUser.id)` (`src/stores/useAuthStore.ts:173,186` — `document.cookie = ...`). Это ок.
- НО `DashboardPage.tsx:161` после `startImpersonation()` зовёт только `router.push(profilePath)` — БЕЗ `router.refresh()`. Симметрично `ImpersonationBanner.tsx:36-37`: `stopImpersonation()` + `router.push('/service-portal/dashboard')` без refresh.
- Без `router.refresh()` Next.js Router держит RSC-cache сегмента под прежним userId. Server Components (`/profile/provider/layout.tsx`, `dashboard/page.tsx` и подмаршруты) помечены `dynamic='force-dynamic'`, но Router-кэш сегмента всё равно может попасть из соседних навигаций / prefetch / предыдущих заходов админа в этот же путь.
- Эффект для пользователя: либо stale data (старый userId в SSR), либо «висит Rendering…» (Server Component запросил данные, но Router отдаёт кеш мимо них).

**Что НЕ является причиной (отбрасываем):**
- ❌ Cookie/LocalStorage sync — работает (Phase 26 hotfix `syncAuthCookie` уже синхронный).
- ❌ Heavy SSR через `Promise.all` 8 коллекций — это медленно на dev (200-500мс), но не блокер. В `npm run build && npm run start` укладывается в норму. **Этот вопрос отдельно не закрываем в 27.15** — он не корень бага.
- ❌ Phase 27 фиксы (27.0–27.14) — не связаны.
- ❌ Отсутствие `loading.tsx` — это UX-маскировка проблемы, не фикс. Опционально можно добавить отдельным шагом, но не в 27.15.

**Где работает корректно (для контраста):**
- `DashboardPage.tsx:180` (`handleLiftQuarantine`) уже вызывает `router.refresh()` после mutation — паттерн уже принят в этом же файле.

**Фикс:**

1. `src/components/admin/DashboardPage.tsx`:
   - В функции impersonation (строка ~141-161), после `router.push(profilePath)` (line 161), добавить `router.refresh()`. Порядок: сначала `push`, затем `refresh` — Next.js рекомендует именно так, чтобы инвалидация cache произошла на новом маршруте.

2. `src/components/admin/ImpersonationBanner.tsx`:
   - В `handleReturn` (строка 36-37), после `router.push('/service-portal/dashboard')` добавить `router.refresh()`.

**НЕ трогаем:**
- `useAuthStore.ts` — store не имеет доступа к `useRouter` (вне React-контекста). Cookie уже пишется синхронно, store ок.
- `syncAuthCookie` / `setAuthUserIdCookie` — без изменений.
- API логирования (`/api/logs`) — без изменений, fire-and-forget остаётся.
- Серверные страницы `/profile/*` — без изменений (refresh заставит их перерендериться с новыми cookies).
- Heavy SSR / loading.tsx — отдельный возможный шаг, не входит в 27.15.

**Регрессионный анализ:**
- `src/test/admin/dashboard.test.tsx:21` — мок `useRouter` уже содержит `refresh: vi.fn()`. Добавление `router.refresh()` в код не сломает существующие ассерты — `vi.fn()` молча принимает вызов.
- `src/test/admin/impersonation-flow.test.tsx:21` — то же самое, `refresh: vi.fn()` уже замокан.
- Никаких других тестов для `DashboardPage` / `ImpersonationBanner` не находится (`grep` дал только эти два файла).
- `router.refresh()` идемпотентен и не имеет side-effects кроме инвалидации RSC-cache. Дополнительный сетевой запрос на текущий маршрут — это и есть желаемое поведение.
- Существующие 1298 тестов остаются зелёными.

**Тесты:**

1. `src/test/admin/dashboard.test.tsx` — расширить существующий impersonation-кейс (где сейчас ассертится `mockPush`):
   - Завести отдельный `mockRefresh = vi.fn()` (заменить `refresh: vi.fn()` на `refresh: mockRefresh`).
   - После клика «Войти как» → `mockRefresh` был вызван.

2. `src/test/admin/impersonation-flow.test.tsx` — аналогично:
   - `mockRefresh` создаётся явно вместо inline `vi.fn()`.
   - После клика «Вернуться в панель» → `mockRefresh` был вызван.

3. Опционально: проверка порядка вызовов (`mockPush` до `mockRefresh`) через `toHaveBeenCalledBefore` — но это уже nice-to-have, основной ассерт «refresh вызван» закрывает регрессию.

**E2E повтор:** ручная проверка пользователем (или второй терминал на `admin-panel.md` Scenario 2):
- step-1 «Войти как» → expect: страница `/profile/provider/dashboard` загружается с актуальными данными provider'а БЕЗ ручного F5, индикатор «Rendering…» исчезает в нормальное время (~500мс на dev).
- step-4 «Выйти из impersonation» → expect: `/service-portal/dashboard` загружается актуальный список users без ручного F5.

**Коммит:** `fix(admin-panel): Step 27.15 — router.refresh() после impersonation start/stop`.

---

## Чек-лист

- [x] Step 27.0 — hotfix сохранения галочек Settings (GET + fetch) — в `c6916e7`
- [x] Step 27.1 — duplicate-check по активным статусам — в `c6916e7`
- [x] Step 27.2 — единый фильтр preferences в db — в `c6916e7`
- [x] Step 27.3 — фильтр типов по accountType — в `c6916e7`
- [x] Step 27.4 — FSM-label у провайдера в История — в `c6916e7`
- [x] Step 27.5 — таймлайн атлета показывает auto-expire — в `c6916e7`
- [x] Step 27.6 — клик по dropdown-уведомлению = mark-as-read + переход — в `c6916e7`
- [x] Step 27.7 — косметика copy — в `c6916e7`
- [x] Повторный E2E-прогон `notifications.md` — отчёт `tests/reports/notifications-2026-04-24T23-55-00.md` (28/28 ✅)
- [x] Step 27.8 — access-denied guard на 3 подмаршрутах ЛК — в `d41a4d5`
- [x] Повторный E2E-прогон `profile-hub.md` после 27.8 — отчёт `tests/reports/profile-hub-2026-04-25T00-15-00.md` (25/25 ✅)
- [x] Step 27.9 — club-side invite через расширенный guard — в `a5de020`
- [x] Step 27.10 — seed offering Anna с `trainerClubLinkId` (локально, `src/data/offerings.json` в `.gitignore`)
- [x] Промежуточный E2E-прогон `trainer-club-links.md` после 27.9 + 27.10 — отчёт `tests/reports/trainer-club-links-2026-04-25T01-30-00.md` (18/21, вскрылся новый баг → Step 27.11)
- [x] Step 27.11 — симметричный approve/reject для club-initiated pending + UI + dynamic copy `link_approved`/`link_rejected` — в `a5de020`
- [x] Финальный E2E-прогон `trainer-club-links.md` после 27.11 — отчёт `tests/reports/trainer-club-links-2026-04-25T01-45-00.md` (21/21 ✅)
- [x] Промежуточный E2E-прогон `admin-panel.md` после 27.0–27.11 — отчёт `tests/reports/admin-panel-2026-04-27T12-35-00.md` (21/24, вскрылся новый баг → Step 27.12)
- [x] Step 27.12 — `getPublishedClubs/Trainers` исключают hidden из SSR главной — в `46a4228`
- [x] Финальный E2E-прогон `admin-panel.md` после 27.12 — отчёт `tests/reports/admin-panel-2026-04-27T13-00-00-rerun.md` + `admin-panel-2026-04-27T13-30-00-step3-clubs.md` (S5.3 trainer + S5.3 club ✅)
- [x] Промежуточный E2E-прогон `booking-fsm.md` — отчёт `tests/reports/booking-fsm-2026-04-27T15-45-00.md` (23/23 ✅, выявлен UX-косяк reject без модалки причины → Step 27.13)
- [x] Step 27.13 — модалка причины при reject booking провайдером — в `fa69f22`
- [x] Step 27.14 — причина отказа/отмены провайдера в таймлайне атлета — в `fa69f22`
- [x] Финальный E2E-прогон `booking-fsm.md` после 27.13 + 27.14 — Scenario 2.3 с reason передаётся в notification + в таймлайн «Детали» (✅)
- [x] Step 27.15 — `router.refresh()` после impersonation start/stop — в `151899d`
- [x] E2E `reliability-quarantine.md` — отчёт `tests/reports/reliability-quarantine-2026-04-28T01-50-00.md` (29/29 ✅)
- [x] Ручная проверка Step 27.15 (impersonation refresh) — пройдена пользователем

---

**Выполнено:** Step 27.0–27.15 ✅ ФАЗА ЗАВЕРШЕНА. Финал: 16 багфиксов по итогам E2E-прогонов и ручных проверок — notifications-блок (preferences GET, applyPreferences flag, accountType-фильтр типов, dropdown-клик=read+nav, copy auto-expire, dynamic copy `link_*`), повторная запись после отмены, FSM-label у провайдера в табе «История», auto-expire в таймлайне атлета, access-denied guard на 3 подмаршрутах ЛК, симметричный FSM приглашений тренер↔клуб (`initiatedBy` + симметричные approve/reject), `getPublishedClubs/Trainers` против утечки hidden на главную, модалка причины reject booking + отображение причины в notification и таймлайне «Деталей», `router.refresh()` после impersonation start/stop. Все Phase 24-26 механики продолжают работать без регрессий.

**Следующий шаг:** — (Phase 27 завершена; ожидает старт Phase 28).

**Статус Phase 27:** ✅ ЗАВЕРШЕНА

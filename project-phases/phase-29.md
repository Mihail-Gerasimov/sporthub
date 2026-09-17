# Phase 29

> Этот файл содержит одну фазу проекта целиком. Главный вход в контекст — `CLAUDE.md`.
> Навигация по фазам — через `PHASES_OVERVIEW.md`.
> В ежедневной работе открывай прежде всего активную фазу и не перечитывай все phase-файлы подряд без необходимости.
> Структура фазы сохраняется в исходном стиле: заголовок фазы, краткий результат, шаги по порядку, затем чеклист и статус.
> Перед стартом новой фазы проверь, что для неё уже есть отдельный `phase-XX.md`, и после завершения шагов или фазы синхронизируй статус здесь, в `PHASES_OVERVIEW.md`, `CLAUDE.md`, `README.md` и при необходимости в `STACK_OVERVIEW.md`.

## Phase 29: Микро-улучшения перед демо — карта-toggle, уведомления, ЛК-настройки, админ-credentials

> После этой фазы: на главной карте появляется toggle «светлая / тёмная» в правом верхнем углу (тёмная реализована через CSS-фильтр `grayscale(1) invert(1)`, проверено в DevTools). Уведомления получают живой счётчик в колокольчике, который декрементируется сразу при пометке прочитанным (не ждёт следующий polling), а на странице уведомлений в ЛК добавляется per-item delete и режим «выбрать несколько → удалить» с физическим удалением из JSON-базы. Появляется новый тип уведомления — при создании отзыва доходит обоим: владельцу клуба/тренера («вам оставили отзыв») и автору отзыва («ваш отзыв опубликован»). В ЛК атлета и провайдера на странице «Настройки» становится возможным редактировать собственный телефон и пароль (e-mail и имя остаются read-only). В админ-панели в карточке пользователя открывается доступ к учётным данным (логин = email, пароль с masked-toggle «показать») и кнопка «Изменить пароль» как админский инструмент для смены пароля любому юзеру.

Phase 29 — серия точечных доработок, отделяющих MVP от состояния, в котором его не стыдно показать клиенту. Каждое из 6 улучшений — небольшое по объёму, но критичное для воспринимаемого качества: динамический счётчик уведомлений вместо «зависающей» цифры, реальная возможность управлять корреспонденцией (читать и удалять), две темы карты вместо одного слепящего серого, нормальные настройки аккаунта вместо заглушек, и админский инструмент посмотреть/сменить пароль пользователю. Главное требование — **ничего не ломать в существующем функционале**: каждый шаг включает regression-проверку существующих flow'ов (booking, auth, notifications, publish, admin). Фаза не вводит новых архитектурных слоёв — переиспользует существующие Zustand-stores, db.ts-хелперы, паттерн `notify()`, Phase 28 дизайн-токены и компонент `Modal`.

**Пререквизит:** Phase 16 (booking + ЛК), Phase 17 (Super Admin DashboardPage), Phase 19 (Yandex Карты), Phase 24 (notifications + bell + notify-helper), Phase 28 (визуальный rebrand) завершены.

---

### Ключевые решения

**Темная тема карты — CSS-фильтр `grayscale(1) invert(1)` на canvas:**

- Yandex Maps 3.0 не предоставляет publicly стабильного theme-API в JS-библиотеке (3.0 — относительно новая версия). Подключать v3 dark-tile-set через runtime — путь, требующий ребилда карты при toggle.
- Решение: оставить карту в дефолтном (светлом) рендере и применять CSS-фильтр **на контейнер карты** в режиме «dark»: `filter: grayscale(1) invert(1)`. Конкретные значения проверены в DevTools пользователем — выглядят корректно. Без `hue-rotate(180deg)` (не нужен).
- Минусы CSS-инверсии: маркеры тоже инвертируются (красный SportHub-пин становится cyan). Решение — counter-invert на самих маркерах через nested CSS `filter: invert(1) hue-rotate(180deg)` (двойная инверсия) **либо** перерисовать маркер-стили под dark с нуля. Решено: выбираем counter-invert (минимум изменений в `useMapMarkers.ts`).
- Toggle и map-controls (zoom-кнопки если есть) **выносятся за пределы** filter-контейнера (рендерятся как absolute siblings, не children) — иначе они тоже инвертируются и UI ломается.
- Плюсы: ноль изменений в бизнес-логике карты, мгновенный toggle, легко удалить и заменить на нативный theme API в будущем.

**Toggle темы карты — Zustand с persist + SSR-safe:**

- Новый `src/stores/useMapThemeStore.ts` с persist в localStorage (`name: 'sporthub-map-theme'`). Не объединяем с другими сторами — дешёво и изолированно.
- Default — `'light'`. SSR отдаёт light, hydrated client может переключиться на dark из localStorage. Защита от hydration-mismatch: `useEffect` mounted-flag в `MapThemeToggle` (рендерит ничего до mount) **либо** Zustand `skipHydration` + ручной `rehydrate()` после mount.
- Toggle-компонент — pill 44×44 в правом верхнем углу карты (`position: absolute; top: 12px; right: 12px; z-index: 5`), две иконки sun/moon, активная горит lime.
- Стилизация — строго по `.claude/skills/frontend-design/SKILL.md`.

**Уведомления — единый Zustand store вместо разрозненного state:**

- Сейчас bell-счётчик живёт в локальном state `NotificationBell.tsx` (через хук `useUnreadCountPolling`). Список уведомлений на странице — отдельный fetch + локальный state в `NotificationsListPage.tsx`. Они **не синхронизированы**: пометка прочитанным на странице не обновляет счётчик колокольчика до следующего polling.
- Решение: новый `src/stores/useNotificationsStore.ts` (Zustand) — единый источник правды.
  - State: `unreadCount: number`, `notifications: Notification[]`, `loaded: boolean`, `userId: number | null`.
  - Actions: `setUnreadCount(n)`, `setNotifications(arr)`, `markRead(id)`, `markAllRead()`, `removeMany(ids)`, `setUserId(id)`, `reset()`.
  - `markRead(id)` — оптимистично декрементит `unreadCount` локально (с guard `Math.max(0, ...)`) и шлёт `POST /api/notifications/[id]/read`. На сервере idempotent.
  - **Rollback на server fail:** catch → revert (вернуть `readAt: undefined`, увеличить `unreadCount`) + toast «Не удалось пометить прочитанным».
- `NotificationBell` подписывается на `unreadCount` из store — реактивный rerender.
- `NotificationsListPage` подписывается на `notifications` и `unreadCount` из того же store.
- Polling (`useUnreadCountPolling`) остаётся как safety-net (60s + смена pathname) — пишет в store, но **merge-логика**: если в store есть pending локальные изменения (через `pendingOps` ref-flag), polling skip overwrite на этот цикл.

**Per-item и bulk-delete уведомлений:**

- Hard-delete (физическое удаление из `notifications.json`). Soft-delete отложен до фазы с email/SMS, когда история станет нужна для аудита.
- Новый API `DELETE /api/notifications` с body `{ ids: number[], userId: number }`. Один endpoint обслуживает оба сценария.
- Guard: на сервере **silent filter** — оставляем только id принадлежащие userId, удаляем их, возвращаем `deleted` count. Не возвращаем 403 на чужие id (не открываем enumeration).
- Empty array → no-op `{ deleted: 0 }`, не падает.
- Новая функция `db.deleteNotifications(ids: number[]): Promise<{ deleted: number }>` — атомарная запись.
- UI: per-item X-иконка на каждой карточке + режим «Выбрать» с чекбоксами + кнопка «Удалить выбранное (N)». Подтверждение через **наш `Modal`-компонент** (НЕ `window.confirm`, который ломает Phase 28 dark style).
- Selection-mode сбрасывается при `pathname` change (useEffect cleanup) — иначе sticky-state.
- Decrement `unreadCount` после удаления: считается на клиенте перед DELETE — `unreadCount -= ids.filter(id => !notification.readAt).length`.
- **Rollback на server fail:** при DELETE 500 — revert (вернуть удалённые в store) + toast.

**Уведомление при создании отзыва — обоим участникам:**

- Расширяем `NotificationType` в `src/types/index.ts` двумя новыми литералами:
  - `review_received_by_provider` — провайдеру (владельцу клуба/тренера). Payload: `{ reviewId, entityType: 'club' | 'trainer', entityId, fromUserId, rating }`.
  - `review_published_for_athlete` — атлету (автору) как confirmation.
- Новая группа `'reviews'` в `src/lib/notification-types.ts` (groupKey + label «Отзывы»). Обновляются: UI-фильтры на `/profile/{role}/notifications` (которые показывают группы), `notification-types-config` (default `enabled: true` для обоих).
- Копирайт в `src/lib/notification-copy.ts` — title и body для обоих типов с link на public detail (`/clubs/[slug]#reviews` или `/trainers/[slug]#reviews`).
- Триггер в `src/app/api/reviews/route.ts` (POST handler):
  - после `createReview()` — резолв entity + ownerId + authorName.
  - 2 параллельных `notify()` (получателю + автору).
  - **Self-review guard:** `if (review.userId === ownerId) skip` для получателя.
  - **Notification preferences guard:** существующий `notify()` уже respects `user.notificationPreferences` (Phase 24). Убедиться что новые типы попадают под эту проверку (тест на disabled-preferences).
  - **Orphan ownerId guard:** если у entity нет ownerId (теоретически) — silent skip с warn.
  - fire-and-forget — не блокирует ответ POST.
- Уведомления автоматически интегрируются с bell + dropdown + полной страницей.

**User settings — только phone и password, security-first:**

- E-mail и name остаются **read-only** в Phase 29 (email — потому что identifier для login, name — потому что в публичных surface как owner).
- Phone — простое поле.
- Password — основная функция. Схема: currentPassword + newPassword + confirmNewPassword. Серверная проверка `currentPassword.trim() === user.password.trim()` (plain compare с trim для seed-надёжности; bcrypt отложен до Phase 30+).
- Backend:
  - `db.updateUser(id, patch: Partial<Pick<User, 'phone' | 'password'>>)` атомарная.
  - `PATCH /api/users/[id]` принимает body `{ phone?, password?, currentPassword? }`.
  - Zod-валидация (phone — существующая `phoneSchema`, password — minLength 6, currentPassword — обязателен если меняется password).
  - **Critical: server-side userId** берётся из существующего MVP-pattern (тот же что у других PATCH-endpoints). Сравнение body.userId с params.id обязательное, но **не достаточное** — должен быть второй guard через session-userId (как в других routes). Реализация — симметрично существующим patterns.
  - Sanitization ответа: omit `password` field через util-helper.

**Импер сонация и редактирование settings — MVP-ограничение:**

- Если `useAuthStore().isImpersonating === true` (admin вошёл от лица другого user) — формы редактирования phone/password в ЛК блокируются с notice «Вы вошли как администратор. Изменение настроек этого пользователя возможно только из админ-панели». Submit-кнопка не рендерится.
- Это сознательное MVP-ограничение. Для смены пароля админу есть отдельный инструмент (Step 29.7).
- Фиксируется в `feature-docs/auth.md`: Phase 29 ограничивает write-операции в ЛК для impersonated-сессии.
- Guard на сервере: PATCH /api/users/[id] игнорирует impersonated-сессию (использует реального admin'а как actor); UI-блок в ЛК — первая линия защиты.

**Админ-панель — credentials в UserCard и admin-only password reset:**

- В `UserCard()` в `src/components/admin/DashboardPage.tsx` добавляется блок «Учётные данные» внизу карточки:
  - Login (= email) — `font-mono`, копируемый.
  - Password — `font-mono` masked `••••••••`. Toggle-кнопка «Показать/Скрыть» (eye icon) — локальный useState.
  - Кнопка «Изменить пароль» — открывает модалку `AdminUpdatePasswordModal`.
  - **Empty password в legacy seed:** отображается `(не задан)`, toggle disabled.
  - **Long password (>50 chars):** `break-all` чтобы UI не ломался.
- Новый endpoint `PATCH /api/admin/users/[id]/password` — admin-only guard, валидация newPassword Zod (minLength 6).
- Логирование: новое значение `LogAction = 'admin_password_change'`. Запись с actorId + targetUserId + timestamp.
- Известный риск (фиксируется в `feature-docs/admin.md`): отображение пароля в clear text → screen-share leak. Не критично для MVP.

**Стилизация — строго по SKILL frontend-design:**

- Все новые UI-компоненты в Phase 29 (toggle карты, чекбоксы и Modal в notifications, формы settings, AdminUpdatePasswordModal, credentials-блок в UserCard) проходят чек-лист `.claude/skills/frontend-design/SKILL.md`:
  - палитра только через `var(--ui-*)` (gold для звёзд, lime для positive, orange для cancel/warning, red для danger);
  - шрифты `font-display` (Bowlby) / `font-body` (Oswald) / `font-mono` (JetBrains Mono);
  - кнопки `rounded-full`, карточки `rounded-[18px]`, модалки `rounded-[24px]` + `shadow-floating`;
  - тени **только** на модалках/dropdown/popover (не на дефолтных карточках);
  - mobile-first (sm/md/lg/xl/xxl/2k брейкпоинты);
  - UPPERCASE на заголовках/кнопках/бэйджах/навигации; mixed case на user-generated данных и body-параграфах;
  - tabular-nums на цифрах (счётчики, цены).

**Область работы (Scope-Guard):**

В Phase 29 входит:

- Map theme toggle (light/dark, CSS-фильтр).
- Notifications store (unreadCount + dynamic decrement).
- Bulk + per-item delete уведомлений (UI + API + db).
- Notification при создании отзыва (2 типа, обоим).
- User settings UI и API: phone и password (только сам себе).
- Admin credentials view + admin password reset endpoint.

В Phase 29 **НЕ** входит:

- Email-смена (требует session invalidation, отдельная фаза).
- Name-смена (требует пересборки производных данных в публичных surfaces).
- Bcrypt и hashing паролей (отложено до Phase 30+).
- Реалтайм через SSE/WebSocket.
- Settings под impersonation (заблокировано как MVP-ограничение).
- Soft-delete уведомлений с архивом (только hard).
- Native theme-API Yandex Maps (только CSS-фильтр).
- Восстановление пароля по email («забыл пароль») — отложено.
- Image upload для avatar — отложено.

---

### Step 29.1: Map theme — Zustand store + MapThemeToggle + CSS-фильтр

- **Действие:**
  - создать `src/stores/useMapThemeStore.ts` с Zustand persist:
    - state: `theme: 'light' | 'dark'`, default `'light'`.
    - actions: `toggleTheme()`, `setTheme(t)`.
    - persist `name: 'sporthub-map-theme'`.
  - создать компонент `src/components/map/MapThemeToggle.tsx`:
    - `useEffect` mounted-flag (рендерит null до mount) — защита от SSR-mismatch.
    - props: `{ className?: string }`.
    - render: pill 44×44 с двумя иконками sun/moon (inline SVG), активная горит lime.
    - `onClick` → `toggleTheme()`.
    - aria-label «Переключить тему карты».
  - в `src/components/map/MainMap.tsx`:
    - получить `theme` из store через selector.
    - обернуть **только map canvas** (не toggle, не controls) в `<div data-map-theme={theme}>`.
    - смонтировать `<MapThemeToggle />` как absolute sibling **снаружи** filter-контейнера.
  - в `src/app/globals.css`:
    - `[data-map-theme="dark"] { filter: grayscale(1) invert(1); }`.
    - counter-invert на маркерах: `[data-map-theme="dark"] .map-marker { filter: invert(1) hue-rotate(180deg); }` — двойная инверсия возвращает оригинальные цвета. Имя класса маркера сверить с `useMapMarkers.ts`.
  - **Стилизация:** строго по `.claude/skills/frontend-design/SKILL.md`. Toggle pill — `rounded-full` + `border border-line` + `bg-card` + `hover:border-lime`. Активная иконка — `text-lime`. Без теней (только модалки). Mobile-first: на 480 — позиция `top-2 right-2`, размер `size-10` (40×40), на 768+ — `top-3 right-3`, `size-11`.

- **Проверка:**
  - toggle в правом верхнем углу карты переключает тему мгновенно.
  - F5 → выбор сохранён.
  - в dark-режиме маркеры в семантически правильных цветах (lime/orange сохранены).
  - на 480 — toggle не перекрывает контролы карты.

- **Тесты:**
  - unit `useMapThemeStore`: toggle, persist (mock localStorage), default `'light'`.
  - unit `MapThemeToggle`: render обоих состояний, click меняет state, не рендерит до mount.
  - integration: MainMap с обоими темами рендерит правильный data-attribute.
  - manual via MCP в Step 29.8: визуальная проверка на 480/1440 + проверка маркеров.

- **Риски и mitigations:**
  - **YMaps3 рендерит canvas в shadow DOM / iframe** → CSS-фильтр на родителе не пройдёт. Mitigation: проверить через DevTools перед реализацией; если canvas в shadow — apply filter напрямую через ref на canvas-element.
  - **Vendor-class fragility** — `ymaps3x0--map` может уйти. Mitigation: использовать ref на map-container `<div>`, не vendor-селектор. Data-attribute на нашем wrapper'е надёжнее.
  - **SSR hydration mismatch** — Zustand persist на SSR отдаёт default. Mitigation: mounted-flag в Toggle.
  - **Counter-invert маркеров может не работать идеально** — если маркер использует SVG с градиентами, double-invert не вернёт цвета 1:1. Mitigation: при проблеме — переписать стиль маркера через `data-map-theme="dark"`-вариант (lime/orange захардкожены под dark).
  - **Regression — карта на главной не должна сломаться** — toggle не вмешивается в логику инициализации YMaps. Mitigation: regression test → `MainMap` рендерится в light как раньше, smoke-test markers.

- **Ожидаемый результат:**
  - пользователь видит на главной карте небольшой toggle, переключает тему светлая ↔ тёмная одним кликом, выбор сохраняется между сессиями.

### Step 29.2: Notifications Zustand store + dynamic bell-counter

- **Действие:**
  - создать `src/stores/useNotificationsStore.ts`:
    - state: `notifications: Notification[]`, `unreadCount: number`, `loaded: boolean`, `userId: number | null`.
    - actions:
      - `setNotifications(list)` — заменяет полный список, пересчитывает `unreadCount`.
      - `setUnreadCount(n)` — устанавливается polling'ом.
      - `markRead(id)` — оптимистично: если `!readAt` → ставит `readAt: now`, декрементит `unreadCount` через `Math.max(0, n - 1)`. Шлёт `POST /api/notifications/[id]/read`. На fail → revert + toast.
      - `markAllRead()` — все локально mark, `unreadCount = 0`. Шлёт `POST /api/notifications/read-all`. На fail → revert + toast.
      - `removeMany(ids)` — фильтрует список + декрементит `unreadCount` на число удалённых непрочитанных. Используется в Step 29.3.
      - `setUserId(id)` — сравнение с текущим, при несовпадении → `reset()` + новый fetch.
      - `reset()` — для logout.
  - переписать `useUnreadCountPolling`:
    - вместо локального state в Bell — пишет в `useNotificationsStore.setUnreadCount`.
    - polling: 60s + смена pathname.
    - **Merge-логика:** перед setUnreadCount проверять `pendingOps` ref-flag в store — если есть pending локальные изменения, polling skip overwrite на этот цикл.
  - обновить `src/components/layout/NotificationBell.tsx`:
    - читает `unreadCount` из store (реактивный rerender).
    - dropdown с последними N уведомлениями — из store.
    - клик по item в dropdown → `store.markRead(id)`.
  - обновить `src/components/profile/notifications/NotificationsListPage.tsx`:
    - читает `notifications` и `unreadCount` из store.
    - первичный fetch при mount, если `!loaded` или `userId !== current`.
    - markRead через store, markAllRead через store.
  - guard от race: при смене userId (impersonation, login, logout) — `setUserId(newId)` в store → автоматический reset + fetch.
  - **AbortController** на pending fetch — abort при unmount или смене pathname.
  - **Стилизация:** SKILL frontend-design — Bell badge остаётся как в Phase 28 (orange dot/pill для unread), только источник данных меняется. Dropdown — `rounded-[18px]` + `shadow-floating`.

- **Проверка двумя паттернами:**
  - **Through-trace:** клик на уведомление в dropdown → `store.markRead` → state обновлён → Bell перерисован с (count − 1) → POST /api/notifications/[id]/read fires → server marks read → polling через 60s ничего не меняет.
  - **Edge-case audit:**
    - повторный клик по прочитанному → ранний return через `if (notification.readAt) return`, counter не уходит в минус;
    - logout/login — store.setUserId(newId) → reset();
    - server fail → revert + toast.

- **Тесты:**
  - unit store: `markRead` декрементит, повторный вызов идемпотентен, fail → revert.
  - unit store: `markAllRead` обнуляет, fail → revert.
  - unit store: `setUserId` со сменой → reset.
  - integration: NotificationBell рендерит счётчик из store.
  - integration: NotificationsListPage клик на item → store.markRead → Bell обновлён.
  - regression: все существующие тесты Bell и NotificationsListPage адаптированы под store-source-of-truth.

- **Риски и mitigations:**
  - **Race polling vs markRead** — polling overwrite локального декремента. Mitigation: `pendingOps` ref-flag в store, polling skip на этот цикл.
  - **Multi-tab inconsistency** — между вкладками не синхронизируется до polling. Принимаем как known limitation MVP, фиксируем в feature-docs.
  - **Polling sets unreadCount меньше реального количества unread в notifications array** — если вдруг сервер вернул меньше из-за гонки. Mitigation: store `setUnreadCount` принимает значение как-есть, единый источник — server. Локальные decrements — оптимистичные.
  - **Optimistic update без rollback** — server fail оставляет stale readAt 60s до polling. Mitigation: catch fail → revert (вернуть `readAt: undefined`, увеличить `unreadCount`) + toast.
  - **AbortController на unmount** — pending fetch при logout/смене pathname → race на set. Mitigation: AbortController в polling-хуке + cleanup в useEffect.
  - **Regression — Bell и NotificationsListPage не должны ломаться** — все существующие тесты адаптированы под новый store.

- **Ожидаемый результат:**
  - счётчик в колокольчике мгновенно убавляется при пометке уведомления прочитанным на странице или в dropdown.

### Step 29.3: Bulk и per-item delete уведомлений

- **Действие:**
  - расширить `src/lib/db.ts`:
    - `deleteNotifications(ids: number[]): Promise<{ deleted: number }>` — атомарная запись `notifications.json`. Empty array → no-op.
  - создать API endpoint `src/app/api/notifications/route.ts` (расширить если есть, либо новый файл) `DELETE`:
    - body Zod: `{ ids: number[], userId: number }`.
    - guard: silent filter — оставляем только id принадлежащие userId, удаляем их (не 403 на чужие).
    - возвращает `{ success: true, data: { deleted } }`.
  - расширить `useNotificationsStore`:
    - action `removeMany(ids)` — локальная фильтрация + пересчёт `unreadCount` (декремент на число удалённых **непрочитанных**, считается перед удалением).
    - на server fail → revert.
  - обновить `src/components/profile/notifications/NotificationsListPage.tsx`:
    - **per-item delete:**
      - на каждой карточке — иконка X (size-5, `text-muted hover:text-orange`), absolute top-right или в правой колонке header'а.
      - клик → открыть наш `Modal` «Удалить уведомление?» с двумя кнопками → confirm → DELETE → `store.removeMany([id])` → toast.
    - **режим выбора:**
      - кнопка-toggle «Выбрать» в шапке списка (рядом с «Прочитать все»).
      - в selection-mode — на каждой карточке чекбокс слева (size-5, lime accent).
      - кнопка «Удалить выбранное (N)» становится видимой; disabled если N=0.
      - клик → Modal «Удалить N уведомлений? Это действие нельзя отменить» → confirm → DELETE → `store.removeMany(selectedIds)` → выход из selection-mode + toast.
      - кнопка «Отмена» → выход + сброс checked.
    - **selection sticky cleanup:** useEffect на pathname → setSelectionMode(false) при размонтировании или смене страницы.
  - **Стилизация:** строго по `.claude/skills/frontend-design/SKILL.md`. Чекбоксы — lime accent + `rounded-[6px]` + border-line; X-иконка — `text-muted hover:text-orange transition-colors`; Modal — наш существующий компонент с `rounded-[24px]` + `shadow-floating` + UPPERCASE-заголовок Bowlby. Кнопка «Выбрать» — outline-pill по SKILL. Mobile-first: на 480 — кнопки full-width в столбик в Modal-footer.

- **Проверка двумя паттернами:**
  - **Through-trace:** click X → Modal → confirm → fetch DELETE → 200 → store.removeMany → list сокращается + bell counter падает (если был unread).
  - **Edge-case audit:**
    - удалить чужое уведомление через DevTools → silent filter, удаляется только своё, никаких 403;
    - bulk delete пустого списка → кнопка disabled;
    - двойной клик delete → idempotent: db.deleteNotifications не падает на ненайденных id;
    - удаление прочитанных → unreadCount не меняется;
    - server fail → revert в store + toast.

- **Тесты:**
  - unit `db.deleteNotifications`: удаляет правильные id, idempotent, empty array → no-op, атомарный write.
  - unit API DELETE: success, 400 invalid body, чужие id silent filtered.
  - unit store `removeMany`: фильтрует список, корректно декрементит unreadCount, fail → revert.
  - integration: per-item X → Modal → store обновлён.
  - integration: selection mode → bulk delete → all selected отфильтрованы.
  - regression: read/read-all flow по-прежнему работает.

- **Риски и mitigations:**
  - **Server guard "чужие ids" enumeration leak** — если возвращать 403 на чужие, юзер может проверить чужие id. Mitigation: silent filter, удаляем только свои.
  - **`window.confirm` ломает Phase 28 dark style** — Mitigation: используем наш Modal-компонент.
  - **Selection sticky после navigate** — selection-mode не сбрасывается при pathname change. Mitigation: useEffect cleanup.
  - **Decrement counter без rollback** — DELETE 500, локально removeMany уже выполнен. Mitigation: store removeMany сначала держит `pendingRemovedIds`, после API success → final remove; на fail → revert.
  - **Regression — Bell и NotificationsListPage не должны сломаться** — все тесты адаптированы.
  - **Empty notification list edge** — если удалили все, показать empty state (либо существующий, либо новый). Mitigation: проверить что `NotificationsListPage` корректно рендерит empty.

- **Ожидаемый результат:**
  - на странице уведомлений можно удалить одно уведомление через X или несколько через режим выбора. Удалённые физически уходят из `notifications.json`.

### Step 29.4: Уведомления при создании отзыва

- **Действие:**
  - расширить `NotificationType` в `src/types/index.ts`:
    - `'review_received_by_provider'` — провайдеру (владельцу клуба/тренера).
    - `'review_published_for_athlete'` — автору (атлету).
  - расширить группировку в `src/lib/notification-types.ts`:
    - groupKey `'reviews'` с label «Отзывы».
    - оба новых литерала входят в эту группу.
    - default `enabled: true` в notification-types-config.
  - копирайт в `src/lib/notification-copy.ts`:
    - `review_received_by_provider`:
      - title: «Получен новый отзыв».
      - body: «<authorName> оставил отзыв с оценкой <rating>★ для <entityName>».
      - link: `/clubs/[slug]#reviews` или `/trainers/[slug]#reviews`.
    - `review_published_for_athlete`:
      - title: «Ваш отзыв опубликован».
      - body: «Отзыв на <entityName> добавлен в общий список отзывов».
      - link: тот же.
  - триггер в `src/app/api/reviews/route.ts`:
    - после `createReview()` — резолв entity (club или trainer) для извлечения `ownerId` и `name`.
    - резолв `authorName` через `getUserById(review.userId)`.
    - 2 параллельных `notify()`:
      - получателю: с self-review guard `if (review.userId === ownerId) skip`.
      - автору: всегда.
    - fire-and-forget.
  - **Notification preferences guard:** проверить что `notify()` уже respects `user.notificationPreferences` (Phase 24). Если нет — добавить guard в `notify()` либо в `createNotification()`. Тест на disabled-preferences.
  - **Группа в UI:** на `/profile/{role}/notifications` групповой фильтр должен включать «Отзывы». Если фильтры жёстко прописаны в UI компоненте — обновить.
  - **Стилизация:** не нужно (Notification cards уже стилизованы; новые типы используют тот же template).

- **Проверка двумя паттернами:**
  - **Through-trace:** создал отзыв (POST /api/reviews) → createReview сохраняет → notify(ownerId) + notify(reviewerId) → notifications.json пополнился двумя записями → bell next polling +2 (или store push если live). Bell badge инкрементируется через polling/store.
  - **Edge-case audit:**
    - self-review через DevTools → notification получателю не отправляется (guard);
    - club/trainer без ownerId (orphan) → graceful skip с warn в console;
    - юзер с `notificationPreferences.reviews: false` → notify создаёт, но не показывает (или вообще не создаёт — зависит от текущей реализации `notify()`);
    - автор отзыва (user.id) удалён → notify к несуществующему userId silent (запись пишется, фронт не покажет — отфильтрован userId guard на /api/notifications GET).

- **Тесты:**
  - unit: notification-copy для обоих типов рендерит правильный текст.
  - integration: POST /api/reviews → 2 notifications в JSON (для ownerId + reviewerId).
  - integration: self-review (mock useId === ownerId) → только 1 notification (автору).
  - integration: notification preferences disabled → notification skipped (или не показывается).
  - regression: review-flow без ownerId не падает.
  - regression: existing booking/link уведомления не сломаны.

- **Риски и mitigations:**
  - **Notification preferences не respect'ятся** — если `notify()` не учитывает preferences, спам новых уведомлений всем подряд. Mitigation: проверить `notify()` имплементацию, при необходимости добавить guard.
  - **Группа UI-фильтра не показывает «Отзывы»** — если фильтры жёстко прописаны. Mitigation: grep по `groupKey`, обновить UI.
  - **Self-review guard может не сработать на edge cases** — например, атлет = club.ownerId (теоретически). Mitigation: явный `if` с явной проверкой типов.
  - **Дубликаты уведомлений на edit-review** — если в будущем POST → PATCH /api/reviews. Mitigation: notify только в POST handler, не в PATCH.
  - **Regression — review POST не должен падать на любых данных** — все существующие тесты прошли + добавленные.

- **Ожидаемый результат:**
  - после оставления отзыва провайдер видит +1 в bell с уведомлением «Получен новый отзыв», атлет — «Ваш отзыв опубликован».

### Step 29.5: User settings backend — db.updateUser + PATCH /api/users/[id]

- **Действие:**
  - расширить `src/lib/db.ts`:
    - `updateUser(id: number, patch: Partial<Pick<User, 'phone' | 'password'>>): Promise<User>`.
    - guards: `id` существует (404), `patch` не пустой (400).
    - merge: `{ ...user, ...patch }` (только поля из patch).
    - атомарная запись через существующий `writeCollection` (тот же atomic-pattern что у других updates).
    - возврат полного user.
  - создать `src/app/api/users/[id]/route.ts` → handler PATCH:
    - body Zod: `{ phone?: string, password?: string, currentPassword?: string }` — все optional.
    - валидация:
      - `phone` — соответствует существующей `phoneSchema` (если есть в `src/lib/schemas/`, иначе simple regex).
      - `password` — minLength 6.
      - если `password` присутствует → `currentPassword` обязателен (refine в Zod).
      - patch не пустой (хотя бы одно поле).
    - **Critical: server-side userId guard** — реализовать симметрично существующим PATCH-routes (изучить паттерн в Phase 24 endpoints, например `PATCH /api/users/[id]/notification-preferences`). Минимум: проверка `body.userId === params.id` + дополнительный guard через session-userId (если такой паттерн есть).
    - `currentPassword` check: `getUserById(id).password.trim() === body.currentPassword.trim()` (plain compare с trim, MVP) — иначе 401.
    - вызов `db.updateUser(id, sanitizedPatch)`.
    - sanitization ответа: omit `password` (через util-helper, например `omitPassword(user)`).
    - return `{ success: true, data: userSafe }`.
  - **Импер сонация guard на API:** проверка `body.userId === sessionUserId` (где sessionUserId — реальный, не impersonated). Конкретный механизм зависит от существующего auth-pattern.

- **Проверка двумя паттернами:**
  - **Through-trace:** UI form submit → PATCH /api/users/[id] body { phone, password, currentPassword, userId } → Zod → guard self → currentPassword check → db.updateUser → response → store update.
  - **Edge-case audit:**
    - patch пустой → 400 «Нет изменений».
    - currentPassword неверный при смене password → 401.
    - меняется только phone (без password) → currentPassword не требуется.
    - чужой id (DevTools tampering) → 403.
    - phone невалидный формат → 400.
    - password === currentPassword (новый = текущему) → принимаем (бессмысленно, но не запрещаем).

- **Тесты:**
  - unit `db.updateUser`: merge корректный, атомарность, ошибки на пустой patch / несуществующий id.
  - unit API PATCH: 200 happy (phone), 200 happy (password + currentPassword), 200 (phone + password), 400 invalid body, 401 wrong currentPassword, 403 not self, 400 empty patch, 404 user not found.
  - unit: trim в currentPassword compare работает.
  - regression: existing endpoints (`/api/users/[id]/notification-preferences`) не сломаны.

- **Риски и mitigations:**
  - **CRITICAL: userId из body — security hole** — если сервер берёт только из body, любой меняет кому угодно через DevTools. Mitigation: server-side проверка userId через тот же pattern, что и другие PATCH-endpoints. **Перед реализацией: обязательно изучить как работают existing endpoints**.
  - **Plain password trim** — `" pwd "` со случайным пробелом ломает compare. Mitigation: trim обеими сторонами.
  - **Concurrent updates (race)** — два запроса одновременно от одного юзера. Mitigation: db.ts `writeCollection` должен быть atomic (lockfile/mutex). Verify existing implementation.
  - **Sanitize response без password** — обязательно. Mitigation: util-helper `omitPassword` + тест что field отсутствует в response.
  - **Session invalidation после смены пароля** — нет (MVP). Юзер с новым паролем продолжает в текущей сессии. Документируется в `feature-docs/auth.md`.
  - **Regression — другие endpoints не должны сломаться** — все existing тесты прошли + новые.

- **Ожидаемый результат:**
  - backend готов принимать обновление phone и password от самого пользователя.

### Step 29.6: User settings UI — формы редактирования в ЛК

- **Действие:**
  - создать общий компонент `src/components/profile/shared/AccountCredentialsSection.tsx`:
    - props: `{ user: User, isImpersonating: boolean }`.
    - блок «Контактные данные» (read-only): email, name (всегда отображаются, без редактирования).
    - блок «Изменить телефон»: input с валидацией + submit.
    - блок «Изменить пароль»: 3 input'а (currentPassword, newPassword, confirmNewPassword) + submit.
    - **autocomplete attributes:**
      - currentPassword: `autocomplete="current-password"`.
      - newPassword + confirm: `autocomplete="new-password"`.
      - phone: `autocomplete="tel"`.
    - **password visibility toggle** на каждом password-input (eye icon, локальный useState).
    - Zod-валидация на клиенте — переиспользуем серверную schema (`import { updateUserSchema } from '@/lib/schemas/...'`).
    - submit → `await fetch PATCH /api/users/[id]` → wait response → on success: toast + update useAuthStore + reset password fields (3 поля → пустые); on error 401 → inline error на currentPassword + focus + toast; on other error → toast «Не удалось обновить» + поля сохранены.
    - **импер сонация:** если `isImpersonating === true` → формы заменяются на notice-плашку «Вы вошли как администратор. Изменение настроек этого пользователя возможно только из админ-панели». Submit-кнопки не рендерятся.
  - использовать `AccountCredentialsSection` в:
    - `src/components/profile/athlete/AthleteSettings.tsx` (или текущее имя компонента — найти grep'ом).
    - `src/components/profile/provider/ProviderSettings.tsx`.
  - удалить плашку «Редактирование будет доступно позже» (Step 29.5/29.6 закрывают её для phone+password).
  - **Стилизация:** строго по `.claude/skills/frontend-design/SKILL.md`. Inputs — `rounded-[12px]` + bg-card-2 + focus:border-lime; кнопка submit — `rounded-full` + bg-lime + UPPERCASE Oswald 700; eye-toggle — outline-button `rounded-full size-9` + lucide eye/eye-off; notice-плашка для impersonation — `rounded-[18px]` + border-orange + bg-orange-soft + текст orange. Mobile-first: на 480 — submit full-width, пароли в столбик; на 768+ — stacked block.

- **Проверка двумя паттернами:**
  - **Through-trace:** input → useState → submit → fetch PATCH → 200 → toast «Успешно» → useAuthStore.updateUser → re-render с новыми данными → password fields очищены.
  - **Edge-case audit:**
    - newPassword !== confirmNewPassword → клиентская валидация без fetch → inline error.
    - currentPassword неверный (server 401) → toast «Неверный текущий пароль» + поле currentPassword фокус + ошибка inline.
    - server fail (network) → toast «Не удалось обновить» + поля сохранены (НЕ reset).
    - impersonating + любой submit → форма не рендерит кнопки → submit невозможен.
    - submit одного только phone (без password) → currentPassword не требуется.

- **Тесты:**
  - unit `AccountCredentialsSection`: render обычный, render impersonating (без форм), валидация confirmNewPassword.
  - integration: submit phone → PATCH вызван с правильным body → store обновлён → toast.
  - integration: submit wrong currentPassword → toast error + fields сохранены + currentPassword фокус.
  - integration: impersonating mode → submit не вызывается.
  - regression: existing AthleteSettings / ProviderSettings не сломаны.
  - e2e via MCP в Step 29.8: change password → logout → login с новым → success.

- **Риски и mitigations:**
  - **autocomplete attributes пропущены** — password managers ломаются. Mitigation: explicit attributes на каждом field.
  - **Inline error vs toast** — wrong currentPassword только как toast → плохой UX. Mitigation: и toast, и inline под полем + автоматический фокус.
  - **Form reset после success** — если не очистить password-поля, юзер думает что их можно править. Mitigation: явный reset password fields, phone оставить.
  - **Optimistic update без rollback** — если useAuthStore оптимистично обновлён, но PATCH 500. Mitigation: для MVP wait response then update (не optimistic).
  - **Validation schema mismatch** — клиент и сервер используют разные Zod. Mitigation: импортируем ту же schema.
  - **Regression — других ЛК-страниц не ломаем** — `AthleteSettings`/`ProviderSettings` уже могут содержать другие секции (notification preferences и т.д.). Mitigation: добавляем нашу `AccountCredentialsSection` рядом, не заменяя; existing тесты прошли.

- **Ожидаемый результат:**
  - провайдер и атлет в своём ЛК на странице «Настройки» могут изменить телефон и пароль; e-mail и имя остаются read-only; при impersonation формы заблокированы с объяснением.

### Step 29.7: Админ-панель — credentials view + admin password reset

- **Действие:**
  - расширить `UserCard()` в `src/components/admin/DashboardPage.tsx` (lines ~486–547):
    - добавить блок «Учётные данные» внизу карточки (после bookings/publications stats).
    - login (= email): `font-mono` small, рядом optional «Скопировать».
    - password: `font-mono` small, по умолчанию `••••••••`. Toggle eye-icon — useState локальный. Empty password в seed → отображается `(не задан)`, eye-icon не рендерится. Long password — `break-all` (без overflow).
    - кнопка «Изменить пароль» → открывает модалку `AdminUpdatePasswordModal`.
  - создать `src/components/admin/AdminUpdatePasswordModal.tsx`:
    - props: `{ user: User, onClose, onSuccess }`.
    - использует существующий `Modal` (`rounded-[24px]` + `shadow-floating`).
    - inputs: newPassword + confirmNewPassword (оба с visibility toggle).
    - Zod-валидация: newPassword min 6, equal confirm.
    - submit → `PATCH /api/admin/users/[id]/password` body `{ newPassword }` → toast → onSuccess + close.
    - **autocomplete:** `new-password`.
  - создать API endpoint `src/app/api/admin/users/[id]/password/route.ts`:
    - method PATCH.
    - body Zod: `{ newPassword: string }` (min 6).
    - **admin-only guard** — переиспользовать существующий pattern (как другие admin endpoints в Phase 17/24).
    - вызов `db.updateUser(params.id, { password: newPassword })`.
    - **Логирование:** `await logAction({ type: 'admin_password_change', actorId: adminUserId, targetUserId: params.id, meta: {} })` — fire-and-forget.
    - response: `{ success: true }`.
  - добавить в `LogAction` (в `src/types/index.ts`) значение `'admin_password_change'`.
  - обновить `src/lib/log-actions.ts` (или `notification-types.ts` — где-то централизованный список) — добавить label «Смена пароля админом».
  - **Стилизация:** строго по `.claude/skills/frontend-design/SKILL.md`. Блок credentials — `font-mono` `text-[12px]` для значений; eye-toggle — outline `rounded-full`; кнопка «Изменить пароль» — primary outline lime. Modal — наш существующий компонент. Mobile-first: на 480 — кнопки в Modal-footer full-width.

- **Проверка двумя паттернами:**
  - **Through-trace:** admin tab «Пользователи» → UserCard → eye-toggle показывает password → клик «Изменить пароль» → Modal → submit → PATCH /api/admin/users/[id]/password → log записан → toast → modal closed.
  - **Edge-case audit:**
    - не-admin (атлет/провайдер) пытается дёрнуть PATCH /api/admin/users/[id]/password → 403.
    - newPassword === confirmNewPassword проверяется клиентски, кнопка disabled.
    - newPassword < 6 chars → Zod 400.
    - empty password в seed → toggle disabled, кнопка «Изменить пароль» работает (admin задаёт впервые).
    - password >50 chars → break-all, не ломает UI.

- **Тесты:**
  - unit `UserCard`: блок credentials отображается, toggle меняет visibility, empty password → `(не задан)`.
  - unit `AdminUpdatePasswordModal`: render, валидация, submit вызывает onSuccess.
  - unit API `PATCH /api/admin/users/[id]/password`: 200 happy, 403 не-admin, 400 invalid body, 404 user not found.
  - integration: admin меняет пароль → log запись `admin_password_change` создана.
  - regression: остальной DashboardPage UserCard не сломан, прочие admin-actions работают.

- **Риски и mitigations:**
  - **Audit log mandatory** — без log-записи смена пароля админом невидима. Mitigation: `logAction()` обязательный, тест на наличие записи.
  - **Password в DOM при toggle** — screen-share leak. Mitigation: фиксируется в `feature-docs/admin.md` как known-limitation MVP. Не реализуем дополнительные защиты.
  - **Long password break** — `break-all` обязательно.
  - **Modal escape close** — наш Modal должен поддерживать. Если нет — добавить.
  - **Empty password edge** — toggle disabled, кнопка «Изменить пароль» работает.
  - **Regression — DashboardPage не ломаем** — карточка получает дополнительный блок снизу, остальные работают как раньше; existing тесты прошли.

- **Ожидаемый результат:**
  - super-admin видит email и пароль каждого пользователя в его карточке (с toggle), может изменить пароль через модалку, действие логируется.

### Step 29.8: E2E через Playwright MCP + sync доков

- **Действие:**
  - запустить Playwright MCP, прогнать на 480 и 1440 следующие сценарии:
    1. **Map theme toggle.** Открыть `/`, найти toggle в правом верхнем углу карты. Клик → переключение dark (`grayscale(1) invert(1)`). F5 → выбор сохранён. Маркеры остаются в своих цветах (counter-invert работает). На 480 — toggle не перекрывает контролы.
    2. **Bell counter dynamic.** Войти как athlete с N>0 unread. Клик на одно уведомление в dropdown → счётчик мгновенно (count − 1). Клик на пометку «Прочитать все» на странице — счётчик 0 без ожидания polling.
    3. **Per-item delete.** Открыть `/profile/athlete/notifications`. Клик X на карточке → Modal → confirm → DELETE → счётчик и список обновлены.
    4. **Bulk delete.** Кнопка «Выбрать» → отметить 2 → «Удалить выбранное (2)» → Modal → confirm → удаление + счётчик.
    5. **Review notification (provider side).** Login as athlete → оставить отзыв на club → logout → login как owner club → bell badge +1 → открыть, увидеть «Получен новый отзыв».
    6. **Review notification (athlete side).** Login back as athlete → bell badge +1 → открыть, увидеть «Ваш отзыв опубликован».
    7. **Settings phone change.** `/profile/{role}/settings` → изменить phone → toast success → reload → новый phone отображается.
    8. **Settings password change.** Тот же экран → change password (currentPassword + newPassword + confirm) → toast → logout → login с новым паролем → success.
    9. **Wrong currentPassword.** Submit password change с неверным currentPassword → toast error + inline error + currentPassword фокус.
    10. **Settings под impersonation.** Login admin → impersonate athlete → `/profile/athlete/settings` → формы заблокированы с notice.
    11. **Admin credentials view.** Login admin → `/service-portal/dashboard` → tab «Пользователи» → UserCard → eye-toggle показывает password.
    12. **Admin password reset.** Тот же UserCard → клик «Изменить пароль» → Modal → submit → toast → log запись `admin_password_change` создана.
  - все сценарии — pass.
  - закрыть browser.

  **После E2E — синхронизировать документы:**
  - `CLAUDE.md` — секция «Текущее состояние»: `Phase 29 ✅ ЗАВЕРШЕНА`, последний завершённый шаг 29.8.
  - `PHASES_OVERVIEW.md` — Phase 29 → ✅, краткое описание результата.
  - `project-phases/phase-29.md` (этот файл) — статус ✅, чеклист все галочки.
  - `PROJECT_STATE.md`:
    - новые компоненты: `MapThemeToggle`, `AccountCredentialsSection`, `AdminUpdatePasswordModal`.
    - новые stores: `useNotificationsStore`, `useMapThemeStore`.
    - новые API: `DELETE /api/notifications`, `PATCH /api/users/[id]`, `PATCH /api/admin/users/[id]/password`.
    - новые типы: `review_received_by_provider`, `review_published_for_athlete`, `LogAction.admin_password_change`.
  - `STACK_OVERVIEW.md` — заметка про CSS-фильтр карты как замену native theme API.
  - `README.md` — Phase 29 → ✅, краткое описание.
  - `feature-docs/notifications.md` — обновить: новые типы review_*, bulk delete + per-item delete, dynamic bell counter через store.
  - `feature-docs/auth.md` — обновить: PATCH /api/users/[id] (phone, password только сам себе), MVP-ограничение settings под impersonation, admin password reset через `/api/admin/users/[id]/password`, password остаётся plain до Phase 30+, нет session invalidation после смены пароля.
  - `feature-docs/admin.md` — обновить: блок credentials в UserCard, admin password reset action, новый LogAction `admin_password_change`, known-limitation про password-in-DOM при toggle.
  - `feature-docs/yandex-maps.md` — обновить: тема через CSS-фильтр `grayscale(1) invert(1)`, toggle UI, persist в localStorage, counter-invert маркеров.
  - `feature-docs/_overview.md` — если затронуты связи между доменами (notifications ↔ reviews) — обновить карту.

- **Проверка:**
  - все 12 сценариев Playwright прошли.
  - все 8 документов и feature-docs обновлены.
  - `npm run format / lint / test / build` зелёные.

- **Риски и mitigations:**
  - **Polling timing flaky** — bell counter test может пройти/не пройти из-за polling 60s. Mitigation: `await waitFor` с явным timeout 2-3s + проверка изменения counter до polling.
  - **Login flow в MVP** — login через AuthModal с email+password (Phase 26+). Тест должен делать full login, не хардкод userId.
  - **MCP стабильность** — если dev server перезапускается, MCP падает. Mitigation: один прогон, при падении — перезапустить.
  - **Filter-значения dark map не оптимальны** — если визуально не понравится `grayscale(1) invert(1)`, поправить итеративно через MCP. План фиксирует базовый рабочий вариант.
  - **Regression — все existing-тесты должны пройти** — `npm run test` зелёный.

- **Ожидаемый результат:**
  - Phase 29 ✅ ЗАВЕРШЕНА.

---

### Чеклист

**Map theme (Step 29.1):** ✅ commit `603da28`

- [x] `useMapThemeStore.ts` создан с persist в localStorage
- [x] `MapThemeToggle` компонент с mounted-flag (защита от SSR-mismatch)
- [x] Toggle смонтирован в `MainMap` как absolute sibling **снаружи** filter-контейнера
- [x] `[data-map-theme="dark"] canvas { filter: grayscale(1) invert(1); }` в globals.css (фильтр **только на canvas** после fix-коммита `02a6b07` — маркеры остаются в исходных цветах без counter-invert)
- [x] Стилизация по SKILL frontend-design (`rounded-full`, lime hover, mobile-first)

**Notifications store + dynamic bell (Step 29.2):** ✅ commit `01620bc`

- [x] `useNotificationsStore.ts` создан (state + actions: setNotifications, markRead, markAllRead, removeMany, setUserId, reset)
- [x] `useUnreadCountPolling` пишет в store + merge-логика через `pendingOps`
- [x] `NotificationBell` подписан на store
- [x] `NotificationsListPage` подписан на store
- [x] Optimistic markRead с revert на server fail
- [x] AbortController на pending fetch
- [x] Reset store при смене userId

**Bulk + per-item delete (Step 29.3):** ✅ commit `00252b8`

- [x] `db.deleteNotifications(ids)` атомарная
- [x] `DELETE /api/notifications` с silent filter (только свои)
- [x] `store.removeMany(ids)` с revert на fail
- [x] Per-item X на карточке + наш Modal для подтверждения
- [x] Режим «Выбрать» с чекбоксами + кнопка «Удалить выбранное (N)»
- [x] Selection-mode сбрасывается при pathname change
- [x] Стилизация по SKILL (lime checkboxes, orange X-icon, наш Modal)

**Review notification (Step 29.4):** ✅ commit `ce3b689`

- [x] `NotificationType` расширен: `review_received_by_provider`, `review_published_for_athlete`
- [x] Группа `'reviews'` в `notification-types.ts`
- [x] Копирайт в `notification-copy.ts` для обоих типов
- [x] Триггер в `POST /api/reviews` (2 notify: получателю + автору)
- [x] Self-review guard
- [x] Notification preferences respect'ятся
- [x] UI-фильтр группы «Отзывы» работает на странице уведомлений

**Settings backend (Step 29.5):** ✅ commit `f6f7260`

- [x] `db.updateUser(id, patch)` атомарная (phone + password)
- [x] `PATCH /api/users/[id]` с Zod-валидацией
- [x] Server-side userId guard (через существующий MVP-pattern)
- [x] currentPassword check с trim
- [x] Sanitize response (omit password)
- [x] Импер сонация: API игнорирует impersonated userId

**Settings UI (Step 29.6):** ✅ commit `7b32fb2` + fix `02a6b07`

- [x] `AccountCredentialsSection` компонент (email/имя/тип read-only, phone inline-edit, password collapsible)
- [x] autocomplete attributes (current-password, new-password, tel)
- [x] Password visibility toggle на каждом password-input
- [x] Inline error + toast + currentPassword фокус на 401
- [x] Form reset password fields после success
- [x] Импер сонация: notice-плашка вместо форм
- [x] Применён в `AthleteSettings` и `ProviderSettings`
- [x] **Fix-коммит `02a6b07`:** старый дублирующийся блок «Базовые настройки» удалён и объединён с `AccountCredentialsSection` в один компактный компонент; password-секция переведена в collapsible (по умолчанию свернута, кнопка-trigger «Сменить пароль» раскрывает форму)
- [x] Стилизация по SKILL (rounded-[12px] inputs, lime submit, orange notice)

**Admin credentials + password reset (Step 29.7):** ✅ commit `6a465a2`

- [x] Блок «Учётные данные» в `UserCard()`
- [x] Login (email) `font-mono`
- [x] Password masked + eye-toggle (empty → `(не задан)`)
- [x] Кнопка «Изменить пароль» открывает Modal
- [x] `AdminUpdatePasswordModal` (newPassword + confirm)
- [x] `PATCH /api/admin/users/[id]/password` с admin-guard
- [x] `LogAction.admin_password_change` логируется
- [x] Стилизация по SKILL

**E2E + sync доков (Step 29.8):** ✅ (manual-проверка пользователем + sync доков; полноценный Playwright MCP-прогон отложен в Phase 30 как часть E2E-аудита)

- [~] 12 сценариев Playwright — manual прохождение пользователем по чек-листу: 5 ✅ + 2 правки → fix-коммит `02a6b07`. Полный MCP-прогон отложен на стадию Phase 30 (где E2E будет частью верификации каждого шага).
- [x] `format / lint / test / build` зелёные на момент коммитов 29.1–29.7
- [x] `CLAUDE.md` синхронизирован (Phase 29 ✅, Phase 30 активная)
- [x] `PHASES_OVERVIEW.md` синхронизирован (Phase 29 → ✅, Phase 30 → 🔄)
- [x] `PROJECT_STATE.md` синхронизирован (новые stores / API / компоненты / типы)
- [x] `README.md` синхронизирован (Phase 29 ✅, Phase 30 запланирована)
- [x] `STACK_OVERVIEW.md` синхронизирован (упоминание map theme через CSS-фильтр)
- [x] `feature-docs/notifications.md` обновлён (Phase 29 запись + новые типы review_*, store, bulk delete)
- [x] `feature-docs/auth.md` обновлён (PATCH /api/users/[id], MVP-ограничение под impersonation, MVP-password остаётся plain до Phase 30+)
- [x] `feature-docs/admin.md` обновлён (credentials view, admin password reset, log_action_admin_password_change, known-limitation про password-in-DOM)
- [x] `feature-docs/yandex-maps.md` обновлён (dual-theme через CSS-фильтр **только на canvas**, persist в localStorage, маркеры остаются в исходных цветах)

**Выполнено:** Step 29.1 ✅, Step 29.2 ✅, Step 29.3 ✅, Step 29.4 ✅, Step 29.5 ✅, Step 29.6 ✅, Step 29.7 ✅, Step 29.8 ✅

**Следующий шаг:** переход на Phase 30 — `git checkout -b phase-30` от `phase-29`, затем Step 30.1 — `router.refresh()` после `adminLogin()` в `ServicePortalLoginForm.tsx`.

**Статус Phase 29:** ✅ ЗАВЕРШЕНА (8 шагов 29.1–29.8 + fix-коммит `02a6b07` по итогам ручной проверки пользователем)

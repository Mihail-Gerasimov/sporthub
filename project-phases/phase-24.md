# Phase 24

> Этот файл содержит одну фазу проекта целиком. Главный вход в контекст — `CLAUDE.md`.
> Навигация по фазам — через `PHASES_OVERVIEW.md`.
> В ежедневной работе открывай прежде всего активную фазу и не перечитывай все phase-файлы подряд без необходимости.
> Структура фазы сохраняется в исходном стиле: заголовок фазы, краткий результат, шаги по порядку, затем чеклист и статус.
> Перед стартом новой фазы проверь, что для неё уже есть отдельный `phase-XX.md`, и после завершения шагов или фазы синхронизируй статус здесь, в `PHASES_OVERVIEW.md`, `CLAUDE.md`, `README.md` и при необходимости в `STACK_OVERVIEW.md`.

## Phase 24: Дисциплина и обязательства — FSM, надёжность, двусторонняя привязка, уведомления

> После этой фазы: booking становится полноценным обязательством с конечным автоматом состояний (8 статусов, полная история переходов, snapshot cancellation-policy). У клубов, тренеров и спортсменов появляется рейтинг надёжности с дисциплинарными последствиями (карантин, бейджи warning/danger). Привязка тренера к клубу перестаёт быть односторонним флагом — становится двусторонним запросом с состояниями pending/confirmed/rejected/revoked. Тренер получает возможность параллельно вести и услуги в клубе, и частные услуги с разными ценами и policy (multi-offering). Ключевые события платформы доходят до пользователя через новую сущность уведомлений и bell-icon в шапке. Собственные действия пользователя подтверждаются toast-стеком.

Phase 24 переосмысляет ядро платформы — жизненный цикл взаимодействия между провайдером и спортсменом. Текущий booking-flow работает как простое «записался / отменился», без различения сценариев (late cancel, no-show, отказ провайдера, факт проведения), с hard-delete при отмене. Это создаёт «серую зону», в которой обе стороны могут вести себя недобросовестно без видимых последствий. Phase 24 закрывает эту зону: каждое действие фиксируется как переход в конечном автомате, каждое нарушение отражается на репутации, каждое критичное событие доставляется уведомлением, а у Super Admin появляются аварийные рычаги на все новые механики.

Фаза сознательно **не** включает в себя реальные платежи и страховые депозиты. Все дисциплинарные механики работают на уровне репутации, статусов и soft-блокировок. Каркас проектируется так, чтобы при подключении платежей в будущем policy отмены легко расширялась денежными последствиями без переделки FSM.

**Пререквизит:** Phase 16 (booking-flow MVP), Phase 17 (Super Admin), Phase 20 (логи), Phase 22 (модерация/booking protection), Phase 23 (справочники и publish-flow) завершены.

---

### Ключевые решения

**FSM booking'а как ядро дисциплины:**

- `BookingStatus` расширяется с 4 до **8 значений**: `pending | confirmed | completed | no_show | unmarked | rejected_by_provider | cancelled_by_athlete | cancelled_by_provider`. Старое значение `cancelled` удаляется, данные сидов мигрируются.
- `Booking` получает новые поля: `statusHistory: BookingStatusTransition[]` (каждая запись — `{ from, to, actor, actorUserId, at, reason? }`), `cancellationPolicySnapshot: CancellationPolicy`, `cancelledBy?`, `cancelReason?: 'on_time' \| 'late'`, `completedAt?`.
- Каждый переход логируется в `statusHistory` с `actor: 'athlete' \| 'provider' \| 'admin' \| 'system'` и timestamp'ом. Это единая история правды — из неё читает и админ, и аналитика, и рейтинг надёжности.

**Стартовый статус — всегда `pending`:**

- `createBookingAtomic()` перестаёт жёстко ставить `confirmed`. Каждая новая запись создаётся в `pending`, ждёт явного подтверждения провайдером.
- Провайдер обязан подтвердить или отклонить заявку в окне времени до слота. По истечении окна (по умолчанию **1 час до начала слота**) ленивая проверка переводит запись в `cancelled_by_provider` с `actor: 'system'` и уведомляет обе стороны.
- Комментарий MVP «запись сразу confirmed, pending зарезервирован» снимается — pending теперь основной стартовый статус.

**`DELETE /api/bookings/[id]` становится soft-cancel:**

- Для атлета — `transitionBooking(id, 'cancelled_by_athlete', 'athlete', reason='on_time'|'late')`. Запись физически сохраняется.
- Hard-delete остаётся **только** как админский инструмент на отдельном эндпоинте `DELETE /api/admin/bookings/[id]` с admin-guard. Публичный DELETE `/api/bookings/[id]` всегда soft.
- Публичная семантика для клиента не меняется («Отменить запись»), но данные живут в базе как источник правды для рейтинга.

**Cancellation policy — snapshot на момент создания:**

- Новый enum `CancellationPolicy = 'free_anytime' | 'free_until_24h' | 'free_until_2h' | 'no_refund'`.
- Поле `Offering.cancellationPolicy` добавляется. Опциональное в TypeScript-типе для совместимости с seed, обязательное в Zod при create/edit, read-fallback `free_until_24h`.
- При создании booking'а policy клонируется в `Booking.cancellationPolicySnapshot`. Задним числом ужесточить условия нельзя.
- Окна бесплатной отмены:

| Policy | Окно бесплатной отмены | Поведение late-cancel |
|--------|-----------------------|----------------------|
| `free_anytime` | ∞ | невозможно (все отмены on_time) |
| `free_until_24h` | 24 часа до слота | за 24h до слота и позднее → `late` |
| `free_until_2h` | 2 часа до слота | за 2h до слота и позднее → `late` |
| `no_refund` | 0 часов | любая отмена → `late` |

**Check-in провайдером (`completed` / `no_show`):**

- Check-in выполняется провайдером вручную и **только после окончания слота**, в окне **48 часов** после `endTime`.
- Не закрытые вовремя booking'и автоматически переходят в `unmarked` через ленивую проверку (`actor: 'system'`) — это отдельная финальная ветка, которая не считается ни как проведение, ни как no_show; это сигнал провайдеру, что слот был забыт.
- `no_show` влияет на рейтинг надёжности атлета, `completed` — на рейтинг клуба/тренера, `unmarked` на рейтинг никого не влияет, но учитывается в админских аналитиках.

**Правила `bookedCount` при FSM:**

`Schedule.bookedCount` перестаёт быть «числом записей в bookings.json» и становится «числом фактически занятых мест». Правила:

| Переход | `bookedCount` |
|---------|---------------|
| `pending → confirmed` | не трогаем |
| `pending → rejected_by_provider` | декремент |
| `pending → cancelled_by_athlete` | декремент |
| `confirmed → cancelled_by_athlete` (on_time/late) | декремент |
| `confirmed → cancelled_by_provider` | декремент |
| `confirmed → completed` | не трогаем (слот прошёл) |
| `confirmed → no_show` | **не** декрементируем (место было занято) |
| `confirmed → unmarked` (авто) | не трогаем |
| Создание booking'а (`pending`) | инкремент |

**Ленивые автопереходы без cron:**

- Единая функция `runLazyBookingTransitions()` в `db.ts`. Идемпотентная, безопасна при повторных вызовах.
- Вызывается ровно в 3 точках:
  - `GET /api/bookings`,
  - `src/app/profile/athlete/page.tsx` (до чтения bookings в SSR),
  - `src/app/profile/provider/page.tsx` (до чтения bookings в SSR).
- Сканирует booking'и и триггерит:
  - `pending` → `cancelled_by_provider` (system) если `now >= startAt - 1h` и не подтверждён,
  - `confirmed` → `unmarked` (system) если `now > endAt + 48h` и не закрыт.
- Каждый авто-переход пишет запись в `statusHistory` с `actor: 'system'` и отправляет уведомление.

**API переходов — отдельные action-endpoints:**

- Каждый переход — отдельный route, тонкая обёртка над `transitionBooking()`:
  - `POST /api/bookings/[id]/confirm` (provider)
  - `POST /api/bookings/[id]/reject` (provider, body `{ reason? }`)
  - `POST /api/bookings/[id]/cancel` (athlete; provider с другой ролью — свой guard)
  - `POST /api/bookings/[id]/check-in` (provider, body `{ outcome: 'completed' | 'no_show' }`)
- Соответственно `PATCH /api/bookings/[id]` не вводится. Каждый роут имеет собственный role-guard и собственный лог, тестируется изолированно.

**Двусторонняя привязка тренер↔клуб — единственный источник правды:**

- Поля `Trainer.affiliatedClubId`, `Trainer.clubId` (STUB), `Offering.affiliatedClubId` **удаляются** из `src/types/index.ts`. Все 5+ точек чтения (trainer detail page, club detail page, trainer-preview, filterTrainers, API routes) мигрируют на новую коллекцию.
- Новая коллекция `trainer-club-links.json`. Тип `TrainerClubLink = { id, trainerId, clubId, status, initiatedBy: 'trainer'|'club', createdAt, approvedAt?, rejectedAt?, revokedAt?, revokedBy? }`.
- Статусы: `pending` (тренер отправил запрос), `confirmed` (клуб подтвердил), `rejected` (клуб отказал), `revoked` (любая сторона разорвала confirmed-связь).
- Публичная связь отображается только при `status === 'confirmed'`. Пока `pending/rejected/revoked` — тренер публично показывается как независимый.
- Один тренер — один клуб на момент времени (active link). Повторные requests после rejected/revoked допустимы как новые записи (история сохраняется).

**Multi-offering тренера:**

- `Trainer` перестаёт быть «одна offering = одна сущность». Один тренер может иметь N offerings.
- Новое поле `Offering.trainerClubLinkId?: EntityId` — ссылка на confirmed-link, если услуга оказывается «в клубе». Если поле отсутствует — услуга частная, подаётся от своего лица.
- У каждой offering свой `cancellationPolicy`, своя цена, свой формат, своё расписание, свои контакты по adresa. Это позволяет тренеру Вадиму иметь «групповая йога в клубе Амстафф, 1000₽, free_until_24h» и «персональная дома, 3000₽, free_until_2h» одновременно.
- `PublishTrainerModal` переделывается на секцию «Список услуг» — аккордеон с кнопкой «+ Добавить услугу». Каждая карточка услуги — свой полный блок полей.
- `TrainerDirectoryItem` мультиплицируется: в каталоге карточка тренера показывает `«от X₽ • N услуг»` или разворачивает мини-список. `filterTrainers` работает по массиву offerings.
- **Это крупный подраздел фазы** — занимает два отдельных Step'а (24.10 данные, 24.11 публичные поверхности).

**Рейтинг надёжности — три публичные функции:**

- `src/lib/reliability.ts` содержит три функции: `computeClubReliability`, `computeTrainerReliability`, `computeAthleteReliability`. Все считают на лету из `bookings.json` через фильтр по `ownerId / userId`.
- Рейтинги **никогда** не хранятся в entity. Источник правды — всегда bookings. Допустимо кэшировать агрегаты в памяти на время одного SSR-запроса.
- Рейтинг качества (средняя оценка из отзывов) и рейтинг надёжности — **два разных показателя**. Не смешиваются.
- Рейтинг юзера-провайдера как суммарный агрегат — не публикуется. Только админу в Dashboard.
- **Владелец видит свой рейтинг в ЛК:** атлет — свой athlete-rating, провайдер-club_owner — рейтинг каждого своего клуба и тренера, с расшифровкой.

**Бейджи и пороги (один режим для всех):**

- Бейджи надёжности публично применяются только при `completedCount >= 5`. До этого — нейтральная плашка «Новый пользователь», без цифр.
- Пороги: `warning` при completionRate < 90%, `danger` при completionRate < 75%.
- Все пороги (минимум для бейджа, процентные пороги warning/danger, окно карантина, минимум no_show для карантина) живут в **одном конфиге** `src/lib/discipline-config.ts`, а не разбрасываются по коду.
- **Grace-период для новичков отсутствует.** Карантин срабатывает по одному правилу для всех, включая новых пользователей с 0 completed. Это осознанное решение — защитить платформу от абьюза новичками-троллями. Super Admin имеет инструмент снятия карантина для спорных случаев.

**Карантин атлета (soft-блокировка):**

- Условие: 3 `no_show` подряд за последние 30 дней (последовательность прерывается первым `completed`).
- Последствие: карантин 7 дней — запрет на создание новых booking'ов. Существующие не трогаются.
- Проверка — вычисляемая, не хранится в `User`. `isAthleteInQuarantine(bookings, userId, config) → { inQuarantine, until, reason }` в `reliability.ts`.
- Guard в `POST /api/bookings` → 403 с объяснением и датой снятия.
- Уведомления `quarantine_start` и `quarantine_end` (по факту прохождения 7 дней при следующем чтении).
- UI-плашка в `/profile/athlete` на время карантина с текстом, датой снятия и ссылкой «как восстановить репутацию».

**Late-cancel — осознанная warning-модалка:**

- При попытке атлета отменить `confirmed`-запись за окном snapshot-policy — показывается модалка с явным текстом: «Эта отмена будет засчитана как поздняя и повлияет на ваш рейтинг надёжности». Не запрет — только осознанное подтверждение.
- При подтверждении переход `confirmed → cancelled_by_athlete` с `cancelReason: 'late'`. Внутри окна — `reason: 'on_time'`.

**Уведомления — новая сущность с polling, архитектурно готово к SSE:**

- Новая коллекция `notifications.json`, тип `Notification = { id, userId, type: NotificationType, payload, readAt?, createdAt }`.
- Типы Phase 24 (минимум): `booking_confirmed`, `booking_rejected`, `booking_cancelled_by_athlete`, `booking_cancelled_by_provider`, `booking_completed`, `booking_no_show`, `booking_auto_expired`, `link_requested`, `link_approved`, `link_rejected`, `link_revoked`, `quarantine_start`, `quarantine_end`, `quarantine_lifted_by_admin`.
- API: `GET /api/notifications`, `POST /api/notifications/[id]/read`, `POST /api/notifications/read-all`, `GET /api/notifications/unread-count`.
- Хелпер `notify(userId, type, payload)` в `src/lib/notify.ts` — вызывается из `transitionBooking` и link-переходов. Fire-and-forget.
- Bell-icon в `Header.tsx` с счётчиком непрочитанных. Polling — при смене route через `usePathname`, а не `setInterval`. Dropdown с последними N уведомлениями. Два маршрута `/profile/athlete/notifications` и `/profile/provider/notifications` — плоский список, отметка прочитанным по клику. Фильтры и настройки — Phase 25.
- При impersonation bell читает `useAuthStore().user` — т.е. показывает уведомления impersonated user (админ видит то же, что реальный юзер).
- Архитектурно: `notify()` не знает, как именно доставляется. Payload серийализуем. Переход на SSE / WebSocket в будущем — замена клиентской стороны без правок серверной.

**Toast-стек для собственных действий:**

- Новый `src/stores/useToastStore.ts` (Zustand): `toasts: Toast[]`, `addToast({ message, tone, duration })`, `dismissToast(id)`. Auto-dismiss 4 сек. Tone: `info | success | warning | error`.
- Новый компонент `src/components/ui/ToastStack.tsx` — монтируется в `AppShell`, рендерит очередь в том же углу, что и прежний `ActionNotice`.
- Существующий `ActionNotice` и все точки его использования (booking-action-block, athlete-upcoming-booking-card, publish-модалки) мигрируют на `addToast(...)`. Локальный state `notice` в компонентах убирается.
- Это ровно тот же паттерн, что и существующие `useAuthStore / useFilterStore / useUIStore` — единообразно, переносимо на SSE push в будущем.

**Super Admin — аварийные рычаги на все новые механики:**

- Просмотр полной `statusHistory` любого booking'а (клик по booking-строке в `DashboardPage` или отдельный раздел — открывает drawer с таймлайном переходов).
- Ручной пересчёт рейтинга пользователя (точечный инструмент, если кэш разъехался).
- Снятие карантина со спортсмена (endpoint + UI в карточке пользователя на Dashboard).
- Принудительный `revoke` привязки тренер↔клуб от лица платформы (любой стороны), например при разборе жалоб.
- Просмотр всех уведомлений системы для отладки.
- Новые значения `LogAction` (14 шт.): `booking_confirm`, `booking_reject`, `booking_check_in_completed`, `booking_check_in_no_show`, `booking_auto_expire`, `link_request`, `link_approve`, `link_reject`, `link_revoke`, `quarantine_start`, `quarantine_end`, `quarantine_admin_lift`, `reliability_recompute`, `admin_hard_delete_booking`.
- Все админские действия логируются через существующий `logAction()` (fire-and-forget).

**Синхронизация документации по ходу фазы:**

- **4 новых доменных файла** уже созданы как skeleton-шаблоны: `feature-docs/booking-lifecycle.md`, `feature-docs/reliability.md`, `feature-docs/notifications.md`, `feature-docs/trainer-club-link.md`. Каждый Step наполняет разделы соответствующего файла сразу после завершения шага (по правилу CLAUDE.md: «после каждого шага синхронизируй feature-docs»).
- **Существующие доменные файлы к обновлению**: `feature-docs/booking.md`, `feature-docs/admin.md`, `feature-docs/data-layer.md`, `feature-docs/publish-flow.md`, `feature-docs/auth.md`, `feature-docs/_overview.md`. Обновление — по мере того, как Step затронул соответствующий домен, не копить до финала.
- `feature-docs/yandex-maps.md` — Phase 24 не затрагивает, не трогаем.
- Финальная сверка и полировка всех 10 файлов (4 новых + 6 существующих) — в Step 24.16.

**Область работы (Scope-Guard):**

В Phase 24 входит:

- Booking FSM + soft-cancel + admin hard-delete.
- Snapshot cancellation policy + 4 preset'а.
- Check-in, ленивые автопереходы (1 функция, 3 точки вызова).
- TrainerClubLink с полным удалением `affiliatedClubId`.
- Multi-offering тренера (данные + форма + публичные поверхности).
- Рейтинг надёжности (3 функции, бейджи, карантин).
- Уведомления (сущность, API, bell, dropdown, `/profile/*/notifications`).
- Toast-стек.
- Super Admin инструменты на все механики.

В Phase 24 **НЕ** входит:

- Реальные платежи, депозиты, возвраты.
- Email / SMS / Push-уведомления. Только in-app.
- Настройки уведомлений для пользователя (фильтры, группировки, отключение типов) — Phase 25.
- Реалтайм-доставка через SSE/WebSocket (архитектурная готовность есть, имплементация отложена).
- Полноценный раздел модерации привязок с фильтрами/пагинацией — в Phase 24 аварийный raw-интерфейс, полноценный UI — Phase 25.
- Кэширование агрегированных рейтингов в БД — считаем на лету.

---

### Step 24.1: Foundations — типы FSM, новые сущности, discipline-config

- **Действие:**
  - в `src/types/index.ts`:
    - расширить `BookingStatus` до 8 значений: `'pending' | 'confirmed' | 'completed' | 'no_show' | 'unmarked' | 'rejected_by_provider' | 'cancelled_by_athlete' | 'cancelled_by_provider'`. Удалить старое `'cancelled'`.
    - новые union'ы: `BookingActor = 'athlete' | 'provider' | 'admin' | 'system'`, `CancellationPolicy = 'free_anytime' | 'free_until_24h' | 'free_until_2h' | 'no_refund'`, `CancelReason = 'on_time' | 'late'`, `NotificationType` (14 значений из Ключевых решений), `TrainerClubLinkStatus = 'pending' | 'confirmed' | 'rejected' | 'revoked'`.
    - новый интерфейс `BookingStatusTransition = { from: BookingStatus | null; to: BookingStatus; actor: BookingActor; actorUserId?: EntityId; at: ISODateTimeString; reason?: string }`.
    - расширить `Booking`: `statusHistory: BookingStatusTransition[]` (обязательное, массив может быть пустым только до первой транзакции), `cancellationPolicySnapshot: CancellationPolicy` (обязательное), `cancelledBy?: BookingActor`, `cancelReason?: CancelReason`, `completedAt?: ISODateTimeString`.
    - расширить `Offering`: `cancellationPolicy?: CancellationPolicy` (опционально в TS для совместимости с seed, обязательно в Zod).
    - добавить на `Offering` поле `trainerClubLinkId?: EntityId` — ссылка на confirmed-link (для услуг тренера «в клубе»). Если отсутствует — услуга частная. Будет использовано в Step 24.10.
    - **удалить** `Trainer.affiliatedClubId`, `Trainer.clubId` (STUB), `Offering.affiliatedClubId`. Массовые рефактор-точки — в Step 24.8.
    - новый интерфейс `Notification extends BaseEntity = { userId: EntityId; type: NotificationType; payload: Record<string, unknown>; readAt?: ISODateTimeString }`.
    - новый интерфейс `TrainerClubLink extends BaseEntity = { trainerId: EntityId; clubId: EntityId; status: TrainerClubLinkStatus; initiatedBy: 'trainer' | 'club'; approvedAt?: ISODateTimeString; approvedByUserId?: EntityId; rejectedAt?: ISODateTimeString; rejectedByUserId?: EntityId; rejectionReason?: string; revokedAt?: ISODateTimeString; revokedByUserId?: EntityId; revokedBy?: 'trainer' | 'club' | 'admin' }`.
    - расширить `LogAction` на 14 новых значений (список в Ключевых решениях).
  - создать `src/lib/discipline-config.ts`:
    - экспорт `DISCIPLINE_CONFIG` как `const { ... } as const`:
      - `minCompletedForBadge: 5` (минимум completed у юзера для публичного бейджа);
      - `reliability.warningThreshold: 0.9`, `reliability.dangerThreshold: 0.75` (процентные пороги);
      - `quarantine.consecutiveNoShowTrigger: 3`, `quarantine.windowDays: 30`, `quarantine.durationDays: 7`;
      - `pending.autoCancelHoursBeforeStart: 1`;
      - `checkIn.windowHoursAfterEnd: 48`;
      - `lateCancel.freeUntil: { free_anytime: Infinity, free_until_24h: 24, free_until_2h: 2, no_refund: 0 }` (часы до слота).
    - этот файл — единственный источник «магических чисел» всей дисциплины. Все читающие утилиты (FSM, reliability, guards) берут параметры отсюда.

- **Проверка:**
  - TypeScript компилируется, типы экспортируются.
  - Поиск по коду `affiliatedClubId` пока возвращает хиты (будут закрыты в Step 24.8) — это ожидаемо; компиляция не падает только если Step 24.8 идёт следующим без больших пауз. Альтернатива: временно оставить поля как deprecated до Step 24.8. **Принять решение:** оставить поля в типе до Step 24.8 с JSDoc-комментарием `/** @deprecated Phase 24 — удалить в Step 24.8 */`, затем в 24.8 вырезать вместе с чтениями. Так компилятор не красит всю кодовую базу за один Step.
  - `DISCIPLINE_CONFIG` импортируется без side-effects.

- **Тесты:**
  - типы: `src/test/types/domain-model.test.ts` — расширить тест на новые union'ы и новые поля в `Booking/Offering`.
  - `src/test/lib/discipline-config.test.ts` — новый файл, smoke-тест на все ключи и их типы (`expect(DISCIPLINE_CONFIG.quarantine.durationDays).toBe(7)`), чтобы защитить от случайного изменения.

- **Ожидаемый результат:**
  - все типы Phase 24 объявлены и совместимы с существующим кодом. Единый источник дисциплинарных параметров. Ничего не сломано в рантайме.

### Step 24.2: Data-layer — коллекции, CRUD в db.ts, миграция seed

- **Действие:**
  - новые JSON-файлы в `src/data/`:
    - `notifications.json` — пустой массив.
    - `trainer-club-links.json` — пустой массив.
  - расширить `DataCollectionMap` и `DATA_FILES` в `src/lib/db.ts` на коллекции `notifications`, `trainerClubLinks`.
  - добавить в `db.ts` по паттерну Phase 23:
    - `getNotifications(filter?: { userId?: EntityId; unreadOnly?: boolean; offset?, limit? }): Promise<Notification[]>`
    - `createNotification(data: Omit<Notification, 'id' | 'createdAt'>): Promise<Notification>`
    - `markNotificationRead(id: EntityId): Promise<Notification>`
    - `markAllNotificationsRead(userId: EntityId): Promise<number>` (возвращает количество помеченных)
    - `getUnreadNotificationCount(userId: EntityId): Promise<number>`
    - `getTrainerClubLinks(filter?: { trainerId?: EntityId; clubId?: EntityId; status?: TrainerClubLinkStatus }): Promise<TrainerClubLink[]>`
    - `getTrainerClubLinkById(id: EntityId): Promise<TrainerClubLink | null>`
    - `createTrainerClubLink(data: Omit<TrainerClubLink, 'id' | 'createdAt'>): Promise<TrainerClubLink>`
    - `updateTrainerClubLink(id: EntityId, patch: Partial<TrainerClubLink>): Promise<TrainerClubLink>` (используется для approve/reject/revoke).
  - миграция существующих данных:
    - `src/data/bookings.json` → **очистить до `[]`** (любые seed-booking'и несовместимы с новой FSM-моделью; новые seed-booking'и добавляются в Step 24.16).
    - `src/data/offerings.json` → дописать `cancellationPolicy: 'free_until_24h'` всем существующим offerings как одноразовая миграция seed.
    - `src/data/trainers.json` → удалить старые поля `affiliatedClubId`, `clubId` из всех записей (в Step 24.8 это станет breaking change по типу; миграция seed — здесь, чтобы JSON был валиден к моменту удаления поля из типа).
  - обновить тестовые фикстуры в `src/test/helpers/seed-fixtures.ts`:
    - `fixtureTrainer*` — убрать `affiliatedClubId`, `clubId`.
    - `fixtureOffering*` — добавить `cancellationPolicy: 'free_until_24h'`.
  - обновить тестовую инфраструктуру `createIsolatedDataDirectory()` — автоматически подхватит новые файлы.

- **Проверка:**
  - новые коллекции существуют и читаются/пишутся как обычные.
  - миграция offerings.json успешна (все offerings имеют policy).
  - `bookings.json` пустой.
  - существующие тесты data-layer (`src/test/lib/db.test.ts`, `src/test/lib/db-publish.test.ts`, `src/test/lib/db-logs.test.ts`, `src/test/lib/db-dictionaries.test.ts`) проходят.

- **Тесты:**
  - `src/test/lib/db-notifications.test.ts` — create, read (фильтры), markRead, markAllRead, getUnreadCount.
  - `src/test/lib/db-trainer-club-links.test.ts` — create, фильтры, updateTrainerClubLink (смена статуса, фиксация actor/timestamps).
  - regression: `src/test/lib/db-booking.test.ts` — адаптировать под пустой стартовый `bookings.json` (фиктюры поднимают booking'и внутри теста).

- **Ожидаемый результат:**
  - data-layer готов обслуживать две новые коллекции, seed мигрирован, старые тесты зелёные.

### Step 24.3: Booking FSM — transitionBooking + ленивые автопереходы

- **Действие:**
  - в `src/lib/db.ts` добавить:
    - `const FSM_TRANSITIONS: Record<BookingStatus, BookingStatus[]>` — карта допустимых переходов. Например, `pending → [confirmed, rejected_by_provider, cancelled_by_athlete, cancelled_by_provider]`, `confirmed → [completed, no_show, cancelled_by_athlete, cancelled_by_provider, unmarked]`, финальные статусы → `[]`.
    - `validateTransition(from: BookingStatus, to: BookingStatus, actor: BookingActor, context: { isAdmin?: boolean }): void` — throws при невалидном переходе или неверном акторе. Админ через инструменты может форсить любой переход (кроме удаления — оно через hard-delete endpoint).
    - `transitionBooking({ id, to, actor, actorUserId?, reason? }): Promise<Booking>` — ядро:
      1. читает booking,
      2. validate transition,
      3. вычисляет bookedCount delta по таблице Ключевых решений,
      4. атомарно записывает новый `Booking.status`, добавляет запись в `statusHistory`, если нужно пишет `cancelledBy/cancelReason/completedAt`, и декрементирует/не трогает `Schedule.bookedCount`,
      5. rollback при ошибке,
      6. fire-and-forget `notify()` (хелпер добавляется в Step 24.5 — пока просто `// TODO Step 24.5: notify()` с чётким комментарием, либо stub-функция-noop). **Уточнение:** добавить stub `notifyStub(userId, type, payload): void {}` в 24.3 и заменить реализацию в 24.5 — так Step закрыт полностью.
  - для `cancelled_by_athlete`: принимать `reason: 'on_time' | 'late'` вычисляется перед вызовом не внутри `transitionBooking` (он только проверяет/пишет), а в API-роуте через функцию `computeCancelReason(booking, now, config): CancelReason` из `src/lib/reliability.ts` (добавится в 24.12, на 24.3 — inline helper в db.ts, потом вынесем; либо сразу inline helper с чётким todo).
  - переписать `createBookingAtomic()`:
    - `status: 'pending'` вместо `confirmed`,
    - `statusHistory: [{ from: null, to: 'pending', actor: 'athlete', actorUserId: userId, at: now }]`,
    - `cancellationPolicySnapshot: offering.cancellationPolicy ?? 'free_until_24h'` (read-fallback).
  - переписать `cancelBooking()`:
    - теперь это тонкая обёртка над `transitionBooking({ to: 'cancelled_by_athlete', actor: 'athlete', actorUserId, reason: computed })`. Hard-delete вырезается отсюда в отдельную функцию `hardDeleteBooking({ id, adminUserId })` — вызывается только из admin endpoint в Step 24.4.
  - новая функция `runLazyBookingTransitions(now?: Date): Promise<{ autoCancelled: number; unmarked: number }>`:
    - сканирует `bookings.json`,
    - для `pending`-записей с `now >= startAt - 1h` → `transitionBooking({ to: 'cancelled_by_provider', actor: 'system', reason: 'auto_cancel_pending_expired' })`,
    - для `confirmed`-записей с `now > endAt + 48h` → `transitionBooking({ to: 'unmarked', actor: 'system' })`,
    - возвращает сводку.
  - обновить фильтры в helper'ах `src/components/profile/athlete-bookings.ts` и `provider-helpers.ts`:
    - `ACTIVE_BOOKING_STATUSES` → `new Set<BookingStatus>(['pending', 'confirmed'])` (без изменений семантики, но типизация на новый union).
    - добавить отдельный `COMPLETED_STATUSES` → `new Set(['completed', 'no_show', 'unmarked'])`, `CANCELLED_STATUSES` → `new Set(['cancelled_by_athlete', 'cancelled_by_provider', 'rejected_by_provider'])` для истории и аналитики.

- **Проверка:**
  - booking создаётся в `pending`.
  - невалидный переход бросает ошибку.
  - при переходе `bookedCount` меняется по таблице.
  - `runLazyBookingTransitions()` идемпотентна: повторный вызов не даёт новых переходов.
  - `cancelBooking` через публичный DELETE переводит booking в `cancelled_by_athlete` с правильным `cancelReason`.

- **Тесты:**
  - `src/test/lib/booking-fsm.test.ts` — новый, матрица допустимых переходов (включая запреты от финальных статусов), правила `bookedCount` на каждый переход, `statusHistory` фиксируется, rollback при ошибке записи Schedule.
  - `src/test/lib/booking-lazy-transitions.test.ts` — auto-cancel pending за 1 час до слота, auto-unmark через 48 часов после конца, идемпотентность повторного вызова, корректное `statusHistory` с `actor: 'system'`.
  - regression: `src/test/lib/db-booking.test.ts` и `src/test/api/bookings.route.test.ts` — адаптировать под `status: 'pending'` на старте и soft-cancel через `cancelled_by_athlete`.

- **Ожидаемый результат:**
  - booking жёстко работает как FSM, история переходов пишется, автопереходы ленивые и идемпотентные, bookedCount математически согласован.

### Step 24.4: API эндпоинты переходов + admin hard-delete

- **Действие:**
  - создать 4 action-endpoint'а в `src/app/api/bookings/[id]/`:
    - `confirm/route.ts` — POST, body `{ userId }` (provider). Guard: booking.status === 'pending', userId — один из владельцев owner-сущности. Вызывает `transitionBooking({ to: 'confirmed', actor: 'provider', actorUserId })`.
    - `reject/route.ts` — POST, body `{ userId, reason? }`. Guard аналогично confirm. Переход → `rejected_by_provider`.
    - `cancel/route.ts` — POST, body `{ userId }`. Guard: либо booking.userId === userId (athlete), либо userId — владелец owner-сущности (provider). Вычисляется actor и целевой статус. Для athlete: вычисляется `cancelReason` через snapshot-policy (inline helper).
    - `check-in/route.ts` — POST, body `{ userId, outcome: 'completed' | 'no_show' }`. Guard: provider owner + окно (после endTime, до endTime + 48h) + booking.status === 'confirmed'.
  - создать `src/app/api/admin/bookings/[id]/route.ts`:
    - DELETE, body `{ adminUserId }`. Guard: `adminUserId` — admin role в `users.json`.
    - Вызывает `hardDeleteBooking({ id, adminUserId })` — физически удаляет, не пишет в statusHistory (запись целиком пропадает), логирует через `logAction({ action: 'admin_hard_delete_booking' })`.
  - рефакторинг существующего `DELETE /api/bookings/[id]` (`src/app/api/bookings/[id]/route.ts`):
    - остаётся как soft-cancel для атлета,
    - теперь это обёртка над `transitionBooking({ to: 'cancelled_by_athlete', actor: 'athlete' })`,
    - публичная семантика для клиента не меняется,
    - логирование переезжает на новый LogAction — `booking_cancel` остаётся как обобщающий, но в `meta` пишется `actor` и `cancelReason`.
  - добавить вызов `runLazyBookingTransitions()` в:
    - `src/app/api/bookings/route.ts` (GET) — до чтения списка,
    - `src/app/profile/athlete/page.tsx` — до `getBookings()`,
    - `src/app/profile/provider/page.tsx` — до `getBookings()`.
  - логирование: каждый action-endpoint вызывает `logAction()` с соответствующим новым значением (`booking_confirm`, `booking_reject`, `booking_check_in_completed|no_show`, `booking_auto_expire` для ленивых).

- **Проверка:**
  - curl `POST /api/bookings/[id]/confirm` от роли провайдера → `status: 'confirmed'`, `statusHistory` увеличился на один элемент.
  - `POST /api/bookings/[id]/check-in` до окончания слота → 403.
  - `POST /api/bookings/[id]/check-in` на 49-м часе после окончания → 403 «окно check-in истекло».
  - `DELETE /api/bookings/[id]` от атлета за 23 часа до слота при policy `free_until_24h` → soft-cancel с `cancelReason: 'late'`.
  - `DELETE /api/admin/bookings/[id]` от админа → запись физически исчезла, лог записан.
  - открытие `/profile/athlete` → если был `pending` за менее 1 часа до слота — автоматически стал `cancelled_by_provider` (system).

- **Тесты:**
  - по одному файлу на каждый новый endpoint в `src/test/api/`:
    - `bookings.confirm.route.test.ts` (success, wrong role, wrong status).
    - `bookings.reject.route.test.ts`.
    - `bookings.cancel.route.test.ts` (on_time vs late через snapshot policy).
    - `bookings.check-in.route.test.ts` (window guard, outcome outcome both branches).
    - `admin.bookings.delete.route.test.ts` (admin-only guard, log fire).
  - обновить существующий `src/test/api/bookings.route.test.ts` под soft-cancel (status проверяется, не delete).
  - `src/test/api/lazy-transitions-integration.test.ts` — открытие ЛК триггерит переходы.

- **Ожидаемый результат:**
  - полный публичный API FSM работает, админский hard-delete изолирован, ленивые переходы триггерятся.

### Step 24.5: Notifications infra — notify() + API + новые LogAction

- **Действие:**
  - `src/lib/notify.ts`:
    - `notify(userId: EntityId, type: NotificationType, payload: Record<string, unknown>): void` — вызывает `createNotification` через fire-and-forget (как `logAction`).
  - заменить stub `notifyStub` в `db.ts#transitionBooking` на реальный `notify()`.
  - во всех точках переходов booking'а и link'а — добавить осмысленные вызовы `notify()`:
    - booking pending → confirmed: notify(athlete, 'booking_confirmed', { bookingId, startAt })
    - booking pending → rejected_by_provider: notify(athlete, 'booking_rejected', { bookingId, reason })
    - booking pending → cancelled_by_provider (system auto-expire): notify(athlete, 'booking_auto_expired', ...), notify(provider, 'booking_auto_expired', ...)
    - confirmed → completed: notify(athlete, 'booking_completed', ...)
    - confirmed → no_show: notify(athlete, 'booking_no_show', ...)
    - confirmed → cancelled_by_*: notify другой стороне
  - API-routes:
    - `src/app/api/notifications/route.ts` — GET `?userId&unreadOnly&offset&limit` → `{ success: true, data: { items: Notification[]; total: number; unreadCount: number } }`.
    - `src/app/api/notifications/[id]/read/route.ts` — POST, body `{ userId }`, guard: notification.userId === userId.
    - `src/app/api/notifications/read-all/route.ts` — POST, body `{ userId }`.
    - `src/app/api/notifications/unread-count/route.ts` — GET `?userId`.

- **Проверка:**
  - каждый FSM-переход создаёт запись в `notifications.json` для соответствующего получателя.
  - GET /api/notifications возвращает список с общим числом и unreadCount.
  - POST read помечает `readAt: now`.
  - при отсутствии guard (notification другого userId) → 403.

- **Тесты:**
  - `src/test/lib/notify.test.ts` — fire-and-forget semantics, silent catch.
  - `src/test/api/notifications.route.test.ts` — get/read/read-all/unread-count.
  - обновить `src/test/lib/booking-fsm.test.ts` — проверить, что на каждый переход создаётся запись уведомления нужного типа для нужного получателя.

- **Ожидаемый результат:**
  - инфраструктура уведомлений работает сквозняком: переход → запись в notifications.json → видна через API.

### Step 24.6: Toast-стек — useToastStore + ToastStack

- **Действие:**
  - `src/stores/useToastStore.ts`:
    - state: `toasts: Toast[]`,
    - `type Toast = { id: string; message: string; tone: 'info' | 'success' | 'warning' | 'error'; duration?: number }`,
    - actions: `addToast(toast: Omit<Toast, 'id'>)`, `dismissToast(id)`, `clearToasts()`.
  - `src/components/ui/ToastStack.tsx`:
    - подписывается на `useToastStore`,
    - рендерит стек toast'ов fixed bottom-right,
    - auto-dismiss через `duration` (default 4000 мс),
    - стили по tone (фон, обводка, иконка).
  - монтировать `ToastStack` в `src/components/layout/AppShell.tsx` — рядом с существующими `AuthModal`, `Footer`.
  - миграция существующего `ActionNotice`:
    - все компоненты, использующие локальный `notice: string` + рендер `<ActionNotice message={notice} />` — переписываются на `addToast({ message, tone: 'success' })`.
    - удалить `ActionNotice.tsx` и все его импорты (если не используется специально где-то как отдельный блок — проверить grep'ом).
    - точки миграции (известные): `BookingActionBlock`, `AthleteUpcomingBookingCard`, `PublishClubModal`, `PublishTrainerModal`, `HideReasonModal`, `ImpersonationBanner`, `AdminAuthScreen`.

- **Проверка:**
  - быстрое выполнение 3 действий подряд → 3 toast'а в стеке, каждый исчезает через свой таймер.
  - клик по крестику закрывает toast раньше.
  - миграция прошла: `ActionNotice` не используется нигде.

- **Тесты:**
  - `src/test/stores/useToastStore.test.ts` — add/dismiss/clear, уникальные id.
  - `src/test/ui/ToastStack.test.tsx` — рендер стека, auto-dismiss (через fake timers), клик по закрытию.
  - обновить тесты компонентов, которые использовали `ActionNotice` — теперь ожидают toast-store вызов.

- **Ожидаемый результат:**
  - единый toast-механизм на всю платформу, легко расширяемый (tone, duration, group).

### Step 24.7: Notifications UI — bell в Header, dropdown, /profile/*/notifications

- **Действие:**
  - в `src/components/layout/Header.tsx`:
    - добавить компонент `NotificationBell` (client) рядом с user-блоком (перед аватаром).
    - bell рендерит SVG-иконку с счётчиком непрочитанных (badge над иконкой, скрыт при 0).
    - клик открывает dropdown (portal или floating div) с последними N=5 уведомлениями.
    - в dropdown: компактный список `NotificationItem` (иконка по type, текст, «2 часа назад»), ссылка «Все уведомления» → `/profile/athlete/notifications` или `/profile/provider/notifications` (по `accountType` из auth store).
    - polling: хук `useUnreadCountPolling()` — при смене `usePathname()` вызывает `GET /api/notifications/unread-count?userId`. Fallback — `setInterval 60000` (только если pathname не меняется долго).
    - при impersonation `useAuthStore().user` уже возвращает impersonated — ничего специального делать не нужно.
  - создать страницы:
    - `src/app/profile/athlete/notifications/page.tsx` — Server Component, `dynamic='force-dynamic'`, читает `getNotifications({ userId: athleteId })`, передаёт в client.
    - `src/app/profile/provider/notifications/page.tsx` — аналогично для провайдера.
  - создать shared client-компонент `src/components/profile/notifications/NotificationsListPage.tsx`:
    - плоский список `NotificationItem`,
    - клик по item → `POST /api/notifications/[id]/read`, локальный state обновляется, badge в header пересчитывается,
    - кнопка «Отметить всё как прочитанное» → `POST /api/notifications/read-all`.
  - компонент `NotificationItem` рендерит разный текст по type через маппинг `NOTIFICATION_COPY: Record<NotificationType, (payload) => string>`.

- **Проверка:**
  - провайдер подтверждает заявку → у атлета в bell появляется «+1» непрочитанных.
  - клик по bell открывает dropdown с этим уведомлением.
  - переход на `/profile/athlete/notifications` → список, отмечается прочитанным по клику.
  - под impersonation видны уведомления impersonated user.

- **Тесты:**
  - `src/test/ui/NotificationBell.test.tsx` — render, счётчик, dropdown.
  - `src/test/profile/notifications-page.test.tsx` — список, mark-read, mark-all-read.
  - `src/test/hooks/useUnreadCountPolling.test.ts` — срабатывает на pathname change, fallback на interval.

- **Ожидаемый результат:**
  - пользователь видит уведомления на любой странице и в разделе ЛК, действия откликаются немедленно (router.refresh + client state).

### Step 24.8: TrainerClubLink — backend + удаление `affiliatedClubId`

- **Действие:**
  - новые API routes в `src/app/api/trainer-club-links/`:
    - `route.ts`: POST (trainer создаёт request, body `{ trainerId, clubId, userId }`, guard: userId — manager тренера), GET `?trainerId&clubId&status`.
    - `[id]/approve/route.ts` — POST, body `{ userId }`, guard: user — manager клуба, status — pending. Переход pending → confirmed, пишет `approvedAt/approvedByUserId`, notify тренеру.
    - `[id]/reject/route.ts` — POST, body `{ userId, reason? }`, guard аналогично. Переход pending → rejected.
    - `[id]/revoke/route.ts` — POST, body `{ userId }`, guard: user — manager любой из сторон (trainer или club) **или** admin. Переход confirmed → revoked, фиксируется `revokedBy`.
  - **массовая миграция чтений** (полный список в Приложении к фазе):
    - `src/app/trainers/[slug]/page.tsx:84-88` — вместо поиска в offerings по `affiliatedClubId` → `getTrainerClubLinks({ trainerId, status: 'confirmed' }).then(links => links[0] ? getClubById(links[0].clubId) : null)`.
    - `src/app/api/trainers/[id]/route.ts:59-61` — аналогично.
    - `src/app/clubs/[slug]/page.tsx:60-69` — получение тренеров клуба: через `getTrainerClubLinks({ clubId, status: 'confirmed' })` → `trainerIds[]` → `getTrainers().filter(...)`.
    - `src/app/api/clubs/[id]/route.ts:61-67` — аналогично.
    - `src/app/api/trainers/route.ts:16-23, 58-68` — фильтр `?affiliatedClubId` перевести на поиск через links.
    - `src/components/trainers/trainer-preview.ts:131-144` — `venueClub` через link.
  - **удаление полей из типов** (`src/types/index.ts`) — теперь окончательно, с deprecated-комментарием Step 24.1 снять.
  - обновить `mapTrainerFormToEntities` / `mapTrainerFormToUpdateInput` / `mapTrainerToFormState`:
    - больше не принимают/не отдают `affiliatedClubId` напрямую.
    - в Step 24.9 вместо поля появится механика запроса link'а.

- **Проверка:**
  - поиск по коду `affiliatedClubId` → 0 хитов (кроме `src/data/*.json`, если там остались — вычистить).
  - TypeScript компилируется.
  - GET /api/trainer-club-links возвращает корректные фильтры.
  - approve/reject/revoke меняют статус, пишут timestamps.
  - публичные страницы клуба и тренера читают связь через links.

- **Тесты:**
  - `src/test/api/trainer-club-links.route.test.ts` — CRUD + action endpoints, role guards.
  - `src/test/lib/db-trainer-club-links.test.ts` (из 24.2) — расширить тестами на `updateTrainerClubLink` по каждому action.
  - regression: все существующие тесты `trainers.route.test.ts`, `clubs.route.test.ts`, `ClubDetailPage`, `TrainerDetailPage` — адаптировать под чтение через links.

- **Ожидаемый результат:**
  - связь тренер↔клуб управляется API и живёт в отдельной коллекции, старые поля удалены, все точки чтения мигрированы.

### Step 24.9: TrainerClubLink — UI (publish-модалка, inbox, публичные поверхности)

- **Действие:**
  - `PublishTrainerModal` — секция «Связать себя с клубом»:
    - select клубов остаётся,
    - при submit: если выбран клуб и ранее не было активного link'а — POST `/api/trainer-club-links`,
    - если существующий link в pending/confirmed — показываем статус «Запрос отправлен» / «Работает в клубе X» с кнопкой «Отозвать»,
    - если rejected/revoked — отдельная плашка «Клуб отклонил запрос / Связь разорвана», с возможностью отправить новый запрос.
  - `ProviderProfilePage` (для club_owner):
    - новый блок «Запросы от тренеров» (inbox), виден если у user'а есть хотя бы один pending-link к его клубам.
    - каждый pending-запрос — карточка с именем тренера, видом спорта, кнопками «Подтвердить» / «Отклонить».
    - блок «Подтверждённые тренеры» — список confirmed с возможностью «Отвязать» (revoke).
  - публичные поверхности:
    - `TrainerDetailPageClient` — секция «Работает в клубе» рендерится только если есть confirmed link. Иначе секция скрыта.
    - `ClubDetailPageClient` — список тренеров только через confirmed links.
    - `TrainerCard` в каталоге — `venueLabel` = имя клуба при confirmed link, иначе адрес тренера. Это требование будет дополнительно обновлено в 24.11 (multi-offering).

- **Проверка:**
  - тренер отправляет запрос → у клуба появляется в inbox.
  - клуб подтверждает → на публичной странице тренера появляется клуб, атлет видит «работает в X».
  - клуб отзывает → тренер уходит в «независимые».
  - тренер отзывает сам → аналогично.
  - отправка повторного запроса после rejected/revoked — работает, создаётся новый link.

- **Тесты:**
  - `src/test/profile/trainer-club-link-ui.test.tsx` — полный flow: request → approve → revoke → re-request.
  - `src/test/profile/provider-links-inbox.test.tsx` — отображение входящих, действия.
  - `src/test/ui/trainer-detail-link-visibility.test.tsx` — публичный тренер виден только при confirmed.
  - regression: `ClubDetailPage` не показывает тренеров с pending/rejected links.

- **Ожидаемый результат:**
  - полноценная двусторонняя привязка работает от UI до базы; публичные поверхности показывают только подтверждённые связи.

### Step 24.10: Multi-offering тренера — данные, форма, контракты

- **Действие:**
  - **модель:** `Trainer` перестаёт иметь свою «основную offering» как единственную. Один тренер — N offerings в `offerings.json`. На Offering добавляется поле `trainerClubLinkId?: EntityId`: если указано — услуга «в клубе» (привязана к confirmed link этого тренера), если пусто — частная.
  - `src/lib/schemas/publish.ts`:
    - в `TrainerFormState` заменить плоские поля оffering (offeringName, offeringDescription, offeringFormat, offeringPrice, offeringDuration, offeringLocation, cancellationPolicy) на массив `offerings: TrainerOfferingFormItem[]`.
    - `TrainerOfferingFormItem = { id?: EntityId; title, description, format, price, duration, location, cancellationPolicy: CancellationPolicy, attachmentMode: 'club' | 'private', clubLinkId?: EntityId, scheduleSlots: ScheduleSlotForm[] }`.
    - attachmentMode `club` требует clubLinkId из confirmed-links.
    - Zod refine: хотя бы одна offering; если attachmentMode='club' — clubLinkId валиден.
  - `src/lib/contracts/publish-trainer.ts`:
    - `mapTrainerFormToEntities` возвращает `{ trainer, offerings: Offering[], schedules: Schedule[] }`. Перебирает form.offerings, создаёт одну offering + N schedule-slots на каждую.
    - `mapTrainerFormToUpdateInput` — full-replace по списку offerings (существующие матчатся по id, новые создаются, удалённые удаляются).
  - `src/lib/contracts/reverse-mapping.ts#mapTrainerToFormState`:
    - читает все offerings тренера, для каждой определяет attachmentMode (через `trainerClubLinkId`), собирает schedule per offering.
  - `PublishTrainerModal` — переделка формы:
    - новая секция «Услуги» — аккордеон с карточкой на каждую offering.
    - кнопка «+ Добавить услугу» создаёт новую offering-карточку.
    - внутри карточки: `attachmentMode` (2 чипа «В клубе / Частно»), если club — select из confirmed-links этого тренера, поля title/description/format/price/duration/location/cancellationPolicy (4 preset'а как TagSelector или radio), блок «Расписание» (ScheduleSlotsEditor per offering).
    - контакты тренера остаются на уровне Trainer, не per-offering.
  - `createTrainerPublication` и `updateTrainerPublication` в `db.ts`:
    - переписаны на работу с массивом offerings (atomic write + rollback по всем коллекциям).
    - при update — diff offerings: создать новые, обновить существующие, удалить удалённые.

- **Проверка:**
  - тренер создаёт публикацию с 2 offerings (1 в клубе, 1 частно) — в `offerings.json` две записи с правильными `trainerClubLinkId` / без него.
  - при edit можно добавить, убрать и отредактировать offerings.
  - при revoke confirmed-link все offerings с этим linkId автоматически переходят в `attachmentMode='private'`? Или остаются «висеть»? **Уточнение:** при revoke link помечаем связанные offerings как `attachmentMode: null` (приватные), пишем уведомление провайдеру «приведите offerings к порядку». В UI помечаем их предупреждением. Альтернатива — запрет revoke при наличии живых offerings. В phase-24 принимаем **мягкий вариант** (auto-detach offerings с notify), чтобы клуб мог разорвать связь без блокировки.

- **Тесты:**
  - `src/test/lib/publish-trainer-contract-multi.test.ts` — maps form с массивом offerings → entities; roundtrip persisted → form-state.
  - `src/test/profile/publish-trainer-modal-multi.test.tsx` — add/remove offering, attachmentMode переключение, зависимость select от confirmed-links.
  - `src/test/lib/db-trainer-update-multi.test.ts` — diff при update, atomic rollback.

- **Ожидаемый результат:**
  - тренер может иметь N услуг с разной привязкой; форма, контракты и data-layer поддерживают модель без каши.

### Step 24.11: Multi-offering — публичные поверхности

- **Действие:**
  - `src/components/trainers/trainer-preview.ts`:
    - `TrainerDirectoryItem` расширяется полем `offerings: TrainerOfferingPreview[]` с per-offering price/format/venue/clubName.
    - `venueLabel` становится агрегированным: например, «В клубе Амстафф + частно» или «2 услуги в клубе Амстафф».
    - `priceFrom` — min по offerings.
    - `searchText` включает все offerings.
  - `TrainerCard`:
    - бейдж привязки заменяется на компактный блок «2 услуги: в клубе X, частно».
  - `TrainerDetailPageClient`:
    - новая секция «Услуги» с развёрткой каждой offering (название, цена, формат, политика отмены, место, расписание).
  - `ClubDetailPageClient`:
    - список «Услуги клуба» теперь собирается из offerings других типов (клуб-owned + trainer-services с confirmed link к этому клубу).
  - `filterTrainers` / `CatalogResultsSection`:
    - фильтр по sportId проверяет, что хотя бы одна offering тренера подходит.
    - если в фильтре один sport — тренер с двумя offerings (одна йога в клубе, другая бокс частно) попадает в оба sport-выбора.

- **Проверка:**
  - каталог тренеров корректно отображает `priceFrom` и `venueLabel` для multi-offering.
  - detail тренера разворачивает все offerings.
  - detail клуба показывает только offerings с confirmed link к нему.
  - фильтр по спорту учитывает все offerings.

- **Тесты:**
  - `src/test/ui/trainer-directory-multi.test.tsx` — агрегаты в preview.
  - `src/test/trainers/trainer-detail-multi.test.tsx` — список услуг в detail.
  - `src/test/clubs/club-detail-multi-offerings.test.tsx` — фильтрация.
  - `src/test/clubs/filter-trainers-multi.test.ts` — фильтр по спорту с мульти-offerings.

- **Ожидаемый результат:**
  - публичные поверхности корректно отображают тренера с N услугами, поиск и фильтры работают по агрегатам.

### Step 24.12: Reliability compute — 3 функции + карантин

- **Действие:**
  - `src/lib/reliability.ts`:
    - `computeClubReliability(bookings: Booking[], clubId: EntityId, config: DisciplineConfig): ReliabilityResult`
    - `computeTrainerReliability(bookings: Booking[], trainerId: EntityId, config): ReliabilityResult`
    - `computeAthleteReliability(bookings: Booking[], userId: EntityId, config): ReliabilityResult`
    - `type ReliabilityResult = { totalRelevant: number; completedCount: number; noShowCount: number; lateCancelCount: number; rejectedByProviderCount: number; completionRate: number; badge: null | 'warning' | 'danger'; isNewUser: boolean }`.
    - для athlete: relevant bookings — все, где `userId === X` в завершённых статусах. `completionRate = completed / (completed + no_show + late_cancel)`. `isNewUser = completed < 5`.
    - для club: relevant — `ownerType='club' && ownerId=clubId`. Формула: `(completed + no_show) / (completed + no_show + cancelled_by_provider + rejected_by_provider)` (провайдер дал провести; no_show — не его вина).
    - для trainer: аналогично club, плюс учёт offerings с trainerClubLinkId (все bookings этого тренера, независимо от club-контекста).
  - `computeCancelReason(booking: Booking, now: Date, config): CancelReason`:
    - находит `startAt` слота, сравнивает с `now + policy.freeUntil[snapshot] hours`,
    - если ещё в окне → `on_time`, иначе `late`.
    - используется в API `/bookings/[id]/cancel` для атлета.
  - `isAthleteInQuarantine(bookings: Booking[], userId: EntityId, config): { inQuarantine: boolean; until?: ISODateTimeString; reason?: string }`:
    - фильтрует booking'и атлета за последние `config.quarantine.windowDays` с статусом в `['no_show', 'completed']`, сортирует по completedAt/endAt,
    - если последние 3 — все `no_show` → карантин начинается с endAt последнего no_show + 7 дней,
    - сравнивает `now < until`.

- **Проверка:**
  - unit-формулы считают верно на фикстурах.
  - в граничных случаях (0 bookings, isNewUser, пороги ровно на 90% / 75%) — корректно.
  - карантин считается из последовательности.

- **Тесты:**
  - `src/test/lib/reliability.test.ts` — большие фикстуры с разными сценариями: новый user (isNewUser=true), warning, danger, идеальный, смешанный, граничные значения.
  - `src/test/lib/compute-cancel-reason.test.ts` — 4 policy × в окне / вне окна.
  - `src/test/lib/is-athlete-in-quarantine.test.ts` — 3 подряд, 3 с разрывом (1 completed посередине — не считается), истёкший карантин.

- **Ожидаемый результат:**
  - чистые чистые функции для всех рейтингов и карантина, готовые к вызову из UI и guard'ов.

### Step 24.13: Reliability UI — бейджи, расшифровки, athlete в incoming

- **Действие:**
  - `TrainerCard`, `ClubCard`, `TrainerDetailPageClient`, `ClubDetailPageClient`:
    - бейдж `warning` / `danger` отображается если `!isNewUser && badge !== null`.
    - если `isNewUser` — компактная плашка «Новый».
    - в detail — раскрытие: «У провайдера X успешно проведено Y тренировок, Z no-show».
  - `/profile/athlete`:
    - секция «Мой рейтинг надёжности» — показывает ReliabilityResult атлета: completionRate в %, количество booking'ов в разрезе, бейдж если применим. Если isNewUser — «Нужно ещё N записей до показа рейтинга».
  - `/profile/provider`:
    - в списке клубов и тренеров провайдера — per-entity мини-бейдж с цифрами (владелец всегда видит точные числа, без скрытия).
  - `ProviderIncomingBooking` (`src/components/profile/provider-helpers.ts` + UI `ProviderBookingsSection`):
    - в карточке входящей pending-заявки рядом с именем атлета — бейдж его надёжности. Если danger — дополнительная строка «3 из последних 10 тренировок — no-show», чтобы провайдер осознанно мог отклонить.
    - `ProviderIncomingBooking` тип расширяется полем `athleteReliability: ReliabilityResult`.
  - полный SSR: `reliability.ts` вызывается в server page.tsx, результаты уходят в client как props.

- **Проверка:**
  - атлет с 3 completed видит «Новый пользователь, ещё 2 до рейтинга».
  - атлет с 10 completed и 1 no_show видит 91% completionRate, без бейджа.
  - провайдер видит в pending-заявке бейдж атлета.
  - в ЛК провайдера у каждого клуба и тренера — свой бейдж с числами.

- **Тесты:**
  - `src/test/ui/reliability-badges.test.tsx` — TrainerCard, ClubCard показывают правильный бейдж.
  - `src/test/profile/athlete-reliability.test.tsx` — расшифровка в ЛК.
  - `src/test/profile/provider-incoming-with-reliability.test.tsx` — бейдж атлета в pending-заявке.

- **Ожидаемый результат:**
  - рейтинг надёжности виден всем релевантным ролям, спрятан у новичков, расшифрован для владельца.

### Step 24.14: Дисциплинарные последствия — late-cancel warning + карантин

- **Действие:**
  - Warning-модалка late-cancel:
    - `AthleteUpcomingBookingCard` при клике «Отменить»:
      - вычисляет `computeCancelReason(booking, now, config)`,
      - если `'late'` — открывает `LateCancelWarningModal` с явным текстом «Эта отмена будет засчитана как поздняя и снизит ваш рейтинг надёжности. Вы уверены?»,
      - при подтверждении → `DELETE /api/bookings/[id]` (soft-cancel, `cancelReason: 'late'` на сервере пересчитывается авторитетно).
    - если `'on_time'` — отмена без модалки (toast «Запись отменена»).
  - Guard карантина:
    - `src/app/api/bookings/route.ts#POST`:
      - после athlete role guard и перед `createBookingAtomic` вызвать `isAthleteInQuarantine(bookings, userId, config)`.
      - если `inQuarantine` → 403 с body `{ success: false, error: 'quarantine', until: ISODateTimeString }`.
    - Booking-страница `/booking/[scheduleId]`:
      - если атлет в карантине — `BookingActionBlock` показывает disabled state «Временный карантин до DD.MM» вместо CTA.
  - Уведомления карантина:
    - при обнаружении `pending (last 30 days: 3rd no_show)` в `runLazyBookingTransitions()` или в `computeAthleteReliability()` — если только что вошёл в карантин (ранее не был) → `notify(athleteUserId, 'quarantine_start', { until })`.
    - при истечении карантина (next read, `now > until`) → `notify(athleteUserId, 'quarantine_end', {})`. Чтобы не слать дубли — в `Notification.payload` хранить `notifiedUntil` и сверять.
  - UI-плашка в `/profile/athlete`:
    - если `isAthleteInQuarantine` → сверху кабинета баннер красного оттенка: «Вы временно не можете создавать новые записи. Карантин до DD.MM. Причина: 3 пропуска за последние 30 дней. Восстановление репутации происходит через первую успешно проведённую тренировку после окончания карантина».

- **Проверка:**
  - late-cancel: модалка появляется, текст корректен, отмена уходит с `reason: 'late'`.
  - карантин: guard блокирует новую запись с понятным error-payload.
  - на `/booking/[scheduleId]` в карантине — disabled CTA.
  - уведомление о карантине приходит один раз, о снятии — тоже один раз.

- **Тесты:**
  - `src/test/ui/late-cancel-warning.test.tsx` — модалка, подтверждение, отмена.
  - `src/test/api/bookings-quarantine-guard.test.ts` — 403 при quarantine.
  - `src/test/ui/booking-page-quarantine.test.tsx` — disabled CTA.
  - `src/test/lib/quarantine-notifications.test.ts` — start/end один раз.

- **Ожидаемый результат:**
  - дисциплинарные механики видны пользователю, у него есть понятная обратная связь и путь к исправлению.

### Step 24.15: Super Admin tools — statusHistory, пересчёт, снятие карантина, forced revoke

- **Действие:**
  - `DashboardPage` (`src/components/admin/DashboardPage.tsx`):
    - новая колонка «Надёжность» в таблице пользователей — вычисляется на лету через `computeAthleteReliability` для athlete и агрегат по управляемым entity для провайдера.
    - новая колонка / индикатор «Карантин до» для atlete'ов.
    - в row-actions: «Снять карантин», «Пересчитать рейтинг».
  - новый компонент `BookingStatusHistoryDrawer`:
    - открывается с Dashboard по строке booking'а (нужен список booking'ов в админке — новый поиск/секция). Либо клик по booking-id в логе → drawer.
    - рендерит таймлайн `statusHistory` с actor'ом, временем, reason.
  - новые API endpoints под `/api/admin/`:
    - `POST /api/admin/users/[id]/recompute-reliability` — инвалидация любого кэша (на MVP no-op, но логирует `reliability_recompute`; существует для будущего кэш-слоя).
    - `POST /api/admin/users/[id]/lift-quarantine` — форсирует «conquest» карантина через искусственный completed-переход или через отдельный флаг. **Механика:** карантин — вычисляемое состояние. Чтобы его снять, нужно либо «стереть» один из последних no_show (через hard-delete), либо добавить искусственный «completed» в историю. Чище — завести на юзере поле `quarantineLiftedAt?: ISODateTimeString` в `users.json` и учитывать в `isAthleteInQuarantine` («если есть lift после последнего no_show — не в карантине»). Выбрать этот вариант — он обратим и логируется.
    - `POST /api/admin/trainer-club-links/[id]/force-revoke` — форсирует revoke от лица админа, `revokedBy: 'admin'`.
  - обновление `AdminNavigation` — новая секция «Дисциплина» (опционально) со сводкой: сколько пользователей в карантине, сколько pending-links, сколько booking'ов с auto-expire за 7 дней.
  - `LogsPage` — новые фильтры по новым LogAction.
  - все админские endpoint'ы логируют через `logAction()` с соответствующим значением.

- **Проверка:**
  - админ видит статус-историю любого booking'а.
  - снятие карантина через UI → атлет может записываться.
  - forced revoke link работает.
  - все действия записаны в логи.

- **Тесты:**
  - `src/test/admin/dashboard-reliability-columns.test.tsx`.
  - `src/test/admin/booking-status-history-drawer.test.tsx`.
  - `src/test/api/admin.lift-quarantine.route.test.ts`.
  - `src/test/api/admin.force-revoke-link.route.test.ts`.
  - `src/test/lib/quarantine-with-lift.test.ts` — `isAthleteInQuarantine` учитывает `quarantineLiftedAt`.

- **Ожидаемый результат:**
  - Super Admin имеет полный набор аварийных рычагов; все действия прозрачны через логи.

### Step 24.16: Seed + feature-docs + финал верификация

- **Действие:**
  - seed-данные:
    - `users.json` — 5–6 юзеров: 1 admin, 2 athletes (1 "чистый", 1 с историей с 2 no_show для тестов карантина), 2 providers (1 club_owner, 1 trainer-like), 1 опциональный inactive.
    - `clubs.json` — 2 публикации.
    - `trainers.json` — 2 тренера (один multi-offering).
    - `offerings.json` — 4–5 offerings с разными `cancellationPolicy`.
    - `trainer-club-links.json` — 1 confirmed + 1 pending.
    - `bookings.json` — 4–5 booking'ов в разных статусах: 1 pending, 1 confirmed (на завтра), 1 completed, 1 no_show (чтобы можно было проверить карантин при «+2 к текущему»), 1 cancelled_by_athlete с `cancelReason: 'late'`.
    - `notifications.json` — пустой (система сама наполнит в рантайме).
  - feature-docs — финальная полировка и сверка (по ходу Step'ов 24.1–24.15 файлы уже наполняются инкрементно; здесь закрываем оставшиеся разделы и проверяем согласованность):
    - **4 новых файла** (skeleton'ы созданы до старта Step 24.1, наполняются инкрементно):
      - `feature-docs/booking-lifecycle.md` — полная картина FSM: статусы, переходы, правила `bookedCount`, snapshot policy, soft-cancel, check-in, ленивые автопереходы, API переходов, admin hard-delete.
      - `feature-docs/reliability.md` — 3 формулы, discipline-config, пороги бейджей, карантин, late-cancel, отображение в UI.
      - `feature-docs/notifications.md` — модель, API, `notify()`, bell-icon, dropdown, `/profile/*/notifications`, toast-стек, архитектурный прицел на SSE.
      - `feature-docs/trainer-club-link.md` — двусторонняя привязка: состояния, API, удаление `affiliatedClubId`, inbox у клуба, публичное отображение только при confirmed, multi-offering `trainerClubLinkId`, admin forced revoke.
    - **6 существующих файлов** к финальной сверке (инкрементные правки должны быть уже внесены):
      - `feature-docs/booking.md` — короткая обзорная справка, основная реализация перенесена в `booking-lifecycle.md`.
      - `feature-docs/admin.md` — новые Super Admin инструменты, колонки Dashboard, 14 новых LogAction.
      - `feature-docs/data-layer.md` — 2 новые коллекции (`notifications`, `trainer-club-links`), расширения `Booking`/`Offering`, удаление `affiliatedClubId`, `transitionBooking`, `runLazyBookingTransitions`.
      - `feature-docs/publish-flow.md` — multi-offering тренера, link-request flow, `cancellationPolicy` в offering.
      - `feature-docs/auth.md` — role-guards на новых API, bell под impersonation.
      - `feature-docs/_overview.md` — 4 домена в таблице (статус MVP вместо 🔄 после закрытия фазы), обновление диаграммы связей.
    - `feature-docs/yandex-maps.md` — **не трогаем**, не затрагивается Phase 24.
  - синхронизация документации:
    - `CLAUDE.md` — «Текущее состояние».
    - `PHASES_OVERVIEW.md` — статус Phase 24.
    - `PROJECT_STATE.md` — новые типы (Notification, TrainerClubLink, BookingActor, CancellationPolicy, …), новые API routes, компоненты (ToastStack, NotificationBell, LateCancelWarningModal, BookingStatusHistoryDrawer), обновлённые Booking/Offering, новые JSON-файлы, новые Zustand-сторы (useToastStore).
    - `README.md` — прогресс Phase 24 ✅, ссылка.
    - `STACK_OVERVIEW.md` — новая архитектура FSM, правило lazy transitions, toast-стек как общий паттерн.
  - финальная верификация:
    - `npm run format`, `npm run lint`, `npm run test`, `npm run build` — зелёные.
    - E2E-сценарий по чек-листу фазы: провайдер публикует клуб → тренер отправляет запрос привязки → клуб подтверждает → тренер создаёт multi-offering (клубная + частная) → атлет записывается → провайдер подтверждает → проходит слот → провайдер делает check-in 'no_show' → атлет видит свой рейтинг упал → повторяет ещё 2 no_show → уходит в карантин → получает уведомление → видит плашку → админ снимает карантин → атлет снова может записываться.

- **Проверка:**
  - полный цикл проходит без багов.
  - все 8 feature-docs (4 новых + 4 обновлённых) согласованы.
  - все корневые документы синхронизированы.

- **Тесты:**
  - `src/test/integration/phase-24-e2e.test.ts` — smoke-тест, который проходит весь сценарий выше на in-memory JSON.

- **Ожидаемый результат:**
  - Phase 24 завершена, документация актуальна, проект готов к Phase 25.

---

### Чек-лист Phase 24

**Foundations (Step 24.1):**

- [x] `BookingStatus` расширен до 8 новых значений FSM (`cancelled` оставлен как `@deprecated` до Step 24.3 — тесты и seed не ломаются)
- [x] Новые типы: `BookingActor`, `CancellationPolicy`, `CancelReason`, `NotificationType`, `TrainerClubLinkStatus`, `BookingStatusTransition`, `Notification`, `TrainerClubLink`
- [x] Поля `Booking.statusHistory`, `Booking.cancellationPolicySnapshot`, `Booking.cancelledBy`, `Booking.cancelReason`, `Booking.completedAt`
- [x] Поля `Offering.cancellationPolicy`, `Offering.trainerClubLinkId`
- [x] Поля `Trainer.affiliatedClubId`, `Trainer.clubId`, `Offering.affiliatedClubId` помечены `@deprecated` (удалятся в 24.8)
- [x] `LogAction` расширен на 14 новых значений, `ACTION_LABELS` в `LogsPage.tsx` синхронизирован
- [x] `src/lib/discipline-config.ts` — единый источник параметров (пороги бейджей, карантин, auto-cancel pending, check-in window, lateCancel freeUntil)
- [x] `User.quarantineLiftedAt` — опциональное поле для ручного снятия карантина админом
- [x] `BOOKING_STATUSES` в `src/lib/constants.ts` и Record'ы `BOOKING_STATUS_LABELS/TONES` в helper'ах синхронизированы с новым union (временная семантика для 8 новых, финал — Step 24.13)

**Data-layer (Step 24.2):**

- [x] `notifications.json`, `trainer-club-links.json` заведены (пустые массивы)
- [x] `DataCollectionMap`, `DATA_FILES` расширены на `notifications` и `trainerClubLinks`
- [x] Функции CRUD notifications: `getNotifications` (фильтры + сортировка DESC + offset/limit), `createNotification`, `markNotificationRead`, `markAllNotificationsRead`, `getUnreadNotificationCount`
- [x] Функции CRUD trainer-club-links: `getTrainerClubLinks` (фильтры), `getTrainerClubLinkById`, `createTrainerClubLink`, `updateTrainerClubLink` (approve/reject/revoke сценарии)
- [x] `bookings.json` очищен до `[]`
- [x] `offerings.json` мигрирован: `cancellationPolicy: 'free_until_24h'` добавлен всем 6 существующим записям
- [x] Тестовые фикстуры `fixtureClubOffering` и `fixtureTrainerOffering` получили `cancellationPolicy`; `seedTestData` пишет пустые `notifications.json` и `trainer-club-links.json`
- [x] Тесты: `src/test/lib/db-notifications.test.ts` (15 тестов), `src/test/lib/db-trainer-club-links.test.ts` (10 тестов)
- [ ] Миграция `src/data/trainers.json` (удаление `affiliatedClubId`, `clubId`) — **перенесена в Step 24.8** вместе с удалением поля из типа и рефакторингом всех 5+ точек чтения; в Step 24.2 это было бы преждевременно и сломало бы существующие компоненты

**FSM (Step 24.3):**

- [x] `FSM_TRANSITIONS` карта допустимых переходов + `TRANSITION_ACTORS` для проверки прав
- [x] `validateTransition` (throws при недопустимом переходе или неверном акторе; admin форсит любой валидный)
- [x] `transitionBooking` ядро: atomic write bookings + schedule с rollback, запись в statusHistory, fill cancelledBy/cancelReason/completedAt, dispatch-уведомления
- [x] `createBookingAtomic` переведён на `status: 'pending'` + snapshot `cancellationPolicy` + первый переход в `statusHistory`
- [x] `cancelBooking` → soft-cancel через `transitionBooking` (с ownership-guard до вызова)
- [x] `hardDeleteBooking` — отдельная функция для admin (Step 24.4 endpoint)
- [x] `runLazyBookingTransitions` — идемпотентная: pending → cancelled_by_provider за 1h до слота, confirmed → unmarked через 48h после endAt
- [x] Правила `bookedCount` по таблице: декремент при cancelled_*/rejected_*, без изменения при completed/no_show/unmarked/pending→confirmed
- [x] Наборы `ACTIVE_/COMPLETED_/CANCELLED_BOOKING_STATUSES` в `src/lib/booking-status.ts` — импортируются helper'ами (athlete-bookings, provider-helpers, athlete-achievements, athlete-favorites)
- [x] `'cancelled'` удалён из `BookingStatus` union и `BOOKING_STATUSES`; все потребители мигрированы на новые наборы или `cancelled_by_athlete`
- [x] `src/lib/notify.ts` — stub хелпера (реальная реализация в Step 24.5); `transitionBooking` уже диспетчит notify() по FSM-переходу
- [x] Тесты: `booking-fsm.test.ts` (17), `booking-lazy-transitions.test.ts` (7), адаптированы `db-booking.test.ts`, `bookings.route.test.ts`, `booking-flow-integration.test.tsx`

**API переходов (Step 24.4):**

- [x] `POST /api/bookings/[id]/confirm` — provider подтверждает pending (guard: isProviderOfBooking)
- [x] `POST /api/bookings/[id]/reject` — provider отклоняет pending, reason опционален
- [x] `POST /api/bookings/[id]/cancel` — универсальный soft-cancel (actor по userId: атлет-владелец или провайдер parent-сущности)
- [x] `POST /api/bookings/[id]/check-in` — provider отмечает completed/no_show с проверкой окна (endAt <= now <= endAt + 48h)
- [x] `DELETE /api/admin/bookings/[id]` — hard-delete для admin-роли через `isAdminUser` guard
- [x] Публичный `DELETE /api/bookings/[id]` работает как soft-cancel (без изменения публичной семантики)
- [x] `runLazyBookingTransitions()` вызывается в GET /api/bookings + `/profile/athlete/page.tsx` + `/profile/provider/page.tsx`
- [x] Helper `src/lib/booking-guards.ts`: `isProviderOfBooking(booking, userId)`, `isAdminUser(userId)` — server-side проверка через db.ts
- [x] Все переходы логируются через logAction с соответствующими новыми LogAction значениями
- [x] Тесты (24 кейса): `bookings.confirm.route.test.ts` (5), `bookings.reject.route.test.ts` (3), `bookings.cancel.route.test.ts` (4), `bookings.check-in.route.test.ts` (6), `admin.bookings.delete.route.test.ts` (4), `lazy-transitions-integration.test.ts` (2)

**Notifications infra (Step 24.5):**

- [x] `src/lib/notify.ts` — awaitable `notify(userId, type, payload): Promise<void>` через dynamic import `createNotification` (разрывает цикл db↔notify)
- [x] `dispatchTransitionNotifications` в db.ts переведён на await — запись уведомления гарантирована до возврата `transitionBooking`
- [x] `notify()` вызывается из каждого FSM-перехода: confirmed/rejected/cancelled_by_athlete/cancelled_by_provider/booking_auto_expired/completed/no_show
- [x] API: `GET /api/notifications` (items + total + unreadCount, фильтры userId/unreadOnly/offset/limit), `POST /api/notifications/[id]/read` (ownership-guard), `POST /api/notifications/read-all`, `GET /api/notifications/unread-count`
- [x] Тесты: `src/test/lib/notify.test.ts` (3 кейса: запись, Promise, silent catch), `src/test/api/notifications.route.test.ts` (10 кейсов: list с фильтрами/пагинацией, read-one, read-all, unread-count)

**Toast-стек (Step 24.6):**

- [x] `src/stores/useToastStore.ts` (Zustand): `toasts`, `addToast({ message, tone, duration })`, `dismissToast(id)`, `clearToasts()`; уникальные id, дефолтный tone='info', duration=4000
- [x] `src/components/ui/ToastStack.tsx` монтируется в `AppShell`, рендерит стек fixed bottom-right с auto-dismiss и ручным закрытием; 4 tone'а (info/success/warning/error)
- [x] `ActionNotice.tsx` удалён; 8 потребителей мигрированы на `addToast`: BookingActionBlock, AthleteProfilePage + AthleteUpcomingBookingCard (пропс `onActionNotice` снят), ProviderProfilePage, TrainerDetailPageClient, ClubDetailPageClient, UpcomingSessions, TrainerAvailability
- [x] Helper `src/test/helpers/render-with-toast.tsx`: `renderWithToast` (монтирует ToastStack + clearToasts) и `resetToasts` — 7 тестовых файлов адаптированы под toast-модель
- [x] Тесты: `useToastStore.test.ts` (6 кейсов), `ToastStack.test.tsx` (6 кейсов: пустой стек, рендер, auto-dismiss, duration=0, клик по закрытию, несколько toast'ов)

**Notifications UI (Step 24.7):**

- [x] `src/hooks/useUnreadCountPolling.ts` (usePathname-триггер, fallback interval 60s, derive 0 при userId=null, AbortController)
- [x] `src/components/layout/NotificationBell.tsx` — SVG-колокольчик, badge «99+», dropdown с 5 последними уведомлениями и ссылкой «Все уведомления» (athlete/provider); lazy-load списка при open; клик вне закрывает
- [x] `src/components/profile/notifications/NotificationsListPage.tsx` — плоский список с per-item read и mass read-all (toast-фидбек)
- [x] `src/components/profile/notifications/notification-copy.ts` — `getNotificationCopy(type, payload)` для всех 14 `NotificationType`
- [x] Server-страницы `/profile/athlete/notifications` и `/profile/provider/notifications` (`dynamic='force-dynamic'`, читают getNotifications для MVP_*_USER_ID)
- [x] NotificationBell смонтирован в `Header.tsx` рядом с user-блоком; в существующих Header-consumer тестах добавлен mock `usePathname`
- [x] Тесты: `src/test/hooks/useUnreadCountPolling.test.ts` (5 кейсов), `src/test/ui/notification-bell.test.tsx` (5 кейсов), `src/test/profile/notifications-page.test.tsx` (4 кейса)

**TrainerClubLink backend (Step 24.8):**

- [x] API: POST `/api/trainer-club-links` (create с guard isManagerOfTrainer, 409 на дубликат active link), GET (filter trainerId/clubId/status), POST `[id]/approve|reject|revoke` (manager-of-club для approve/reject, manager-любой-стороны или admin для revoke)
- [x] `src/lib/link-guards.ts`: `isManagerOfTrainer`, `isManagerOfClub`
- [x] `LogEntityType` += `'trainer_club_link'`; 4 LogAction уже есть (link_request/approve/reject/revoke)
- [x] Seed `src/data/trainer-club-links.json` — 1 confirmed-запись trainer1↔club2 (отражает существующую реальную связь)
- [x] 6 читателей `affiliatedClubId` мигрированы с приоритетом links → fallback legacy поле: `src/app/trainers/[slug]/page.tsx`, `src/app/api/trainers/[id]/route.ts`, `src/app/clubs/[slug]/page.tsx`, `src/app/api/clubs/[id]/route.ts`, `src/app/api/trainers/route.ts` (фильтр `?affiliatedClubId`), `src/components/trainers/trainer-preview.ts` (новый опциональный проп `trainerClubLinks`), `src/app/page.tsx` (прокидывает links в buildTrainerDirectory)
- [x] Helper `clearCatalogCollections` чистит и `trainer-club-links.json`, чтобы `publishCatalogPair({ clearExisting })` не оставлял висящих seed-link'ов
- [ ] Удаление полей `affiliatedClubId`/`clubId` из типов `Trainer`/`Offering`/`Schedule`/`Booking` и контрактов publish — отложено на отдельную под-подшагу (Step 24.8c) из-за объёма (30+ тестов и контракты)
- [ ] `mapTrainerFormToEntities` / reverse-mapping обновлены (Step 24.8c)
- [x] Тесты: `src/test/api/trainer-club-links.route.test.ts` (14 кейсов)

**TrainerClubLink UI (Step 24.9):**

- [x] 24.9a — `PublishTrainerModal` в edit-режиме: секция «Связать себя с клубом» с fetch GET /api/trainer-club-links?trainerId=X на open; статусы pending/confirmed показываются с кнопкой «Отозвать запрос»/«Отвязать от клуба»; rejected/revoked — плашка + возможность нового запроса; revoke-endpoint расширен для pending
- [x] 24.9b — `ProviderLinkRequestsSection` в кабинете провайдера: fetch pending-запросов по всем providerClubs, список с Подтвердить/Отклонить; блок confirmed-тренеров с «Отвязать»; toast-фидбек + router.refresh
- [x] 24.9c — Публичные поверхности: `/trainers/[slug]`, `/clubs/[slug]` и `buildTrainerDirectory` читают ТОЛЬКО confirmed links (fallback на legacy `affiliatedClubId` убран). `createTrainerPublication` auto-создаёт confirmed-link при указании clubId (MVP: provider = owner обеих сторон)
- [x] Тесты: `provider-link-requests-section.test.tsx` (4 кейса), расширен `publish-trainer-modal.test.tsx` (+2 edit-flow теста), regression `provider-profile-page.test.tsx` (2 теста адаптированы под link-модель)

**Multi-offering данные (Step 24.10):**

- [x] 24.10a — `TrainerOfferingFormItem` тип + `additionalOfferings?: TrainerOfferingFormItem[]` в `TrainerFormState` (additive — плоские offering*-поля остаются как «первая услуга»); Zod `trainerOfferingItemSchema` с refine `attachmentMode=club → clubLinkId` обязателен; `cancellationPolicy` enum в схеме
- [x] 24.10b — `mapTrainerFormToEntities` расширен: возвращает `additionalOfferings` массив из `form.additionalOfferings`; `CreateTrainerPublicationInput` принимает optional `additionalOfferings[]`; `createTrainerPublication` атомарно пишет N offerings + их schedule в один rollback
- [x] 24.10c — `AdditionalOfferingsEditor` компонент: кнопка «+ Добавить услугу», attachmentMode-чипы (Частно/В клубе), select из confirmedLinks при «В клубе», fields title/description/format/price/duration/location/cancellationPolicy, ScheduleSlotsEditor per offering, кнопка «Удалить». Смонтирован в PublishTrainerModal; confirmedLinks фетчатся в edit-режиме через fetchLinks
- [x] 24.10d — revoke-endpoint вызывает `detachOfferingsFromLink(linkId)` (новая helper-функция в db.ts): все offerings с этим `trainerClubLinkId` теряют поле (переход в «приватные»); `detachedCount` попадает в logAction meta
- [ ] `updateTrainerPublication` — full-replace массива offerings (отложено; update пока работает с первой offering как ранее)
- [ ] Reverse-mapping — чтение массива offerings (отложено: будет в Step 24.8c вместе с очисткой legacy полей)

**Multi-offering UI (Step 24.11):**

- [x] `TrainerDirectoryItem.offerings: TrainerOfferingPreview[]` — id/title/format/price/durationMinutes + venueClubName (резолв через confirmed link) + trainerClubLinkId
- [x] `priceFrom` агрегируется как `Math.min(offering.price)` по всем услугам; fallback на `trainer.priceFrom` при пустом списке
- [x] `TrainerDetailPageClient` — per-offering venue-бейдж: «В клубе X» (при `trainerClubLinkId` + `affiliatedClub`) / «Частно»
- [x] `ClubDetailPage` — confirmed-links уже фильтруют тренеров (Step 24.9c); offerings на уровне клуба напрямую не рендерятся
- [x] `filterTrainers` — без изменений (searchText уже содержит offerings.title+description, sport/city-фильтры работают на trainer-уровне)

**Reliability compute (Step 24.12):**

- [x] `src/lib/reliability.ts` — чистые функции: `computeAthleteReliability`, `computeClubReliability`, `computeTrainerReliability` + `ReliabilityResult` тип (totalRelevant/completedCount/noShowCount/lateCancelCount/rejectedByProviderCount/completionRate/badge/isNewUser)
- [x] `computeCancelReason(booking, slot, now, config)` — вынесен в reliability.ts как единый источник; db.ts импортирует обратно; `no_refund` → всегда late (freeUntilHours=0)
- [x] `isAthleteInQuarantine(bookings, userId, now, config)` — окно `windowDays=30` дней, триггер по `consecutiveNoShowTrigger=3` подряд no_show без completed посередине, до `durationDays=7` от последнего no_show
- [x] Тест: `src/test/lib/reliability.test.ts` (23 кейса) — isNewUser/warning/danger для атлета, provider-формула, все 4 policy × окно/вне окна для cancelReason, карантин с разрывом/истечением/другим userId

**Reliability UI (Step 24.13):**

- [x] `src/components/ui/ReliabilityBadge.tsx` — shared компонент с тремя вариациями: `Новый пользователь` / `Умеренно надёжен (XX%)` / `Низкая надёжность (XX%)`, опциональный `showDetails` выводит `completed / total`
- [x] `AthleteProfilePage` — секция «Мой рейтинг надёжности» между achievements и upcoming: `athleteReliability = computeAthleteReliability(athleteBookings, userId)`; для isNewUser показывает плашку «нужно ещё N», иначе 3 KPI-карточки (процент, no_show, late_cancel)
- [x] `ProviderBookingsSection` получает `allBookings` и для каждой входящей заявки рендерит `ReliabilityBadge` атлета (compact + showDetails)
- [x] `ProviderIncomingBooking.athleteUserId` добавлено в тип для резолва
- [x] Тесты: `src/test/ui/reliability-badge.test.tsx` (6 кейсов — isNewUser/warning/danger/скрытый/showDetails/compact)
- [ ] Расшифровка в ЛК атлета и провайдера
- [ ] Рейтинг атлета в ProviderIncomingBooking

**Дисциплинарные последствия (Step 24.14):**

- [x] `LateCancelWarningModal` (inline в `AthleteUpcomingBookingCard`): client-side `isLateCancelPreview` по snapshot-policy + now; при late — модалка «Эта отмена будет засчитана как поздняя», кнопки «Оставить запись» / «Всё равно отменить»; on_time → отмена без модалки
- [x] Guard карантина в `POST /api/bookings` → 403 с `{ error: 'quarantine', until, reason }`
- [x] Плашка в `/profile/athlete` сверху (красный баннер с датой окончания и пояснением про восстановление репутации)
- [x] `UpcomingProfileBooking.cancellationPolicySnapshot` пробрасывается из `Booking`
- [ ] Booking-страница `/booking/[scheduleId]` disabled CTA при карантине (отложено)
- [ ] Уведомления `quarantine_start` / `quarantine_end` с дедупликацией через `notifiedUntil` (отложено)
- [x] Тесты: `bookings.route.test.ts` (+1 quarantine-guard), `athlete-profile-page.test.tsx` (адаптирован — late-cancel flow через модалку)

**Super Admin (Step 24.15):**

- [x] Колонки «Надёжность» (ReliabilityBadge compact+showDetails) и «Карантин до» (red Badge с датой) в `DashboardPage`; row-actions «Снять карантин» (показывается только если inQuarantine) и «Пересчитать рейтинг» (для athlete)
- [x] `BookingStatusHistoryDrawer` (`src/components/admin/BookingStatusHistoryDrawer.tsx`) — рендерит таймлайн `Booking.statusHistory` через существующий `Modal`; `from → to`, actor, at (локализовано), reason; плашка «История пуста» для booking без переходов
- [x] `POST /api/admin/users/[id]/lift-quarantine` — пишет `User.quarantineLiftedAt = now` через новый `liftUserQuarantine()` в db.ts; логирует `quarantine_admin_lift` с `meta.quarantineLiftedAt`; admin-guard
- [x] `POST /api/admin/users/[id]/recompute-reliability` — no-op + `await logAction('reliability_recompute')`; точка приложения для будущего кэш-слоя
- [x] `POST /api/admin/trainer-club-links/[id]/force-revoke` — форсированный revoke с `revokedBy='admin'`; уведомляет ОБЕ стороны (trainer manager + club manager); вызывает `detachOfferingsFromLink`; логирует `link_revoke` с `meta.forced=true` и `actorRole='admin'`
- [x] `isAthleteInQuarantine(bookings, userId, now, { quarantineLiftedAt })` — новая сигнатура через options-object; lift позже последнего no_show снимает карантин; 2 call-site (POST /api/bookings, AthleteProfilePage) прокидывают `user.quarantineLiftedAt`
- [x] Фильтры по новым LogAction в LogsPage — уже были со Step 24.1 (ACTION_LABELS содержит 14 Phase 24 экшенов, фильтр auto-генерируется из Object.entries)
- [ ] Опциональный раздел «Дисциплина» в AdminNavigation — отложено (нет отдельной страницы — все controls живут на Dashboard)
- [x] Все админские действия логируются (`quarantine_admin_lift`, `reliability_recompute`, `link_revoke` с `forced=true`)
- [x] Тесты (+22 новых): `reliability.test.ts` (+2 кейса на quarantineLiftedAt), `admin.lift-quarantine.route.test.ts` (5), `admin.recompute-reliability.route.test.ts` (3), `admin.force-revoke-link.route.test.ts` (4), `dashboard-reliability-columns.test.tsx` (5), `booking-status-history-drawer.test.tsx` (4), + миграция 6 существующих `isAthleteInQuarantine` тестов на options-object

**Seed + финал (Step 24.16):**

- [ ] Seed: 5–6 users, 2 clubs, 2 trainers (1 multi-offering), 1+1 links, 4–5 bookings в разных статусах
- [ ] Новые feature-docs: `booking-lifecycle.md`, `reliability.md`, `notifications.md`, `trainer-club-link.md`
- [ ] Обновлены: `booking.md`, `admin.md`, `data-layer.md`, `publish-flow.md`, `_overview.md`
- [ ] `CLAUDE.md`, `PHASES_OVERVIEW.md`, `PROJECT_STATE.md`, `README.md`, `STACK_OVERVIEW.md` — синхронизированы
- [ ] `format / lint / test / build` зелёные
- [ ] E2E-сценарий дисциплины пройден в браузере

**Выполнено:** Step 24.1 ✅, Step 24.2 ✅, Step 24.3 ✅, Step 24.4 ✅, Step 24.5 ✅, Step 24.6 ✅, Step 24.7 ✅, Step 24.8 частично ✅ (24.8a/24.8b; 24.8c после 24.10), Step 24.9 ✅, Step 24.10 частично ✅, Step 24.11 ✅, Step 24.12 ✅, Step 24.13 ✅ (ядро), Step 24.14 частично ✅ (ядро: guard+плашка+late-cancel warning; disabled CTA booking-страницы и quarantine_start/end notifications отложены), Step 24.15 ✅ (ядро: lift-quarantine/recompute-reliability/force-revoke endpoints, Dashboard reliability+quarantine columns, BookingStatusHistoryDrawer; AdminNavigation «Дисциплина» секция отложена, Drawer не интегрирован c LogsPage — точечная интеграция на Step 24.16 по факту)

**Следующий шаг:** Step 24.16 — Seed + feature-docs + финальная верификация: наполнить seed (5–6 users, 2 clubs, 2 trainers multi-offering, 1+1 links, 4–5 bookings в разных статусах); создать `feature-docs/booking-lifecycle.md`, `reliability.md`, `notifications.md`, `trainer-club-link.md`; обновить `booking.md`, `admin.md`, `data-layer.md`, `publish-flow.md`, `_overview.md`; синхронизировать `CLAUDE.md` / `PHASES_OVERVIEW.md` / `PROJECT_STATE.md` / `README.md` / `STACK_OVERVIEW.md`; полный E2E-сценарий дисциплины в браузере; `format/lint/test/build` зелёные. Опционально «доделки»: интеграция BookingStatusHistoryDrawer в LogsPage (клик по booking-id), AdminNavigation секция «Дисциплина», disabled CTA на `/booking/[scheduleId]` в карантине, `quarantine_start`/`end` notifications, `updateTrainerPublication` full-replace offerings (Step 24.8c/24.10 хвосты).

**Статус Phase 24:** 🔄 В РАБОТЕ

---

### Принцип масштабирования

- **FSM Booking** при переходе на Prisma превращается в поле `status` с PostgreSQL-enum, `statusHistory` — отдельная таблица `booking_transitions (booking_id FK, from, to, actor, actor_user_id, at, reason)`. `validateTransition` остаётся в application layer.
- **`TrainerClubLink`** на Prisma — самостоятельная таблица с unique index на `(trainer_id, club_id, status='confirmed')` для гарантии одной активной связи.
- **Multi-offering тренера** — уже в MVP построен как one-to-many `Trainer → Offering`, прямой маппинг на Prisma через FK `offerings.trainer_id`.
- **Notifications**: модель `notifications` на Prisma, индекс на `(user_id, read_at IS NULL)` для быстрого unread-count. Клиентская часть переезжает с polling на SSE — сервер добавляет route `/api/notifications/stream`, клиент заменяет хук `useUnreadCountPolling` на `useNotificationStream`. API и типы не меняются.
- **Reliability compute**: при росте трафика — переход на materialized view в PostgreSQL, пересчитываемый по триггеру на `INSERT/UPDATE` в `bookings`. Публичные функции в `reliability.ts` остаются как тонкие обёртки с fallback на lazy compute.
- **Карантин** и все дисциплинарные параметры живут в `discipline-config.ts`. При росте — переезжает в feature-flags (LaunchDarkly / Unleash) или отдельную таблицу `platform_config` в БД с hot-reload.
- **Ленивые автопереходы** (`runLazyBookingTransitions`): при росте нагрузки отделяются в cron-задачу (BullMQ / cloud scheduler), таблица переходов становится идемпотентной.
- **Toast-стек** — пригоден к переносу на push: `addToast` остаётся, добавляется `ToastChannel` (push-stream-подписка), UI остаётся.
- **Super Admin инструменты** — все через REST routes `/api/admin/*`, на будущее легко оборачиваются в RBAC-middleware (policy-based).

### Приложение: Карта потребителей `affiliatedClubId` (для Step 24.8)

> При реализации Step 24.8 сверяться с этим списком, чтобы не пропустить файлы.

**`Trainer.affiliatedClubId` / `Offering.affiliatedClubId` (обе ветки) — миграция на `getTrainerClubLinks({ status: 'confirmed' })`:**

- `src/types/index.ts` — объявления полей (удалить).
- `src/app/api/trainers/[id]/route.ts:55–61, 65, 67` — GET выдаёт `affiliatedClub` + `club`; теперь через links.
- `src/app/api/trainers/route.ts:16, 23, 55, 58–68` — query-фильтр `?affiliatedClubId` / `?clubId`; на lookup через links.
- `src/app/trainers/[slug]/page.tsx:84–88` — резолв клуба по offerings; на links.
- `src/app/clubs/[slug]/page.tsx:60–69` — список тренеров клуба; на links.
- `src/app/api/clubs/[id]/route.ts:61–67` — аналогично.
- `src/components/trainers/trainer-preview.ts:131–144` — `venueClub`; на links.
- `src/lib/contracts/publish-trainer.ts:92, 105, 169, 175` — запись `affiliatedClubId`; заменяется на link-flow в Step 24.10.
- `src/lib/contracts/reverse-mapping.ts:101` — чтение `trainer.affiliatedClubId`; удалить.
- `src/components/profile/PublishTrainerModal.tsx:94, 484–510` — поле формы `clubId` остаётся, но теперь создаёт link через API.
- `src/data/trainers.json`, `src/data/offerings.json` — убрать поля из существующих записей в Step 24.2.
- тесты, использующие `affiliatedClubId` в ассёртах (не менее 10 файлов в `src/test/**`) — обновить.

# E2E: Booking FSM (Phase 16 + Phase 24)

**Role:** cross-role (athlete ↔ provider)
**Base URL:** http://localhost:3000
**Preconditions:**

- Seed; у провайдера id=2 есть опубликованный клуб/тренер и слот расписания в будущем
- dev-сервер запущен
- `bookings.json` можно опционально очистить перед сценарием для изоляции

## Scenario: Создание pending и видимость в обоих ЛК

**Role:** athlete (id=1) → provider (id=2)

- [ ] **step-1** Login athlete, navigate на деталку клуба/тренера Марины — expect блок расписания
- [ ] **step-2** Click слот → переход на `/booking/[scheduleId]`
- [ ] **step-3** Click «Записаться» → expect success, переход в `/profile/athlete/dashboard`
- [ ] **step-4** Navigate `/profile/athlete/schedule` — expect карточка со статусом `pending`
- [ ] **step-5** Logout, login provider, navigate `/profile/provider/bookings?tab=pending` — expect карточка с именем «Алексей Смирнов»

## Scenario: Confirm / Reject провайдером

**Role:** provider (id=2)

- [ ] **step-1** Login, в `/profile/provider/bookings` tab pending — click «Подтвердить» → expect toast, статус `confirmed`
- [ ] **step-2** Logout → login athlete → `/profile/athlete/notifications` — expect уведомление `booking_confirmed`
- [ ] **step-3** Новый pending (повторить scenario 1) → provider click «Отклонить» — expect ОТКРЫТИЕ модалки `RejectBookingReasonModal` (Phase 27 Step 27.13), а НЕ моментальный POST. До submit'а никаких сетевых запросов
- [ ] **step-3a** Заполнить textarea «Причина отказа» текстом «Время не подходит» → click «Отклонить» → expect toast «Запись отклонена», статус `rejected_by_provider`, body запроса `POST /api/bookings/[id]/reject` содержит `{ userId, reason: "Время не подходит" }`
- [ ] **step-3b** Logout → login athlete → `/profile/athlete/notifications` или dropdown колокольчика — expect карточка `booking_rejected` с описанием **«Причина: Время не подходит»** (Step 27.13)
- [ ] **step-3c** Создать ещё один pending → provider click «Отклонить» → в модалке СРАЗУ click «Отклонить» (без ввода) → expect `rejected_by_provider`, body запроса `{ userId }` без поля `reason`. Атлет в уведомлении видит fallback «Провайдер отклонил запись. Попробуйте другой слот.»
- [ ] **step-3d** Создать ещё один pending → provider click «Отклонить» → в модалке click «Отмена» (или ESC, или клик вне модалки) → expect модалка закрылась, статус booking'а ОСТАЛСЯ `pending`, никакого POST не было
- [ ] **step-3e** После закрытия модалки в 3d — открыть её снова кликом «Отклонить» → expect textarea ПУСТАЯ (текст из предыдущей сессии не утёк, Step 27.13)

## Scenario: Check-in после слота

**Role:** provider (id=2)

- [ ] **step-1** Иметь confirmed booking на прошедший слот (можно через правку `bookings.json` или подождать). Provider navigate `/profile/provider/bookings?tab=check-in`
- [ ] **step-2** Click «Пришёл» — expect `completed`, toast success
- [ ] **step-3** Для другой записи — click «Не пришёл» → expect `no_show`, атлет получает уведомление `booking_no_show`
- [ ] **step-4** 48+ часов после endAt без действий — при next-open страницы → статус автоматически `unmarked`

## Scenario: Auto-cancel pending за 1ч до слота

**Role:** athlete → provider

- [ ] **step-1** Athlete создал pending на слот <1h вперёд (либо правка `bookings.json`)
- [ ] **step-2** Навигация provider'а в `/profile/provider/bookings` или `/profile/athlete/schedule` — expect `runLazyBookingTransitions` сработала, статус `cancelled_by_provider` (actor=system)
- [ ] **step-3** Athlete: уведомление `booking_auto_expired` в колокольчике
- [ ] **step-4** Provider: уведомление `booking_auto_expired_to_provider` в колокольчике (Phase 26 hotfix)

## Scenario: Отмены и late/on_time

**Role:** athlete → provider

- [ ] **step-1** Booking создан с offering.cancellationPolicy=`free_until_24h`
- [ ] **step-2** Athlete отменяет за 25 часов до слота → `cancelled_by_athlete`, `cancelReason=on_time`
- [ ] **step-3** Создать новый booking, отменить за 2 часа до слота → `cancelReason=late`, в UI плашка «поздняя отмена»
- [ ] **step-4** Provider отменяет confirmed → `cancelled_by_provider`, атлет получает уведомление

## Scenario: Snapshot cancellationPolicy

**Role:** provider → athlete

- [ ] **step-1** Create booking с policy=`free_until_24h`
- [ ] **step-2** Provider в edit offering меняет policy на `no_refund` → save
- [ ] **step-3** Athlete отменяет эту бронь за 25 часов до слота — expect `cancelReason=on_time` (snapshot 24h сохранил старую политику, а не текущую `no_refund`)

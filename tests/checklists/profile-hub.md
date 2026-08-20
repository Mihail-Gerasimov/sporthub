# E2E: Profile Hub (Phase 25 + Phase 26 Steps 26.1/26.5/26.8/26.9/26.10 + Phase 27 Step 27.8)

**Role:** cross-role (athlete / provider / guest)
**Base URL:** http://localhost:3000
**Preconditions:**

- Seed; у провайдера id=2 есть ≥1 клуб и ≥1 тренер
- dev-сервер запущен

## Scenario: Redirect корневых `/profile/*`

**Role:** athlete (id=1) → provider (id=2)

- [ ] **step-1** Login athlete, navigate `/profile/athlete` — expect redirect на `/profile/athlete/dashboard`
- [ ] **step-2** Logout, login provider, navigate `/profile/provider` — expect redirect на `/profile/provider/dashboard`
- [ ] **step-3** Assert в DOM нет монолитного `ProviderProfilePage` / `AthleteProfilePage` (удалены в Step 26.5)

## Scenario: Подмаршруты кабинета атлета

**Role:** athlete (id=1)

- [ ] **step-1** Login, navigate `/profile/athlete/dashboard` — expect reliability-секция, KPI, ближайшая запись
- [ ] **step-2** Navigate `/profile/athlete/schedule` — expect 4 FSM-фильтра (Все / Активные / Завершённые / Отменённые)
- [ ] **step-3** Navigate `/profile/athlete/stats` — expect графики Recharts (стрики, часы, completion rate)
- [ ] **step-4** Navigate `/profile/athlete/favorites` — expect избранное или empty-state
- [ ] **step-5** Navigate `/profile/athlete/reviews` — expect «Мои отзывы» или empty-state
- [ ] **step-6** Navigate `/profile/athlete/settings` — expect редактор notification preferences
- [ ] **step-7** Navigate `/profile/athlete/notifications` — expect `NotificationsListPage`

## Scenario: Подмаршруты кабинета провайдера и 5 KPI

**Role:** provider (id=2)

- [ ] **step-1** Login, navigate `/profile/provider/dashboard` — expect **5 KPI-карточек** в ряду: «Ожидают подтверждения», «Заявки на привязку», «Check-in истекает», «Непрочитанные», **«Рейтинг»** (Step 26.9)
- [ ] **step-2** Assert карточка «Рейтинг» — линк на `/profile/provider/reviews`
- [ ] **step-3** Assert карточка «Ожидают» — линк на `/profile/provider/bookings?tab=pending` (или аналог)
- [ ] **step-4** Navigate по всем 9 подмаршрутам: `bookings`, `clients`, `stats`, `links`, `publications`, `reviews`, `settings`, `finance`, `notifications` — каждый рендерится без 500

## Scenario: `ProfileBreadcrumb` (Step 26.10)

**Role:** athlete или provider

- [ ] **step-1** Login athlete, navigate `/profile/athlete/dashboard` — expect breadcrumb **НЕ виден**
- [ ] **step-2** Navigate `/profile/athlete/schedule` — expect breadcrumb `Обзор / Расписание` над контентом
- [ ] **step-3** Click «Обзор» — expect redirect на `/profile/athlete/dashboard`
- [ ] **step-4** На viewport < 768px (mobile) — breadcrumb виден даже при скрытом sidebar
- [ ] **step-5** Повторить step-2 для provider на всех подмаршрутах, кроме dashboard

## Scenario: Access-denied при чужом типе ЛК

**Role:** cross (athlete + guest)

- [ ] **step-1** Login athlete, navigate `/profile/provider/dashboard` — expect `AccessDeniedCard` (Step 26.1) с `requiredRole="provider"`, кнопка «Войти на другой»
- [ ] **step-2** Logout, navigate `/profile/athlete/settings` — expect `AccessDeniedCard` для guest'а
- [ ] **step-3** Assert UX одинаковый на всех **17 подмаршрутах** (7 athlete + 10 provider, нет визуальных расхождений)
- [ ] **step-4** Phase 27 Step 27.8 — guest заходит на 3 ранее сломанных маршрута: `/profile/athlete/schedule`, `/profile/athlete/notifications`, `/profile/provider/notifications`. Expect `AccessDeniedCard` на всех трёх: data-testid `profile-access-denied-athlete` (первые два) и `profile-access-denied-provider` (третий), heading «Доступ ограничен», **НЕТ** пустых табов `Все 0 / Записи 0 / Дисциплина 0` и плашек «У вас нет записей»
- [ ] **step-5** Phase 27 Step 27.8 cross-role: login athlete, navigate `/profile/provider/notifications` — expect `AccessDeniedCard` с badge «Provider only». Logout, login provider, navigate `/profile/athlete/schedule` — expect `AccessDeniedCard` с badge «Athlete only»

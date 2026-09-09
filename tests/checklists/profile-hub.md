# E2E: Profile Hub (Phase 25 + Phase 26 Steps 26.1/26.5/26.8/26.9/26.10 + Phase 27 Step 27.8)

**Role:** cross-role (athlete / provider / guest)
**Base URL:** http://localhost:3000
**Preconditions:**

- База поднята и засеяна (`npm run db:up`, `npm run db:seed`), подняты бэкенд `:3001` и фронт `:3000`
- Учётки из сида `apps/api/src/storage/seed/dev-seed.ts`, пароль общий — `DEV_PASSWORD`:
  атлет id=4 `athlete@sporthub.local`, представитель услуг id=2 `owner@sporthub.local`
  (роль `club_owner`, у него 2 клуба), тренер id=3 `trainer@sporthub.local` (у него карточка тренера)
- ⚠️ Кабинет провайдера общий для обеих ролей, но **разделы внутри разные**: у представителя
  услуг «Публикации», у тренера «Моя карточка». Роль сценария выбирать по проверяемому разделу

## Scenario: Redirect корневых `/profile/*`

**Role:** athlete (id=4) → provider (id=2)

- [ ] **step-1** Login athlete, navigate `/profile/athlete` — expect redirect на `/profile/athlete/dashboard`
- [ ] **step-2** Logout, login provider, navigate `/profile/provider` — expect redirect на `/profile/provider/dashboard`
- [ ] **step-3** Assert в DOM нет монолитного `ProviderProfilePage` / `AthleteProfilePage`: кабинет собран из разделов, а не из одной страницы

## Scenario: Подмаршруты кабинета атлета

**Role:** athlete (id=4)

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

## Scenario: Чужой кабинет закрыт на сервере

**Role:** cross (athlete + guest)

⚠️ Решение принимает layout кабинета (`requireRole` в `apps/web/src/app/profile/*/layout.tsx`):
гостя и чужую роль он уводит на главную **до** загрузки данных. Проверяется именно это —
что данных кабинета в ответе нет вовсе, а не что их спрятали плашкой поверх.

- [ ] **step-1** Login athlete, navigate `/profile/provider/dashboard` — expect увели на главную `/`
- [ ] **step-2** Logout, navigate `/profile/athlete/settings` — expect гостя увели на главную `/`
- [ ] **step-3** Assert поведение одинаковое на всех **17 подмаршрутах** (7 athlete + 10 provider): проверка стоит в layout, а не в каждой странице, и пропущенных маршрутов быть не должно
- [ ] **step-4** Guest заходит на `/profile/athlete/schedule`, `/profile/athlete/notifications`, `/profile/provider/notifications` — на всех трёх увели на главную. Assert по **исходному** HTML/RSC-потоку ответа: в нём нет ни записей, ни уведомлений, ни пустых табов `Все 0 / Записи 0 / Дисциплина 0`
- [ ] **step-5** Cross-role: login athlete, navigate `/profile/provider/notifications` — увели на главную. Logout, login provider (id=2), navigate `/profile/athlete/schedule` — тоже увели на главную

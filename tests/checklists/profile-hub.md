# E2E: Profile Hub (Phase 25 + Phase 26 Steps 26.1/26.5/26.8/26.9/26.10 + Phase 27 Step 27.8)

**Role:** cross-face (гость / человек без лиц / человек с лицами / админ)
**Base URL:** http://localhost:3000
**Preconditions:**

- База поднята и засеяна (`npm run db:up`, `npm run db:seed`), подняты бэкенд `:3001` и фронт `:3000`
- Учётки из сида `apps/api/src/storage/seed/dev-seed.ts`, общий пароль — `DEV_PASSWORD`:
  id=4 `athlete@sporthub.local` (лиц нет), id=2 `owner@sporthub.local` (клубы 1 и 2),
  id=3 `trainer@sporthub.local` (карточка тренера 1), id=5 `both@sporthub.local`
  (клуб 3 **и** карточка тренера 2), id=1 `admin@sporthub.local` (служебная запись)

⚠️ **Ролей нет (фаза 35).** Кабинетов два, и делятся они не по роли, а по адресату:
`/profile/athlete/*` — **личный** кабинет человека (записи, отзывы, избранное), он есть
у любого вошедшего, включая владельца зала; `/profile/provider/*` — кабинет **лица услуг**,
и в него пускает наличие хотя бы одного лица. Разделы внутри зависят от того, чем человек
владеет: у клубов — «Публикации», у карточки тренера — «Моя карточка», у человека с обоими —
**оба пункта сразу**.

⚠️ **Адреса в коде прежние.** Адресных `/profile/me/*`, `/profile/club/[id]/*`,
`/profile/trainer/[id]/*` из решения 5.8 на диске пока нет; кабинет лица один на все лица
человека, текущее лицо задаёт переключатель. Когда адреса станут адресными, шаги ниже
меняются вместе с ними.

## Scenario: Redirect корневых `/profile/*`

**Role:** id=4 → id=2

- [ ] **step-1** Login id=4, navigate `/profile/athlete` — expect redirect на `/profile/athlete/dashboard`
- [ ] **step-2** Logout, login id=2, navigate `/profile/provider` — expect redirect на `/profile/provider/dashboard`
- [ ] **step-3** Assert в DOM нет монолитного `ProviderProfilePage` / `AthleteProfilePage`: кабинет собран из разделов, а не из одной страницы

## Scenario: Подмаршруты личного кабинета

**Role:** id=4 (лиц нет)

- [ ] **step-1** Login, navigate `/profile/athlete/dashboard` — expect reliability-секция, KPI, ближайшая запись
- [ ] **step-2** Navigate `/profile/athlete/schedule` — expect 4 FSM-фильтра (Все / Активные / Завершённые / Отменённые)
- [ ] **step-3** Navigate `/profile/athlete/stats` — expect графики Recharts (стрики, часы, completion rate)
- [ ] **step-4** Navigate `/profile/athlete/favorites` — expect избранное или empty-state
- [ ] **step-5** Navigate `/profile/athlete/reviews` — expect «Мои отзывы» или empty-state
- [ ] **step-6** Navigate `/profile/athlete/settings` — expect редактор notification preferences
- [ ] **step-7** Navigate `/profile/athlete/notifications` — expect `NotificationsListPage`
- [ ] **step-8** Assert: список разделов в сайдбаре — ровно семь и одинаковый для любого
      вошедшего человека: «Обзор», «Расписание», «Статистика», «Избранное», «Отзывы»,
      «Уведомления», «Настройки». Лица на него не влияют

## Scenario: Личный кабинет есть и у владельца лиц

**Role:** id=2 (два клуба)

Проверка того, что фаза 35 вернула: человек с залом сам ходит на тренировки, и личный
кабинет ему нужен так же, как всем. Прежде роль провайдера уводила его с этих адресов.

- [ ] **step-1** Login id=2, navigate `/profile/athlete/dashboard` — expect **страница
      открылась**, кабинет обычный, увода на главную нет
- [ ] **step-2** Navigate `/profile/athlete/schedule` и `/profile/athlete/favorites` — открываются
- [ ] **step-3** Assert: это личные данные человека, а не сводка его клубов — в расписании
      его собственные записи, а не записи клиентов
- [ ] **step-4** Logout, login id=1 (админ), navigate `/profile/athlete/dashboard` — expect
      увели на главную `/`: у служебной записи базового набора человека нет (решение 13)

## Scenario: Подмаршруты кабинета лица и 5 KPI

**Role:** id=2

- [ ] **step-1** Login, navigate `/profile/provider/dashboard` — expect **5 KPI-карточек** в ряду: «Ожидают подтверждения», «Заявки на привязку», «Check-in истекает», «Непрочитанные», **«Рейтинг»** (Step 26.9)
- [ ] **step-2** Assert карточка «Рейтинг» — линк на `/profile/provider/reviews`
- [ ] **step-3** Assert карточка «Ожидают» — линк на `/profile/provider/bookings?tab=pending` (или аналог)
- [ ] **step-4** Navigate по всем 9 подмаршрутам: `bookings`, `clients`, `stats`, `links`, `publications`, `reviews`, `settings`, `finance`, `notifications` — каждый рендерится без 500

⚠️ Разделы «Бронирования», «Клиенты» и «Статистика» появляются только при наличии записей
у публикаций человека, «Связи» и «Отзывы» — при наличии самих публикаций
(`apps/web/src/components/profile/profile-nav-items.ts`). В свежем сиде записей нет:
чтобы увидеть все девять пунктов, сначала создать запись под id=4 на слот клуба 1.

## Scenario: Разделы кабинета собираются от лиц

**Role:** id=2 → id=3 → id=5

Ключевая проверка фазы 35: набор разделов выводится из владения, а не из типа записи.

- [ ] **step-1** Login id=2 (только клубы), `/profile/provider/dashboard` — assert в сайдбаре
      пункт **«Публикации»** есть, пункта **«Моя карточка»** нет
- [ ] **step-2** Logout, login id=3 (только карточка тренера) — assert наоборот:
      **«Моя карточка»** есть, **«Публикации»** нет
- [ ] **step-3** Logout, login id=5 (клуб и карточка) — assert **оба пункта присутствуют
      одновременно**. Это то, что прежняя модель выразить не могла вовсе
- [ ] **step-4** Assert: сверять списками целиком, а не наличием одного пункта — общий хвост
      «Финансы», «Уведомления», «Настройки» одинаков у всех трёх
- [ ] **step-5** Assert у id=5: переключатель лиц (`FaceSwitcher`) виден, заголовок
      «Кабинет лица», подписи вида — «Клуб» и «Карточка тренера». У id=3 (одно лицо)
      переключателя **нет в разметке вовсе**

## Scenario: `ProfileBreadcrumb` (Step 26.10)

**Role:** любой вошедший человек

- [ ] **step-1** Login id=4, navigate `/profile/athlete/dashboard` — expect breadcrumb **НЕ виден**
- [ ] **step-2** Navigate `/profile/athlete/schedule` — expect breadcrumb `Обзор / Расписание` над контентом
- [ ] **step-3** Click «Обзор» — expect redirect на `/profile/athlete/dashboard`
- [ ] **step-4** На viewport < 768px (mobile) — breadcrumb виден даже при скрытом sidebar
- [ ] **step-5** Повторить step-2 для id=2 в кабинете лица на всех подмаршрутах, кроме dashboard

## Scenario: Кабинет закрыт на сервере

**Role:** cross (гость + человек без лиц + админ)

⚠️ Решение принимает layout кабинета (`apps/web/src/app/profile/*/layout.tsx`), и принимает
его **до** загрузки данных. Проверок теперь три разных, и путать их нельзя:

- `/profile/athlete/*` — `requirePerson()`: пускает любого вошедшего человека, отказывает
  гостю и **служебной записи**;
- `/profile/provider/*` — `requireSession()` плюс `session.faces.length === 0 → redirect('/')`:
  пускает того, у кого есть хотя бы одно лицо;
- `/service-portal/*` — `requireAdmin()`.

Проверяется именно это — что данных кабинета в ответе нет вовсе, а не что их спрятали
плашкой поверх.

- [ ] **step-1** Login id=4 (лиц нет), navigate `/profile/provider/dashboard` — expect увели
      на главную `/`. Причина отказа сменилась: не «чужая роль», а **нет ни одного лица услуг**
- [ ] **step-2** Logout, navigate `/profile/athlete/settings` — expect гостя увели на главную `/`
- [ ] **step-3** Assert поведение одинаковое на всех **17 подмаршрутах** (7 личных + 10 лица):
      проверка стоит в layout, а не в каждой странице, и пропущенных маршрутов быть не должно
- [ ] **step-4** Guest заходит на `/profile/athlete/schedule`, `/profile/athlete/notifications`,
      `/profile/provider/notifications` — на всех трёх увели на главную. Assert по **исходному**
      HTML/RSC-потоку ответа: в нём нет ни записей, ни уведомлений, ни пустых табов
- [ ] **step-5** Login id=1 (админ), navigate `/profile/athlete/dashboard` и
      `/profile/provider/dashboard` — увели на главную с обоих: у служебной записи нет
      ни базового набора человека, ни лиц услуг
- [ ] **step-6** Контрольная группа: login id=2, navigate `/profile/athlete/dashboard` —
      **открылось**. Отказ по лицам не должен превращаться в отказ по личному кабинету

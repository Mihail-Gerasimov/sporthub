# E2E: Profile Hub (Phase 25 + Phase 26 Steps 26.1/26.5/26.8/26.9/26.10 + Phase 27 Step 27.8 + Phase 35 Steps 35.31–35.37)

**Role:** cross-face (гость / человек без лиц / человек с лицами / админ)
**Base URL:** http://localhost:3000
**Preconditions:**

- База поднята и засеяна (`npm run db:up`, `npm run db:seed`), подняты бэкенд `:3001` и фронт `:3000`
- Учётки из сида `apps/api/src/storage/seed/dev-seed.ts`, общий пароль — `DEV_PASSWORD`:
  id=4 `athlete@sporthub.local` (лиц нет), id=2 `owner@sporthub.local` (клубы 1 и 2),
  id=3 `trainer@sporthub.local` (карточка тренера 1), id=5 `both@sporthub.local`
  (клуб 3 **и** карточка тренера 2), id=1 `admin@sporthub.local` (служебная запись)

⚠️ **Ролей нет (фаза 35).** Кабинетов два вида, и делятся они не по роли, а по адресату:

- **личный кабинет человека** — `/profile/me/*`: записи, отзывы, избранное. Он есть
  у любого вошедшего человека, включая владельца зала;
- **кабинет лица услуг** — `/profile/<вид>/<номер>/*`, где вид это `club` или `trainer`.
  Кабинет принадлежит **одному лицу**: у человека с залом и своей карточкой тренера
  ДВА кабинета с разными адресами, а не один со смешанными разделами.

⚠️ **Прежние адреса живы и уводят на новые** (`apps/web/src/lib/service-faces.ts`):
`/profile/athlete/*` → **308** на `/profile/me/*` (соответствие неизменное и одно для всех,
ответ кэшируемый); `/profile/provider/*` → **307** на кабинет **первого** лица из сессии
(назначение зависит от вошедшего, поэтому постоянным быть не может; у человека без лиц —
на `/`). Разделы имён не меняли, поэтому переезд — это замена начала адреса.

## Scenario: Redirect корневых `/profile/*`

**Role:** id=4 → id=2

- [ ] **step-1** Login id=4, navigate `/profile/me` — expect redirect (307) на `/profile/me/dashboard`
- [ ] **step-2** Logout, login id=2, navigate `/profile/club/1` — expect redirect (307) на `/profile/club/1/dashboard`
- [ ] **step-3** Прежние адреса: `/profile/athlete/schedule` — **308** на `/profile/me/schedule`;
      `/profile/provider/bookings` — **307** на `/profile/club/1/bookings`. Assert коды именно
      такие: постоянный редирект на адрес, зависящий от вошедшего, увёл бы закэшировавший
      его браузер в чужой кабинет
- [ ] **step-4** Assert в DOM нет монолитного `ProviderProfilePage` / `AthleteProfilePage`: кабинет собран из разделов, а не из одной страницы

## Scenario: Подмаршруты личного кабинета

**Role:** id=4 (лиц нет)

- [ ] **step-1** Login, navigate `/profile/me/dashboard` — expect reliability-секция, KPI, ближайшая запись
- [ ] **step-2** Navigate `/profile/me/schedule` — expect 4 FSM-фильтра (Все / Активные / Завершённые / Отменённые)
- [ ] **step-3** Navigate `/profile/me/stats` — expect графики Recharts (стрики, часы, completion rate)
- [ ] **step-4** Navigate `/profile/me/favorites` — expect избранное или empty-state
- [ ] **step-5** Navigate `/profile/me/reviews` — expect «Мои отзывы» или empty-state
- [ ] **step-6** Navigate `/profile/me/settings` — expect редактор notification preferences
- [ ] **step-7** Navigate `/profile/me/notifications` — expect `NotificationsListPage`
- [ ] **step-8** Assert: список разделов в сайдбаре — ровно семь и одинаковый для любого
      вошедшего человека, в этом порядке: «Обзор», «Расписание», «Статистика», «Избранное»,
      «Отзывы», «Уведомления», «Настройки» (`PERSONAL_SECTIONS` в
      `apps/web/src/components/profile/profile-nav-items.ts`). Лица на него не влияют

## Scenario: Личный кабинет есть и у владельца лиц

**Role:** id=2 (два клуба)

Проверка того, что фаза 35 вернула: человек с залом сам ходит на тренировки, и личный
кабинет ему нужен так же, как всем. Прежде роль провайдера уводила его с этих адресов.

- [ ] **step-1** Login id=2, navigate `/profile/me/dashboard` — expect **страница
      открылась**, кабинет обычный, увода на главную нет
- [ ] **step-2** Navigate `/profile/me/schedule` и `/profile/me/favorites` — открываются
- [ ] **step-3** Assert: это личные данные человека, а не сводка его клубов — в расписании
      его собственные записи, а не записи клиентов
- [ ] **step-4** Logout, login id=1 (админ), navigate `/profile/me/dashboard` — expect
      увели на главную `/` (`requirePerson()`): у служебной записи базового набора
      человека нет (решение 13)

## Scenario: Подмаршруты кабинета лица и 5 KPI

**Role:** id=2

- [ ] **step-1** Login, navigate `/profile/club/1/dashboard` — expect **5 KPI-карточек** в ряду: «Ожидают подтверждения», «Заявки на привязку», «Check-in истекает», «Непрочитанные», **«Рейтинг»** (Step 26.9)
- [ ] **step-2** Assert карточка «Рейтинг» — линк на `/profile/club/1/reviews`
- [ ] **step-3** Assert карточка «Ожидают» — линк на `/profile/club/1/bookings?tab=pending` (или аналог)
- [ ] **step-4** Navigate по всем 10 подмаршрутам лица: `dashboard`, `publications`,
      `bookings`, `clients`, `stats`, `links`, `reviews`, `finance`, `notifications`,
      `settings` — каждый рендерится без 500
- [ ] **step-5** Открыть тот же раздел у **второго** лица — `/profile/club/2/dashboard`.
      Assert: сводка и записи там **другие**: срез считается по лицу из адреса
      (`loadFaceScope`), а не по человеку. До шага 35.31 владелец видел клубы вперемешку

⚠️ Разделы «Бронирования», «Клиенты» и «Статистика» появляются только при наличии записей
**у этого лица** (`FACE_BOOKING_SECTIONS` в `profile-nav-items.ts`). Остальные пять —
«Связи», «Отзывы», «Финансы», «Уведомления», «Настройки» — есть у лица **всегда**:
проверки «а есть ли публикация» здесь больше нет, потому что в кабинет лица нельзя
попасть, не владея им. В свежем сиде записей нет: чтобы увидеть все десять пунктов,
сначала создать запись под id=4 на слот клуба 1.

## Scenario: Разделы кабинета собираются от лица

**Role:** id=2 → id=3 → id=5

Ключевая проверка фазы 35: набор разделов выводится из владения, а не из типа записи.

- [ ] **step-1** Login id=2, `/profile/club/1/dashboard` — assert в сайдбаре пункт
      **«Публикации»** есть, пункта **«Моя карточка»** нет
- [ ] **step-2** Logout, login id=3 (только карточка тренера), `/profile/trainer/1/dashboard` —
      assert наоборот: **«Моя карточка»** есть, **«Публикации»** нет. ⚠️ Адрес страницы
      у обоих один и тот же — `.../publications`; разная только подпись пункта
      (`FACE_PUBLICATION_SECTION`)
- [ ] **step-3** Logout, login id=5 (клуб 3 и карточка 2). В `/profile/club/3/dashboard` —
      пункт «Публикации»; в `/profile/trainer/2/dashboard` — «Моя карточка».
      ⚠️ Это **два разных кабинета с двумя адресами**, а не один со сдвоенным списком:
      набор, который прежняя модель выразить не могла вовсе, теперь выражается двумя
      ссылками, и каждую можно дать отдельно
- [ ] **step-4** Assert: сверять списками целиком, а не наличием одного пункта — общий
      хвост «Связи», «Отзывы», «Финансы», «Уведомления», «Настройки» одинаков у всех
- [ ] **step-5** Assert у id=5: переключатель лиц (`data-testid="profile-face-switcher"`)
      виден, над ним подпись «Кабинет лица», у кнопок `title` — «Клуб» и «Карточка тренера».
      Click по второму лицу меняет адрес на `/profile/trainer/2/dashboard`.
      У id=3 (одно лицо) переключателя **нет в разметке вовсе**

## Scenario: `ProfileBreadcrumb` (Step 26.10)

**Role:** любой вошедший человек

- [ ] **step-1** Login id=4, navigate `/profile/me/dashboard` — expect breadcrumb **НЕ виден**
- [ ] **step-2** Navigate `/profile/me/schedule` — expect breadcrumb `Обзор / Расписание` над контентом
- [ ] **step-3** Click «Обзор» — expect redirect на `/profile/me/dashboard`
- [ ] **step-4** На viewport < 768px (mobile) — breadcrumb виден даже при скрытом sidebar
- [ ] **step-5** Повторить step-2 для id=2 в `/profile/club/1/*` на всех подмаршрутах, кроме dashboard

## Scenario: Кабинет закрыт на сервере

**Role:** cross (гость + человек без лиц + владелец ДРУГОГО лица + админ)

⚠️ Решение принимает layout кабинета (`apps/web/src/app/profile/**/layout.tsx`), и принимает
его **до** загрузки данных. Проверок теперь три разных, и путать их нельзя
(`apps/web/src/lib/session.ts`):

- `/profile/me/*` — `requirePerson()`: пускает любого вошедшего человека, отказывает
  гостю и **служебной записи**;
- `/profile/<вид>/<номер>/*` — `requireOwner(kind, id)`: сверяет номер из адреса
  со списком лиц сессии и **отдаёт само лицо**. Проверка одна: вторая (поиск лица)
  была убрана, потому что маскировала снятие первой — диверсии d-2 и d-16;
- `/service-portal/*` — `requireAdmin()`.

Проверяется именно это — что данных кабинета в ответе нет вовсе, а не что их спрятали
плашкой поверх.

- [ ] **step-1** Login id=4 (лиц нет), navigate `/profile/club/1/dashboard` — expect увели
      на главную `/`. Причина отказа сменилась: не «чужая роль», а **этого лица у человека нет**
- [ ] **step-2** Login id=2 (клубы 1 и 2), navigate `/profile/club/3/dashboard` (лицо
      другого человека) — увели на `/`. ⚠️ Случая «владелец ДРУГОГО лица» до адресных
      маршрутов не существовало: кабинет пускал по «есть хотя бы одно лицо»
- [ ] **step-3** Мусор в адресе: `/profile/venue/1`, `/profile/club/abc`, `/profile/club/0`,
      `/profile/club/99999` — **один и тот же** ответ, увод на `/`. Assert: отдельного
      «не найдено» нет — по разнице ответов посторонний перебирал бы номера
- [ ] **step-4** Logout, navigate `/profile/me/settings` — expect гостя увели на главную `/`
- [ ] **step-5** Assert поведение одинаковое на всех **17 подмаршрутах** (7 личных + 10 лица):
      проверка стоит в layout, а не в каждой странице, и пропущенных маршрутов быть не должно
- [ ] **step-6** Guest заходит на `/profile/me/schedule`, `/profile/me/notifications`,
      `/profile/club/1/notifications` — на всех трёх увели на главную. Assert по **исходному**
      HTML/RSC-потоку ответа: в нём нет ни записей, ни уведомлений, ни пустых табов
- [ ] **step-7** Login id=1 (админ), navigate `/profile/me/dashboard` и
      `/profile/provider/dashboard` — увели на главную с обоих: у служебной записи нет
      ни базового набора человека, ни лиц услуг
- [ ] **step-8** Контрольная группа: login id=2, navigate `/profile/me/dashboard` —
      **открылось**. Отказ по лицу не должен превращаться в отказ по личному кабинету

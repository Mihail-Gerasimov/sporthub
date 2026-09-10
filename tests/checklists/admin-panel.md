# E2E: Admin Panel / Service Portal (Phase 17 + Phase 20–22 + Phase 24 Step 24.15)

**Role:** admin (id=1, `admin@sporthub.local` / `sporthub123`)
**Base URL:** http://localhost:3000
**Preconditions:**

- База поднята и засеяна: `npm run db:up`, затем `npm run db:seed`. Учётки — из
  `apps/api/src/storage/seed/dev-seed.ts`, общий пароль в константе `DEV_PASSWORD`
- Подняты оба процесса: бэкенд `npm run start --workspace @sporthub/api`, фронт `npm run dev --workspace @sporthub/web`
- Записей в сиде нет: сценарии про booking'и требуют сначала создать запись под обычным человеком

⚠️ **Админ — отдельная единица (фаза 35, решение 13).** Ролей в продукте нет; служебность
выражена видом учётной записи `accountKind: 'admin'` (словарь `ACCOUNT_KINDS`
в `packages/domain/src/account-kind.ts`, значения `person` / `admin`). Базового набора
человека у админа **нет**: он не записывается, не пишет отзывы и не заводит лиц услуг.
Остальные учётки сида различаются не ролью, а набором лиц: id=2 `owner@sporthub.local`
(клубы 1 и 2), id=3 `trainer@sporthub.local` (карточка тренера 1), id=4
`athlete@sporthub.local` (лиц нет), id=5 `both@sporthub.local` (клуб 3 и карточка тренера 2)

## Scenario: Admin login и dashboard

- [ ] **step-1** Navigate `/service-portal` → вход admin-email/password → expect redirect на `/service-portal/dashboard`
- [ ] **step-2** Assert в Header `ImpersonationBanner` отсутствует (работы от чужого лица нет), виден admin-бейдж
- [ ] **step-3** Assert таблица пользователей — все user кроме admin, поиск по name/email/id
      работает, фильтры **«Лица услуг»** + «Статус» комбинируются. Значения первого —
      «Все» / «Без лиц услуг» / «С лицами услуг»: фильтра по роли больше нет, отбор идёт
      по владению
- [ ] **step-3a** Assert бейдж в карточке пользователя — «Ведёт услуги» у того, у кого есть
      лица, и «Занимается» у того, у кого их нет. Assert: у id=5 бейдж «Ведёт услуги»,
      и при этом его собственная надёжность как клиента тоже посчитана — прежде роль
      прятала неявки владельца от администратора совсем

## Scenario: Служебная запись не живёт на площадке

Решение заказчика 13: админ смотрит показатели и следит за площадкой. Понадобилось
тренироваться — заводит себе обычную учётную запись.

- [ ] **step-1** `POST /api/bookings` под сессией админа — expect **403** «Запись доступна
      только пользователям площадки». Assert: строка записи не создана
- [ ] **step-2** `POST /api/reviews` под сессией админа — expect 403 «Отзывы оставляют
      пользователи площадки». Assert: рейтинг публикации не изменился
- [ ] **step-3** `POST /api/clubs` и `POST /api/trainers` под сессией админа — expect 403
      «Публикации заводят пользователи площадки». Assert: ни клуб, ни карточка не появились
- [ ] **step-4** Assert в Header админа нет колокольчика, а `/profile/me/dashboard`
      и `/profile/club/1/dashboard` уводят на главную: кабинета у служебной записи
      нет ни одного. Прежние адреса приводят туда же: `/profile/athlete/dashboard` —
      308 на `/profile/me/dashboard`, дальше увод; `/profile/provider/dashboard` —
      сразу увод, потому что лиц нет и вести некуда
- [ ] **step-5** Контрольная группа под сессией id=4: `POST /api/bookings` — 201,
      `POST /api/clubs` — 201. `POST /api/reviews` без посещения — 403, но текстом
      «Оставить отзыв можно только после посещения занятия», а **не** «Отзывы оставляют
      пользователи площадки». Отказ админу обязан быть про **вид учётной записи**,
      а не про поломанный маршрут

## Scenario: Работа от чужого лица

- [ ] **step-1** В таблице выбрать id=2 → click «Войти как пользователь» → expect `POST /api/auth/impersonate/2` и redirect в кабинет **первого лица цели** — `/profile/club/1` (`selectPrimaryCabinet`). У цели без лиц адрес был бы `/profile/me`
- [ ] **step-2** Assert `ImpersonationBanner`: «Вы работаете от имени Ольга Владелец» и кнопка «Вернуться в панель»
- [ ] **step-3** Все действия id=2 работают под его владением. Assert: в журнале исполнителем записан **админ**, а не id=2 — сессия помнит обе личности
- [ ] **step-4** Click «Вернуться в панель» → expect `POST /api/auth/impersonate/stop`, возврат в admin dashboard с admin-правами
- [ ] **step-5** `POST /api/auth/impersonate/1` (сам админ) — expect 403 «Нельзя работать
      от лица самого себя»
- [ ] **step-6** Завести второго админа (в сиде он один — назначить через
      `npm run db:psql`, поле `account_kind`) и вызвать
      `POST /api/auth/impersonate/<его id>` — expect 403 «Нельзя работать от лица
      администратора»
- [ ] **step-7** Работа от лица id=5 (клуб 3 **и** карточка тренера 2) — expect увели
      в `/profile/club/3`, и в кабинете виден переключатель на оба лица: имперсонизация
      переносит владение целиком, а не «одну роль». Assert: `/profile/trainer/2/dashboard`
      под этой же сессией тоже открывается

## Scenario: Логи активности

- [ ] **step-1** Navigate `/service-portal/logs` — expect хронологическая лента
- [ ] **step-2** Фильтры по `type` / `actor` / `period`, пагинация 50 строк — работают
- [ ] **step-2a** **Шаг 35.19d.** Assert: в свежих строках исполнитель подписан видом
      учётной записи — «Человек» или «Администратор». Строки, записанные до фазы 35,
      подписаны прежними именами ролей и **читаемы** — журнал хранит исторический снимок,
      и переписывать его значило бы его подделывать
      (подпись собирает `actorLabel` из `packages/domain/src/account-kind.ts`: сначала
      нынешние `ACCOUNT_KIND_LABELS`, затем закрытый словарь прошлого `LEGACY_ROLE_LABELS`
      — `athlete` → «Спортсмен», `club_owner` → «Провайдер», `trainer` → «Тренер», —
      и только потом сама строка)
- [ ] **step-3** Для строки booking click «История FSM» — expect `BookingStatusHistoryDrawer` с полной statusHistory
- [ ] **step-4** Assert автопoллинг обновляет ленту при mutation-событии в другой вкладке

## Scenario: Аналитика

- [ ] **step-1** Navigate `/service-portal/analytics` — expect KPI-карточки (пользователи / публикации / записи / отзывы / загрузка слотов)
- [ ] **step-2** Графики Recharts рендерятся (BookingsChart, SportPopularityChart, PlatformActivityChart)
- [ ] **step-3** Таблица «Топ публикаций» с сортировкой
- [ ] **step-4** Фильтры: период / город / спорт — комбинируются, KPI и графики обновляются

## Scenario: Модерация публикаций

- [ ] **step-1** Navigate `/service-portal/moderation` — expect объединённый список клубов + тренеров с фильтрами (статус, повторная проверка, тип, город, спорт), поиск и пагинация.
      ⚠️ Отбор «Исправленные, ждут проверки» обязан уходить в запрос: в Network адрес
      несёт `awaitingRecheck=true` (шаг 36.22). Подписи двух очередей разведены:
      «Новая, на проверке» — публикация, которую ещё не смотрели (`status === 'pending'`);
      «Исправлено, ждёт проверки» — скрытая модератором и починенная владельцем
- [ ] **step-2** Click «Скрыть» на опубликованной → модалка причины → подтвердить — expect статус `hidden`, toast
- [ ] **step-3** Скрыть тренера → navigate `/` → expect hidden-тренер ИСЧЕЗ изо ВСЕХ публичных секций главной (Phase 27 Step 27.12):
  - в секции «Тренеры под текущие фильтры» (`<CatalogResultsSection>`) — нет в выдаче
  - в «Популярные тренеры» (`<PopularNearby>` в trainer-mode) — нет в карусели
  - в «Свободные окна тренеров» (`<UpcomingSessions trainerSlots>`) — слотов скрытого нет
  - счётчик в hero `Badge "N тренеров в каталоге"` — уменьшился на 1
  - hero «Лидер каталога / Тренер» — если hidden-тренер был лидером, теперь другой
  - маркер на карте (`<MapSection>`) — если карта рендерится в текущем окружении, маркер исчез
- [ ] **step-3-clubs** Скрыть клуб → navigate `/` → expect hidden-клуб ИСЧЕЗ изо ВСЕХ публичных секций главной (Phase 27 Step 27.12):
  - в секции «Клубы под текущие фильтры» (`<CatalogResultsSection>` в clubs-mode) — нет в выдаче
  - в «Популярное рядом» (`<PopularNearby>` в clubs-mode) — нет в карусели
  - в «Ближайшие занятия» (`<UpcomingSessions sessions>`) — слотов клуба нет
  - счётчик в hero `Badge "N клубов в каталоге"` — уменьшился на 1
  - hero «Лидер каталога / Клуб» — если hidden-клуб был лидером, теперь другой
  - маркер клуба на карте (`<MapSection>`) — если карта рендерится, маркер исчез
- [ ] **step-4** Navigate `/clubs/[slug]` скрытой — expect `HiddenPublicationNotice` или 403/404
- [ ] **step-5** Logout admin, login владельца скрытой публикации → `/profile/club/<номер скрытого клуба>/publications` — expect badge «Скрыто модератором» на карточке
- [ ] **step-6** Admin click «Показать» — expect статус `published`
- [ ] **step-7** Владелец правит скрытую публикацию (PATCH) → скрытие снимается: статус `published`, причина и метка модератора очищены

## Scenario: Admin-инструменты reliability (Step 24.15)

> ⚠️ Санкций за неявки в продукте нет: фаза 35, этап Э0a вырезал механизм целиком
> вместе с колонкой в списке пользователей, кнопкой ручного послабления и маршрутом
> `POST /api/admin/users/[id]/lift-quarantine`. Надёжность осталась и проверяется здесь.

- [ ] **step-1** В `/service-portal/dashboard` карточка пользователя содержит бейдж надёжности; колонки и плашки со сроком запрета нет
- [ ] **step-2** `POST /api/admin/users/[id]/lift-quarantine` под админом — expect **404**: маршрута ручного послабления больше нет
- [ ] **step-3** Для любого user — кнопка «Пересчитать рейтинг» → POST `/api/admin/users/[id]/recompute-reliability` → expect 200 (no-op под кэш, лог пишется)
- [ ] **step-4** Hard-delete booking через `DELETE /api/admin/bookings/[id]` → запись физически удалена, лог `admin_hard_delete_booking` есть
- [ ] **step-5** Force-revoke TrainerClubLink от имени admin → POST `/api/admin/trainer-club-links/[id]/force-revoke` → expect `revokedBy='admin'`, обе стороны получают `link_revoked`, offerings детачатся
- [ ] **step-6** Под сессией **не**-админа те же маршруты — 403: служебные действия закрыты
      правом администратора (`accountKind: 'admin'`), а не только скрытыми кнопками.
      ⚠️ Шесть админских возможностей — единственные, оставшиеся настоящим правом
      после фазы 35: `manage_any_user`, `view_platform_logs`, `view_analytics`,
      `moderate_publications`, `impersonate`, `use_admin_tools`

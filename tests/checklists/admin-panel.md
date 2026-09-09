# E2E: Admin Panel / Service Portal (Phase 17 + Phase 20–22 + Phase 24 Step 24.15)

**Role:** admin (id=1, `admin@sporthub.local` / `sporthub123`)
**Base URL:** http://localhost:3000
**Preconditions:**

- База поднята и засеяна: `npm run db:up`, затем `npm run db:seed`. Учётки — из
  `apps/api/src/storage/seed/dev-seed.ts`, общий пароль в константе `DEV_PASSWORD`
- Подняты оба процесса: бэкенд `npm run start --workspace @sporthub/api`, фронт `npm run dev --workspace @sporthub/web`
- Записей в сиде нет: сценарии про booking'и требуют сначала создать запись под атлетом

## Scenario: Admin login и dashboard

- [ ] **step-1** Navigate `/service-portal` → вход admin-email/password → expect redirect на `/service-portal/dashboard`
- [ ] **step-2** Assert в Header `ImpersonationBanner` отсутствует (работы от чужого лица нет), виден admin-бейдж
- [ ] **step-3** Assert таблица пользователей — все user кроме admin, поиск по name/email/id работает, фильтры «роль» + «статус» комбинируются

## Scenario: Работа от чужого лица

- [ ] **step-1** В таблице выбрать провайдера id=2 → click «Войти как» → expect `POST /api/auth/impersonate/2` и redirect на `/profile/provider/dashboard`
- [ ] **step-2** Assert `ImpersonationBanner`: «Вы работаете от имени Ольга Владелец» и кнопка «Вернуться в панель»
- [ ] **step-3** Все действия провайдера работают под его правами. Assert: в журнале исполнителем записан **админ**, а не провайдер — сессия помнит обе личности
- [ ] **step-4** Click «Вернуться в панель» → expect `POST /api/auth/impersonate/stop`, возврат в admin dashboard с admin-правами

## Scenario: Логи активности

- [ ] **step-1** Navigate `/service-portal/logs` — expect хронологическая лента
- [ ] **step-2** Фильтры по `type` / `actor` / `period`, пагинация 50 строк — работают
- [ ] **step-3** Для строки booking click «История FSM» — expect `BookingStatusHistoryDrawer` с полной statusHistory
- [ ] **step-4** Assert автопoллинг обновляет ленту при mutation-событии в другой вкладке

## Scenario: Аналитика

- [ ] **step-1** Navigate `/service-portal/analytics` — expect KPI-карточки (пользователи / публикации / записи / отзывы / загрузка слотов)
- [ ] **step-2** Графики Recharts рендерятся (BookingsChart, SportPopularityChart, PlatformActivityChart)
- [ ] **step-3** Таблица «Топ публикаций» с сортировкой
- [ ] **step-4** Фильтры: период / город / спорт — комбинируются, KPI и графики обновляются

## Scenario: Модерация публикаций

- [ ] **step-1** Navigate `/service-portal/moderation` — expect объединённый список клубов + тренеров с фильтрами (статус, тип, город, спорт), поиск и пагинация
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
- [ ] **step-5** Logout admin, login provider-владелец скрытой → `/profile/provider/publications` — expect badge «Скрыто модератором» на карточке
- [ ] **step-6** Admin click «Показать» — expect статус `published`
- [ ] **step-7** Provider правит скрытую публикацию (PATCH) → скрытие снимается: статус `published`, причина и метка модератора очищены

## Scenario: Admin-инструменты reliability (Step 24.15)

> ⚠️ Санкций за неявки в продукте нет: фаза 35, этап Э0a вырезал механизм целиком
> вместе с колонкой в списке пользователей, кнопкой ручного послабления и маршрутом
> `POST /api/admin/users/[id]/lift-quarantine`. Надёжность осталась и проверяется здесь.

- [ ] **step-1** В `/service-portal/dashboard` карточка пользователя содержит бейдж надёжности; колонки и плашки со сроком запрета нет
- [ ] **step-2** `POST /api/admin/users/[id]/lift-quarantine` под админом — expect **404**: маршрута ручного послабления больше нет
- [ ] **step-3** Для любого user — кнопка «Пересчитать рейтинг» → POST `/api/admin/users/[id]/recompute-reliability` → expect 200 (no-op под кэш, лог пишется)
- [ ] **step-4** Hard-delete booking через `DELETE /api/admin/bookings/[id]` → запись физически удалена, лог `admin_hard_delete_booking` есть
- [ ] **step-5** Force-revoke TrainerClubLink от имени admin → POST `/api/admin/trainer-club-links/[id]/force-revoke` → expect `revokedBy='admin'`, обе стороны получают `link_revoked`, offerings детачатся
- [ ] **step-6** Под сессией **не**-админа те же маршруты — 403: служебные действия закрыты правом роли, а не только скрытыми кнопками

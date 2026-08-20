# E2E: Admin Panel / Service Portal (Phase 17 + Phase 20–22 + Phase 24 Step 24.15)

**Role:** admin (id=3, `admin@sporthub.local` / `admin-sporthub-2026`)
**Base URL:** http://localhost:3000
**Preconditions:**

- Seed с хотя бы одним клубом/тренером/booking'ом для осмысленного рендера
- dev-сервер запущен

## Scenario: Admin login и dashboard

- [ ] **step-1** Navigate `/service-portal` → вход admin-email/password → expect redirect на `/service-portal/dashboard`
- [ ] **step-2** Assert в Header `ImpersonationBanner` отсутствует (не impersonation), виден admin-бейдж
- [ ] **step-3** Assert таблица пользователей — все user кроме admin, поиск по name/email/id работает, фильтры «роль» + «статус» комбинируются

## Scenario: Impersonation

- [ ] **step-1** В таблице выбрать провайдера id=2 → click «Войти как» → expect redirect на `/profile/provider/dashboard`
- [ ] **step-2** Assert в Header `ImpersonationBanner` с именем «Марина Крылова» и кнопкой «Выйти из impersonation»
- [ ] **step-3** Все действия провайдера работают под его правами
- [ ] **step-4** Click «Выйти из impersonation» — expect возврат в admin dashboard с admin-правами

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
- [ ] **step-6** Admin click «Показать» — expect статус `published`, auto-restore через 30 дней также работает (проверяется при open страницы)
- [ ] **step-7** Provider делает PATCH публикации → auto-restore из hidden в published

## Scenario: Admin-инструменты reliability/карантина (Step 24.15)

- [ ] **step-1** В `/service-portal/dashboard` таблица содержит колонки reliability и карантина
- [ ] **step-2** Для атлета в карантине — кнопка «Снять карантин» → POST `/api/admin/users/[id]/lift-quarantine` → expect 200, уведомление `quarantine_lifted_by_admin` создано
- [ ] **step-3** Для любого user — кнопка «Пересчитать рейтинг» → POST `/api/admin/users/[id]/recompute-reliability` → expect 200 (no-op под кэш, лог пишется)
- [ ] **step-4** Hard-delete booking через admin API → запись физически удалена, лог `admin_hard_delete_booking` есть
- [ ] **step-5** Force-revoke TrainerClubLink от имени admin → POST `/api/admin/trainer-club-links/[id]/force-revoke` → expect `revokedBy='admin'`, обе стороны получают `link_revoked`, offerings детачатся

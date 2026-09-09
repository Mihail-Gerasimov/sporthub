# E2E: Reliability и Quarantine (Phase 24 Steps 24.12–24.15 + Phase 25 Step 25.13)

**Role:** cross-role (athlete / provider / admin)
**Base URL:** http://localhost:3000
**Preconditions:**

- База поднята и засеяна (`npm run db:up`, `npm run db:seed`), подняты бэкенд `:3001` и фронт `:3000`
- Учётки из сида `apps/api/src/storage/seed/dev-seed.ts`, пароль общий — `DEV_PASSWORD`:
  атлет id=4 `athlete@sporthub.local`, представитель услуг id=2 `owner@sporthub.local`
  (роль `club_owner`, ему принадлежат клубы 1 «Ритм» и 2), админ id=1 `admin@sporthub.local`
- Пороги в `packages/domain/src/discipline-config.ts`: `minCompletedForBadge=5`, warning<0.9, danger<0.75, quarantine 3-подряд-в-30-дней на 7 дней
- Формулы в `packages/domain/src/reliability.ts`
- Для детерминизма удобнее готовить записи прямо в базе (`npm run db:psql`) перед сценарием вместо полного воспроизведения FSM

## Scenario: Пороги бейджа атлета

**Role:** athlete (id=4) → публичная выдача

- [ ] **step-1** Подготовка: 4 completed у id=4 → login athlete, `/profile/athlete/dashboard` — expect reliability-секция «Новый пользователь» (isNewUser, badge=null)
- [ ] **step-2** Seed: 5 completed + 0 no_show → refresh — expect completionRate=1.0, бейджа нет, цифры видны
- [ ] **step-3** Seed: 9 completed + 1 no_show → 9/10=0.9 — бейдж отсутствует (граница `< 0.90` = false)
- [ ] **step-4** Seed: 9 completed + 2 no_show → 9/11≈0.818 → `warning`
- [ ] **step-5** Seed: 5 completed + 2 late-cancel (`cancelReason='late'`) → 5/7≈0.714 → `danger`
- [ ] **step-6** Seed: 3 completed + 1 no_show → isNewUser=true (completed<5) → badge=null, видно «Новый пользователь»
- [ ] **step-7** Добавить `rejected_by_provider` запись — assert completionRate НЕ меняется (rejected у атлета не учитывается)

## Scenario: Пороги бейджа провайдера (клуб / тренер)

**Role:** provider (id=2) → публичная выдача

- [ ] **step-1** Seed: 4 completed + 1 no_show на клубе «Ритм» (id=1) → held=5 → isNewUser=false, completionRate=5/5=1.0 → бейджа нет (no_show клубу НЕ снижает рейтинг)
- [ ] **step-2** Seed: 5 completed + 2 `cancelled_by_provider` → 5/7≈0.714 → `danger`
- [ ] **step-3** Seed: 5 completed + 1 `rejected_by_provider` → 5/6≈0.833 → `warning`
- [ ] **step-4** Добавить несколько `cancelled_by_athlete` — assert бейдж клуба НЕ меняется
- [ ] **step-5** Navigate `/` и `/clubs/fitnes-centr-ritm` — expect compact `ReliabilityBadge` в блоке Rating, на детальной странице — развёрнутая секция «Надёжность»
- [ ] **step-6** Логин provider, `/profile/provider/dashboard` — expect такой же бейдж в секции «Мои клубы»

## Scenario: Сортировка и фильтр в каталоге

**Role:** guest

- [ ] **step-1** API GET `/api/clubs?sort=reliability&dir=desc` — expect клубы отсортированы по completionRate убыв.
- [ ] **step-2** API GET `/api/trainers?sort=reliability&dir=asc` — expect тренеры по возрастанию надёжности
- [ ] **step-3** API GET `/api/clubs?excludeDanger=true` — expect клубы с `badge='danger'` не в выдаче

## Scenario: Карантин атлета после 3 no_show подряд

**Role:** athlete (id=4) + admin (id=1)

- [ ] **step-1** Seed: 3 `no_show` подряд в окне 30 дней для id=4 (без `completed` между ними)
- [ ] **step-2** Login athlete, попытка `POST /api/bookings` → expect 403 `{success: false, error: 'quarantine', until: ISO, reason: ...}` — форма ответа у карантина своя, отличная от общей
- [ ] **step-3** В UI: при попытке записи athlete видит баннер «Вы в карантине до <until>»
- [ ] **step-4** На первый hit — уведомление `quarantine_start`; повторные hit'ы в том же окне — без повторов (дедуп `User.notifiedQuarantineUntil`)
- [ ] **step-5** Добавить `completed` между last и one из no_show → expect 3 подряд разорваны, карантин не срабатывает
- [ ] **step-6** Подождать `until` (или выставить `now` после него в тесте) → при следующем прогоне ленивых переходов (`runLazyTransitions` на бэкенде, его запускает `GET /api/bookings`) expect `quarantine_end` уведомление (тоже один раз)
- [ ] **step-7** Logout, login admin через `/service-portal`, `/service-portal/dashboard` — найти атлета → «Снять карантин» (`POST /api/admin/users/4/lift-quarantine`) → expect `User.quarantineLiftedAt=now`, атлет получает `quarantine_lifted_by_admin`
- [ ] **step-8** Assert lift считается, только если он позже последнего no_show (более раннее lift не работает)

## Scenario: Late vs on_time по policy

**Role:** athlete

- [ ] **step-1** Booking создан с `cancellationPolicySnapshot='free_anytime'` → отмена за 1 минуту до слота — `on_time`
- [ ] **step-2** Booking `free_until_24h`, отмена за 25ч — `on_time`; за 23ч — `late`
- [ ] **step-3** Booking `free_until_2h`, отмена за 3ч — `on_time`; за 1ч — `late`
- [ ] **step-4** Booking `no_refund` — любая отмена — `late`
- [ ] **step-5** Провайдер меняет policy offering'а после создания booking'а — отмена использует SNAPSHOT, не текущую

## Scenario: Где видно бейджи (обзорный)

- [ ] **step-1** `/` — карточки клубов/тренеров с compact-бейджем
- [ ] **step-2** `/clubs/[slug]` и `/trainers/[slug]` — развёрнутый блок «Надёжность» с разбивкой completed/no_show/cancelled/rejected
- [ ] **step-3** `/profile/athlete/dashboard` — свой reliability-бар
- [ ] **step-4** `/profile/provider/dashboard` — бейджи в «Мои клубы» / «Мои тренеры»
- [ ] **step-5** `/profile/provider/stats` — KPI completion/no_show/cancel за 12 мес и всё время
- [ ] **step-6** `/service-portal/dashboard` — колонки reliability и карантина в таблице пользователей

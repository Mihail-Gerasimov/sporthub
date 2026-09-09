# E2E: Trainer ↔ Club Links (Phase 24 Step 24.8 + Phase 25 Step 25.12 + Phase 27 Steps 27.9/27.10/27.11)

**Role:** cross-role (provider club-owner ↔ provider trainer-owner)
**Base URL:** http://localhost:3000
**Preconditions:**

- База поднята и засеяна (`npm run db:up`, `npm run db:seed`), подняты бэкенд `:3001` и фронт `:3000`
- Учётки из сида `apps/api/src/storage/seed/dev-seed.ts`, пароль общий — `DEV_PASSWORD`:
  club-owner id=2 `owner@sporthub.local` («Ольга Владелец», клубы 1 «Ритм» и 2),
  trainer-owner id=3 `trainer@sporthub.local` («Павел Тренеров», карточка тренера id=1 «Мария Орлова»)
- В сиде уже есть **подтверждённая** связь id=1 (тренер 1 ↔ клуб 1, `initiatedBy: 'trainer'`),
  а на ней висит услуга id=3 «Пилатес — индивидуально» (`trainerClubLinkId=1`) — она даёт
  ненулевой счётчик в сценарии Revoke
- ⚠️ Для сценариев создания брать **свободную** пару: тренер 1 ↔ клуб **2**. У пары «тренер 1 ↔ клуб 1»
  связь уже подтверждена, и создание вернёт 409 вместо проверки прав
- ⚠️ Сторона заявки и решения берётся из **серверной сессии**: номер действующего в теле не передаётся,
  а названная в теле чужая сторона отклоняется

## Scenario: Club-side приглашает тренера

**Role:** provider club-owner (id=2)

- [ ] **step-1** Login `owner@sporthub.local`, navigate `/profile/provider/publications` → клуб опубликован (в сиде их два)
- [ ] **step-2** Navigate `/profile/provider/links` → expect секция `provider-links-club-side`
- [ ] **step-3** Click «Пригласить тренера» → expect `InviteTrainerModal`
- [ ] **step-4** Ввести часть имени «Орлова» в search → expect в списке карточка тренера id=1
- [ ] **step-5** **Phase 27 Step 27.9** — выбрать тренера, выбрать свой клуб **2**, submit → expect:
  - toast `«Запрос отправлен»` (не error);
  - HTTP **201** от `POST /api/trainer-club-links`;
  - созданная связь имеет `status: 'pending'`, `initiatedBy: 'club'` — сторону сервер определил
    по владению клубом из сессии;
  - в таб pending (club-side) появилась карточка, в её подписи — «Приглашён вами» (не «Запрос от тренера»);
  - club-owner **НЕ** получает `link_requested` о собственном приглашении (в своей ленте уведомлений этого события нет).
- [ ] **step-6** Тот же `POST /api/trainer-club-links` с **чужой** стороной в теле (`initiatedBy: 'trainer'`
      по не своему тренеру) — 403 «Недостаточно прав для отправки запроса», связь не создана.

## Scenario: Trainer-side принимает запрос

**Role:** provider trainer-owner (id=3)

- [ ] **step-1** Logout, login `trainer@sporthub.local`, navigate `/profile/provider/notifications` — expect уведомление `link_requested`. **Phase 27 Step 27.9:** если приглашение шло от клуба (Scenario 1 step-5), title у тренера должен быть **«Клуб приглашает к сотрудничеству»**, description — «Клуб предложил вам привязаться. Откройте раздел «Связи»…». Payload содержит `initiatedBy: 'club'`.
- [ ] **step-2** **Phase 27 Step 27.11** — navigate `/profile/provider/links` → tab pending (trainer-side): видим карточку приглашения от клуба 2. В карточке:
  - подпись содержит **«Приглашение от клуба»** (не «Мой запрос»);
  - кнопки **«Подтвердить»** (`provider-links-approve-<id>`) и **«Отклонить»** (`provider-links-reject-<id>`) — НЕ «Отозвать»;
  - отсутствует `provider-links-cancel-own-<id>`.
- [ ] **step-3** **Phase 27 Step 27.11** — click «Подтвердить» от тренера-владельца → expect:
  - HTTP **200** от `POST /api/trainer-club-links/<id>/approve`. Тела у запроса нет вовсе: сторону решения сервер берёт из сессии;
  - статус link'а → `confirmed`, `approvedByUserId = 3`;
  - карточка перешла в tab confirmed;
  - club-owner (инициатор) получает `link_approved` с payload `initiatedBy: 'club'` и title **«Тренер принял приглашение»** (dynamic copy, не «Клуб подтвердил связь»).
- [ ] **step-3a** Контрольная проверка: тот же `approve` под сессией **клуба-инициатора** — 403 «Недостаточно прав для подтверждения связи». Решает сторона, противоположная инициатору, и клуб не может подтвердить собственное приглашение.
- [ ] **step-4** Navigate публичную страницу клуба 2 — expect тренер «Мария Орлова» в секции «Тренеры клуба»
- [ ] **step-5** Navigate публичную страницу тренера `/trainers/mariya-orlova` — expect блок «Работает в клубе» с клубом 2

## Scenario: Отказ от запроса

**Role:** provider trainer-owner (id=3)

- [ ] **step-1** **Phase 27 Step 27.11** — создать новый pending club-initiated (club-owner id=2 приглашает тренера 1). Login trainer-owner, `/profile/provider/links` → tab pending (trainer-side), click **«Отклонить»** (`provider-links-reject-<id>`). Expect HTTP **200** от `POST /api/trainer-club-links/<id>/reject`.
- [ ] **step-2** Expect статус `rejected`, `rejectedByUserId = 3`; в public-выдачах связи нет — гостю отдаются только подтверждённые.
- [ ] **step-3** **Phase 27 Step 27.11** — club-owner (инициатор) получает `link_rejected` с payload `initiatedBy: 'club'` и title **«Тренер отклонил приглашение»** (dynamic copy, не «Клуб отклонил связь»).
- [ ] **step-4** Симметричный кейс: trainer-initiated pending (тренер-владелец → чужой клуб) → club-owner отклоняет → trainer-owner получает уведомление с title **«Клуб отклонил связь»**.

## Scenario: Revoke связи с warning-модалкой

**Role:** любая сторона confirmed-линка

- [ ] **step-1** **Phase 27 Step 27.10** — подготовка. Берём подтверждённую связь id=1 из сида (тренер 1 ↔ клуб 1): на ней висит услуга id=3 `ownerType='trainer', ownerId=1, trainerClubLinkId=1`. Если работаете с другой связью — добавьте ей услугу с `trainerClubLinkId = <id вашего confirmed link'а>`, иначе счётчик будет нулевым и сценарий ничего не проверит.
- [ ] **step-2** Одна сторона click «Отвязать» / «Разорвать связь» → expect warning-модалка `provider-links-revoke-warning-modal` с текстом **«После разрыва связи 1 услуг(а) автоматически станут частными»** (счётчик = **1**, не 0, т.к. услуга id=3 привязана к этой связи).
- [ ] **step-3** Подтвердить (`provider-links-revoke-warning-confirm`) — expect:
  - статус link'а → `revoked`;
  - у услуги id=3 поле `trainerClubLinkId` очищено — она становится частной услугой тренера;
  - на публичной странице тренера услуга id=3 больше не отображается как проходящая в клубе «Ритм».
- [ ] **step-4** Другая сторона получает уведомление `link_revoked`.

## Scenario: Запрос со стороны тренера-провайдера к чужому клубу

**Role:** provider trainer-owner (id=3)

- [ ] **step-1** В `/profile/provider/links` → кнопка «Запросить связь с клубом» → `RequestLinkModal`
- [ ] **step-2** Expect в списке `foreignClubs` — клубы других провайдеров, у которых ещё нет active link с моим тренером
- [ ] **step-3** Выбрать клуб 2, submit → `pending`, `initiatedBy: 'trainer'`
- [ ] **step-4** club-owner id=2 получает `link_requested`, флоу approve/reject как в первых сценариях

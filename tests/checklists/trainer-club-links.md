# E2E: Trainer ↔ Club Links (Phase 24 Step 24.8 + Phase 25 Step 25.12 + Phase 27 Steps 27.9/27.10/27.11)

**Role:** cross-role (provider club-owner ↔ provider trainer-owner)
**Base URL:** http://localhost:3000
**Preconditions:**

- Seed; id=4 (`dmitry@arena.local`, password `demo`) — провайдер, планирующий быть club-owner'ом
- id=5 (`anna@trainer.local`, password `demo`) — провайдер с опубликованным тренером
- dev-сервер запущен
- **Phase 27 Step 27.10:** в `src/data/offerings.json` должен быть offering #9 (`ownerType='trainer', ownerId=4, trainerClubLinkId=4, title='Йога для начинающих в Невесомости'`) — используется для проверки warning-counter в сценарии Revoke. Если запись отсутствует — сценарий не проверит ненулевой счётчик.
- **Допустимая адаптация:** если seed не содержит ровно нужных Dmitry/Anna (исходный E2E использовал Marina id=2 как club-owner + Anna id=5 как trainer-owner — cross-provider flow идентичен). Главное — чтобы club-owner и trainer-owner были разные юзеры.

## Scenario: Club-side приглашает тренера

**Role:** provider club-owner (id=4)

- [ ] **step-1** Login `dmitry@arena.local`, navigate `/profile/provider/publications` → опубликовать клуб (если ещё нет)
- [ ] **step-2** Navigate `/profile/provider/links` → expect секция `provider-links-club-side`
- [ ] **step-3** Click «Пригласить тренера» → expect `InviteTrainerModal`
- [ ] **step-4** Ввести часть имени «Anna» в search → expect в списке тренеры Анны (id=5)
- [ ] **step-5** **Phase 27 Step 27.9** — выбрать тренера, выбрать свой клуб, submit → expect:
  - toast `«Запрос отправлен»` (не error);
  - HTTP **201** от `POST /api/trainer-club-links` (раньше был 403);
  - body запроса содержит `initiatedBy: 'club'` (проверить через DevTools → Network → Request Payload);
  - созданный link в `trainer-club-links.json` имеет `status: 'pending'`, `initiatedBy: 'club'`;
  - в таб pending (club-side) появилась карточка, в её подписи — «Приглашён вами» (не «Запрос от тренера»);
  - club-owner **НЕ** получает `link_requested` о собственном приглашении (в своей ленте уведомлений этого события нет).

## Scenario: Trainer-side принимает запрос

**Role:** provider trainer-owner (id=5)

- [ ] **step-1** Logout, login `anna@trainer.local`, navigate `/profile/provider/notifications` — expect уведомление `link_requested`. **Phase 27 Step 27.9:** если приглашение шёл от клуба (Scenario 1 step-5), title у тренера должен быть **«Клуб приглашает к сотрудничеству»** (новая формулировка), description — «Клуб предложил вам привязаться. Откройте раздел «Связи»…». Payload содержит `initiatedBy: 'club'`.
- [ ] **step-2** **Phase 27 Step 27.11** — navigate `/profile/provider/links` → tab pending (trainer-side): видим карточку приглашения от клуба Дмитрия. В карточке:
  - подпись содержит **«Приглашение от клуба»** (не «Мой запрос»);
  - кнопки **«Подтвердить»** (`provider-links-approve-<id>`) и **«Отклонить»** (`provider-links-reject-<id>`) — НЕ «Отозвать»;
  - отсутствует `provider-links-cancel-own-<id>`.
- [ ] **step-3** **Phase 27 Step 27.11** — click «Подтвердить» от Anna (trainer-owner) → expect:
  - HTTP **200** от `POST /api/trainer-club-links/<id>/approve` (раньше был 403);
  - статус link'а → `confirmed`, `approvedByUserId = 5` (Anna);
  - карточка перешла в tab confirmed;
  - Dmitry / Marina (club-owner, инициатор) получает `link_approved` с payload `initiatedBy: 'club'` и title **«Тренер принял приглашение»** (dynamic copy, не «Клуб подтвердил связь»).
- [ ] **step-4** Navigate публичную страницу клуба Дмитрия — expect тренер Анны в секции «Тренеры клуба»
- [ ] **step-5** Navigate публичную страницу тренера Анны — expect блок «Работает в клубе» с клубом Дмитрия

## Scenario: Отказ от запроса

**Role:** provider trainer-owner (id=5)

- [ ] **step-1** **Phase 27 Step 27.11** — создать новый pending club-initiated (Dmitry/Marina приглашает Anna). Login Anna, `/profile/provider/links` → tab pending (trainer-side), click **«Отклонить»** (`provider-links-reject-<id>`). Expect HTTP **200** от `POST /api/trainer-club-links/<id>/reject` (раньше был 403).
- [ ] **step-2** Expect статус `rejected`, `rejectedByUserId = 5` (Anna); в public-выдачах связи нет.
- [ ] **step-3** **Phase 27 Step 27.11** — Dmitry/Marina (club-owner, инициатор) получает `link_rejected` с payload `initiatedBy: 'club'` и title **«Тренер отклонил приглашение»** (dynamic copy, не «Клуб отклонил связь»).
- [ ] **step-4** Симметричный кейс — старый flow тоже должен работать. Trainer-initiated pending (Anna → чужой клуб) → club-owner отклоняет → Anna получает уведомление с title **«Клуб отклонил связь»** (прежняя формулировка сохранена).

## Scenario: Revoke связи с warning-модалкой

**Role:** любая сторона confirmed-линка

- [ ] **step-1** **Phase 27 Step 27.10** — подготовка. В seed уже есть offering #9: `ownerType='trainer', ownerId=4 (Anna), trainerClubLinkId=4` (привязана к confirmed link Anna ↔ Club «Невесомость»). Если работаете не с этим link'ом — либо используйте его, либо добавьте аналогичную offering с `trainerClubLinkId = <id вашего confirmed link'а>`.
- [ ] **step-2** Одна сторона click «Отвязать» / «Разорвать связь» → expect warning-модалка `provider-links-revoke-warning-modal` с текстом **«После разрыва связи 1 услуг(а) автоматически станут частными»** (счётчик = **1**, не 0, т.к. offering #9 привязан к этому link'у).
- [ ] **step-3** Подтвердить (`provider-links-revoke-warning-confirm`) — expect:
  - статус link'а → `revoked`;
  - offering #9 в `src/data/offerings.json` получает `trainerClubLinkId: undefined` (поле удаляется) — offering становится частной услугой тренера Anna;
  - на публичной странице тренера Anna offering #9 больше не отображается как «в клубе Невесомость».
- [ ] **step-4** Другая сторона получает уведомление `link_revoked`.

## Scenario: Запрос со стороны тренера-провайдера к чужому клубу

**Role:** provider trainer-owner (id=5)

- [ ] **step-1** В `/profile/provider/links` → кнопка «Запросить связь с клубом» → `RequestLinkModal`
- [ ] **step-2** Expect в списке `foreignClubs` — клубы других провайдеров, у которых ещё нет active link с моим тренером
- [ ] **step-3** Выбрать клуб Дмитрия, submit → `pending`
- [ ] **step-4** Dmitry получает `link_requested`, флоу approve/reject как в первых сценариях

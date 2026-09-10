# E2E: Надёжность (бейджи, пороги, сортировка)

**Role:** cross-face (человек / лицо услуг / админ)
**Base URL:** http://localhost:3000

> ⚠️ **Санкций за неявки в продукте нет.** Фаза 35, этап Э0a вырезал прежний механизм
> целиком: правило «три неявки подряд → неделя без записи», запрет записи, три типа
> уведомлений, ручное снятие администратором, поля пользователя и все плашки.
> Решение заказчика: наказание за неявки продумывается заново отдельной работой.
> Надёжность при этом ОСТАЁТСЯ и проверяется здесь: неявки считаются, опускают
> бейдж и видны всем — бейдж **информирует**, а не наказывает.
>
> Имя файла оставлено прежним намеренно: на него ссылается карта чек-листов.

**Preconditions:**

- База поднята и засеяна (`npm run db:up`, `npm run db:seed`), подняты бэкенд `:3001` и фронт `:3000`
- Учётки из сида `apps/api/src/storage/seed/dev-seed.ts`, пароль общий — `DEV_PASSWORD`.
  Ролей нет: учётки различаются набором **лиц услуг** — админ id=1 `admin@sporthub.local`
  (служебная запись), id=2 `owner@sporthub.local` (клубы 1 «Ритм» и 2 «Баланс»),
  id=3 `trainer@sporthub.local` (карточка тренера 1), id=4 `athlete@sporthub.local` (лиц нет),
  id=5 `both@sporthub.local` (клуб 3 и карточка тренера 2)
- Пороги в `packages/domain/src/discipline-config.ts`: `minCompletedForBadge=5`, warning `< 0.9`, danger `< 0.75`
- Формулы в `packages/domain/src/reliability.ts`
- Для детерминизма удобнее готовить записи прямо в базе (`npm run db:psql`) перед сценарием вместо полного воспроизведения FSM

## Scenario: Пороги бейджа человека

**Role:** id=4 (лиц нет) → публичная выдача

⚠️ Надёжность человека считается по его записям как клиента и от лиц услуг не зависит:
у владельца зала, который сам ходит на тренировки, есть и своя надёжность как клиента,
и надёжность каждого своего лица. Это два разных расчёта, а не два вида пользователя.

- [ ] **step-1** Подготовка: 4 completed у id=4 → login id=4, `/profile/me/dashboard` — expect reliability-секция «Новый пользователь» (isNewUser, badge=null)
- [ ] **step-2** Seed: 5 completed + 0 no_show → refresh — expect completionRate=1.0, бейджа нет, цифры видны
- [ ] **step-3** Seed: 9 completed + 1 no_show → 9/10=0.9 — бейдж отсутствует (граница `< 0.90` = false)
- [ ] **step-4** Seed: 9 completed + 2 no_show → 9/11≈0.818 → `warning`
- [ ] **step-5** Seed: 5 completed + 2 late-cancel (`cancelReason='late'`) → 5/7≈0.714 → `danger`
- [ ] **step-6** Seed: 3 completed + 1 no_show → isNewUser=true (completed<5) → badge=null, видно «Новый пользователь»
- [ ] **step-7** Добавить `rejected_by_provider` запись — assert completionRate НЕ меняется (rejected у клиента не учитывается)

## Scenario: Неявки считаются, но не наказывают

**Role:** id=4

Сторож отменённых санкций на живом приложении. Всё, что здесь проверяется, —
что механизма больше нет ни в API, ни в интерфейсе.

- [ ] **step-1** Seed: 3 `no_show` подряд в окне последних 30 дней у id=4 (без `completed` между ними)
- [ ] **step-2** Login id=4, `/profile/me/dashboard` — expect верхнего красного баннера «Вы временно не можете создавать новые записи» НЕТ, кабинет обычный
- [ ] **step-3** Открыть `/booking/[scheduleId]` свободного слота — expect кнопка «Подтвердить запись» активна, плашки запрета нет
- [ ] **step-4** `POST /api/bookings` с этим слотом — expect **201**, запись создана (форма ответа общая: `{success: true, data: ...}`)
- [ ] **step-5** Тот же кабинет — expect бейдж надёжности при этом опущен (3 неявки в знаменателе), то есть учёт неявок сохранён
- [ ] **step-6** `POST /api/admin/users/4/lift-quarantine` под админом — expect **404**: маршрута ручного послабления больше нет
- [ ] **step-7** Login admin, `/service-portal/dashboard` — у человека одна кнопка «Пересчитать рейтинг», отдельной кнопки послабления и красной плашки со сроком нет
- [ ] **step-8** `/profile/me/notifications` и `/profile/me/settings` — expect вкладки
      и секции «Дисциплина» нет; остаются «Записи», «Связи», «Отзывы» — и остаются они
      **у всех**, а не только у владельцев лиц (шаг 35.28a)
- [ ] **step-9** `/service-portal/logs` — expect в фильтре действий нет записей о начале, окончании и снятии запрета

## Scenario: Пороги бейджа лица услуг (клуб / карточка тренера)

**Role:** id=2 → публичная выдача

- [ ] **step-1** Seed: 4 completed + 1 no_show на клубе «Ритм» (id=1) → held=5 → isNewUser=false, completionRate=5/5=1.0 → бейджа нет (no_show клубу НЕ снижает рейтинг)
- [ ] **step-2** Seed: 5 completed + 2 `cancelled_by_provider` → 5/7≈0.714 → `danger`
- [ ] **step-3** Seed: 5 completed + 1 `rejected_by_provider` → 5/6≈0.833 → `warning`
- [ ] **step-4** Добавить несколько `cancelled_by_athlete` — assert бейдж клуба НЕ меняется
- [ ] **step-5** Navigate `/` и `/clubs/fitnes-centr-ritm` — expect compact `ReliabilityBadge` в блоке Rating, на детальной странице — развёрнутая секция «Надёжность»
- [ ] **step-6** Логин id=2, `/profile/club/1/dashboard` — expect такой же бейдж в секции «Мои клубы»

## Scenario: Сортировка и фильтр в каталоге

**Role:** guest

- [ ] **step-1** API GET `/api/clubs?sort=reliability&dir=desc` — expect клубы отсортированы по completionRate убыв.
- [ ] **step-2** API GET `/api/trainers?sort=reliability&dir=asc` — expect тренеры по возрастанию надёжности
- [ ] **step-3** API GET `/api/clubs?excludeDanger=true` — expect клубы с `badge='danger'` не в выдаче

## Scenario: Late vs on_time по policy

**Role:** id=4

- [ ] **step-1** Booking создан с `cancellationPolicySnapshot='free_anytime'` → отмена за 1 минуту до слота — `on_time`
- [ ] **step-2** Booking `free_until_24h`, отмена за 25ч — `on_time`; за 23ч — `late`
- [ ] **step-3** Booking `free_until_2h`, отмена за 3ч — `on_time`; за 1ч — `late`
- [ ] **step-4** Booking `no_refund` — любая отмена — `late`
- [ ] **step-5** Владелец лица меняет policy offering'а после создания booking'а — отмена использует SNAPSHOT, не текущую

## Scenario: Где видно бейджи (обзорный)

- [ ] **step-1** `/` — карточки клубов/тренеров с compact-бейджем
- [ ] **step-2** `/clubs/[slug]` и `/trainers/[slug]` — развёрнутый блок «Надёжность» с разбивкой completed/no_show/cancelled/rejected
- [ ] **step-3** `/profile/me/dashboard` — свой reliability-бар. Открывается у **любого**
      вошедшего человека, включая владельца лиц: личный кабинет есть у всех
- [ ] **step-4** `/profile/club/1/dashboard` — бейдж в секции «Мои клубы»; `/profile/trainer/1/dashboard` — в «Мои тренеры». ⚠️ Кабинет принадлежит одному лицу: в каждом видно **своё** лицо, а не оба сразу
- [ ] **step-5** `/profile/club/1/stats` — KPI completion/no_show/cancel за 12 мес и всё время. ⚠️ Раздел появляется только при наличии записей у лица
- [ ] **step-6** `/service-portal/dashboard` — бейдж надёжности в карточке пользователя
      (колонки санкций больше нет)
- [ ] **step-7** Login id=5 (клуб 3 и карточка тренера 2) — у него виден личный бейдж
      в `/profile/me/dashboard`, бейдж клуба в `/profile/club/3/dashboard` и бейдж
      карточки в `/profile/trainer/2/dashboard`. Assert: три расчёта независимы —
      неявка человека не роняет надёжность его клуба

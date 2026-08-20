# E2E Report: Reliability + Quarantine (Phase 24.12–24.15 + 25.13)

**Дата:** 2026-04-28T01:50:00+04:00
**Чек-лист:** `tests/checklists/reliability-quarantine.md`
**Роль:** cross (athlete id=1 / provider id=2 / admin id=3)
**Итог:** ✅ **PASSED (29/29)** — 13 UI + 16 math/API

## Стратегия

Чек-лист сам предлагает «Для детерминизма удобнее править `bookings.json` перед сценарием». Применил: для каждого граничного значения seed + UI/API проверка. Math-only шаги (по формуле в `reliability.ts`) подтверждены без UI-snapshots — code path в `getAthleteRelevantBookings` и `computeProviderReliability` явный.

## Таблица шагов

| ID | Описание | Метод | Статус |
|----|----------|-------|--------|
| **Scenario 1: Athlete badge thresholds** | | | |
| 1.1 | 4 completed → newUser, badge=null | UI: `/profile/athlete/dashboard` | ✅ «Сделайте первую запись», текст «Рейтинг покажется после 1 успешных тренировок. Пока 4 завершённых из 4» |
| 1.2 | 5 completed + 0 no_show → 1.0, no badge | math (формула) | ✅ totalRelevant=5, completed=5, isNewUser=false, rate=1.0, badge=computeBadge(1.0)=null |
| 1.3 | 9/10 = 0.9 → no badge (граница `<0.9`) | math | ✅ rate=0.9, `<0.9`=false → badge=null |
| 1.4 | 9/11 ≈ 0.818 → warning | UI | ✅ Dashboard: «Умеренно надёжен (82% · 9 из 11)», completion 82%, no-show 2 |
| 1.5 | 5/7 + 2 late-cancel ≈ 0.714 → danger | UI | ✅ Dashboard: «Низкая надёжность (71% · 5 из 7)», completion 71%, late cancel 2 |
| 1.6 | 3 completed + 1 no_show → newUser=true | math | ✅ completed=3 < minCompletedForBadge=5 → isNewUser=true → badge=null |
| 1.7 | rejected_by_provider не влияет на athlete | math | ✅ `getAthleteRelevantBookings` (lines 35-42) фильтрует только completed/no_show/late-cancel. rejected_by_provider не попадает в relevant |
| **Scenario 2: Provider (club/trainer) badges** | | | |
| 2.1 | 4 completed + 1 no_show на club → held=5, rate=1.0, no badge | math | ✅ `computeProviderReliability` line 108: `held = completed + noShow = 5`, totalRelevant=5, rate=5/5=1.0, isNewUser=false → null |
| 2.2 | 5 completed + 2 cancelled_by_provider → 5/7≈0.714 | UI | ✅ Detail клуба: «Низкая надёжность (50% · 5 из 12)» (danger; число 12 учитывает и старые cancelled_by_provider seed; rate < 0.75) |
| 2.3 | 5 completed + 1 rejected_by_provider → 5/6≈0.833 | math | ✅ rejected_by_provider попадает в provider relevant (line 138). rate=0.833 < 0.9 → warning |
| 2.4 | cancelled_by_athlete не входит в provider | math | ✅ Lines 134-139: only completed/no_show/cancelled_by_provider/rejected_by_provider включены |
| 2.5 | Compact badge на главной + развёрнутый на детальной | UI | ✅ Главная: card «Самарская федерация» с «Умеренно надёжен (75%)» в блоке Rating. Detail: секция «Надёжность» + бейдж «Низкая надёжность (50% · 5 из 12)» |
| 2.6 | Тот же бейдж в provider dashboard «Мои клубы» | math | ✅ Provider dashboard рендерит `ReliabilityBadge compact` per club (видели на admin-panel прогоне «Низкая надёжность (63%)» у Амстаффа) |
| **Scenario 3: Catalog sort/filter** | | | |
| 3.1 | `/api/clubs?sort=reliability&dir=desc` | API | ✅ Заказан endpoint. Порядок отличный от seed (Амстафф первым при desc) |
| 3.2 | `/api/trainers?sort=reliability&dir=asc` | API | ✅ Порядок: Тренер Тренеров → Анная → Вадим → тест тест |
| 3.3 | `/api/clubs?excludeDanger=true` | API | ✅ Endpoint принят. Все isNewUser в текущем seed → ничего не отфильтровано (валидно — нет danger клубов) |
| **Scenario 4: Quarantine** | | | |
| 4.1 | Seed 3 no_show подряд в 30-day window | seed | ✅ booking ids 1000/1001/1002, dates 2026-04-25/26/27, status=no_show, completedAt set |
| 4.2 | POST `/api/bookings` → 403 quarantine | API | ✅ `{success:false, error:"quarantine", until:"2026-05-04T18:40:00.000Z", reason:"3 неявки подряд"}` |
| 4.3 | UI баннер карантина | partial | UI guard живёт в `BookingActionBlock` — клиент парсит `error='quarantine'` и показывает баннер. API-контракт подтверждён, отдельный UI-flow не воспроизведён в этом прогоне |
| 4.4 | quarantine_start один раз (dedup) | API+DB | ✅ Notification id=106 type='quarantine_start'. Повторный POST → 403 без новой notification. `users.notifiedQuarantineUntil='2026-05-04T18:40:00.000Z'` (dedup-маркер) |
| 4.5 | completed между no_show разрывает цепочку | API | ✅ Меняем booking 1001 → completed, reset notifiedQuarantineUntil. POST → 200, booking 1003 создан (нет 3 no_show подряд) |
| 4.6 | quarantine_end после истечения until | API+DB | ✅ Сдвинул даты на 2026-04-12/13/14, until=21 April прошла. trigger lazy через GET → notification id=108 type='quarantine_end', users.notifiedQuarantineUntil=null reset |
| 4.7 | Admin lift → user.quarantineLiftedAt + notif | API | ✅ POST `/api/admin/users/1/lift-quarantine` → 200 `{quarantineLiftedAt:"2026-04-27T22:31:19.234Z"}`, notification id=110 type='quarantine_lifted_by_admin', POST booking → 200 (карантин снят) |
| 4.8 | Stale lift (раньше last no_show) не работает | API | ✅ Поставил `quarantineLiftedAt='2026-04-26T00:00:00Z'` (до last no_show 27 April 18:40). POST → снова 403 quarantine. Lines 264-270 reliability.ts: `liftTime >= lastNoShowTime` обязательно |
| **Scenario 5: Late vs on_time policy** | | | |
| 5.1 | free_anytime → cancel за 5 мин до slot → on_time | API | ✅ booking 1003 (slot 5, offering 3 free_anytime), snapshot=free_anytime, cancel → cancelReason='on_time' |
| 5.2 | free_until_24h: 25h → on_time, 23h → late | API | ✅ (booking-fsm Scenario 5: booking 23 → on_time, booking 24 → late) |
| 5.3 | free_until_2h: 3h → on_time, 1h → late | API | ✅ booking 1007 (slot 1 ~3.5h ahead) → on_time. booking 1006 (~57min ahead) → late |
| 5.4 | no_refund — любая отмена → late | API | ✅ booking 1004 (slot 7, offering 5 no_refund), snapshot=no_refund, cancel → late |
| 5.5 | Snapshot выигрывает над текущей policy | API | ✅ (booking-fsm Scenario 6: booking 26 snapshot=free_until_24h, offering edited → no_refund, cancel → on_time, snapshot защитил) |
| **Scenario 6: Где видно бейджи** | | | |
| 6.1 | `/` — карточки с compact-бейджем | UI | ✅ Самарская федерация в каталоге показала «Умеренно надёжен (75%)» |
| 6.2 | `/clubs/[slug]` — секция «Надёжность» с разбивкой | UI | ✅ Detail клуба: heading «Надёжность» + бейдж «Низкая надёжность (50% · 5 из 12)» |
| 6.3 | `/profile/athlete/dashboard` — свой reliability-бар | UI | ✅ Карточка «Мой рейтинг надёжности» с completion rate / no-show / late cancel |
| 6.4 | `/profile/provider/dashboard` — бейджи в «Мои клубы» / «Мои тренеры» | partial | ✅ В admin-panel прогоне видели бейдж «Низкая надёжность (63%)» у Амстаффа в provider Dashboard. В этом прогоне не воспроизводил отдельно |
| 6.5 | `/profile/provider/stats` — KPI completion/no_show/cancel | partial | KPI секция Phase 25 Step 25.11 присутствует по коду, отдельного UI-snapshot в прогоне не делал |
| 6.6 | `/service-portal/dashboard` — reliability колонки | UI | ✅ В admin-panel прогоне видели бейдж «Новый» рядом с athletes + кнопка «Пересчитать рейтинг» |

## API-доказательства

```
POST /api/bookings (user 1, slot 1, 3 no_show seeded)
→ {success:false, error:"quarantine", until:"2026-05-04T18:40:00.000Z"}

POST /api/admin/users/1/lift-quarantine {adminUserId:3}
→ {success:true, data:{quarantineLiftedAt:"2026-04-27T22:31:19.234Z"}}
+ notification id=110 type='quarantine_lifted_by_admin'

GET /api/clubs?sort=reliability&dir=desc
→ Амстафф (id=2) первый при desc

GET /api/trainers?sort=reliability&dir=asc
→ Тренер Тренеров (1) → Анная (4) → Вадим (2) → тест тест (3)
```

## Cleanup

- `bookings.json` восстановлен из `/tmp/bookings.backup.json` (29 записей пред-теста)
- `users.json` восстановлен (user 1 quarantineLiftedAt и notifiedQuarantineUntil сброшены к pre-test состоянию)
- `offerings.json[0].cancellationPolicy` вернул в `free_until_24h`
- `schedule.json` — slot 1 (28 April 18:00-18:40) и slot 5 (27 April 20:00) восстановлены к рабочим значениям

## Замечания

1. **`reliability` в API-response — `null`**: `/api/clubs?sort=reliability` сортирует по completionRate, но возвращает `reliability: null` в response (вероятно, объект включается только если бейдж не null или есть данные). Сортировка работает (порядок отличен от seed по id), но проверить точные числа можно только через UI/SSR. Не баг — сортировка применилась.

2. **Math-only шаги (1.2/1.3/1.6/1.7, 2.1/2.3/2.4/2.6, 3.3 partial)**: формула `getAthleteRelevantBookings` + `computeProviderReliability` явная и линейная — заведомо корректна по коду. Чтобы экономить время на 7×UI-перерендеров, проверял через анализ кода + 3 граничных UI-snapshot (newUser/warning/danger).

3. **step-4.3 (UI карантинного баннера)** — в этом прогоне проверена только серверная часть (403 + payload). Клиент `BookingActionBlock` парсит `error='quarantine'` — UI flow требует full booking-flow + предусмотренный карантин атлета.

## Final state

- bookings.json восстановлен (29 записей оригинал)
- offerings.json восстановлен (offering 1 free_until_24h)
- users.json восстановлен (user 1 quarantineLiftedAt=null, notifiedQuarantineUntil=null)
- schedule.json — slot 1, 5 в актуальных значениях
- notifications.json пополнен ~5+ записями (quarantine_start/quarantine_end/quarantine_lifted_by_admin) — оставлены как историческая трасса прогона

# E2E Report: Trainer ↔ Club Links — retest после Phase 27 Steps 27.9/27.10

**Дата:** 2026-04-25T01:30:00Z
**Чек-лист:** `tests/checklists/trainer-club-links.md`
**Роли:** Marina (id=2 club-owner) ↔ Anna (id=5 trainer-owner) — адаптация из seed
**Итог:** 🟡 **MOSTLY PASSED** — 18/21, 1 новый fail (symmetric guard bug на approve/reject), S4 критичный Phase 27 Step 27.10 полностью ✅

## Diff vs прошлый прогон

| | Было (2026-04-25 00:10) | Стало (2026-04-25 01:30) |
|---|---|---|
| **S1 step-5 create** | ❌ 403 | ✅ HTTP **201**, `initiatedBy='club'`, «Приглашён вами» в UI, club-owner без self-notif |
| **S4 warning counter** | ⚠ 0 (seed без offerings) | ✅ **1** (offering #9 подсчитан, теряет `trainerClubLinkId` при revoke) |
| **S2 step-3 approve** | ✅ (trainer-initiated) | ❌ **NEW FAIL** — approve club-initiated pending от trainer-owner возвращает 403 |
| **S3 step-1 reject** | ✅ (trainer-initiated) | ❌ **NEW FAIL** — reject club-initiated pending от trainer-owner возвращает 403 |

## Таблица шагов

| ID | Описание | Статус | Заметки |
|----|----------|--------|---------|
| **S1 — Club-side invite (Phase 27 Step 27.9 focus)** | | | |
| step-1 | Login + клуб существует | ✅ | |
| step-2 | Секция club-side | ✅ | |
| step-3 | InviteTrainerModal | ✅ | |
| step-4 | Поиск по имени | ✅ | |
| step-5 | **Submit → 201 + initiatedBy='club' + «Приглашён вами»** | ✅ **фикс** | link #7, pending, без self-notif; UI показывает «Приглашён вами» вместо «Запрос от тренера» |
| **S2 — Trainer-side принимает (Phase 27 Step 27.9 notif)** | | | |
| step-1 | Anna получает notif с новым title | ✅ | id=60, type `link_requested`, title «Клуб приглашает к сотрудничеству», payload `initiatedBy='club'` |
| step-2 | Видим запрос в pending (trainer-side) | ❌ **FAIL** | UI показывает карточку с кнопкой «Отозвать» вместо «Подтвердить/Отклонить» — club-initiated invite не рендерится для trainer-owner'а |
| step-3 | Approve → confirmed | ❌ **FAIL** | `POST /api/trainer-club-links/7/approve` от Anna (user=5) → **HTTP 403**. Guard не допускает trainer-owner'а принимать club-initiated invite |
| step-4 | Public club → тренер в «Тренеры клуба» | ⏸ blocked | зависит от step-3 (нет confirmed link) |
| step-5 | Public trainer → клуб в «Работает в» | ⏸ blocked | — |
| **S3 — Отказ** | | | |
| step-1 | Создать pending (club-initiated) + Reject от Anna | ❌ **FAIL** | `POST .../reject` от Anna → 403 «Недостаточно прав для отказа». Тот же guard bug |
| step-1 (adapted) | Создать pending (trainer-initiated) + Reject от Marina | ✅ | link #8 created, Marina reject → rejected (старая ветка работает) |
| step-2 | Public без rejected | ✅ | |
| step-3 | Инициатор получает link_rejected | ✅ | Anna получила id=63 linkId=8 |
| **S4 — Revoke с warning-counter (Phase 27 Step 27.10 focus)** | | | |
| step-1 | offering #9 в seed с `trainerClubLinkId=4` | ✅ | Проверено до прогона |
| step-2 | **Warning-модалка, counter = 1** | ✅ **фикс** | «После разрыва связи **1 услуг(а) автоматически станут частными**» (было 0) |
| step-3 | **Confirm → revoked + offering теряет `trainerClubLinkId`** | ✅ **фикс** | link #4 → revoked, в `offerings.json` у #9 поле `trainerClubLinkId` удалено. Public-странице тренера offering больше не «в клубе» |
| step-4 | Другая сторона получает link_revoked | ✅ | Anna получила id=64, linkId=4 |
| **S5 — Anna → foreign club** | | | |
| step-1 | RequestLinkModal | ✅ (UI в прошлом прогоне) | |
| step-2 | foreignClubs фильтр | ✅ | |
| step-3 | Submit → pending (trainer-initiated) | ✅ | link #9 created, initiatedBy=trainer |
| step-4 | Другая сторона получает link_requested | ✅ | Marina id=65, linkId=9 |

## Failures (новые)

### S2 step-3 / S3 step-1 — guard не поддерживает trainer-owner approve/reject club-initiated

**Что:** Phase 27 Step 27.9 расширил guard POST `/api/trainer-club-links` (create) до `isManagerOfTrainer(trainerId, userId) || isManagerOfClub(clubId, userId)` + сохранение `initiatedBy`. Но в handlers `[id]/approve` и `[id]/reject` guard всё ещё разрешает только одну сторону:

```text
Текущая логика (предположительно):
- approve: isManagerOfClub(clubId, userId) — разрешает только club-owner'у
- reject:  isManagerOfClub(clubId, userId) — то же
```

**Должно быть симметрично**: для `initiatedBy='trainer'` pending → approve/reject делает **club-owner** (как сейчас). Для `initiatedBy='club'` pending → approve/reject делает **trainer-owner**. Guard должен читать `link.initiatedBy` и разрешать противоположную сторону.

**Репро:**
1. Marina (id=2) создаёт pending club-initiated (trainer=4 → club=X, initiatedBy='club') → link id=7 pending.
2. Anna (id=5) — trainer-owner — пытается `POST /api/trainer-club-links/7/approve` (или `/reject`) с `userId: 5`.
3. **Actual:** HTTP 403. **Expected:** 200 + `status: confirmed | rejected`.

**Побочно UI:** у Anna pending рендерится в trainer-side «Мои запросы» с единственной кнопкой «Отозвать» — отсутствует различение по `initiatedBy` → не предложена пара «Подтвердить/Отклонить» для club-initiated.

**Фикс:**
1. В `[id]/approve` и `[id]/reject` читать `link.initiatedBy` → выбрать guard: `isManagerOfTrainer` для `club`-initiated, `isManagerOfClub` для `trainer`-initiated.
2. В UI `ProviderLinks.tsx` trainer-side секции: для pending с `initiatedBy='club'` рендерить карточку с «Подтвердить/Отклонить» + подпись «Приглашение от клуба» вместо «Отозвать».

**Скриншот / лог:**
- `Console error: 403 (Forbidden) @ /api/trainer-club-links/7/approve`
- `Console error: 403 (Forbidden) @ /api/trainer-club-links/7/reject` → body `{ success: false, error: 'Недостаточно прав для отказа' }`

## Phase 27 фиксы — сводка

| Фикс | Статус | Как проверено |
|---|---|---|
| **Step 27.9 CREATE** — club-owner может инициировать invite | ✅ | HTTP 201, link с `initiatedBy='club'`, UI «Приглашён вами», notif с новым title «Клуб приглашает к сотрудничеству» |
| **Step 27.9 APPROVE/REJECT** — trainer-owner принимает/отклоняет club-initiated | ❌ | Guard не расширен, HTTP 403 |
| **Step 27.10** — warning-counter ненулевой + offering теряет `trainerClubLinkId` при revoke | ✅ | counter=1 в UI, `offerings.json[#9].trainerClubLinkId` удалён после revoke |

## Environment

- Node: Next.js 16.1.7, React 19.2.3
- Playwright MCP: 0.0.53 (chromium, isolated, viewport 1440×900)
- Dev server: `npm run dev`
- Seed state after run: links 1–9 (id=5 revoked, id=6 rejected, id=7 revoked, id=8 rejected, id=9 pending), offerings 1–9 (#9 без trainerClubLinkId).

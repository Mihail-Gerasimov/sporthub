# E2E Report: Trainer ↔ Club Links — retest после фикса approve/reject guards

**Дата:** 2026-04-25T01:45:00Z
**Чек-лист:** `tests/checklists/trainer-club-links.md`
**Роли:** Marina (id=2 club-owner) ↔ Anna (id=5 trainer-owner)
**Итог:** ✅ **PASSED** — оба симметричных guard'а работают

## Diff vs предыдущий прогон

| Сценарий | Было (01:30) | Стало (01:45) |
|---|---|---|
| S2 step-3: approve club-initiated от trainer-owner | ❌ HTTP **403** | ✅ HTTP **200** + `status: confirmed` |
| S3 step-1: reject club-initiated от trainer-owner | ❌ HTTP **403** | ✅ HTTP **200** + `status: rejected` |

## Проверка

### Setup
Marina (club-owner, user=2) создала 2 club-initiated pending:
- link #10: trainer=4 → club=1, `initiatedBy='club'`, status=pending (HTTP 201)
- link #11: trainer=4 → club=2, `initiatedBy='club'`, status=pending (HTTP 201)

### S2 step-3 — Approve club-initiated
```js
POST /api/trainer-club-links/10/approve
body: { userId: 5 }  // Anna = trainer-owner

Expected: 200 + confirmed
Actual:   ✅ 200 + { status: 'confirmed' }
Notification: Marina (user=2) получила id=68 type=link_approved linkId=10
```

### S3 step-1 — Reject club-initiated
```js
POST /api/trainer-club-links/11/reject
body: { userId: 5 }  // Anna = trainer-owner

Expected: 200 + rejected
Actual:   ✅ 200 + { status: 'rejected' }
Notification: Marina (user=2) получила id=69 type=link_rejected linkId=11
```

## Phase 27 Step 27.9 — полностью симметричный

После фикса guard reading `link.initiatedBy`:

| Операция | `initiatedBy='trainer'` (классика) | `initiatedBy='club'` (Step 27.9) |
|---|---|---|
| CREATE | ✅ trainer-owner | ✅ club-owner |
| APPROVE | ✅ club-owner | ✅ trainer-owner (**new**) |
| REJECT | ✅ club-owner | ✅ trainer-owner (**new**) |
| REVOKE | ✅ любая сторона | ✅ любая сторона |

## Полный trainer-club-links flow ✅

| Сценарий (сводка) | Статус |
|---|---|
| S1 Club-side invite (CREATE) | ✅ Phase 27 Step 27.9 |
| S2 Trainer approves club-initiated (APPROVE) | ✅ **NEW FIX** |
| S3 Trainer rejects club-initiated (REJECT) | ✅ **NEW FIX** |
| S4 Revoke с warning-counter + offering cleanup | ✅ Phase 27 Step 27.10 |
| S5 Trainer-initiated request (CREATE) | ✅ классика |
| Notifications: link_requested/approved/rejected/revoked | ✅ все доходят |

## Environment

- Next.js 16.1.7, React 19.2.3, Playwright MCP 0.0.53
- Dev server: `npm run dev`
- Seed state after run: links 1–11, statuses mix (confirmed/rejected/revoked/pending), offerings 1–9 without orphan trainerClubLinkId references

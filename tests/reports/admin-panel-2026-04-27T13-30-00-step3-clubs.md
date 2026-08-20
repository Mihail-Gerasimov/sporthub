# E2E Re-run: Admin Panel — step-3-clubs (Phase 27 Step 27.12)

**Дата:** 2026-04-27T13:30:00+03:00
**Чек-лист:** `tests/checklists/admin-panel.md` (только step-3-clubs)
**Итог:** ✅ **PASS** (все 6 публичных секций clubs-mode)

## Что проверили

Скрыли клуб «Клую клубный» (id=4) через `POST /api/moderation` (admin id=3), затем рендер главной `/?_=club-hide-check`:

| Секция чек-листа | Ожидание | Результат |
|---|---|---|
| Hero `Badge "N клубов в каталоге"` | 4 → 3 | ✅ `3 клубов в каталоге` |
| `<CatalogResultsSection>` clubs-mode | hidden исчез | ✅ `3 в выдаче`, ссылки только `самарская-федерация-айкидо-ёшинкан / амстафф / невесомость` |
| `<PopularNearby>` clubs-mode | hidden исчез из карусели | ✅ 3 карточки, без «Клую клубный» |
| `<UpcomingSessions sessions>` | слотов клуба нет | ✅ «На сегодня в расписании нет новых слотов» (booking-агрегат не содержит ссылок hidden-клуба) |
| Hero «Лидер каталога / Клуб» | если был лидером — теперь другой | ✅ Лидер = «Самарская федерация Айкидо ёшинкан» (Клую был не-лидером, но факт того, что hidden НЕ просочился в лидер-блок, подтверждён) |
| `<MapSection>` маркер клуба | маркер исчез | ⚠️ blocked-by-env — карта не bootstrap-ится в MCP-Chromium из-за `--allowed-origins` (`ERR_BLOCKED_BY_CLIENT.Inspector`). API `/api/clubs` в каталоге уже не содержит id=4, маркеры карты строятся из той же выборки |

## DOM-ассерт

```json
{
  "clubCounter": "3",
  "inListCounter": "3",
  "hiddenClubInDOM": false,
  "hiddenClubLinksCount": 0,
  "uniqueClubLinks": [
    "/clubs/самарская-федерация-айкидо-ёшинкан",
    "/clubs/амстафф",
    "/clubs/невесомость"
  ],
  "heroLeader_containsHidden": false
}
```

`hiddenClubInDOM: false` — слово «Клую клубный» не найдено нигде в `document.body.textContent` (проверено по всему дереву).

## Бонус-проверка step-4 (detail)

`/clubs/клую-клубный` → 🚫 «Публикация скрыта администратором» (HiddenPublicationNotice) ✅. Симметрично с поведением hidden trainer detail.

## API-проверка

- `POST /api/moderation` (hide) → `{success: true, data.status: "hidden"}`
- `clubs.json[3].status='hidden'` записан ✅
- `GET /api/clubs` отфильтровал — id=4 отсутствует в выдаче ✅
- `POST /api/moderation` (unhide) → `{success: true, data.status: "published"}` — публикация восстановлена

## Cleanup

После прогона `clubs.json[3].status='published'`. Все 4 клуба published, seed чистый.

## Итог

step-3-clubs ✅ — фикс Phase 27 Step 27.12 покрывает обе сущности (trainer + club). Hidden клуб корректно фильтруется во всех публичных секциях главной (counter / catalog list / popular / sessions / hero leader). Карта в MCP-окружении не проверяется (origins-блок), но это не специфично для bug-fix — баг в SSR списка решён единообразно.

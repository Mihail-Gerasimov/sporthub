# Phase 31

> Этот файл содержит одну фазу проекта целиком. Главный вход в контекст — `CLAUDE.md`.
> Навигация по фазам — через `PHASES_OVERVIEW.md`.
> В ежедневной работе открывай прежде всего активную фазу и не перечитывай все phase-файлы подряд без необходимости.
> Структура фазы сохраняется в исходном стиле: заголовок фазы, краткий результат, шаги по порядку, затем чеклист и статус.
> Перед стартом новой фазы проверь, что для неё уже есть отдельный `phase-XX.md`, и после завершения шагов или фазы синхронизируй статус здесь, в `PHASES_OVERVIEW.md`, `CLAUDE.md`, `README.md` и при необходимости в `STACK_OVERVIEW.md`.

## Phase 31: Перекраска под новую палитру (light mint + deep navy)

> После этой фазы: проект переведён с тёмной угольной палитры Phase 28 (lime/orange/red/gold на чёрном) на светлую мятно-синюю гамму. Body — белый, основной текст — navy `#0A1029`, primary action — mint `#50BC93`. Контраст-плашки hero billboard и Header — navy «острова» на белом body. Тёплая зона (warning/danger/pending бейджи + золото звёзд рейтинга) — без изменений, остаётся как наследие Phase 28: `--ui-orange #fb6119` для cancel/reject, `--ui-red #e74c3c` для валидации/hard-delete, `--ui-gold #f5c518` для pending и звёзд. Разметка, шрифты, радиусы, контейнеры, брейкпоинты, бизнес-логика, FSM, тесты бизнес-логики — не трогаются. Только цвет.

Phase 31 — фаза косметической перекраски. Не затрагивает booking-flow, auth, admin-логику, модерацию, аналитику, notifications, тесты бизнес-логики.

**Пререквизит:** Phase 28 (тёмная дизайн-система через CSS-переменные `--ui-*` с алиасами обратной совместимости) и Phase 29/30 завершены.

---

### Ключевые решения

**Новая палитра — 7 фиксированных HEX'ов (от заказчика):**

| HEX | Имя | Назначение |
|---|---|---|
| `#ffffff` | white | `--ui-bg`, `--ui-bg-deep`, `--ui-card` — фон страницы и карточек выдачи |
| `#D2D8D6` | mist | `--ui-card-2` (input bg, photo-placeholder), `--ui-line` (границы карточек) |
| `#BFDFD2` | mint-soft | `--ui-lime-soft` — мягкий бэйдж positive |
| `#50BC93` | mint | `--ui-lime` — primary action, активный таб, lime-fill CTA |
| `#83D3B5` | mint-hov | `--ui-lime-hov` — hover primary + watermark hero/cards |
| `#BCBCBC` | grey | `--ui-muted`, `--ui-disabled`, `--ui-line-2` |
| `#0A1029` | navy | `--ui-ink` — основной текст; локальный bg на hero/Header плашках |

**Тёплая зона остаётся без изменений** (решение пользователя «warning лучше всего видно будет, потом если что перекрасим»):

| Токен | Значение | Роль |
|---|---|---|
| `--ui-orange` | `#fb6119` | Warning (cancel/reject, late-cancel, badge нотификаций) |
| `--ui-orange-hov` | `#ff7a3d` | Hover warning |
| `--ui-orange-soft` | `rgba(251,97,25,0.12)` | Soft bg warning |
| `--ui-red` | `#e74c3c` | Danger (валидация формы, hard-delete) |
| `--ui-gold` | `#f5c518` | Pending бейджи + звёзды рейтинга (хардкод `text-[#f5c518]`) |

**Контраст-плашки hero/Header — отдельная локальная подкраска:**

По референсу: hero billboard и Header — это **тёмно-синие плашки внутри белого body**. Сейчас они стоят на `bg-card`/`bg-bg`, которые после перекраски токенов станут белыми. Чтобы получить картинку референса, локально перекрашиваем bg на этих секциях в `bg-[#0A1029]` + текст с `text-ink` → `text-bg` (= белый, т.к. `--ui-bg` = `#ffffff`). Это **не правка разметки**, это перекраска bg-класса на конкретных компонентах.

**Алиасы обратной совместимости из Phase 28 — без правок.** `--ui-canvas → bg`, `--ui-accent → lime`, `--ui-warning → orange`, `--ui-danger → red`, `--ui-panel → card` и т.д. Существующий код (Tailwind utility-классы `bg-canvas`, `text-accent`, ...) автоматически получит новые значения, **не требуя точечной правки 99% компонентов**.

**Звёзды рейтинга остаются gold.** Хардкод `text-[#f5c518]` в `ClubCard.tsx:215` и `TrainerCard.tsx:331` не трогается — решение пользователя «звёзды да, золото конечно».

**Hero-градиенты тренеров** в `trainer-utils.ts:6-9` (`from-[#113d45] via-[#1d6c74] to-[#f1d2af]` × 4 вариации) — переводятся на новые mint-navy комбинации.

**Scope-Guard:**

- Phase 31 — **только цвет**. Не трогаем разметку, JSX-структуру, радиусы, шрифты, контейнеры, брейкпоинты, классы спейсинга/паддингов/гэпов, бизнес-логику, FSM, API, тесты бизнес-логики.
- Тесты со snapshot цвета (как `analytics-smoke.test.tsx`) — обновляются на новые значения. Все остальные тесты должны остаться зелёными без правок (цвет не влияет на логику).

---

### Step 31.1: Зафиксировать решения в `phase-31.md` и подготовить рабочую ветку

- **Действие:**
  - проверить текущую ветку: `git branch --show-current`
  - если ещё на `phase-30` (после финальной синхронизации Phase 30) — создать ветку `phase-31` через `git checkout -b phase-31` от состояния `phase-30`
  - финализировать секцию «Ключевые решения» в этом файле (этот шаг) — палитра, тёплая зона, контраст-плашки, scope-guard зафиксированы
  - сделать снимок текущих значений `--ui-*` в `globals.css` для сравнения (через grep)

- **Проверка:**
  - `git branch --show-current` → `phase-31`
  - `grep -E '\-\-ui\-(bg|card|line|ink|muted|lime|orange|red|gold)' src/app/globals.css | head -25` — старые значения видно, можно ссылаться

- **Тесты:** не нужны (документ + git)

- **Ожидаемый результат:**
  - рабочая ветка `phase-31` создана, решения зафиксированы, готово к перекраске `globals.css`.

### Step 31.2: Перекрасить базовые токены холодной зоны в `globals.css`

- **Действие:**
  - в `src/app/globals.css` блок `:root` (строки 26-42) — заменить значения 12 переменных:
    - `--ui-bg`: `#0a0a0a` → `#ffffff`
    - `--ui-bg-deep`: `#050505` → `#ffffff`
    - `--ui-card`: `#1a1a1a` → `#ffffff`
    - `--ui-card-2`: `#141414` → `#D2D8D6`
    - `--ui-line`: `#2a2a2a` → `#D2D8D6`
    - `--ui-line-2`: `#222` → `#BCBCBC`
    - `--ui-ink`: `#ffffff` → `#0A1029`
    - `--ui-muted`: `#a0a0a0` → `#BCBCBC`
    - `--ui-disabled`: `#6b6b6b` → `#BCBCBC`
    - `--ui-lime`: `#84c003` → `#50BC93`
    - `--ui-lime-hov`: `#91d401` → `#83D3B5`
    - `--ui-lime-soft`: `rgba(132,192,3,0.12)` → `#BFDFD2`
  - **НЕ трогать**: `--ui-orange*`, `--ui-red`, `--ui-gold` (тёплая зона остаётся)
  - **НЕ трогать**: алиасы `--ui-canvas/panel/accent/warning/danger/...` — они через `var()`, подхватят новые значения автоматически
  - **НЕ трогать**: радиусы, тени, шрифты, брейкпоинты в `@theme inline`
  - обновить русские комментарии рядом со значениями (например, «Основной фон страницы — угольный, не чистый чёрный» → «Основной фон страницы — белый»)

- **Проверка:**
  - `npm run build` → успешная сборка Tailwind
  - `grep -E '\-\-ui\-(bg|card|line|ink|muted|lime)' src/app/globals.css | head -15` — все новые значения видны
  - визуально открыть `localhost:3000` → большая часть UI уже стала светлой через алиасы (контраст-плашки hero/Header пока выглядят неправильно — закроется в Step 31.4)

- **Тесты:** `npm run test` — все тесты остаются зелёными (цвет не влияет на логику).

- **Ожидаемый результат:**
  - 12 базовых токенов холодной зоны на новых значениях, build зелёный.

### Step 31.3: Перекрасить декоративные rgba в `globals.css`

- **Действие:**
  - **body background gradient (строки 162-167):**
    - `rgba(132,192,3,0.05)` (lime пятно top-left) → `rgba(80,188,147,0.05)` (mint)
    - `rgba(251,97,25,0.04)` (orange пятно bottom-right) — **оставить** (тёплая зона)
    - комментарий «Лайм 5% top-left + оранжевый 4%» → «Mint 5% top-left + orange 4% bottom-right»
  - **`.hero-bg-lime` (строки 260-271):** все `rgba(132,192,3,*)` → `rgba(80,188,147,*)`
  - **`.hero-bg-orange` (строки 273-284):** не трогать (warning остался orange)
  - **`.hero-bg-blank` (строки 286-292):** `rgba(255,255,255,0.025)` (на тёмном фоне белая штриховка) → `rgba(10,16,41,0.025)` (на светлом фоне navy-штриховка)
  - **`.slot-hero::before` (строки 378-393):** lime-rgba → mint-rgba аналогично hero-bg-lime, штриховку `rgba(255,255,255,0.02)` → `rgba(10,16,41,0.02)`
  - **`.slot-card.tone-orange::before` (строки 395-405):** не трогать
  - **`.slot-card.tone-blank::before` (строки 407-414):** `rgba(255,255,255,0.025)` → `rgba(10,16,41,0.025)`
  - **`.capacity-pill.lime` (строки 427-431):** `rgba(132,192,3,0.28)` → `rgba(80,188,147,0.28)`
  - **`@keyframes admin-pulse` (строки 453-460):** `rgba(132,192,3,0.35/0.05)` → `rgba(80,188,147,0.35/0.05)`
  - **тени `--ui-shadow-card/floating` (строки 87-88):** не трогать (нейтральные `rgba(0,0,0,*)`, работают на любом фоне)
  - **`::selection` (строки 174-177):** не трогать (через `var(--ui-lime)` + `var(--ui-bg)`)

- **Проверка:**
  - визуально на `localhost:3000`:
    - body имеет едва-видимое мятное пятно сверху-слева + оранжевое снизу-справа
    - `.hero-bg-lime` диагональный луч мятный
    - `.capacity-pill.lime` мятная (в slot-блоках на главной)
    - admin-pulse мятный (на `/service-portal/logs` при включённом auto-poll)
  - штриховки в hero и slot-card на светлом фоне видны (раньше белые на тёмном, теперь navy на светлом)
  - `npm run build` зелёный

- **Тесты:** `npm run test` — все тесты остаются зелёными.

- **Ожидаемый результат:**
  - декор-слой `globals.css` обновлён, lime-rgba переехали на mint-rgba, тёплая orange-зона осталась.

### Step 31.4: Контраст-плашки — hero и Header

- **Действие:**
  - **`src/app/page.tsx`** — HeroBillboard секция (блок с `bg-card`/`bg-bg` и hero-разметкой):
    - bg → `bg-[#0A1029]` (navy)
    - текст на navy: `text-ink` → `text-white` (явно) либо подходящий мятный тон из новой палитры (`text-[#BFDFD2]` для secondary)
    - eyebrow — оставить mint
    - sport-chips внутри hero — пересмотреть точечно, чтобы читались на navy (border mint + текст mint-soft, либо вариант по референсу)
    - mini-FocusCard справа сверху (на lg+) — оставить `bg-card` (=белый) для контраста с navy, либо подобрать тон по референсу
  - **`src/components/layout/Header.tsx`** — фон header'а:
    - если на `bg-bg`/`bg-card` → `bg-[#0A1029]`
    - текст / иконки: `text-ink` → `text-white`
    - pill-навигация (logout, login, user-info): сейчас на `bg-card`/`border-line` — пересмотреть на navy с mint-soft border, либо белые pill'ы
    - NotificationBell — фон + иконка пересмотреть на navy
    - **гранж лого `Header.tsx:65`** `rgba(0,0,0,0.18)` на mint-марке — оставить, гранж работает
  - **`src/components/detail-shared/DetailScheduleWeek.tsx:126`** — badge счётчика слотов `bg-black/20` (на тёмной палитре давал мягкую заливку) → на светлой странице теряется. Заменить на `bg-ink/10` или `bg-[var(--ui-lime-soft)]` (любой мятный тон, чтобы метило на светлом теле). Юзер: «возьмём подходящий цвет из новой палитры, перекрасим если что потом».
  - **НЕ трогаем (на токенах, перекрасятся автоматически):** Footer, MobileNav, ProfileMobileNav, Skeleton, AdminSectionLoading, ProfileSectionLoading, ImpersonationBanner (намеренный warning-tone), MapThemeToggle, HiddenPublicationNotice — все используют токены `--ui-*` через утилиты Tailwind, новые значения подхватятся через алиасы обратной совместимости.

- **Проверка:**
  - визуально на `localhost:3000`:
    - hero на главной — navy с белым текстом, mint CTA, watermark mint-«SH», eyebrow mint
    - Header — navy с белой навигацией и mint логотипом
    - body вокруг них — белый/off-white, соответствует референсу
    - DetailScheduleWeek week-tabs — badge счётчика «метит» на светлом
  - `npm run build` зелёный
  - открыть `/clubs/[slug]` и `/trainers/[slug]` — detail-hero на photo-placeholder, проверить общую согласованность

- **Тесты:** регрессионные `npm run test` зелёные.

- **Ожидаемый результат:**
  - hero и Header — navy «острова» на белом body, остальная страница светлая, badge на week-tabs читается.

### Step 31.4.5: Audit `text-bg` → `text-ink` на цветных плашках

- **Действие:**
  - **Контекст проблемы:** на текущей dark-палитре `--ui-bg = #0a0a0a (угольный)`, паттерн `bg-lime text-bg` давал кнопку с лаймовой заливкой и тёмным контрастным текстом (~9:1, WCAG AAA). После перекраски `--ui-bg = #ffffff` → `text-bg` становится **белым**, и `bg-mint #50BC93 + text-white` даёт контраст **~2.7** — НЕ проходит WCAG AA. Mint-плашки станут плохо читаемыми.
  - **Решение** (юзер: «делаем текст темнее, любой подходящий цвет из новой палитры»): массовая замена `text-bg` → `text-ink` (= navy `#0A1029` после перекраски, контраст с mint ~7:1, проходит AA).
  - Файлы-кандидаты (10+, точный список через grep `text-bg` по `src/`):
    - `src/components/ui/SlotCard.tsx` — CTA «К записи» (Phase 30.9 `rounded-pill bg-lime text-bg`)
    - `src/components/ui/HiddenPublicationNotice.tsx` — кнопка возврата
    - `src/components/admin/AdminNavigation.tsx` — активный таб
    - `src/components/admin/LogsPage.tsx`, `ModerationPage.tsx`, `analytics/AnalyticsFilters.tsx`, `DashboardPage.tsx`
    - `src/components/clubs/ClubDetailPageClient.tsx`, `src/components/trainers/TrainerDetailPageClient.tsx`
    - `src/components/detail-shared/DetailScheduleWeek.tsx`
    - `src/components/profile/notifications/NotificationsListPage.tsx`
  - Для каждого: проверить контекст использования. На `bg-lime/mint` → `text-ink` обязательно. На `bg-orange/red/gold` — `text-ink` тоже подойдёт (navy на тёплых цветах контраст ~6-9, лучше унифицировать). На прозрачном/нейтральном фоне (если `text-bg` использовался как «акцент-текст») — пересмотреть по месту.
  - Использовать `grep -rn 'text-bg' src/` для полного списка перед заменой.

- **Проверка:**
  - `grep -rn 'text-bg' src/ | wc -l` → счёт совпадений до и после
  - визуально на `localhost:3000`:
    - SlotCard CTA «К записи» (mint-кнопка) — navy-текст, читается
    - HiddenPublicationNotice кнопка возврата читается
    - Admin pills/chips на цветных плашках читаются
  - `npm run build` зелёный

- **Тесты:** `npm run test` — все тесты остаются зелёными (если есть snapshot на классы — обновить).

- **Ожидаемый результат:**
  - все цветные плашки (mint/orange/red/gold) имеют читаемый navy-текст; контраст ≥ WCAG AA.

### Step 31.5: Точечный хардкод в компонентах

- **Действие:**
  - **`src/components/map/MainMap.tsx`** — marker pin и popup в JS-шаблоне:
    - pin background: `#d85a32` → `#50BC93` (mint)
    - pin border: `#fff` → `#ffffff` (без изменений)
    - popup background: `#fff` → `#ffffff`
    - popup title color: `#1a1a1a` → `#0A1029` (navy)
    - popup sport color: `#666` → `#BCBCBC` (muted)
    - popup address color: `#888` → `#BCBCBC` (muted)
    - popup rating: фон → `#f5c518` (gold) для звезды, цифра → `#0A1029` (navy на gold)
  - **`src/components/trainers/trainer-utils.ts:6-9`** — 4 hero-градиента:
    - текущие `from-[#113d45] via-[#1d6c74] to-[#f1d2af]` и т.д. → новые комбинации mint-navy:
      - вариация 1: `from-[#0A1029] via-[#50BC93] to-[#BFDFD2]`
      - вариация 2: `from-[#50BC93] via-[#83D3B5] to-[#BFDFD2]`
      - вариация 3: `from-[#0A1029] via-[#83D3B5] to-[#D2D8D6]`
      - вариация 4: `from-[#BFDFD2] via-[#50BC93] to-[#0A1029]`
    - финальные комбинации подбираются визуально по 4 тренерским hero-карточкам в выдаче
  - **`src/components/ui/ChipMarquee.tsx:231-233`** — маска edge-gradient:
    - `linear-gradient(to right, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%)` → `var(--ui-bg)` вместо `#000`
    - на светлой палитре `#000` создаст резкий чёрный артефакт у краёв
  - **`src/test/admin/analytics-smoke.test.tsx:34,55`** — тестовые цвета Recharts:
    - `stroke="#d85a32"` (Line) → `stroke="#50BC93"` (mint)
    - `fill="#0c6f73"` (Bar) → `fill="#0A1029"` (navy)
  - **НЕ трогать:**
    - `ClubCard.tsx:215`, `TrainerCard.tsx:331` — звёзды gold `text-[#f5c518]` остаются
    - `Modal.tsx:67` — оверлей `bg-[rgba(21,35,42,0.56)]` остаётся (стандартный UX-паттерн)
    - `Header.tsx:65` — гранж `rgba(0,0,0,0.18)` остаётся

- **Проверка:**
  - визуально на `localhost:3000`:
    - карта на главной → marker pin mint, popup на белом с navy текстом, рейтинг с золотой звездой
    - 4 тренерских карточки в выдаче → 4 разных hero-градиента в новой палитре
    - ChipMarquee тегов в карточках клубов → плавная маска на краях без чёрного артефакта
  - `npm run test src/test/admin/analytics-smoke.test.tsx` → проходит
  - `npm run lint` зелёный
  - `npm run build` зелёный

- **Тесты:** обновлённый `analytics-smoke.test.tsx` проходит; остальные тесты regressionно зелёные.

- **Ожидаемый результат:**
  - все хардкод-цвета вне токенов либо переведены на новые HEX, либо явно оставлены (звёзды gold + Modal overlay + Header гранж).

### Step 31.6: Обновить `.claude/skills/frontend-design/SKILL.md`

- **Действие:**
  - **Секция «Дизайн-философия» (строки 48-54):**
    - «Тема: ТЁМНАЯ. Угольный фон, белый текст, лаймовые и оранжевые акценты» → «Тема: СВЕТЛАЯ. Белый фон, navy-текст, мятные акценты (с сохранёнными orange/red/gold для warning/danger/pending как наследие Phase 28)»
    - «слабые радиальные пятна лайма/оранжевого на body wrapper и hero billboard» → «слабые радиальные пятна mint и orange на body»
    - «бруталистично-стритовый. Энергия, дерзость, движение» — **оставить** (DNA не меняется)
  - **Секция «Цветовая палитра» (строки 56-84):**
    - имена токенов `lime/orange/red/gold` сохраняются
    - таблица: обновить колонку «Назначение» под mint-семантику `lime`
    - «Лайм = записаться, подтвердить, опубликовать, success, активный таб» → «Лайм (mint в Phase 31+) = записаться, ...»
    - семантика orange/red/gold — без изменений
    - блок про алиасы обратной совместимости (Phase 28) → дополнить «Phase 31 сохранила эти алиасы при переходе на светлую палитру»
  - **Секция «Hero billboard» (строки 152-153):**
    - «rounded-[24-28px] + bg-card + декор» → «rounded-[24-28px] + bg `#0A1029` (navy plate на светлом body) + декор»
  - **Секция «Header parts» (строка 150):**
    - «Логотип-марка 44×44 lime» → «Логотип-марка 44×44 mint»
    - остальное (гранж через `::before`, pill-навигация, NotificationBell, аватар) — оставить
  - **Секция «Запреты» (строки 180-192):**
    - «Purple/blue gradient mesh» — **оставить** (у нас плоский navy на bg-плашках, не mesh)
    - «Hex-коды напрямую в JSX (только `var(--ui-*)` или Tailwind токены)» → дополнить: «Исключения, оправданные историей: `text-[#f5c518]` для звёзд рейтинга (gold-семантика); `bg-[#0A1029]` для контраст-плашек hero/Header (когда `bg-card` стал бы белым на белом)»
  - **Чек-лист перед коммитом UI-компонента (строки 194-209):** допустить исключения по hex (звёзды gold, hero navy)

- **Проверка:**
  - открыть `.claude/skills/frontend-design/SKILL.md` и убедиться что:
    - дизайн-философия теперь «светлая mint»
    - палитра ссылается на новые значения через `globals.css`
    - запреты обновлены под исключения
    - hero и Header упомянуты с navy bg

- **Тесты:** не применимо (markdown-документ).

- **Ожидаемый результат:**
  - source-of-truth по дизайн-системе синхронизирован с новой палитрой.

### Step 31.7: Визуальная верификация через Playwright MCP

- **Действие:**
  - `rm -rf .next && npm run dev` — холодная сборка (исключает закэшированные старые цвета)
  - дождаться готовности сервера (`http://localhost:3000`)
  - прогон по чек-листу через Playwright MCP (`mcp__playwright__browser_*`):
    1. `browser_navigate` → `/` → `browser_take_screenshot` (главная — hero + leader strip)
    2. scroll вниз → snapshot выдачи клубов + тренеров + slot-блоков + ChipMarquee + footer
    3. `browser_navigate` → `/clubs/<slug>` (seed-клуб) → snapshot
    4. `browser_navigate` → `/trainers/<slug>` → snapshot
    5. login athlete через `browser_fill_form` → `/profile/athlete/dashboard` + snapshot 7 подмаршрутов выборочно
    6. login provider → `/profile/provider/*` snapshot 10 подмаршрутов выборочно
    7. login admin → `/service-portal/*` snapshot 5 admin-разделов
    8. `/booking/<scheduleId>` → snapshot
    9. открыть PublishClubModal с пустыми полями → submit → проверить **danger-red валидация**
  - визуальные ассерции по каждому снимку:
    - читаемость navy на white
    - читаемость white на navy-плашках hero/Header
    - mint CTA выделяется
    - звёзды gold остались золотыми
    - warning/cancel-кнопки orange по-прежнему orange
    - валидация форм red
    - gold pending бейджи в Moderation/Users
    - нет видимых артефактов от старых rgba (например, чёрная маска ChipMarquee)
  - найденные огрехи → отдельный fix-коммит в рамках Step 31.7

- **Проверка:**
  - все снимки соответствуют новой палитре + сохранена тёплая семантика
  - нет «провалов» где старый lime-rgba не подхватился

- **Тесты:** Playwright MCP-снимки как evidence.

- **Ожидаемый результат:**
  - визуальный аудит подтверждает что перекраска завершена, нет регрессий.

### Step 31.8: Финальная верификация и синхронизация документации

- **Действие:**
  - прогнать:
    - `npm run format`
    - `npm run lint`
    - `npm run test`
    - `npm run build`
  - синхронизировать документацию:
    - **`CLAUDE.md`** — обновить секцию «Текущее состояние»: последняя завершённая фаза → Phase 31, краткое описание перекраски
    - **`PHASES_OVERVIEW.md`** — обновить «Текущий статус» + добавить строку Phase 31 в таблицу фаз
    - **`project-phases/phase-31.md`** — чек-лист, последний шаг отмечен, статус «✅ ЗАВЕРШЕНА»
    - **`PROJECT_STATE.md`** — обновить упоминания «тёмная палитра» в секциях «Ключевые компоненты», «Главная страница»
    - **`README.md`** — обновить hero-блок описания (упоминает «тёмная SportHub-палитра»), добавить строку Phase 31 в таблицу прогресса
    - **`STACK_OVERVIEW.md`** — секция «Дизайн-система»: обновить на светлую mint, контраст-плашки hero/Header
    - **`feature-docs/`** — пробежаться, проверить упоминания палитры; цвет не затрагивает доменную логику, изменений быть не должно

- **Проверка:**
  - все 4 npm-команды зелёные
  - документация синхронизирована, «тёмная палитра» не значится как актуальное состояние
  - PROJECT_STATE.md описывает текущую светлую палитру

- **Тесты:** финальный `npm run test` — 1451+ тестов зелёные.

- **Ожидаемый результат:**
  - Phase 31 закрыта, документация в порядке, проект готов к демо.

### Step 31.10: Финальная докраска (navy darken + lime swap + mist carriers + graphite text)

> Re-open после первого закрытия фазы. Пользователь по результату визуального аудита запросил серию точечных правок, не меняющих ни функционал, ни структуру — только цвет и фон конкретных поверхностей. Объединено в один шаг и один коммит как полноценный финальный аудит палитры.

**Подшаг A — Аудит контрастов + navy darken под референс:**

- `--ui-ink` `#07124F → #0A1029` (темнее, ближе к референсу пользователя). Синхронно в 14 точках: `globals.css` (--ui-ink + 6 `rgba(7,18,79,…)` → `rgba(10,16,41,…)` в `.hero-bg-*`, `.slot-hero::before`, `.slot-card.tone-blank`); `page.tsx`/`Header.tsx` (`bg-[#07124F] → bg-[#0A1029]` навы плашки); `trainer-utils.ts` (3 hero-градиента); `MainMap.tsx` popup-title color; `analytics-smoke.test.tsx` `fill`; и упоминания во всех проектных доках.
- `Chip.tsx:20` активное `bg-ink text-ink` (текст того же цвета что фон — невидимо после Phase 31.4.5) → `bg-lime text-ink`. Сразу починило активные табы дискавери, sport-chip «Все», все `<Chip active>`.
- `AuthModal.tsx` табы Вход/Регистрация: `bg-ink text-ink` → `bg-lime text-ink` (2 occurrences).
- `DetailScheduleWeek.tsx` badge активного дня: `bg-ink/20 text-bg` (белый на полупрозр navy на белом — почти невидимо) → `bg-ink text-bg` (твёрдый navy + белый).
- `--ui-muted` поднят `#BCBCBC → #7A8186` (graphite) — контраст ≥4.6 на белом проходит WCAG AA. Описания/мета/специализации стали читаться.
- Stat-rail на mist (`bg-card-2`) в `ClubDetailPageClient.tsx` и `TrainerDetailPageClient.tsx`: `text-muted` (контраст 1.5 на mist) → `text-ink/55` (eyebrow) и `text-ink/70` (email, «за абонемент», контакты).
- `ProfileSidebar.tsx:51` — non-existent class `text-ink-muted` → `text-muted` (неактивная вкладка получила цвет).

**Подшаг B — Карточки выдачи: hero на mist:**

- `ClubCard.tsx` и `TrainerCard.tsx` — корневая `<article>` остаётся `bg-card` (white) + `border-line` (как было). Внутренняя hero-`<div>` меняем `bg-[var(--ui-bg)] → bg-[var(--ui-card-2)]` — серенький верх с сохранёнными mint/orange-лучом, штриховкой 135°, watermark номера. Body (rating, цена, описание, чипы) остаётся на белом — чёткий ритм «media-zone (mist) / content-zone (white)».
- `TrainerCard.tsx` avatar-disc 84×84 (в hero, после перекраски hero в mist): `bg-card-2 → bg-card` (внутри mist нужен white для контраста).
- «Новый» бейдж в обеих карточках остаётся `bg-card-2` (стоит на white body — выделяется).
- `TrainerCard.tsx` meta-box (Площадка / Ближайшее окно) остаётся `bg-card-2` (на белом body — контрастирует).

**Подшаг C — Swap `--ui-lime` ↔ `--ui-lime-hov`:**

- `globals.css :root`: `--ui-lime #50BC93 → #83D3B5` (default — мягкий mint), `--ui-lime-hov #83D3B5 → #50BC93` (hover/press-emphasis — насыщенный mint). UX: hover делает кнопку темнее, что валидно для светлой темы.
- Декоративные `rgba(80,188,147,…) → rgba(131,211,181,…)` в 5 точках `globals.css` (`body` radial, `.hero-bg-lime`, `.slot-hero::before`, `.capacity-pill.lime` border, `@keyframes admin-pulse`).
- Точечные хексы: `MainMap.tsx` pin/popup-стрелка `#50BC93 → #83D3B5`; `trainer-utils.ts` 4 hero-градиента — попарный swap `#50BC93 ↔ #83D3B5`; `analytics-smoke.test.tsx` Recharts `stroke` `#50BC93 → #83D3B5`.
- Мёртвые `rgba(132,192,3,0.3)` (Phase 28 olive-lime от `#84c003`, забытые после Phase 31.2) в `page.tsx:268`, `TrainerCard.tsx:108`, `ChipMarquee.tsx:219`, `ClubDetailPageClient.tsx:85,602` — на актуальный `rgba(131,211,181,0.3)`.

**Подшаг D — Leader Strip 01/02 на mist:**

- `page.tsx:253` (лидер-клуб) и `:317` (лидер-тренер) — `<article>` `bg-card → bg-card-2` (mist). Внутри mini-stat «Рейтинг»/«Отзывы» остались на `bg-bg` (white) — белые блоки на mist контрастируют.
- Avatar-disc «С» (лидер-клуб): `text-[var(--ui-lime)] → text-[var(--ui-lime-hov)]` — после swap буква получает насыщенный mint и читается на mint-soft фоне.

**Подшаг E — `text-lime` на mint-soft → `text-muted` (graphite):**

- После swap светлый mint `#83D3B5` на `bg-lime-soft #BFDFD2` плохо читается. Заменяем на `text-muted #7A8186`:
  - `ChipMarquee.tsx:219` solid lime variant — теги клубов «УТРЕННИЕ ГРУППЫ» и т.п.
  - `ClubDetailPageClient.tsx:85` — solid bullet в empty-state.
  - `ClubDetailPageClient.tsx:602` — chip-бэйдж specialty.
  - `ClubCard.tsx:79` — address-eyebrow tone=lime (на mist hero после Подшага B).
  - `globals.css .slot-card .slot-eyebrow.lime` — eyebrow слот-карточки.
  - `globals.css .capacity-pill.lime` — capacity-пилл текст внутри mint-soft.
- `TrainerCard.tsx:109` group-chip lime variant — текст оставлен `text-lime-hov` (насыщенный mint), т.к. это короткий 5-символьный чип-индикатор «Группа» — насыщенный mint сохраняет видимость акцента.
- Точки где `text-lime` на **навы/белом фоне** (Header role-eyebrow, page hero `<span>спорт</span>`, NotificationBell ссылка, MobileNav active иконка) — не трогаются, там mint работает как акцент по другому контрасту.

**Проверка** (через Playwright MCP на dev-сервере):

- Главная (1440): hero navy глубже (под референс), Leader Strip на mist с читаемой буквой аватара, ClubCard hero на mist + body white, mint в CTA светлее (`#83D3B5`), фильтрационный chip «Все» / активный таб «По клубам и направлениям» — mint на белом читается, hover темнеет.
- ClubCard tags ChipMarquee — теги graphite на mint-soft, читаются (главная проблема скриншота решена).
- Detail-страница клуба/тренера — stat-rail на mist с читаемыми email/«за абонемент»/контактами.
- Mobile 480, tablet 768 — структурно не поломано.
- Admin: AdminNav segmented-control active mint, pulse-dot светло-mint.

**Тесты:** `npm run test` — `analytics-smoke.test.tsx` зелёный с новым `#83D3B5`. Остальные 1451+ зелёные (цвет не влияет на бизнес-логику). `npm run lint` + `npm run build` зелёные.

**Ожидаемый результат:** Phase 31 закрыта окончательно. Палитра прошла визуальный аудит по референсу, все контрастные косяки убраны, hover/press-emphasis работает, документация синхронизирована. Один итоговый коммит для всех правок Подшагов A-E.

---

### Чек-лист Phase 31

**Step 31.1 — Подготовка:**
- [ ] Ветка `phase-31` создана
- [ ] Решения в «Ключевые решения» зафиксированы
- [ ] Снимок старых значений `globals.css` сделан

**Step 31.2 — Базовые токены (`globals.css`):**
- [ ] 12 переменных холодной зоны на новых значениях
- [ ] Тёплая зона (`--ui-orange*`, `--ui-red`, `--ui-gold`) без изменений
- [ ] Алиасы обратной совместимости не тронуты
- [ ] Русские комментарии актуализированы
- [ ] `npm run build` зелёный

**Step 31.3 — Декоративные rgba (`globals.css`):**
- [ ] body gradient — lime → mint, orange сохранён
- [ ] `.hero-bg-lime` mint
- [ ] `.hero-bg-orange` сохранён
- [ ] `.hero-bg-blank` штриховка navy
- [ ] `.slot-hero::before` mint
- [ ] `.slot-card.tone-orange::before` сохранён
- [ ] `.slot-card.tone-blank::before` штриховка navy
- [ ] `.capacity-pill.lime` mint border
- [ ] `@keyframes admin-pulse` mint

**Step 31.4 — Контраст-плашки:**
- [ ] HeroBillboard на `page.tsx` — bg navy + текст белый
- [ ] Header — bg navy + текст белый + mint логотип
- [ ] `DetailScheduleWeek` `bg-black/20` → подходящий мятный/navy-soft тон
- [ ] Footer / MobileNav / Skeleton / loading.tsx / ImpersonationBanner / MapThemeToggle / HiddenPublicationNotice — **не трогаем** (на токенах, перекрасятся автоматически)

**Step 31.4.5 — Audit `text-bg` → `text-ink`:**
- [ ] `grep -rn 'text-bg' src/` сделан, список зафиксирован
- [ ] SlotCard CTA (mint-кнопка) — `text-ink`
- [ ] HiddenPublicationNotice — `text-ink`
- [ ] AdminNavigation / LogsPage / ModerationPage / AnalyticsFilters / DashboardPage
- [ ] ClubDetailPageClient / TrainerDetailPageClient
- [ ] DetailScheduleWeek
- [ ] NotificationsListPage
- [ ] Визуально проверены mint/orange/red/gold плашки на читаемость

**Step 31.5 — Точечный хардкод:**
- [ ] `MainMap.tsx` marker pin → mint
- [ ] `MainMap.tsx` popup → navy/muted/gold
- [ ] `trainer-utils.ts` 4 hero-градиента → mint-navy
- [ ] `ChipMarquee.tsx` маска `#000` → `var(--ui-bg)`
- [ ] `analytics-smoke.test.tsx` тестовые цвета обновлены
- [ ] Звёзды gold в ClubCard/TrainerCard сохранены
- [ ] Modal overlay сохранён
- [ ] Header гранж сохранён

**Step 31.6 — SKILL.md:**
- [ ] Дизайн-философия обновлена (тёмная → светлая mint)
- [ ] Цветовая палитра — упоминание mint в `lime`
- [ ] Запреты — добавлены исключения (звёзды gold, hero navy)
- [ ] Hero billboard упомянут как navy plate
- [ ] Header logo-mark mint

**Step 31.7 — Playwright MCP:**
- [ ] Главная — snapshot
- [ ] Detail клуба + тренера — snapshot
- [ ] ЛК атлета (выборочно) — snapshot
- [ ] ЛК провайдера (выборочно) — snapshot
- [ ] Service Portal (5 разделов) — snapshot
- [ ] Booking — snapshot
- [ ] PublishModal с red-валидацией — snapshot
- [ ] Визуальные ассерции пройдены
- [ ] Найденные огрехи закрыты fix-коммитом

**Step 31.8 — Финализация:**
- [ ] `npm run format` зелёный
- [ ] `npm run lint` зелёный
- [ ] `npm run test` зелёный (1451+)
- [ ] `npm run build` зелёный
- [ ] `CLAUDE.md` синхронизирован
- [ ] `PHASES_OVERVIEW.md` синхронизирован
- [ ] `phase-31.md` чек-лист завершён
- [ ] `PROJECT_STATE.md` синхронизирован
- [ ] `README.md` синхронизирован
- [ ] `STACK_OVERVIEW.md` синхронизирован
- [ ] `feature-docs/` проверены

**Step 31.10 — Финальная докраска (A: navy darken + audit, B: mist-hero карточек, C: lime swap, D: Leader Strip, E: text-lime → text-muted):**

*Подшаг A — Audit + navy darken:*
- [x] `--ui-ink` `#07124F → #0A1029` (+ 6 rgba штриховок в `globals.css`)
- [x] navy hex синхронизирован в `page.tsx`, `Header.tsx`, `trainer-utils.ts` (3 grad), `MainMap.tsx`, `analytics-smoke.test.tsx`
- [x] `Chip.tsx` active `bg-ink text-ink` → `bg-lime text-ink`
- [x] `AuthModal.tsx` табы Вход/Регистрация `bg-ink text-ink` → `bg-lime text-ink`
- [x] `DetailScheduleWeek.tsx` badge `bg-ink/20 text-bg` → `bg-ink text-bg`
- [x] `--ui-muted` `#BCBCBC → #7A8186` (graphite)
- [x] `ClubDetailPageClient.tsx` + `TrainerDetailPageClient.tsx` stat-rail на mist — `text-muted` → `text-ink/55` / `text-ink/70`
- [x] `ProfileSidebar.tsx` non-existent `text-ink-muted` → `text-muted`

*Подшаг B — Карточки выдачи hero на mist:*
- [x] `ClubCard.tsx` hero `<div>` `bg-bg` → `bg-card-2`
- [x] `TrainerCard.tsx` hero `<div>` `bg-bg` → `bg-card-2`
- [x] `TrainerCard.tsx` avatar-disc 84×84 `bg-card-2` → `bg-card` (контраст в mist hero)
- [x] «Новый» бейдж и meta-box (TrainerCard) остаются `bg-card-2` на белом body

*Подшаг C — Swap lime ↔ lime-hov:*
- [x] `globals.css :root` swap значений `--ui-lime` (#83D3B5) ↔ `--ui-lime-hov` (#50BC93)
- [x] 5 декоративных `rgba(80,188,147,…)` → `rgba(131,211,181,…)` в `globals.css`
- [x] `MainMap.tsx` pin/popup-стрелка `#50BC93 → #83D3B5`
- [x] `trainer-utils.ts` swap `#50BC93 ↔ #83D3B5` в 4 hero-градиентах
- [x] `analytics-smoke.test.tsx` `stroke` `#50BC93 → #83D3B5`
- [x] Мёртвые `rgba(132,192,3,…)` → `rgba(131,211,181,…)` в `page.tsx`, `TrainerCard.tsx`, `ChipMarquee.tsx`, `ClubDetailPageClient.tsx`

*Подшаг D — Leader Strip 01/02 на mist:*
- [x] `page.tsx:253` лидер-клуб `<article>` `bg-card` → `bg-card-2`
- [x] `page.tsx:317` лидер-тренер `<article>` `bg-card` → `bg-card-2`
- [x] Avatar-disc «С» (лидер-клуб) `text-lime` → `text-lime-hov`

*Подшаг E — text-lime → text-muted на mint-soft:*
- [x] `ChipMarquee.tsx` solid lime variant
- [x] `ClubDetailPageClient.tsx` (2 точки — empty-state bullet + specialty chip)
- [x] `ClubCard.tsx` address-eyebrow tone=lime
- [x] `globals.css` `.slot-card .slot-eyebrow.lime` color
- [x] `globals.css` `.capacity-pill.lime` color

*Документация (Step 31.10):*
- [x] `phase-31.md` — Step 31.10 + чек-лист (этот документ)
- [x] `PHASES_OVERVIEW.md` — описание Phase 31 дополнено упоминанием Step 31.10
- [x] `PROJECT_STATE.md` — упоминания актуальной палитры (#83D3B5 / #50BC93 / #7A8186 / #0A1029) и mist-hero карточек
- [x] `README.md` — Phase 31 описание дополнено
- [x] `STACK_OVERVIEW.md` — Дизайн-система: новые hex'ы
- [x] `CLAUDE.md` — Текущее состояние: упоминание Step 31.10
- [x] `.claude/skills/frontend-design/SKILL.md` — палитра / Filter-chip / карточка в выдаче

*Верификация:*
- [x] Playwright MCP визуальный обход — главная, ClubCard теги, Leader Strip, detail-страницы
- [x] `npm run format` зелёный (prettier подровнял 2 файла без правок логики)
- [x] `npm run lint` зелёный (0 errors, 12 наследных warnings про unused vars в тестах)
- [x] `npm run test` зелёный (1451/1451 за 15s)
- [x] `npm run build` зелёный (Next build success)

**Выполнено:** Step 31.1 ✅ (без коммита — docs в .gitignore), Step 31.2 ✅ `304a8e7`, Step 31.3 ✅ `0085e56`, Step 31.4 ✅ `dd14cf0`, Step 31.4.5 ✅ `a3c6dbe`, Step 31.5 ✅ `451e0a8`, Step 31.6 ✅ (без коммита — SKILL.md в .gitignore), Step 31.7 ✅ `5719076` (fix контрастов + text-panel массовый audit), Step 31.8 ✅ `871ee2a` (prettier-cleanup), Step 31.10 ✅ `82574bf` (финальная докраска — navy darken, lime swap, mist-hero карточек, graphite text — единый коммит 15 файлов).

**Следующий шаг:** — Phase 31 закрыта окончательно, ждём команду пользователя (demo / новая фаза).

**Статус Phase 31:** ✅ ЗАВЕРШЕНА (Step 31.10 — финальный аудит палитры после первого закрытия)

---

### Принцип масштабирования

- **Алиасы обратной совместимости** (`--ui-canvas → bg`, `--ui-accent → lime`, ...) из Phase 28 остаются как мост между старыми именами и новыми значениями. При будущих ребрендах достаточно поменять значения базовых токенов в одной точке (`:root`), весь код через утилиты Tailwind подхватит автоматически.
- **Hardcoded bg на контраст-плашках** (hero/Header `bg-[#0A1029]`) — пока живёт точечно. При переходе на полноценную **light/dark toggle** через `prefers-color-scheme` или Zustand-store эти bg нужно будет либо завернуть в новый токен (например, `--ui-contrast-plate`), либо оставить как brand-константу (navy всегда navy).
- **Гольд звёзд рейтинга** (`text-[#f5c518]`) — кандидат на токенизацию в будущей фазе, если появится потребность гибко менять акцент рейтинга. Сейчас хардкод оправдан семантикой («звезда всегда золотая»).
- **Hero-градиенты тренеров** (`trainer-utils.ts`) — кандидат на перевод в утилиту `generateHeroGradient(seed)` для процедурной генерации, если потребуется > 4 вариаций. Пока 4 захардкоженных достаточно.
- **Тёплая зона (orange/red/gold)** — следующая итерация может либо перевести их на холодные альтернативы (если потребуется чистая mono-mint палитра), либо оставить как «brand-сигналы безопасности» (warning/danger/pending должны кричать, а не сливаться с general palette).
- **Yandex Maps dark theme** (Phase 29: `[data-map-theme='dark'] canvas { filter: grayscale(1) invert(1); }`) — после перекраски на светлую палитру dark-режим карты остаётся отдельной фичей; пользователь может переключаться, фильтр инвертирует тайлы. Поведение проверяется визуально в Step 31.7.

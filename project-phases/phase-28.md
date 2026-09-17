# Phase 28

> Этот файл содержит одну фазу проекта целиком. Главный вход в контекст — `CLAUDE.md`.
> Навигация по фазам — через `PHASES_OVERVIEW.md`.
> В ежедневной работе открывай прежде всего активную фазу и не перечитывай все phase-файлы подряд без необходимости.
> Структура фазы сохраняется в исходном стиле: заголовок фазы, краткий результат, шаги по порядку, затем чеклист и статус.
> Перед стартом новой фазы проверь, что для неё уже есть отдельный `phase-XX.md`, и после завершения шагов или фазы синхронизируй статус здесь, в `PHASES_OVERVIEW.md`, `CLAUDE.md`, `README.md` и при необходимости в `STACK_OVERVIEW.md`.

## Phase 28: Редизайн фундамента — токены, Header, главная

> Phase 28 переводит проект на новую дизайн-систему SportHub, зафиксированную в Claude Design (тёмная угольная палитра, лайм/оранжевые акценты, Bowlby One + Oswald + JetBrains Mono). Phase 28 — **только фундамент**: дизайн-токены в `globals.css`, шрифты через `next/font`, перевёрстка `Header` + `MobileNav` + `NotificationBell` (видны на всех страницах) и редизайн главной (`/`) с сохранением функциональности и live Yandex Maps. Дальнейшие страницы (ЛК, admin, detail-страницы клубов и тренеров, /booking) переводятся в Phase 29+ кусками по мере добавления новых блоков от Claude Design.

Phase 28 — это не «новая функциональность», а **инфраструктурный rebrand визуала**. Бизнес-логика (FSM booking, Phase 24-25 reliability, Phase 26 fake auth, Phase 27 hot-fixes) не трогается. Поведение страниц после Phase 28 не меняется — меняется только внешний вид Header'а на всех страницах и компоновка главной. Единственный source-of-truth по визуалу — handoff-bundle Claude Design, лежащий локально в `claude-design/` (в `.gitignore`):

- `claude-design/project/SportHub UI Kit.html` — палитра, типографика, компоненты, состояния, animations
- `claude-design/project/SportHub Header - Standalone Source.html` — разметка главной (header + hero + search + map placeholder + leader strip) на 6 брейкпоинтах
- `claude-design/chats/chat1.md` — интент: какие решения и почему

Ключевое правило: **прототип не копируем по DOM-ам**, а переводим в наш стек (Next.js 16 App Router + React 19 + Tailwind CSS 4 + Zustand). Матчим визуал и адаптив, не структуру inline Babel-скриптов из прототипа.

**Пререквизит:** Phase 27 завершена — финальный E2E `reliability-quarantine.md` пройден 29/29, дисциплина и ЛК-хаб стабильны. Все Phase 24-27 механики работают на текущем (светлом) визуале и продолжат работать после rebrand'а — он чисто визуальный.

---

## Правила работы

Применяются к каждому шагу, где переносится верстка из handoff-bundle Claude Design в реальный код. Эти правила выше любого конкретного степа — нарушать нельзя.

**Playwright MCP включается СРАЗУ.** Перед стартом любого верстального шага:

1. Запустить dev-сервер в фоне: `npm run dev` (background).
2. Поднять Playwright MCP (если ещё не открыт): `mcp__playwright__browser_install` (только при первом запуске сессии) → `mcp__playwright__browser_navigate` к `http://localhost:3000`.
3. Держать MCP открытым до конца степа. **Не пытаться верстать «вслепую» по диффам — это уже один раз ехало адаптивно (Step 28.3, потребовался hot-fix `7d3e8e5`).**
4. После каждой осмысленной правки JSX/CSS делать `mcp__playwright__browser_resize` по 5 брейкпоинтам подряд: **480 / 768 / 1024 / 1280 / 1440** (1920 не обязательно — поведение совпадает с 1440). На каждом — `mcp__playwright__browser_snapshot` (или `browser_take_screenshot` если нужно сравнить с дизайном).
5. Проверка обязательно включает: (а) нет horizontal scroll на 480, (б) карточки в слайдере одинаковой высоты, (в) chip-marquee катится без визуальных «стыков», (г) drag/swipe на чипах работает, (д) на 768 переключение «по 1 видимой» отрабатывает.

**Источник истины — handoff-bundle.** Все pixel-perfect значения, animations, анимационные тайминги (transition .15s, .35s cubic-bezier, marquee 32 px/sec) — из `claude-design/cards-trainers/sporthub/project/SportHub Cards - {Clubs,Trainers}.html`. Intent (что и зачем) — из `claude-design/cards-trainers/sporthub/chats/chat1.md`.

**Перевод в стек:** не копируем DOM прототипа 1-в-1 — переводим в Server/Client Components + Tailwind utility-классы + `var(--ui-*)` токены. CSS-переменные прототипа (`--bg`/`--lime`/`--orange`/`--card`/`--line`/`--muted`) маппятся на наши через алиасы Phase 28.1: `--bg → --ui-bg`, `--card → --ui-card`, `--line → --ui-line`, `--ink → --ui-ink`, `--muted → --ui-muted`, `--lime → --ui-lime`, `--orange → --ui-orange` (или существующие `--ui-accent` / `--ui-warning`). Hex-коды напрямую в JSX **запрещены**.

**Scope защищён.** Не трогаем компоненты вне scope конкретного степа. ChipMarquee и CardSlider пишутся **до** перевёрстки карточек (в общий 28.6) — карточки потом просто их используют.

---

### Ключевые решения

**Семантика переменных сохраняется, меняются только значения.**

- В `globals.css` сейчас 11 CSS-переменных под светлую палитру (`--ui-canvas: #f4ead7`, `--ui-accent: #d85a32`, ...). Они используются в `@theme inline` маппинге Tailwind как `--color-canvas`, `--color-accent`, ... → классы `bg-canvas`, `text-accent`, `border-line` разбросаны по 200+ компонентам.
- Phase 28 **не переименовывает** эти переменные. Меняются их значения (`--ui-canvas: #0a0a0a`, `--ui-accent: #84c003`, ...) + **добавляются новые** под расширенную палитру UI Kit (`--ui-card-2`, `--ui-line-2`, `--ui-orange`, `--ui-orange-soft`, `--ui-lime-soft`, `--ui-disabled`, `--ui-red`).
- Существующие страницы (ЛК, admin, /clubs/[slug], /trainers/[slug], /booking) автоматически получат тёмную палитру и продолжат работать. Точечная полировка по компонентам — в Phase 29+ по мере добавления новых блоков от Claude Design.
- Альтернативу (полное переименование переменных + рефакторинг 200+ компонентов за один шаг) **отвергли**: ломает весь проект, очень рискованно, не добавляет ценности.

**Шрифты через `next/font/google`.**

- Self-hosted в Next.js, нулевой CLS, без обращений к Google Fonts в проде.
- 3 семейства: `Bowlby_One` (400 only), `Oswald` (400, 500, 600, 700), `JetBrains_Mono` (400, 500).
- Подключаются в `src/app/layout.tsx` с `variable: '--ui-font-display' / '--ui-font-body' / '--ui-font-mono'` — именно те имена CSS-переменных, что уже используются в `globals.css`. После шага значения переменных перестают быть системными fallback'ами и становятся реально загруженными шрифтами.

**Контейнер 1280 → 1440 только для Header и главной.**

- В `chat1.md` зафиксировано решение поднять max-width контейнера главной с 1280 (`max-w-7xl`) до 1440px. Свыше 1440 — симметричные пустые поля по бокам (без растяжения контента).
- В Phase 28 трогаем контейнер только в `Header.tsx` и `src/app/page.tsx` (`max-w-[1440px]`). Остальные страницы (ЛК, admin, detail) пока на `max-w-7xl` — портируем по мере rebrand'а.
- Это компромисс: главное визуальное впечатление (hero + header) уже в новом просторе, остальное — постепенно.

**Карта остаётся live, без визуальных правок внутренней логики.**

- В дизайне Claude Design map — это декоративная заглушка (сетка + «река» + 4 пина с пульсирующим ripple).
- У нас в проекте — production Yandex Maps 3.0 (Phase 19) с маркерами, popup, геокодированием.
- Phase 28 **не трогает** компонент `MapSection` и связанные с ним `MainMap` / `YandexMapProvider` / `useMapMarkers`. Внутренний рендер карты остаётся как есть. Внешняя обёртка (border, padding, тени) подстраивается автоматически через изменившиеся токены.
- Стилизация карты под новую палитру (тёмная стилизация Yandex layer'а, кастомные пины) — в Phase 29+ отдельным шагом.

**Адаптив по 6 брейкпоинтам, mobile-first.**

| Имя | Ширина | Header | Главная |
|-----|--------|--------|---------|
| `sm` | 480px | Нав скрыта, user-info скрыт, видна mobile dock внизу | Hero одна колонка, sport-rail горизонтальный скролл, FocusCard под рейлом, leader-strip в столбик, CTA full-width |
| `md` | 768px | Нав видна, user-info скрыт, кнопка «Выйти» — иконка-дверь 44×44 | Sport-rail без переноса, leader-strip 2 колонки, FocusCard под рейлом |
| `lg` | 1024px | Полный header (нав + user-info) | Hero billboard 2 колонки (1.3fr / 0.7fr), FocusCard overlapping, leader-strip 2 колонки |
| `xl` | 1280px | Контент = max-w-[1440px], тянется по ширине вьюпорта | Та же сетка, контейнер тянется |
| `xxl` | 1440px | Контейнер достигает потолка | Контейнер достигает потолка |
| `2k` | 1920px | Симметричные пустые поля слева/справа | Симметричные пустые поля |

**UI Kit как референс, не как маршрут.**

- HTML-источник `claude-design/project/SportHub UI Kit.html` остаётся локальной документацией.
- `.claude/skills/frontend-design/SKILL.md` — это и есть наш «UI Kit в виде правил» (палитра, шрифты, компоненты, чек-лист). Он **уже подробно описывает SportHub-дизайн** (тёмная тема, lime/orange, Bowlby+Oswald), требует точечной доработки.
- Маршрут `/design-system` в проекте **НЕ создаём** — лишний код в проде, дублирующий скилл и UI Kit-исходник.

**Скилл `frontend-design/SKILL.md` — точечная очистка, не переписывание.**

- Удаляем generic-блок «Frontend Aesthetics Guidelines» (строки 11-42) — это AI-инструктаж про «выберите смелый стиль», который конфликтует с уже зафиксированным в скилле SportHub-стилем.
- Заменяем на 5-строчный блок-указатель: «Этот скилл — единственный источник правды по дизайн-системе SportHub. Источники: `claude-design/project/SportHub UI Kit.html` (компоненты), `Header - Standalone Source.html` (главная), `chat1.md` (intent). При появлении новых компонентов от Claude Design — обновляем этот скилл.»
- Остальные секции скилла (палитра, типографика, компоненты, чек-лист) — оставляем, при необходимости синхронизируем значения с UI Kit.html (значения **уже совпадают**, проверка контрольная).

**Тесты — структурные, без визуальных снапшотов.**

- Существующие тесты Header (`Header.test.tsx`, если есть) и других затронутых компонентов прогоняем — убеждаемся, что rebrand не сломал поведение.
- Новые тесты для редизайна — **минимум**: testid'ы на ключевые элементы Header (логотип, navigation, NotificationBell, аватар, Выйти/Войти). Гость / athlete / provider / admin / impersonating состояния рендерят правильный набор элементов.
- **Визуальные снапшоты НЕ делаем** — слишком хрупкие при styling-фиксах, много шума при будущих iterations Phase 29+. Ручная верификация через `npm run dev` + браузер на 6 брейкпоинтах.

**Что НЕ делаем в Phase 28:**

- Не трогаем `Button`, `Card`, `Input`, `Select`, `Modal`, `Badge`, `Chip`, `Rating`, `Skeleton`, `ToastStack`, `ReliabilityBadge` UI-атомы. Они автоматически получат новые токены через изменённые CSS-переменные. Точечная полировка под UI Kit-классы (`btn-sm/md/lg`, `r-card`, `r-pill`) — в Phase 29+ по мере необходимости.
- Не трогаем ЛК (`/profile/*`), admin (`/service-portal/*`), detail-страницы (`/clubs/[slug]`, `/trainers/[slug]`, `/booking/[scheduleId]`).
- Не трогаем `MapSection` и Yandex Maps стек.
- Не пишем новые компоненты для UI Kit-первоисточника (`FocusCard`, `LeaderCard` отдельные модули). Они интегрируются inline в `src/app/page.tsx` — после стабилизации в Phase 29+ можно будет вынести.
- Не делаем E2E. Существующих тестов хватит для smoke-проверки.

---

### Step 28.0: Создание ветки phase-28 + коммит pending `.gitignore`

**Что делаем:**

- `git checkout -b phase-28` от `phase-27`.
- Закоммитить уже существующее изменение `M .gitignore` (добавлены `.mcp.json`, `tests/`, `e2e/`, `ЗАМЕТКИ.md`, `claude-design/`, `драфт_дизайн/`) одним коммитом `chore(gitignore): добавить локальные артефакты и claude-design bundle`.
- Запушить ветку: `git push -u origin phase-28`.

**Тест:**

- `git branch --show-current` → `phase-28`
- `git status` → working tree clean
- `git log -1 --oneline` показывает свежий коммит про gitignore

---

### Step 28.1: Дизайн-токены, шрифты, `globals.css`

**Что делаем:**

- Подключить шрифты в `src/app/layout.tsx` через `next/font/google`:
  - `Bowlby_One` 400 → `variable: '--ui-font-display'`
  - `Oswald` 400/500/600/700 → `variable: '--ui-font-body'`
  - `JetBrains_Mono` 400/500 → `variable: '--ui-font-mono'`
  - Применить классы `${bowlby.variable} ${oswald.variable} ${jetbrains.variable}` к `<html>` (или `<body>`).
- Полностью пересобрать `src/app/globals.css`:
  - 14 CSS-переменных тёмной палитры (`--ui-bg #0a0a0a`, `--ui-bg-deep #050505`, `--ui-card #1a1a1a`, `--ui-card-2 #141414`, `--ui-line #2a2a2a`, `--ui-line-2 #222`, `--ui-ink #ffffff`, `--ui-muted #a0a0a0`, `--ui-disabled #6b6b6b`, `--ui-lime #84c003`, `--ui-lime-hov #91d401`, `--ui-lime-soft rgba(132,192,3,0.12)`, `--ui-orange #fb6119`, `--ui-orange-hov #ff7a3d`, `--ui-orange-soft rgba(251,97,25,0.12)`, `--ui-red #e74c3c`).
  - **Сохранить старые имена-алиасы** для обратной совместимости с существующими компонентами: `--ui-canvas → var(--ui-bg)`, `--ui-panel → var(--ui-card)`, `--ui-panel-strong → var(--ui-card-2)`, `--ui-accent → var(--ui-lime)`, `--ui-accent-strong → var(--ui-lime-hov)`, `--ui-accent-soft → var(--ui-lime-soft)`, `--ui-teal → var(--ui-lime)`, `--ui-success → var(--ui-lime)`, `--ui-warning → var(--ui-orange)`, `--ui-danger → var(--ui-red)`. → существующие `bg-canvas`, `text-accent`, `border-line` будут указывать на тёмные значения, не сломав ни один компонент.
  - Радиусы: `--ui-radius-pill 999px`, `--ui-radius-card 18px`, `--ui-radius-card-lg 14px`, `--ui-radius-modal 24px`, `--ui-radius-mark 12px`. Существующие `--ui-radius-card` остаётся именем.
  - Тени: `--ui-shadow-card 0 1px 2px rgba(0,0,0,0.4)` (минимальная, тёмная), `--ui-shadow-floating 0 24px 48px rgba(0,0,0,0.6)` (для модалок и dropdown).
  - `@theme inline` маппинг: добавить новые `--color-bg`, `--color-bg-deep`, `--color-card`, `--color-card-2`, `--color-line-2`, `--color-lime`, `--color-lime-hov`, `--color-lime-soft`, `--color-orange`, `--color-orange-hov`, `--color-orange-soft`, `--color-disabled`, `--color-red`. Старые остаются (ссылаются на новые через алиасы переменных).
  - `--font-sans`, `--font-display`, `--font-body`, `--font-mono` маппятся на новые `--ui-font-*`.
  - `body`: `background: var(--ui-bg-deep)` + двойной радиальный градиент (lime 5% top-left 20% 0%, orange 4% bottom-right 90% 100%), `font-family: var(--ui-font-body)`, `color: var(--ui-ink)`.
  - Утилиты типографики из UI Kit: `.t-display` (Bowlby clamp(48px,6vw,88px) line-height 0.92 UPPERCASE), `.t-h1` (Bowlby 48px 0.95 UPPERCASE), `.t-h2` (Bowlby 36px 1.0 UPPERCASE), `.t-h3` (Bowlby 24px 1.1 UPPERCASE), `.t-h4` (Oswald 700 18px UPPERCASE letter-spacing 0.02em), `.t-body` (Oswald 400 16px line-height 1.55), `.t-small` (Oswald 500 13px), `.t-eyebrow` (Oswald 700 11px UPPERCASE letter-spacing 0.18em color lime), `.t-mono` (JetBrains 13px), `.t-num` (Bowlby tabular-nums).
  - Сохранить существующие утилиты: `.scrollbar-hidden`, `input[type=number]` resets.

**Тест:**

- `npm run dev` запускается без ошибок.
- В `<head>` приходят 3 шрифт-link'а от Next.js (`/_next/static/media/Bowlby...`).
- `document.body` имеет фон `#050505` с двумя радиальными градиентами.
- В DevTools → Elements → Computed на `<body>` `font-family` начинается с `Oswald`.
- Существующие страницы (открыть `/`, `/profile/athlete/dashboard`, `/service-portal/dashboard`) **открываются** (могут визуально выглядеть «странно» — это норма, ребрендим Header и главную далее).
- `npm run lint` чистый, `npm run test` зелёный (никаких изменений тест-логики не было).

---

### Step 28.2: Header + MobileNav + NotificationBell rebrand

**Что делаем:**

Перевёрстать `src/components/layout/Header.tsx` 1-в-1 с `claude-design/project/SportHub Header - Standalone Source.html`:

- Контейнер: `<header className="border-b border-[var(--ui-line)] bg-[var(--ui-bg)]/95 backdrop-blur-md">`, внутри `<div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-4 px-4 py-4 sm:gap-6 sm:px-6 lg:px-10">`.
- **Лого-марка** (44×44, lime фон, Bowlby «S»):
  ```tsx
  <span className="relative flex size-11 items-center justify-center overflow-hidden rounded-[12px] bg-[var(--ui-lime)] font-display text-[22px] text-[var(--ui-bg)] before:absolute before:inset-0 before:opacity-35 before:[background:repeating-linear-gradient(135deg,rgba(0,0,0,0.18)_0_2px,transparent_2px_8px)]">S</span>
  ```
- **Tagline-блок:** eyebrow «SPORTHUB» (Oswald 700 11px UPPERCASE letter-spacing 0.18em, color lime, скрыт на md и ниже) + «Найди свой ритм» (Bowlby One 18px UPPERCASE).
- **Pill-навигация** (3 пункта Подборки/Выдача/Слоты), скрытая на 480 (`hidden md:flex`):
  - Pill-контейнер: `padding: 5px; border: 1px solid var(--ui-line); background: rgba(255,255,255,0.02); border-radius: 999px;`
  - Пункты: `padding: 8px 14px; rounded-full; font: Oswald 500 12px UPPERCASE letter-spacing 0.06em; color: var(--ui-muted)`.
  - Active: `bg-[var(--ui-lime)] text-[var(--ui-bg)] font-semibold`.
  - Hover (не active): `bg-[rgba(255,255,255,0.04)] text-[var(--ui-lime)]`.
- **NotificationBell** (44×44, outline, badge orange) — отдельным шагом ниже.
- **User-info** (имя + роль), видим только на lg+ (`hidden lg:block`):
  - Имя: Oswald 500 13px text-ink margin-bottom 4px.
  - Роль: Oswald 700 9px UPPERCASE letter-spacing 0.16em text-lime (или Администратор для admin).
- **Аватар** (44×44 outline pill): `border: 2px solid var(--ui-line); rounded-full; bg-[var(--ui-card)]; font-display text-[16px] uppercase`. Hover: `border-color: var(--ui-lime); color: var(--ui-lime)`.
- **Кнопка «Выйти»** — warning-вариант:
  - На md/lg+: текст «Выйти», `border: 2px solid var(--ui-orange); rounded-full; px-5 py-3; Oswald 600 13px UPPERCASE`. Hover: `bg-[var(--ui-orange)] text-[var(--ui-bg)]`.
  - На sm (480): иконка-дверь 44×44, тот же warning-стиль.
- **Кнопка «Войти»** (для гостя) — primary outline lime: `border-2 border-[var(--ui-lime)]; bg-[var(--ui-bg)]; text-[var(--ui-ink)]; rounded-full`. Hover: `bg-[var(--ui-lime)] text-[var(--ui-bg)]`.
- Адаптив:
  - `sm (480)`: нав скрыта (`hidden md:flex`), user-info скрыт (`hidden lg:block`), вместо «Выйти»-текста — иконка 44×44.
  - `md (768)`: нав видна, user-info скрыт, «Выйти» в виде иконки-двери для экономии места.
  - `lg (1024+)`: полный header — нав + user-info + текст «Выйти».

Перевёрстать `src/components/layout/MobileNav.tsx`:

- Bottom-fixed dock на 480: `fixed inset-x-3 bottom-3 z-50 flex items-center justify-between rounded-[18px] border border-[var(--ui-line)] bg-[var(--ui-card)] px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.4)] md:hidden`.
- 4 пункта (Главная/Поиск/Слоты/Профиль) с SVG-иконками 24×24, текстом Oswald 600 11px UPPERCASE letter-spacing 0.06em color muted.
- Active: `text-[var(--ui-lime)]` для иконки и текста (определяется по `usePathname()`).

Перевёрстать `src/components/layout/NotificationBell.tsx`:

- Bell-кнопка 44×44: `relative flex size-11 items-center justify-center rounded-full border-2 border-[var(--ui-line)] bg-[var(--ui-card)] text-[var(--ui-ink)] transition-colors hover:border-[var(--ui-lime)] hover:text-[var(--ui-lime)]`.
- Badge: `absolute -top-1 -right-1 min-w-5 h-5 rounded-full bg-[var(--ui-orange)] text-white font-display text-[11px] tabular-nums border-2 border-[var(--ui-bg)] flex items-center justify-center`. Контент: число (max «99+»).
- При новом уведомлении: spring-bounce scale 1→1.25→1, 350ms (через CSS keyframe).
- Dropdown panel: `bg-[var(--ui-card)] border border-[var(--ui-line)] rounded-[18px] shadow-[var(--ui-shadow-floating)]`. Padding и внутренние отступы — согласно UI Kit «Cards» + «Modals».
- Dropdown items, кнопки «Mark all read» / ссылка «Все уведомления» — Oswald, без изменений в behavior'е.

**Тест:**

- `npm run lint` чистый.
- `npm run test` зелёный (Header existing тесты + NotificationBell существующие тесты, если есть).
- `npm run build` проходит (TypeScript ошибок нет).
- Открыть в браузере на 6 брейкпоинтах через DevTools (480/768/1024/1280/1440/1920):
  - На 480: видны лого + bell + аватар + иконка-дверь, нав и user-info скрыты, MobileNav в bottom.
  - На 768: добавляется нав, user-info скрыт, «Выйти» иконкой.
  - На 1024+: всё видно полностью, «Выйти» — текст.
- Functionality smoke (на 1024+):
  - Гость: видит «Войти» → клик → AuthModal открывается → можно залогиниться.
  - Athlete: видит NotificationBell с badge / без, имя + роль «Спортсмен», аватар → клик ведёт в `/profile/athlete/dashboard`, «Выйти» работает.
  - Provider: то же, роль «Представитель спортивных услуг».
  - Admin: вместо аватара — клик ведёт в `/service-portal/dashboard`, роль «Администратор».
  - Impersonating: кнопка «Выйти» завершает impersonation + redirect в `/service-portal/dashboard`.
- На всех страницах проекта (`/`, `/profile/athlete/*`, `/service-portal/*`, `/clubs/[slug]`, `/trainers/[slug]`, `/booking/[scheduleId]`) Header выглядит одинаково и не ломает рендер страницы.

---

### Step 28.3: Главная страница — hero billboard + leader strip + search section (карта остаётся)

**Что делаем:**

Полностью переписать `src/app/page.tsx` 1-в-1 с `claude-design/project/SportHub Header - Standalone Source.html` (секции hero + sport rail + leader strip), сохраняя всю существующую SSR data-fetching логику (`Promise.all` с `getPublishedClubs/Trainers/Schedule/Sports/...`, `computeClubReliability/TrainerReliability`, `buildTrainerDirectory`, `getTrainerAvailability`, `getUpcomingSessions`, `featuredClub/Trainer` сортировка).

Структура:

- Контейнер: `<main className="min-h-screen bg-[var(--ui-bg-deep)] px-4 py-6 sm:px-6 lg:px-10">`, внутри `<div className="mx-auto flex max-w-[1440px] flex-col gap-8 lg:gap-12">`.
- **Hero billboard** (один большой блок с диагональными лучами и watermark «SH»):
  - Карточка: `relative overflow-hidden rounded-[24px] border border-[var(--ui-line)] bg-[var(--ui-card)] p-8 sm:p-10 lg:p-12`.
  - Декор-фон: ::before с диагональными лучами (135deg repeating-linear-gradient lime 0.05) + watermark «SH» (Bowlby 220px opacity 0.04 lime, absolute right-bottom).
  - На lg+ внутри 2-колоночная grid `lg:grid-cols-[1.3fr_0.7fr] lg:gap-8`. На md/sm — 1 колонка.
  - Левая колонка:
    - **Strip badges** (3 шт): `flex flex-wrap gap-2`. «Samara active city» (b-accent: lime-soft + lime, padding 7×14, rounded-full, Oswald 700 11px UPPERCASE letter-spacing 0.14em), «{N} клубов в каталоге» (b-outline: transparent + ink + line border), «{N} тренеров в каталоге» (b-orange: orange-soft + orange).
    - **H1** «Найди **спорт** в своём ритме» через `<h1 className="t-display mt-6">`, ключевое слово «спорт» wrapped в `<span className="text-[var(--ui-lime)]">`.
    - **Lede** параграф Oswald 17px muted, max-width 760px, mt-5.
    - **Sport-rail** (горизонтальный скроллящийся rail чипов), берёт первые 5-8 sports из `sports`:
      - Контейнер: `mt-8 flex gap-3 overflow-x-auto scrollbar-hidden`.
      - Чип: `inline-flex items-center gap-2 rounded-full border border-[var(--ui-line)] bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase text-[var(--ui-ink)] whitespace-nowrap shrink-0 hover:border-[var(--ui-lime)] hover:text-[var(--ui-lime)] hover:-translate-y-px transition-all duration-150`.
      - Иконка-инициал (первая буква названия спорта): `inline-flex size-5 items-center justify-center rounded-md bg-[var(--ui-lime-soft)] text-[var(--ui-lime)] font-display text-[10px]`.
    - **2 CTA** (mt-10 flex-wrap gap-3):
      - «Открыть выдачу» — primary outline lime: `inline-flex items-center justify-center rounded-full border-2 border-[var(--ui-lime)] bg-[var(--ui-bg)] px-7 py-3.5 font-body font-semibold text-sm uppercase tracking-[0.06em] text-[var(--ui-ink)] hover:bg-[var(--ui-lime)] hover:text-[var(--ui-bg)] transition-all`.
      - «Смотреть слоты и окна» — ghost: `border-2 border-[var(--ui-line)] bg-transparent text-[var(--ui-ink)]`. Hover: `border-[var(--ui-lime)] text-[var(--ui-lime)]`.
  - Правая колонка (на lg+ overlapping справа сверху, на md/sm под рейлом):
    - **FocusCard** «Сегодня в фокусе»: `rounded-[18px] border border-[var(--ui-line)] bg-[var(--ui-bg-deep)]/60 p-6`.
      - Eyebrow «СЕГОДНЯ В ФОКУСЕ» (Oswald 700 11px UPPERCASE letter-spacing 0.18em color lime).
      - Время Bowlby 56px UPPERCASE: формат `HH:MM` ближайшей `upcomingSessions[0]` (или fallback «—:—»).
      - Пульсирующий **LIVE-dot**: `size-2 rounded-full bg-[var(--ui-orange)] animate-[pulse_1.6s_ease-in-out_infinite]` + label «LIVE» Oswald 700 9px UPPERCASE letter-spacing 0.16em color orange.
      - Название и клуб ближайшей сессии (Bowlby 19px / Oswald 13px muted).
      - Кнопка «Записаться» — primary solid lime: `bg-[var(--ui-lime)] text-[var(--ui-bg)] hover:bg-[var(--ui-lime-hov)] hover:-translate-y-px`. Disabled если `upcomingSessions.length === 0`.
      - Mini-stat «На сегодня: N занятий» (Oswald 12px muted).
- **Leader strip** (под billboard, mt-10 lg:mt-12):
  - Grid: `grid gap-5 sm:gap-6 md:grid-cols-2`.
  - Карточка клуба + карточка тренера: `relative overflow-hidden rounded-[18px] border border-[var(--ui-line)] bg-[var(--ui-card)] p-6 hover:border-[var(--ui-lime)] transition-colors`.
  - Watermark номера ранга «01» / «02» Bowlby 80px opacity 0.06 absolute right-top.
  - Thumb-инициал 80×80: lime для клуба, orange для тренера. Background `bg-[var(--ui-lime-soft)] text-[var(--ui-lime)] font-display text-[36px] uppercase rounded-[18px]`.
  - Eyebrow «КЛУБ» / «ТРЕНЕР» (Oswald 700 11px UPPERCASE letter-spacing 0.18em color lime/orange).
  - Название (Bowlby 22px UPPERCASE) + описание (Oswald 14px muted line-height 1.55).
  - Stat-pills row: рейтинг (status-badge teal: lime-soft+lime, padding 6×12, Oswald 500 12px), отзывы (status-badge outline: line+muted), цена (price-pill lime / orange Bowlby tabular-nums).
- **SearchControlsPreview** под leader-strip — обновить токены контейнера (`bg-[var(--ui-card)] border border-[var(--ui-line)] rounded-[18px]`), внутреннюю UI логику (mode pills / city select / search input / sport chips) **сохранить** как есть. Точечная переверстка inline-стилей под UI Kit классы — в Phase 29.
- **MapSection** — **не трогаем** ни структуру, ни внутренний рендер. Внешняя обёртка автоматически подстроится через изменённые CSS-токены (border-line, bg).
- **CatalogResultsSection**, **PopularNearby**, **UpcomingSessions** — оставляем как есть. Они визуально на тёмном фоне будут выглядеть «приемлемо» через общие токены, точечная полировка — Phase 29+.

**Адаптив главной:**

- `sm (480)`:
  - Hero billboard padding 24px, H1 размер `clamp(40px,9vw,56px)`.
  - Sport-rail: горизонтальный скролл, чипы не переносятся.
  - FocusCard под рейлом, full-width.
  - Leader strip — 1 колонка, карточки в столбик.
  - CTA — full-width в столбик.
- `md (768)`:
  - Sport-rail без переноса, помещается без скролла.
  - Leader strip — 2 колонки рядом.
  - FocusCard под рейлом (не overlapping).
  - CTA — flex-row.
- `lg (1024+)`:
  - Hero billboard 2 колонки 1.3fr / 0.7fr, FocusCard прижат справа сверху (overlapping или вложенный).
  - Leader strip — 2 колонки.
  - Полный layout.
- `xl (1280)`, `xxl (1440)`, `2k (1920)`: контейнер тянется до 1440, потом симметричные поля.

**Тест:**

- `npm run format`, `npm run lint`, `npm run test`, `npm run build` — все зелёные.
- В браузере на 6 брейкпоинтах через DevTools:
  - На 480: одна колонка, sport-rail скроллится, FocusCard под H1, leader-strip в столбик, кнопки full-width.
  - На 768: leader-strip 2 колонки, FocusCard под рейлом, CTA в строку.
  - На 1024+: hero 2 колонки, FocusCard overlapping справа сверху.
- `featuredClub` / `featuredTrainer` рендерятся в leader-strip с правильными данными (из текущих сидов или после публикации).
- `upcomingSessions[0]` рендерится во FocusCard с правильным временем.
- Sport-rail показывает первые 5-8 sports из `sports`.
- Кнопки CTA «Открыть выдачу» / «Смотреть слоты и окна» ведут в `#results` / `#availability` (как сейчас).
- Карта Yandex рендерится на своём месте, маркеры видны, popup открывается.
- Все секции под map (`SearchControlsPreview`, `MapSection`, `CatalogResultsSection`, `PopularNearby`, `UpcomingSessions`) рендерятся, ничего не «обвалилось».

---

### Step 28.4: Сжатие `frontend-design/SKILL.md` + правило Claude Design + STACK_OVERVIEW + `feature-docs/_overview.md`

**Что делаем:**

Полная переработка `.claude/skills/frontend-design/SKILL.md` со сжатием с ~390 → ~150 строк. Идея — оставить **философию + жёсткие правила**, убрать **pixel-perfect значения** (они живут в `claude-design/project/SportHub UI Kit.html` как single-source-of-truth, дублирование плодит расхождения при будущих iterations).

**Оставляем в скилле:**

- Frontmatter + блок-указатель на источники (новый, см. ниже).
- Раздел «Workflow с Claude Design» (новый, см. ниже).
- Дизайн-философия (стиль, тема, тени, линии, акценты, декор, UPPERCASE/mixed case).
- Цветовая палитра (имена `--ui-*` + назначение, **без точных hex** — они в `globals.css` и UI Kit).
- Семантика lime/orange/red (positive/warning/danger).
- Типографика (3 шрифта + ролевое распределение + UPPERCASE/mixed case зоны).
- Брейкпоинты (6 штук + правило mobile-first).
- Семантический HTML (общие правила).
- Список запретов (purple gradient mesh, glass-morphism, `shadow-2xl` везде, scale на ховере, mixed case в кнопках, тени на дефолтных карточках).
- Чек-лист перед коммитом UI-компонента.

**Удаляем из скилла:**

- Generic-блок «Design Thinking» + «Frontend Aesthetics Guidelines» (строки 11-42, AI-инструктаж про «выберите смелый стиль»).
- Pixel-perfect спецификации компонентов (строки ~167-373: кнопки 3 размера × 4 варианта × 3 состояния с точными `padding 9px 16px / min-height 40px`, search-field `min-width: 320px`, лого-марка с конкретным `repeating-linear-gradient(135deg, ...)` через `::before`, bell с `top: -3px; right: -3px`, аватар, навигация с `padding: 5px`, user-info, бэйджи 3 паттерна со всеми пикселями).
- Точные таблицы радиусов и типографических классов с pixel-значениями.

**Заменяем секции компонентов** на **короткое описание + ссылку на UI Kit**:

```markdown
### Компоненты

Точные значения (padding, font-size, hex, border, animations) — в `claude-design/project/SportHub UI Kit.html`.

В этом скилле фиксируем только правила, которые НЕ должны меняться между iterations.

**Кнопки.** 3 размера (sm/md/lg) + icon-only. 4 варианта: primary outline (90% случаев), primary solid (1 на странице — главный CTA), warning (cancel/reject), ghost (фильтры). `rounded-full` обязательно. Hover меняет border/bg/color, **transform только на solid-primary** (`-1px`). Без теней.

**Карточки.** `rounded-[18px]` + 1px line-border. Hover: `border-color: lime` без подъёма. Без теней по умолчанию.

**Модалки.** `rounded-[24px]` + line-border + единственное место, где разрешена тень `0 24px 48px rgba(0,0,0,0.6)`.

**Бэйджи / chips.** `rounded-full`. 3 семантических варианта: lime-soft (positive), orange-soft (warning), outline (нейтральный). UPPERCASE.

**Header parts (logo / nav / bell / avatar / user-info / search).** Структуру и pixel-spec смотри в UI Kit + `Header - Standalone Source.html`.
```

**Добавляем новый раздел в начале скилла** (после frontmatter, перед «Дизайн-философия»):

```markdown
## Источники

Этот скилл — единственный источник правды по дизайн-системе SportHub.

HTML-первоисточники (локально, в `.gitignore`):

- `claude-design/project/SportHub UI Kit.html` — палитра, типографика, компоненты, состояния, animations (pixel-perfect)
- `claude-design/project/SportHub Header - Standalone Source.html` — разметка главной (header + hero + search + map placeholder + leader strip) на 6 брейкпоинтах
- `claude-design/chats/chat1.md` — intent (какие решения и почему)

При появлении новых компонентов от Claude Design — обновляем этот скилл (правила, не значения).
При конфликте `SKILL.md` ↔ UI Kit.html — `SKILL.md` имеет приоритет.

## Workflow с Claude Design

Триггер: пользователь скидывает команду из Claude Design в формате `Fetch this design file ... https://api.anthropic.com/v1/design/...` (она копируется по кнопке «Send to local coding agent» в UI Claude Design).

Шаги работы:

1. **`WebFetch` по присланной URL** → получаем gzip-tar bundle (3-5 MB). Сохраняем в `~/.claude/.../tool-results/*.bin`.
2. **Распаковываем в `claude-design/`** через `gzcat ... | tar -xf - -C /Users/misha/Desktop/prosport2.1/claude-design/`. Папка уже в `.gitignore`. Если `claude-design/` существует — `rm -rf` старое содержимое перед распаковкой (или `cp -R` поверх).
3. **Читаем по приоритету:**
   - `README.md` — инструкция от Claude Design (короткая, 2 KB).
   - `chats/*.md` — переписка с дизайнером (intent, обоснование решений). Главный файл для понимания «что и зачем».
   - `project/*Source*.html` (или `*Breakpoints*.html`) — разметка дизайна. Читаем целиком, не скимуем.
   - `project/*UI Kit*.html` — компоненты, состояния, animations.
   - `project/uploads/*.png` — референсы пользователя (опционально, для контекста).
4. **НЕ открываем `*standalone*.html` файлы для чтения кода** — это упакованные бандлы (1.4 MB+ с base64-картинками, не читаемые). Они только для офлайн-просмотра пользователем в браузере.
5. **Доклад пользователю:** что в bundle, какие секции дизайна, какие токены / правила / брейкпоинты, что вижу из intent. **НЕ начинаем реализацию без подтверждения.**
6. **Реализация:**
   - Перевожу разметку из vanilla HTML/inline Babel в наш стек: Next.js 16 App Router + React 19 + Tailwind CSS 4 + Zustand + наши CSS-переменные `--ui-*`.
   - Матчу визуал и адаптив (6 брейкпоинтов 480/768/1024/1280/1440/1920), не структуру DOM.
   - НЕ копирую inline Babel-классы 1-в-1; использую Tailwind utility-классы и наши токены.
   - НЕ трогаю компоненты вне scope текущей задачи (если задача — Header, не правлю Footer/Cards).
7. **Обновляем `SKILL.md`** только если в новом дизайне появился компонент с собственными правилами (не значениями) — например «всплывающая подсказка показывается через 300ms hover». Pixel-значения остаются в UI Kit.html.
8. **`claude-design/` живёт постоянно** в проекте как single-source-of-truth. При новом handoff — старое содержимое заменяем (или сохраняем версию через подпапки `claude-design/2026-04-28/...` если важна история).
```

Сверка значений палитры/типографики между сжатым `SKILL.md` и `UI Kit.html` — контрольная (на момент Phase 28 совпадают).

Проверить, что чек-лист в конце скилла актуален и не ссылается на удалённые секции.

Обновить `STACK_OVERVIEW.md`:

- В «Стек и версии» — отметить: шрифты Bowlby One + Oswald + JetBrains Mono подключаются через `next/font/google` в `src/app/layout.tsx`.
- В «Адаптивность и брейкпоинты» — добавить: контейнер главной + Header использует `max-w-[1440px]` (поднят с 1280); остальные страницы пока на `max-w-7xl` (1280), портируются по мере rebrand'а в Phase 29+.
- Добавить новый раздел «Дизайн-система» в конце, со ссылками:
  - Скилл: `.claude/skills/frontend-design/SKILL.md`
  - HTML-первоисточники: `claude-design/project/`
  - Палитра: тёмная угольная, lime #84c003 (positive), orange #fb6119 (warning), red #e74c3c (danger)
  - Шрифты: Bowlby One (display), Oswald (body), JetBrains Mono (mono)
- В «Соглашения по коду» — упомянуть: при создании или изменении UI-компонента — следовать скиллу (palette tokens `--ui-*`, типографика `.t-*`, кнопки `rounded-full`, карточки `rounded-[18px]`).

Обновить `feature-docs/_overview.md`:

- Добавить опционально домен «дизайн-система» со статусом «Phase 28 ✅» и ссылкой на скилл. Не критично — можно отложить, если в `feature-docs/` нет шаблона для design-domain.

**Тест:**

- `.claude/skills/frontend-design/SKILL.md` открывается, содержит блок-указатель в начале и не содержит generic-инструкций «выберите смелый стиль / brutalist / luxury / playful».
- `STACK_OVERVIEW.md` имеет раздел «Дизайн-система».
- `npm run lint` и `npm run build` зелёные (никаких изменений в коде).

---

### Step 28.5: Финальная синхронизация документов и коммит фазы

**Что делаем:**

- Обновить `CLAUDE.md` секцию «Текущее состояние»:
  - Последняя завершённая фаза: Phase 28.
  - Текущая ветка: `phase-28`.
  - Последний шаг: 28.5.
  - Следующий шаг: открыть Phase 29 (продолжение rebrand'а — detail-страницы клубов/тренеров, /booking, ЛК).
- Обновить `PHASES_OVERVIEW.md`: статус Phase 28 ✅, краткое описание (редизайн фундамента, токены, Header, главная).
- Обновить `PROJECT_STATE.md`:
  - В «Дереве» отметить, что `claude-design/` лежит локально как референс (в `.gitignore`).
  - В «Страницах» — обновить описание `/` (новая hero billboard + leader strip + sport rail).
  - В «Ключевых компонентах» — обновить описание Header / MobileNav / NotificationBell (новая палитра, шрифты, лого-марка).
  - В «Ключевых утилитах» — добавить упоминание шрифтов через `next/font/google` в layout.tsx.
- Обновить `README.md`:
  - В «Прогрессе реализации» добавить строку для Phase 28: «Редизайн фундамента (токены, Header, главная страница) | ✅».
  - В описании MVP в начале README — обновить мини-абзац: «оба ЛК ... + новая тёмная палитра, Bowlby One + Oswald, поднятый контейнер 1440px на главной и в Header».
- Финальный коммит фазы: `git add` затронутые файлы (документы только! `claude-design/` в gitignore, скилл в gitignore через `.claude/`) → `git commit -m "feat(design): Phase 28 — редизайн фундамента (токены, Header, главная)"` (ветка `phase-28`).

**Тест:**

- `git status` чистый после коммита.
- `CLAUDE.md`, `PHASES_OVERVIEW.md`, `PROJECT_STATE.md`, `README.md` синхронизированы.
- `git log --oneline -5` показывает свежие коммиты Phase 28.
- `npm run format`, `npm run lint`, `npm run test`, `npm run build` — все зелёные финально.
- В браузере: открыть `/` на 6 брейкпоинтах, убедиться что Hero + Leader + Search + Map + остальные секции работают, Header виден везде.

---

### Step 28.6: Общие компоненты — `CardSlider` + `ChipMarquee` + hero-bg классы

> Базовый шаг под слайдеры карточек клубов и тренеров. Делаем строго **до** перевёрстки `ClubCard`/`TrainerCard` — чтобы потом не дублировать. Оба компонента — клиентские (interactive). Также готовим CSS-классы под двухслойный hero-фон (Tailwind с этим не справляется).

**Что делаем:**

**(а) `src/app/globals.css` — 3 новых класса для hero-фона (рядом с существующими, ничего не перезаписываем).**

Двухслойный фон (диагональный луч + штриховка 135°) Tailwind в одну утилиту не уместит. Заводим 3 готовых класса:

```css
/* Phase 28.6 — hero-фон для карточек клубов/тренеров (3 тона) */
.hero-bg-lime {
  background:
    linear-gradient(118deg, transparent 0%, transparent 55%,
      rgba(132,192,3,0.18) 60%, rgba(132,192,3,0.05) 70%, transparent 78%),
    repeating-linear-gradient(135deg, rgba(255,255,255,0.02) 0 1px, transparent 1px 14px);
}
.hero-bg-orange {
  background:
    linear-gradient(118deg, transparent 0%, transparent 55%,
      rgba(251,97,25,0.18) 60%, rgba(251,97,25,0.05) 70%, transparent 78%),
    repeating-linear-gradient(135deg, rgba(255,255,255,0.02) 0 1px, transparent 1px 14px);
}
.hero-bg-blank {
  background:
    repeating-linear-gradient(135deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 14px);
}
```

Перед добавлением: `cat src/app/globals.css | grep -n "^.hero-"` — убедиться что таких классов ещё нет. Не трогать ничего другого в файле — токены `--ui-*`, типографические утилиты `.t-*`, `@theme inline` маппинг и существующие `body`/`html` правила остаются как были.

**(б) Создать `src/components/ui/CardSlider.tsx`:**

- `'use client'` компонент, step-based слайдер с translateX-rail.
- Пропсы:
  ```ts
  type CardSliderProps = {
    children: ReactNode;          // массив карточек (нумерация по children)
    total: number;                // длина списка для max-idx и pill-счётчика
    eyebrow: string;              // напр. 'Club list' / 'Trainer list'
    title: string;                // напр. 'Клубы под текущие фильтры'
    accent: 'lime' | 'orange';    // влияет на цвет dots, hover стрелок, pill-счётчика
    sliderId: string;             // уникальный id (для делегированных кликов nav-btn)
    visiblePerBreakpoint?: { lg: number; default: number }; // дефолт {lg:2, default:1}
    countLabel?: string;          // дефолт 'в выдаче'
    emptyMessage?: string;        // дефолт 'Ничего не нашли'
  };
  ```
- Адаптив через `matchMedia('(min-width: 1024px)')` + state `visible` (1 на ≤768, 2 на 1024+). Слушать изменения mediaList.
- DOM:
  - `.listing-head` (eyebrow + title + tools) — pill-счётчик `<num>{total}</num> {countLabel}` + 2 nav-btn (40×40, outline `border-[var(--ui-line)]`, hover `border-[var(--ui-${accent})]` и тот же color).
  - `.slider` → `.slider-track` (`overflow:hidden`, `rounded-[22px]`) → `.slider-rail` (`flex`, `transition-transform duration-[350ms] [transition-timing-function:cubic-bezier(.2,.7,.2,1)]`).
  - `.slider-slide` — `flex: 0 0 auto`, `width: calc(100% / visible)`, `padding-right: 22px` (18px на 1024 и 768, 14px на 480), последний — без padding.
  - `.slider-dots` — `flex gap-2 justify-center mt-6`. Dot — 28×4 → активный 40×4 в accent цвете, transition .2s.
- State: `idx` через `useState(0)`. `maxIdx = max(0, total - visible)`. Стрелки disabled на краях. Dots генерируются по `maxIdx + 1`.
- Транзиции: `rail.style.transform = translateX(-${idx * slideW}px)` где `slideW = slides[0].offsetWidth`. На resize пересчитываем.
- Empty state: если `total === 0` → не рендерится сам слайдер (только листинг-head + сообщение `emptyMessage`).

**(в) Создать `src/components/ui/ChipMarquee.tsx`:**

- `'use client'` компонент, бесшовная бегущая лента чипов с pause-on-hover и pointer-drag scrub.
- Пропсы:
  ```ts
  type ChipMarqueeProps = {
    items: ChipItem[];                // [{ label: string }]
    variant: 'outline' | 'solid';     // outline (бордер+ink) | solid (lime/orange-soft + accent text)
    accent: 'lime' | 'orange';
    speedPxPerSec?: number;           // дефолт 32
    isLast?: boolean;                 // true → margin-bottom: 22px (или 16 на 480)
  };
  type ChipItem = { label: string };
  ```
- Реализация (1-в-1 с `setupMarquee()` из `SportHub Cards - Clubs.html`):
  - Контейнер `.chip-marquee` (height 36, overflow:hidden, `mask-image: linear-gradient(to right, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%)`).
  - `.chip-track` (display:flex, gap:10, padding:0 22, `cursor:grab`, `touch-action:pan-y`, `user-select:none`).
  - В `useEffect`: измерить `track.scrollWidth ≤ container + 1` → если влезает, добавить класс `.no-loop` (убрать mask, cursor, не клонировать, не запускать rAF). Иначе — клонировать original children пока `scrollWidth ≥ containerW + loopLen + 40`.
  - `loopLen = (last.offsetLeft + last.offsetWidth - first.offsetLeft) + gap` — точная ширина одной копии.
  - rAF tick: `offset -= SPEED * dt`; нормализация `while (offset <= -loopLen) offset += loopLen; while (offset > 0) offset -= loopLen;` → `transform: translate3d(${offset}px, 0, 0)`.
  - Pointer events: `pointerdown` (сохранить `dragStartX/Offset`, set capture) → `pointermove` (offset = dragStartOffset + dx) → `pointerup` (release).
  - Hover: `mouseenter` → `paused = true; lastT = 0` (чтобы при возобновлении не было прыжка).
  - Resize: дебаунс 120 мс → пересчёт `loopLen` и пересчёт ветки no-loop (на случай резкого ресайза, когда чипы стали влезать/перестали).
  - На unmount: `cancelAnimationFrame`, отписать listeners.
  - Если `items.length === 0` → не рендерим компонент вовсе (early return null).

**Тест:**

- Создать `src/test/ui/card-slider.test.tsx`:
  - Рендерится с 6 children → pill «6 в выдаче», dots = 5 (при visible=2).
  - Клик «вперёд» → idx меняется на 1, dots[1].active, прежняя dot снимает `.active`.
  - На краях disabled-атрибут на соответствующей nav-btn (idx=0 → prev disabled, idx=maxIdx → next disabled).
  - Empty state (total=0) → нет `.slider`, есть листинг-head + сообщение `emptyMessage`.
- Создать `src/test/ui/chip-marquee.test.tsx`:
  - **Мок rAF** в `beforeEach`: `vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(performance.now()); return 0; });` — чтобы анимация прогонялась синхронно.
  - **Мок layout-свойств** через `Object.defineProperty(HTMLElement.prototype, ...)` для контроля `scrollWidth`/`offsetLeft`/`offsetWidth`/`clientWidth` (jsdom возвращает 0).
  - Рендерится с массивом 5 items → `.chip-track` содержит 5 элементов до `useEffect`.
  - Когда `scrollWidth ≤ containerW` → `.no-loop` класс добавлен, `mask-image: none`, клоны не созданы.
  - Когда `scrollWidth > containerW` → клоны созданы, нет `.no-loop`.
  - Pointer drag: `pointerdown(clientX=0) → pointermove(clientX=50) → pointerup` → проверить что `track.style.transform` обновился (`translate3d(50px,0,0)` после `pointermove`, до нормализации).
  - `items.length === 0` → компонент не рендерится (returns null).
- `npm run format`, `npm run lint`, `npm run test`, `npm run build` — все зелёные.
- Smoke в Playwright MCP: создать временную demo-страницу или подмонтировать на `/` через `// STUB:`-блок, увидеть что слайдер двигается стрелками, marquee катится при overflow и стоит при no-loop, drag работает. **Удалить STUB перед коммитом** (или оставить только до Step 28.10).

---

### Step 28.7: Удалить `isFeatured` из кодовой базы

> Поле `Club.isFeatured` (boolean) на текущем MVP не используется — фильтрация и сортировка от него не зависят, провайдеры всегда публикуют `isFeatured: false`, в новом дизайне места под Featured-бейдж нет. Чтобы не таскать мёртвое поле через всю фазу — выпиливаем целиком до перевёрстки карточек.

**Что делаем:**

Зачистка по всем точкам, найденным в коде:

1. **Тип** — `src/types/index.ts:195` — удалить строку `isFeatured: boolean;` из `Club`.
2. **Рендер бейджа** — `src/components/clubs/ClubCard.tsx:73` — удалить весь блок `{club.isFeatured ? (...) : null}` (ветка с Badge «Featured»).
3. **Избранное атлета** — `src/components/profile/AthleteFavoritesSection.tsx:53` — удалить `{club.isFeatured ? <Badge tone="success">Featured</Badge> : null}`.
4. **Default value при публикации** — `src/lib/contracts/publish-club.ts:103` — удалить строку `isFeatured: false,` из `mapClubFormToEntities`.
5. **db.ts** — `src/lib/db.ts:160` — убрать `'isFeatured'` из массива/Pick/Omit, где бы оно ни стояло.
6. **Сид-данные** — проверить `src/data/clubs.json` (если непустой): `grep -n "isFeatured" src/data/clubs.json` → удалить ключ из всех записей.
7. **Тесты** — пройти по всем файлам с моками (`src/test/**/*.{ts,tsx}`): `grep -rln "isFeatured" src/test/` → удалить строки `isFeatured: true,` / `isFeatured: false,` из всех мок-объектов. Список затронутых на момент планирования: `schedule/get-upcoming-sessions.test.ts`, `types/domain-model.test.ts`, `design/cards-design.test.tsx`, `clubs/club-detail-page.test.tsx`, `clubs/club-list.test.tsx`, `clubs/club-card.test.tsx`, `clubs/filter-clubs-tags.test.ts`, `clubs/popular-nearby.test.tsx`, `clubs/club-detail-page-client.test.tsx`, `admin/dashboard.test.tsx`, `trainers/trainer-detail-page-client.test.tsx`, `profile/athlete-review-items.test.ts`, `map/use-map-markers.test.ts`, `profile/athlete-schedule.test.tsx`, `profile/provider-stats.test.tsx`, `profile/athlete-favorites.test.ts`, `profile/provider-clients.test.tsx`, `profile/provider-publications.test.tsx`, `profile/profile-nav-items.test.ts` (~19 файлов на сейчас, проверить актуальный список grep'ом перед началом).
8. **Любые упоминания в SKILL.md / docs** — `grep -rn "isFeatured" .claude/ feature-docs/ STACK_OVERVIEW.md PROJECT_STATE.md README.md` → почистить.

После удаления — повторный grep на чистоту: `grep -rn "isFeatured" src/ .claude/ feature-docs/` → должен вернуть **0 совпадений**.

**Тест:**

- `grep -rn "isFeatured" src/` → пусто.
- `npm run lint` → зелёный (без TypeScript errors на отсутствующее поле).
- `npm run test` → 1299/1299 (или меньше, если какой-то тест проверял ровно `isFeatured` — таких тестов быть не должно, поле не было основой ассерта). Если упал тест — посмотреть, что он проверял, и обновить.
- `npm run build` → зелёный.
- Smoke в Playwright MCP: открыть `/`, `/profile/athlete/favorites`, `/profile/provider/publications` — нет визуальных регрессий, нет Featured-бейджей.

---

### Step 28.8: Перевёрстка `ClubCard` под новый дизайн

> Полная замена `src/components/clubs/ClubCard.tsx` на структуру из `claude-design/cards-trainers/sporthub/project/SportHub Cards - Clubs.html` (`.club-card` + child grid). Слайдер в этом степе **не подключаем** — только сама карточка. Тестируется в одиночку через `<ClubCard>` напрямую.

**Что делаем:**

Полностью переписать `src/components/clubs/ClubCard.tsx`. Удалить `getCoverPalette`, gradient-варианты обложек.

Особенности реализации:

- **`'use client'`** в начало файла. Компонент использует ChipMarquee (с `useEffect`/rAF), сам обязан быть client-only. Проверить первой строкой: `head -1 src/components/clubs/ClubCard.tsx` — добавить директиву если её нет.
- **Никакого `<Link>` снаружи `<article>`.** Внутри ClubCard навигация — только через `<Link href="/clubs/{slug}">` на name (Bowlby 22px). Hover-стиль карточки даёт CSS (`.club-card:hover { border-color: var(--ui-lime) }`), не Link. Это исключает nested `<a>` и упрощает работу любых будущих inner CTA.
- **`grid-template-rows`** обязательно фиксируется через arbitrary-class Tailwind: `grid-rows-[auto_auto_72px_auto_auto_auto]` на ≥768, `grid-rows-[auto_auto_84px_auto_auto_auto]` на 480 (через media-prefix). Без этого карточки в одном слайдере будут разной высоты.

Новые/изменённые пропсы:
```ts
type ClubCardProps = {
  club: Club;
  sports: ClubCardSport[];
  tags?: Tag[];
  index?: number;                                 // для wm и tone
  highlighted?: boolean;
  reliability?: ReliabilityResult;
  // variant убираем — карточка теперь всегда «slider-style»
};
```

Деривируемые поля (computed внутри):

- `wm`: `String((index ?? 0) + 1).padStart(2, '0')` (например `'01'`). При `index === undefined` → пустая строка (не рендерим watermark).
- `tone`: `(['lime','orange','blank'] as const)[(index ?? 0) % 3]`.
- `isNew`: `club.reviewCount === 0 && club.rating === 0`.
- `tagNames`: `club.tagIds.map(id => tagsById.get(id)?.name).filter(Boolean)`.
- `scheduleNames`: пустой массив на MVP (форматов клуба в пропсах нет). ChipMarquee сам делает early return при пустом списке — отдельной проверки в карточке не пишем.

Структура JSX:

- `<article className="club-card tone-{tone} ...">` без `<Link>` обёртки.
- Hero (`.club-hero`): `min-h-[176px] md:min-h-[164px] xs:min-h-[152px]` (через arbitrary-classes), `position: relative`, `overflow: hidden`, `bg-[var(--ui-bg)]`, `border-bottom border-[var(--ui-line-2)]`. Внутри:
  - `<span aria-hidden className="absolute inset-0 hero-bg-{tone}" />` — двухслойный фон через готовый CSS-класс из Step 28.6.
  - `.hero-wm` (Bowlby 92px, `text-white/[0.04]`, watermark номера).
  - `.hero-row` (`relative z-10`): `<span class="city-pill">г. {city}</span>` + `<span class="preview-pill">Фото preview</span>`.
  - `.hero-bottom` (`relative z-10`): address (Oswald 11px UPPERCASE letter-spacing 0.18em, accent-цвет по tone) + name (`<Link href="/clubs/{slug}" class="hero-name">…</Link>` Bowlby 22px clamp 2 lines).
- Body grid с фикс. `grid-rows-[auto_auto_72px_auto_auto_auto]` (на 480 → `xs:grid-rows-[auto_auto_84px_auto_auto_auto]`):
  - `.body-meta`: `<span class="meta-price"><span class="from">от</span>{formatPrice(priceFrom)}</span>` + `<span class="meta-distance">{distanceKm} км</span>` (используем существующий `formatPrice` из `lib/utils.ts`).
  - `.body-desc`: Oswald 13px line-height 1.6, clamp 3 lines (4 на 480), text from `club.shortDescription`.
  - `.body-rating`: SVG звёзды (5 шт, `class="on"` для `Math.round(rating)`) + Bowlby num + «{reviewCount} отзывов» + если `isNew` → `<span class="new-badge">Новый</span>`.
  - **`<ReliabilityBadge mode="compact" reliability={reliability} />`** — рендерится **отдельной строкой ниже body-rating** (не в одном ряду со звёздами), `padding: 0 22px; margin-top: 12px;`. На 480 ничего не меняется (уже отдельная строка).
  - `<ChipMarquee items={scheduleNames} variant="outline" accent="lime" />` — на MVP скрыт (early return).
  - `<ChipMarquee items={tagNames.map(label=>({label}))} variant="solid" accent="lime" isLast />`.

Сохраняем функционал:

- `highlighted` → CSS `.club-card[data-highlighted="true"] { border-color: var(--ui-lime) }`. Передаётся через `data-highlighted` атрибут (не меняет grid-rows).
- `reliability` → отдельной строкой под body-rating (см. выше).
- isFeatured — **НЕ упоминаем нигде**, поле уже удалено в Step 28.7.

Стили токенов: `--bg → var(--ui-bg)`, `--card → var(--ui-card)`, `--card-2 → var(--ui-card-2)`, `--line → var(--ui-line)`, `--line-2 → var(--ui-line-2)`, `--lime → var(--ui-lime)`, `--orange → var(--ui-orange)`. Hex напрямую — нет.

**Тест:**

- Обновить `src/test/clubs/club-card.test.tsx`:
  - Рендерится с минимальным club + sports, без падения.
  - При `index=0` → watermark `01` отрисован, `tone-lime` класс присутствует.
  - При `index=1` → `tone-orange`. При `index=2` → `tone-blank`.
  - При `reviewCount=0 && rating=0` → присутствует `.new-badge` с текстом «Новый».
  - При `reviewCount>0` → нет `.new-badge`, есть `.rating-num` с числом.
  - Если `tagIds` непуст и резолвятся в имена → ChipMarquee для tags рендерится (`data-testid="chip-marquee-tags"`).
  - Если `tagIds` пустой → ChipMarquee не рендерится.
  - Если `highlighted=true` → атрибут `data-highlighted="true"` на article.
  - Имя обёрнуто в `<a href="/clubs/{slug}">` (только на name, не на всей карточке).
  - `reliability` передан → блок `<ReliabilityBadge>` отрисован отдельной строкой ниже rating-row.
- `npm run lint/test/build` — зелёные.
- Playwright MCP smoke на 480/768/1024/1280/1440: hero-row не упаковывается, name не выходит за clamp 2 lines, marquee катится при ≥4 длинных тегах, статичен при ≤3 коротких, ReliabilityBadge виден отдельной строкой и не ломает rating-row.

---

### Step 28.9: Перевёрстка `TrainerCard` под новый дизайн

> Полная замена `src/components/trainers/TrainerCard.tsx`. Использует `TrainerDirectoryItem` (как и сейчас). Вся специфика тренера — meta-box «Площадка/Окно», headline, quote, sport-tag — мапится из существующих полей без расширения типов.

**Что делаем:**

Полностью переписать `src/components/trainers/TrainerCard.tsx`. Удалить gradient-обложки.

Особенности реализации:

- **`'use client'`** обязательно (см. Step 28.8 — ChipMarquee внутри).
- **Никакого `<Link>` снаружи `<article>`.** Внутри карточки — два независимых Link: один на имени тренера (`/trainers/{slug}`), другой на CTA «К записи →» (`/booking/{nextSlotId}` или `/trainers/{slug}` если nextSlotId отсутствует). Hover-стиль карточки — CSS, не Link.
- **`grid-template-rows`** фиксируем строго: `grid-rows-[auto_auto_auto_48px_auto_auto_auto_auto]` на ≥768, на 480 — то же значение (тренеры одинаково на всех разрешениях по строкам).

Пропсы:
```ts
type TrainerCardProps = {
  trainer: TrainerDirectoryItem;
  index?: number;                  // для wm и tone
  highlighted?: boolean;
  reliability?: ReliabilityResult;
};
```

Маппинг полей `TrainerDirectoryItem → дизайн`:

| В дизайне | Источник в проекте |
|-----------|-------------------|
| `wm` | `String((index ?? 0) + 1).padStart(2, '0')` |
| `tone` | `(['orange','lime','blank'])[(index ?? 0) % 3]` (orange — дефолт для тренеров) |
| `city` | `trainer.city ?? 'Самара'` |
| `role` | константа `'Персональный тренер'` |
| `ini` | `getTrainerInitials(trainer.name)` (уже есть утилита) |
| `name` | `trainer.name` |
| `sportTag` | `trainer.sports?.[0]?.name ?? null` (если null — не рендерим chip) |
| `price` | `formatPrice(trainer.priceFrom)` |
| `distance` | `trainer.distanceKm !== null ? \`${distanceKm} км\` : \`${availableSlotsCount} окон\`` |
| `experience` | `\`${trainer.experienceYears} лет опыта\`` |
| `isGroup` | `['group','mini_group'].includes(trainer.primaryOfferingFormat)` |
| `headline` | `trainer.primaryOfferingTitle ?? trainer.bio ?? ''` |
| `rating`, `reviewCount` | напрямую |
| `isNew` | `trainer.reviewCount === 0 && trainer.rating === 0` |
| `venue.name` | `trainer.venueLabel ?? 'Без привязки'` |
| `venue.sub` | `trainer.venueAddress ?? null` |
| `slot` | `trainer.nextSlotDate && trainer.nextSlotStartTime ? \`${formatDate(nextSlotDate)}, ${nextSlotStartTime}\` : 'Слоты скоро появятся'` |
| `tags` (solid) | `trainer.specialtyNames` |
| `quote` | если `headline === trainer.bio` — пусто (чтобы не дублировать); иначе `trainer.bio ?? ''` |
| CTA href | `trainer.nextSlotId ? \`/booking/${nextSlotId}\` : \`/trainers/${trainer.slug}\`` |

Если потребуется отдельный `formatBookingSlot(date, time)` — добавить в `lib/utils.ts`. Иначе использовать существующий `formatDate`.

Структура JSX:

- `<article class="trainer-card tone-{tone}">` (без `<Link>` обёртки). Hover: `.trainer-card:hover { border-color: var(--ui-orange) }` (или lime для tone-lime — `.trainer-card.tone-lime:hover { border-color: var(--ui-lime) }`).
- Hero `min-h: [200/184/178]`, фон через `<span aria-hidden className="absolute inset-0 hero-bg-{tone}" />` (классы из Step 28.6). Top-row: city-pill + trainer-avatar 84×84 (rounded-[16px], `bg-[var(--ui-card-2)]`, `border-[var(--ui-line)]`, ini Bowlby 22px + photo-tag 8px UPPERCASE на orange/lime фоне). Bottom-row: role + `<Link href="/trainers/{slug}" class="trainer-name">…</Link>` (clamp 2 lines) + sport-tag.
- Body grid `grid-rows-[auto_auto_auto_48px_auto_auto_auto_auto]`:
  - `.body-meta`: orange price-pill (lime для tone-lime) + distance.
  - `.exp-row`: experience tag (outline) + `.tag.group` chip (orange-soft) если `isGroup`.
  - `.trainer-headline`: Oswald 600 14px, `line-clamp-2`, фикс высота 48px.
  - `.body-rating`: как в ClubCard.
  - **`<ReliabilityBadge mode="compact" />`** — отдельной строкой ниже body-rating, `padding: 0 22px; margin-top: 12px;` (на 480 — `padding-x: 16px`).
  - `.meta-box`: `bg-[var(--ui-card-2)] border-[var(--ui-line)] rounded-[14px] grid grid-cols-[1fr_auto] gap-y-[14px] gap-x-[28px] p-[16px_18px]`. Left: lbl «Площадка» + val name + sub. Right: lbl «Ближайшее окно» + val.date Bowlby 14px. На 480: `grid-cols-1`, `right` text-align: left.
  - `<ChipMarquee items={specialtyNames} variant="solid" accent="orange" />` (lime для tone-lime).
  - `.quote-row`: `border-top border-[var(--ui-line)]`, `grid grid-cols-[1fr_auto] gap-5` — quote (Oswald 12px muted, line-clamp-2) + `<Link href="{ctaHref}" class="quote-cta">К записи</Link>` (Oswald 700 12px UPPERCASE, accent цвет, hover orange-hov, после ::after → стрелка). На 480 — `grid-cols-1`.

Сохраняем `highlighted` (через `data-highlighted="true"`) / `reliability` (отдельной строкой).

**Тест:**

- Создать `src/test/trainers/trainer-card.test.tsx` (раньше его не было):
  - Рендерится с минимальным `TrainerDirectoryItem`.
  - `index=0` → wm `01`, `tone-orange`.
  - `primaryOfferingFormat='group'` → есть `.tag.group` со словом «Группа».
  - `primaryOfferingFormat='personal'` → `.tag.group` отсутствует.
  - `nextSlotId=null` → CTA `href="/trainers/{slug}"`, slot текст = «Слоты скоро появятся».
  - `nextSlotId='sl_42'` → CTA `href="/booking/sl_42"`, slot текст содержит дату и время.
  - `venueLabel=null && venueAddress=null` → val «Без привязки», sub отсутствует.
  - `bio` пустой → quote-row рендерится только с CTA (без `.quote`).
  - Имя обёрнуто в `<a href="/trainers/{slug}">`, CTA — отдельный `<a>`.
  - `reliability` передан → `<ReliabilityBadge>` отрисован отдельной строкой ниже rating-row.
- Существующий `home-page.test.tsx` — обновить если ломается (вероятно сломается из-за изменения структуры).
- Playwright MCP smoke с реальным sample-тренером: meta-box не съезжает, quote clamp 2 lines, marquee катится, на 480 meta-box стекается в столбец, оба Link кликабельны независимо.

---

### Step 28.10: Интеграция `CardSlider` в `ClubList` + `TrainerList`

> Финальная сборка: оборачиваем карточки в слайдер, передаём `index` для wm/tone. `CatalogResultsSection.tsx` не трогаем — он уже корректно переключает `discoveryMode`.

**Что делаем:**

Переписать `src/components/clubs/ClubList.tsx`:

- Сохраняем `'use client'`, `useFilterStore` для фильтрации (searchQuery / selectedSportId / selectedCity).
- После `filterClubs(...)` → результат `filtered: Club[]`.
- Рендер:
  ```tsx
  <CardSlider
    eyebrow="Club list"
    title="Клубы под текущие фильтры"
    accent="lime"
    sliderId="clubs-results"
    total={filtered.length}
    emptyMessage="Ничего не нашли. Попробуйте сменить фильтры."
  >
    {filtered.map((club, i) => (
      <ClubCard
        key={club.id}
        club={club}
        sports={sports}
        tags={tags}
        index={i}
        highlighted={selectedClubId === club.id}
        reliability={reliabilityByClubId?.get(club.id)}
      />
    ))}
  </CardSlider>
  ```
- Удалить `embedded` prop (раньше использовался для grid-обёртки) — в карточном слайдере не нужен. Проверить call-sites через `grep -n "<ClubList" src/`.

Аналогично `src/components/trainers/TrainerList.tsx`:

```tsx
<CardSlider
  eyebrow="Trainer list"
  title="Тренеры под текущие фильтры"
  accent="orange"
  sliderId="trainers-results"
  total={filtered.length}
  emptyMessage="Ничего не нашли. Попробуйте сменить фильтры."
>
  {filtered.map((trainer, i) => (
    <TrainerCard
      key={trainer.id}
      trainer={trainer}
      index={i}
      highlighted={selectedTrainerId === trainer.id}
      reliability={reliabilityByTrainerId?.get(trainer.id)}
    />
  ))}
</CardSlider>
```

`CatalogResultsSection.tsx` — без изменений. `src/app/page.tsx` — без изменений (CatalogResultsSection в нём остаётся на том же месте).

**Тест:**

- Обновить (или создать) тесты на `ClubList` / `TrainerList`:
  - Рендерится с массивом из 6 клубов → `.listing-pill` показывает «6 в выдаче», dots = 5, отображается 2 первых карточки на 1024+ (smoke через layout-классы).
  - Пустой массив → empty state с `emptyMessage`, нет `.slider`.
  - Карточки получают корректный `index` (0..N).
  - При смене `useFilterStore.discoveryMode` → CatalogResultsSection переключает ClubList ↔ TrainerList.
- Existing `home-page.test.tsx` — обновить под изменившуюся структуру DOM.
- `npm run format/lint/test/build` зелёные.
- Полный Playwright MCP прогон на 5 брейкпоинтах: 480/768/1024/1280/1440 — оба режима (`discoveryMode=clubs` и `=trainers`). Проверка: slider step работает, dots переключаются, marquee катится, drag работает на десктопе и через touch-эмуляцию.

---

### Step 28.11: Финальная синхронизация и коммит

**Что делаем:**

- Обновить `CLAUDE.md` секцию «Текущее состояние»: последний шаг 28.11, описание (карточки клубов и тренеров в виде слайдеров + chip-marquee + удалён isFeatured).
- Обновить `PHASES_OVERVIEW.md`: краткое описание Phase 28 расширить «+ карточки клубов/тренеров под фильтр (слайдер + chip-marquee), удалён неиспользуемый `isFeatured`».
- Обновить `PROJECT_STATE.md`:
  - В «Ключевых компонентах» — добавить `ui/CardSlider`, `ui/ChipMarquee`. Обновить описание `clubs/ClubCard` и `trainers/TrainerCard` (новый дизайн, marquee, meta-box). Обновить `ClubList`/`TrainerList` (теперь через CardSlider).
  - В «Дереве» — добавить новые файлы.
  - В «Моделях данных» — убрать `isFeatured` из описания `Club`.
- Обновить `STACK_OVERVIEW.md`:
  - В разделе «Дизайн-система» обновить путь к источнику: `claude-design/cards-trainers/sporthub/project/SportHub Cards - {Clubs,Trainers}.html` (старая структура `claude-design/project/...` больше не существует).
  - В «Соглашения по коду» дополнить упоминание ChipMarquee и CardSlider как стандартных компонентов.
- Обновить `.claude/skills/frontend-design/SKILL.md`:
  - Подправить пути к источникам в разделе «Источники» (теперь `claude-design/cards-trainers/sporthub/project/`).
  - В «Компоненты» добавить пункт про ChipMarquee и CardSlider (1-в-1 правило — не значения).
- Обновить `feature-docs/_overview.md` если нужно (карта доменов вряд ли затронута, но проверить).
- Обновить `README.md`: краткое описание прогресса Phase 28 расширить на карточки.
- Финальный коммит блока 28.6–28.11:
  - `git add` затронутые файлы (документы — локальные, не коммитятся; коммитим только реальные изменения в `src/`).
  - Дробим минимум на 2 коммита для читаемости истории:
    1. `chore(types): Step 28.7 — удалить isFeatured из кодовой базы`
    2. `feat(design): Step 28.6/28.8/28.9/28.10 — слайдеры карточек клубов и тренеров под фильтр (CardSlider + ChipMarquee)`
  - Ветка `phase-28`.

**Тест:**

- `git status` чистый после коммитов.
- `npm run format/lint/test/build` — все зелёные.
- Полный Playwright MCP smoke на 5 брейкпоинтах ещё раз с открытием обоих режимов (clubs/trainers) — финальная проверка.
- `git log --oneline -10` показывает свежие коммиты.

---

### Step 28.12: Trainer Availability slider — «Свободные окна тренеров» на главной

> Переносим новый handoff-bundle от Claude Design (`claude-design/slots-availability/sporthub/project/SportHub Slots - Availability.html` + `chats/chat1.md`) в проект. Целевой блок — слайдер «свободных окон тренеров» в нижней части главной (там же, где сейчас `TrainerAvailability` рендерится через `UpcomingSessions` для `discoveryMode='trainers'`). Точечный визуальный rebrand. Бизнес-логика (`getUpcomingSessions`, `lib/db.ts`, `/api/schedule`, тип `Schedule`/`TrainerAvailabilityItem`) — не трогается.

**Что делаем:**

1. **Новый компонент `src/components/trainers/TrainerSlotCard.tsx`** (`'use client'`):
   - `<article className="slot-card tone-{lime|orange|blank}">` — `bg-[var(--ui-card)]`, `border border-[var(--ui-line)] rounded-[22px]`, `display: grid; grid-template-rows: auto auto auto`. Hover: `border-[var(--ui-lime)] translateY(-2px)` (transform-исключение для tone-positive здесь логичнее без подъёма — оставляем подъём как в дизайне, по аналогии с ClubCard/TrainerCard 28.8/28.9 где он уже допущен).
   - **Hero**: `min-height: 168px` (480 → 156), `bg-[var(--ui-bg)]`, диагональный lime/orange-луч (118deg) + штриховка 135° через `::before` (декларируем единый класс `.slot-hero` в `globals.css`, тоновые модификаторы `.tone-orange .slot-hero::before`/`.tone-blank .slot-hero::before`). Watermark `<span className="hero-wm">{String(index+1).padStart(2,'0')}</span>` Bowlby 88px opacity 0.04.
   - **Hero-content** (3 ряда `auto / 44px / 22px`): head (eyebrow «ПЕРСОНАЛЬНАЯ УСЛУГА» + capacity-pill справа); name (Bowlby 19px, `line-clamp-2`); sport (Oswald 13px muted, `line-clamp-1`).
   - **Capacity-pill — всегда лайм** (`bg-lime-soft border-lime/28 text-lime`, Oswald 700 10px UPPERCASE). Склонение: `1 → «место»`, `2-4 → «места»`, `5+ → «мест»`.
   - **Slot-boxes** (2 колонки `1fr 1fr`, gap 10): «Время» / «Стоимость». `lbl` Oswald 700 9px UPPERCASE muted; `val` Bowlby `font-size: clamp(13px, 2.2cqw, 17px)` + `tabular-nums` + `white-space: nowrap` + `container-type: inline-size`. **Никогда не уходит в 2 строки** — даже на 480 при «20 000 ₽».
   - **Slot-foot** (1fr auto, `border-top: 1px var(--ui-line-2)`): venue (Площадка + комната, Oswald `line-clamp-1` каждая) + CTA `<Link href={`/booking/${item.scheduleId}`} className="slot-cta">К записи</Link>` (lime, Oswald 700 12px UPPERCASE, hover lime-hov + расширение gap; `::after` стрелка «→»). Auth/role-guard живёт уже в `/booking/[scheduleId]` — здесь не дублируем.
   - **Tone-ротация** по `(['lime','orange','blank'])[index % 3]` — по тому же паттерну, что ClubCard (28.8) и TrainerCard (28.9).
   - НЕ оборачиваем `<article>` в `<Link>` (правило скила). Линк только на CTA.

2. **Переписать `src/components/trainers/TrainerAvailability.tsx`**:
   - Сетку `<Card>` → `<CardSlider>`:
     - `accent="lime"`, `eyebrow="Trainer availability"`, `title="Свободные окна тренеров"`, `sliderId="trainer-availability"`, `emptyMessage="Свободных окон пока нет."`,
     - `visibleByBp={{ sm: 1, md: 2, xl: 3 }}`,
     - `tools={<>{pill «Ближайшие»}{chip dateLabel}</>}` — pill solid lime + outline-chip с живым `dateLabel` (приходит сверху из `getUpcomingSessions` / `getTrainerAvailability`, как и раньше).
   - Каждому `item` рендерим `<TrainerSlotCard item={item} index={i} />`.
   - Контракт `{ dateLabel, items }` сохранён — `UpcomingSessions.tsx` (orchestrator) НЕ трогаем.

3. **Расширить `src/components/ui/CardSlider.tsx`** двумя опциональными props:
   - `tools?: ReactNode` — кастомный блок справа в `listing-head`. Если передан — внутренний pill-счётчик и стрелки prev/next встают рядом с `tools` (стрелки часть `tools` слева их добавляем последними детьми, или `tools` сами включают стрелки — выбираем: **`tools` рисует только пользовательскую часть, стрелки `CardSlider` рисует сам в одном ряду с `tools`**, чтобы стрелки оставались управляемыми компонентом). Если НЕ передан — рендерится текущий pill-счётчик «N в выдаче».
   - `visibleByBp?: { sm?: number; md?: number; xl?: number }` — расширение бинарного 1↔2 (`matchMedia('(min-width: 1024px)')`) до тернарного через 2 mediaQuery'я: `(min-width: 768px)` для `md`, `(min-width: 1280px)` для `xl`. Если ключ не задан — fallback на ближайший меньший. Если prop не передан — текущее поведение `1↔2 на 1024px` (для ClubList/TrainerList ничего не меняется).
   - **Адаптивный `listing-head`**: на `lg+` (1024+) — одна `flex-row` со всеми элементами и `tools` через `margin-left:auto`; на `<lg` — три ряда:
     - row1: `flex-row justify-between items-center` — слева eyebrow, справа стрелки prev/next;
     - row2: `<h2>` title во всю ширину (`white-space: normal`, без ellipsis);
     - row3: `flex-row gap-2` — pill «Ближайшие» + chip даты (без стрелок).
   - Стрелки рендерятся **либо** в верхнем ряду на `<lg` **либо** в `tools`-ряду на `lg+` — позиционирование через два разных слота в JSX с условным рендером по media-query state.

4. **Стили в `src/app/globals.css`** — добавить под существующими `.hero-bg-{lime,orange,blank}` (28.6):
   - `.slot-hero` + `.slot-hero::before` (диагональный lime-луч 118deg + штриховка 135° opacity 0.02).
   - `.tone-orange .slot-hero::before` (orange-луч), `.tone-blank .slot-hero::before` (только штриховка).
   - `.slot-card`, `.slot-card:hover`, `.hero-wm`.
   - `.slot-boxes`, `.slot-box`, `.slot-box .val` (`clamp(13px, 2.2cqw, 17px)` + `tabular-nums` + `nowrap` + `container-type: inline-size`).
   - `.slot-foot`, `.slot-cta`, `.slot-cta:hover`, `.slot-cta::after`.
   - `.capacity-pill` (`bg: var(--ui-lime-soft); color: var(--ui-lime); border: 1px solid rgba(132,192,3,0.28)`).
   - Всё через `var(--ui-*)` — никаких прямых hex.

**Тест (TDD: красные → зелёные):**

`src/test/trainers/trainer-slot-card.test.tsx` (новый):
- Capacity склонение `1→место`, `3→места`, `10→мест`.
- Capacity-pill всегда `text-[var(--ui-lime)]`/`bg-lime-soft` (нет orange/red вариантов).
- Tone-ротация по `index%3`: 0→lime, 1→orange, 2→blank, 3→lime.
- Watermark рендерит `String(index+1).padStart(2,'0')` (0→«01», 11→«12»).
- CTA — `<a href="/booking/{scheduleId}">К записи</a>`.
- Time/price имеют `white-space: nowrap` (по computed style или класс/data-attr).
- `room` пустой → строка `<p class="room">` не рендерится.
- Длинное `name` имеет `line-clamp-2`.

`src/test/trainers/trainer-availability.test.tsx` (создать или обновить):
- Рендерится `<CardSlider>` с `accent="lime"`, eyebrow «Trainer availability», title «Свободные окна тренеров».
- `tools` содержит pill «Ближайшие» + chip с переданным `dateLabel`.
- Передан `visibleByBp={{sm:1, md:2, xl:3}}`.
- `items` мапятся в `<TrainerSlotCard>` с правильным `index`.
- На `<lg` (mock matchMedia: 1024 → false) header имеет три ряда; на `lg+` — одну строку с `tools` через `ml-auto`.

`src/test/components/card-slider.test.tsx` (доп. ассерты):
- Без `tools` → старый pill-счётчик (регрессия).
- С `tools` → внутренний pill-счётчик НЕ рендерится, вместо него — переданный `tools` + стрелки.
- Без `visibleByBp` → 1↔2 на 1024px (регрессия).
- С `visibleByBp={sm:1, md:2, xl:3}` → 3 значения через 2 mediaQuery'я (mock переключений).

Регрессия — должны остаться зелёными: `home-page.test.tsx`, `upcoming-sessions.test.tsx`, `cards-design.test.tsx`, `publish-catalog-flow.test.tsx`, `popular-nearby.test.tsx`, `trainer-card.test.tsx`, `club-card.test.tsx`. Если глобальный `matchMedia`-мок в `src/test/setup.ts` (28.10) не отвечает разному `query` — расширить до lookup-таблицы по строке запроса.

**Верификация:**

- `npm run format` чистый.
- `npm run lint` 0 errors (старые 11 warnings допустимы).
- `npm run test` зелёный, новых тестов ~13–18 без регрессий.
- `npm run build` без ошибок.
- Playwright MCP smoke на 5 брейкпоинтах (480/768/1024/1280/1440), главная в режиме `discoveryMode='trainers'`:
  - 1440/1280 — 3 карточки в кадре, header в одну строку; tools (pill+date+arrows) справа.
  - 1024 — 2 карточки, header одна строка с tools справа (lg+).
  - 768 — 2 карточки, header **3 ряда** (eyebrow+стрелки / title / pill+date).
  - 480 — 1 карточка, header **3 ряда**, title во всю ширину без обрезки.
  - Стрелки disable на краях.
  - `capacity-pill` «1 место» — лайм (НЕ orange).
  - Time/price «20 000 ₽» / «19:50 – 20:40» — в одну строку (срабатывает `clamp` font-size).
  - hover на карточке: `border: lime`, лёгкий `translateY(-2px)`.
  - Нет horizontal scroll нигде.

Коммит: `feat(design): Step 28.12 — Trainer Availability slider («Свободные окна тренеров» на главной)`.

---

### Step 28.13: Универсальный `SlotCard` + клубный slot-блок на главной

> После 28.12 на главной два блока «свободных окон»: тренерский (новый дизайн) и клубный (старая `<Card>`-сетка в `UpcomingSessions`). Они идентичны по семантике (eyebrow + название + capacity-pill + время + цена + площадка + CTA). Шаг — **унификация**: переезд карточки слота в общий `ui/SlotCard` + новый `ClubAvailability` под тот же визуал. Бизнес-логика не трогается.

**Что делаем:**

1. **Переезд карточки в `ui/`:**
   - `src/components/trainers/TrainerSlotCard.tsx` → `src/components/ui/SlotCard.tsx`. Экспорт переименован `TrainerSlotCard` → `SlotCard`. Контракт нейтральный: `{ eyebrow, name, sport, availableSpots, startTime, endTime, price, venueLabel, room?, index, onSelect, ctaAriaName }`. Привязка к `TrainerAvailabilityItem` уходит — карточка ничего не знает про тренера/клуб.
   - Барреля `src/components/ui/index.ts` — добавить экспорт `SlotCard`.
   - Стили `.slot-*` в `globals.css` уже общие (из 28.12) — не трогаем.

2. **`TrainerAvailability.tsx`:**
   - `<TrainerSlotCard item={slot} index={i}/>` → `<SlotCard {...mapTrainerToSlot(slot, i)} onSelect={...}/>`.
   - `mapTrainerToSlot(slot, i)` — локальный helper: `eyebrow="Персональная услуга"`, `name=slot.trainerName`, `sport=slot.title`, `venueLabel=slot.venueLabel`, `ctaAriaName="К записи: {trainerName}"`. Контракт `{ dateLabel, slots }` сохранён.

3. **Новый `src/components/schedule/ClubAvailability.tsx`** (`'use client'`):
   - Принимает `{ dateLabel: string; sessions: UpcomingSessionItem[]; onSelect: (id) => void }`. Auth-guard живёт в `UpcomingSessions` — onSelect делегируется наверх.
   - Использует `CardSlider` с `accent="lime"`, `eyebrow="Sessions today"`, `title="Ближайшие занятия"`, `sliderId="club-availability"`, `visibleByBp={{ sm:1, md:2, xl:3 }}`, `tools={<>{pill «Сегодня»}{chip dateLabel}</>}`.
   - `mapSessionToSlot(session, i)`: `eyebrow="Групповое занятие"` (статика), `name=session.title`, `sport=session.clubName`, `venueLabel=session.clubName`, `room=session.room`, `ctaAriaName="К записи: {session.title}"`.

4. **`UpcomingSessions.tsx`:**
   - В `discoveryMode='clubs'` → `<ClubAvailability dateLabel={dateLabel} sessions={sessions} onSelect={handleSessionClick}/>` вместо старой `<Card>`-сетки. Старый клубный JSX, импорты `Badge`/`Card`/`formatPrice`, локальный `getPlacesLabel` — удаляются.
   - В `discoveryMode='trainers'` — без изменений.

**Тест (TDD):**

`src/test/ui/slot-card.test.tsx` (перенос из `src/test/trainers/trainer-slot-card.test.tsx`):
- Capacity склонение `1/3/10`, capacity-pill всегда lime, tone-ротация, watermark, CTA, nowrap time/price, room-skip, line-clamp на name.
- Дополнительно: `eyebrow` и `sport` приходят из props (тестируем «Персональная услуга» и «Групповое занятие»). `venueLabel` рендерится в `.slot-venue-name`.

`src/test/schedule/club-availability.test.tsx` (новый):
- CardSlider с `accent="lime"`, eyebrow «Sessions today», title «Ближайшие занятия». Tools: pill «Сегодня» + chip с `dateLabel`. Сессии → SlotCard с `eyebrow="Групповое занятие"`, `name=session.title`, `sport=session.clubName`. Клик «К записи» → `onSelect(session.id)`. Empty-state на пустом массиве.

`src/test/trainers/trainer-availability.test.tsx` (обновить): ожидание `<TrainerSlotCard>` → `<SlotCard>`.
`src/test/schedule/upcoming-sessions.test.tsx` (обновить): aria-label CTA `Открыть запись на занятие …` → `К записи: …`.
`src/test/ui/publish-catalog-flow.test.tsx` (обновить): тот же aria-label.

**Что НЕ делаем:**
- НЕ трогаем `getUpcomingSessions` / `getTrainerAvailability` / data layer.
- НЕ трогаем `/trainers/[slug]`, `/clubs/[slug]` schedule-секции.
- НЕ переключаем `ClubList`/`TrainerList` (28.10) на 3-visible.
- НЕ переписываем `globals.css` (стили `.slot-*` уже общие).

**Верификация:**

- `npm run format/lint/test/build` — зелёные. Целевое: 1368 + ~5 новых = ~1373 без регрессий.
- Playwright MCP smoke в **обоих режимах** на 5 брейкпоинтах: оба блока выглядят идентично, header 3-рядный на `<lg`, capacity-pill лайм, time/price в одну строку, нет horizontal scroll.

Коммит: `feat(design): Step 28.13 — общий SlotCard + клубный slot-блок на главной`.

---

### Step 28.16: Layout админки + AdminNavigation segmented + новая `--ui-gold`

**Что делаем:**

- `src/app/globals.css`: добавляем новую переменную `--ui-gold: #f5c518` в `:root` + проброс в `@theme inline` как `--color-gold` (для status-pending бейджей и warn-action в логах). Цвета `--ui-card`/`--ui-card-2`/`--ui-red` НЕ трогаем (расхождение на 6 hex'ов с макетом игнорируем — глобальная правка вне scope).
- `src/app/service-portal/(admin)/layout.tsx`: убираем мини-H2 «Сервисная панель» (роль перешла к sec-head на каждой странице), расширяем контейнер с `max-w-5xl` (1024) до `max-w-[1440px]` + `px-4 sm:px-8 py-7`. Ссылка «Открыть сайт →» в стиле btn-ghost (rounded-full + line-border + lime hover, Oswald 700 11px uppercase). На lg+ AdminNavigation и ссылка в одну строку, на <lg — стек.
- `src/components/admin/AdminNavigation.tsx`: переделываем под segmented-control. Wrapper `inline-flex` + `bg-card-2` + `border-line` + `rounded-full` + `p-1.5` + `gap-1`. Каждая ссылка — `rounded-full` + `px-4 py-2` + Oswald 700 11px uppercase letter-spacing 0.16em + whitespace-nowrap. Активная (по `pathname.startsWith(href + '/')` или строгому `===` — N8 защита от ложных совпадений `/dashboard-extra`): `bg-lime` + `text-bg`. Неактивная: `text-muted` → `hover:text-ink`. Адаптив 480: `overflow-x-auto` + `scrollbar-hidden`.
- ImpersonationBanner НЕ трогаем (N4) — остаётся красным/warning по текущему коду, чтобы админ сразу видел режим имперсонизации.

**Тесты:** admin-integration.test.ts, service-portal-login.test.tsx — должны проходить без правок (селекторы структурные, не по стилям).

**Верификация:** format/lint/test/build зелёные. Playwright MCP `/service-portal/dashboard` на 5 брейкпоинтах: nav на 480 horizontal scroll, на 768+ помещается, на lg+ — в одну строку с «Открыть сайт».

Коммит: `feat(design): Step 28.16 — layout админки + AdminNavigation segmented-стиль + --ui-gold`.

---

### Step 28.17: Аналитика под Phase 28

**Что делаем:**

- `src/components/admin/analytics/AnalyticsDashboard.tsx`: sec-head сверху — eyebrow `Admin · Overview` (Oswald 700 11px UPPERCASE letter-spacing 0.22em muted) + Bowlby `Аналитика` (32 / 28 на 1024 / 26 на 768 / 24 на 480) + sub-описание + `sec-pill` справа (`live · обновлено сейчас`, статичная лайм-точка через inline span с `bg-lime shadow-[0_0_0_3px_rgba(132,192,3,0.18)]`, без анимации, без таймера). Контейнер `max-w-7xl` убираем — внешний layout уже даёт `max-w-[1440px]`.
- `src/components/admin/analytics/AnalyticsFilters.tsx`: segmented-period (rounded-full inline-flex, p-1.5, кнопки rounded-full Oswald 700 11px uppercase tracking-[0.16em], idle muted hover ink, is-active = lime-fill text-bg) с 4 периодами (Всё время / Месяц / Неделя / Сегодня) + 2 кастомных select-wrap (rounded-[12px] на `bg-card-2` border-line, is-active = lime border + lime chevron — псевдо-стрелка absolute span с rotated borders, БЕЗ трогания глобального `<Select>` — N5). Layout grid `1fr auto auto` на 1280+, `1fr 1fr 1fr` на 1024 (seg col-span-3), `1fr 1fr` на 768/480 (seg col-span-2 scrollable).
- `src/components/admin/analytics/KpiCards.tsx`: 6 карточек в сетке `grid-cols-2 lg:grid-cols-3 xl:grid-cols-6`. Каждая: иконка-квадратик 22×22 (rounded-[6px] border + центрированный SVG) + label Oswald 700 9px (480) → 10px (sm+) UPPERCASE tracking-[0.18em] (480) → tracking-[0.22em] (sm+) muted + Bowlby-число 30px (480) → 36px (sm) → 38px (lg) → 44px (xl) tabular-nums + sub-описание 12px muted line-clamp-2. Карточка `is-feature` (Пользователи) — лайм-градиентный фон + лайм-цифра + лайм-иконка. БЕЗ спарклайнов / trend-бейджей / прогресс-кольца (в макете нет — N3).
- Графики (BookingsChart/SportPopularityChart/PlatformActivityChart) и TopEntitiesTable — НЕ трогаем (вне scope блока), оставляем под KPI как есть.

**Тесты:** analytics-kpi.test.tsx, analytics-filters.test.tsx, analytics-charts*.test.tsx, analytics-smoke.test.tsx — все 20 тестов analytics проходят без правок (testid сохранены).

**Верификация:** format/lint/test/build зелёные. Playwright MCP на 5 брейкпоинтах: KPI-grid 6→3→2 col, segmented period с lime-active, селекты с lime-border при выборе.

Коммит: `feat(design): Step 28.17 — Аналитика под Phase 28 (sec-head + segmented + KPI без графиков)`.

**Fix-коммит:** `fix(design): Step 28.17 — уменьшить label KPI на мобилке (загрузка слотов в одну строку)` — на <480 «ЗАГРУЗКА СЛОТОВ» в 2-col grid влезала в 2 строки из-за tracking 0.22em + длинного слова. Уменьшил до `text-[9px]` + `tracking-[0.18em]` на mobile, на sm+ прежние 10px/0.22em.

---

### Step 28.18: Логи активности под Phase 28

**Что делаем:**

- `src/app/globals.css`: добавляем `@keyframes admin-pulse` + класс `.admin-pulse-dot` (1.6s ease-in-out infinite, расширяющийся `box-shadow`). Обязательно `@media (prefers-reduced-motion: reduce) { .admin-pulse-dot { animation: none; } }` — accessibility для пользователей с эпилепсией / vestibular sensitivity.
- `src/components/admin/LogsPage.tsx`: sec-head с eyebrow `Admin · Activity Logs` + Bowlby `Логи активности` + actions-блок справа (btn-ghost `↻ Обновить` rounded-full с inline SVG-refresh + auto-status pill — серая точка `bg-disabled` когда autoPolling=false, лайм + `.admin-pulse-dot` когда true). Фильтры в карточке `bg-card-2` `rounded-[16px]` `p-[18px_22px]`, grid 3-col на 1024+, 2-col + last-field full на 768, 1-col на 480. 3 поля: action select / period select / actor-id input (input-wrap rounded-[12px] + lime focus-border). Log-card: grid `1fr auto`, info-блок (action-badge с тонами `is-good` lime-soft / `is-warn` gold через `--ui-gold` / `is-danger` red / `neutral` line-outline + actor-line «Админ #N» + target-string Oswald 600 14px ink + опц. extras `btn-mini` rounded-full ghost outline для «История FSM») + timestamp Oswald 500 12px muted nowrap справа. На 480 — log-card 1-col, time переезжает наверх (`order:-1` + Oswald 600).
- `ACTION_TONES` маппинг переписан под семантические уровни good/warn/danger/neutral: `publish_create`/`booking_create`/`booking_confirm`/`booking_check_in_completed`/`link_approve`/`quarantine_end`/`moderation_unhide` → good; `booking_reject`/`publish_delete`/`link_reject`/`link_revoke`/`admin_hard_delete_booking` → danger; `booking_cancel`/`booking_check_in_no_show`/`booking_auto_expire`/`quarantine_*`/`admin_impersonate_start`/`moderation_hide` → warn; остальные → neutral.
- **Pagination:** `PAGE_SIZE` снижен с 20 до **15** (унификация с Users/Moderation). Pager отображается **всегда** (даже при 1 странице) — numbered кнопки lime-active + chevron prev/next + max 5 видимых кнопок. Стиль: 32×32 rounded-[8px] border-line, hover lime-border, active lime-fill text-bg.
- `src/components/admin/BookingStatusHistoryDrawer.tsx`: минимальный rebrand — внутренние карточки timeline `bg-card-2` (вместо `bg-canvas`) + `rounded-[12px]` + font-mono с `tabular-nums` для timestamp.

**Тесты:** logs-page.test.tsx, booking-status-history-drawer.test.tsx — 11 тестов проходят без правок (data-testid сохранены, в т.ч. `logs-open-booking-history-${id}`).

**Верификация:** format/lint/test/build зелёные.

Коммит: `feat(design): Step 28.18 — Логи активности под Phase 28 (sec-head + auto-status pulse + log-card + pager 15)`.

---

### Step 28.19: Модерация публикаций под Phase 28

**Что делаем:**

- `src/components/admin/ModerationPage.tsx`: sec-head с eyebrow `Admin · Moderation` + Bowlby `Модерация публикаций` + sub `Управление видимостью клубов и тренеров на платформе · N карточек`. Toolbar: grid `minmax(0,1.4fr) repeat(4, minmax(0,1fr))` на 1440 → `minmax(0,1.2fr) + 4×1fr` на 1280 → `1fr 1fr` (search col-span-2) на 1024/768/480. Search rounded-[14px] + иконка-лупа absolute слева + lime focus-border. 4 select-wrap (rounded-[14px], lime-border при is-active): статусы / типы / города / виды спорта. Item-card grid `1fr 220px` на 1280+, 1-col на ≤1024 (action в новой строке). info: name Bowlby 18px + бейджи `type-trainer/club` (lime-fill), `status-published` (lime-soft), `status-hidden` (muted-outline), `status-pending` (gold через `--ui-gold`) + meta-line (city · «Создано: дата» с muted dot-разделителем). Action: btn-danger «Скрыть» (red outline → red-fill hover) для published, btn-primary «Показать» (lime-fill) для hidden. На 480 — кнопка full-width.
- **Pagination:** `limit` 20 → **15**, pager всегда видим (numbered + chevron prev/next), стиль одинаковый с Logs/Users.
- `src/components/admin/HideReasonModal.tsx`: textarea на `bg-card-2` rounded-[12px] + lime focus-border. Кнопки: btn-ghost «Отмена» + btn-danger «Скрыть» (red outline → red-fill hover) с правильным disabled-стейтом.

**Тесты:** moderation-page.test.tsx — 3 теста проходят без правок.

**Верификация:** format/lint/test/build зелёные.

Коммит: `feat(design): Step 28.19 — Модерация публикаций под Phase 28 (toolbar 5-col + item-card 1fr+220 + pager 15)`.

---

### Step 28.20: Пользователи платформы под Phase 28

**Что делаем:**

- `src/components/admin/DashboardPage.tsx`: sec-head с eyebrow `Admin · Users` + Bowlby `Пользователи платформы` + sub `N пользователей · M показано` + sec-pill `обновлено сейчас` справа (статика, без точки — это Users, не Analytics). Toolbar grid `1fr auto`: search-input на rounded-[14px] `bg-card-2` + иконка-лупа absolute слева + placeholder `Поиск по ID, имени или email…` + lime-solid кнопка «Фильтры ⌃» (rounded-[14px] padding 14×22, при `is-open` — chevron rotate 180° через CSS transition). На 480 — toolbar 1-col, кнопка full-width. **Lime-solid здесь оправдан — N6 (в админке допускаем больше lime, приоритет — удобство).** Filters-panel collapsible: rounded-[14px] `bg-card-2` p-[18px_22px], grid 2-col Роль / Статус (select-wrap rounded-[10px] на `bg-bg`, лайм focus-border). User-card grid `1fr 440px` на 1280+, 1-col на ≤1024 (action в новой строке). info: line с `#ID` (font-mono muted) + Name (Bowlby 18px) + role-бейдж (lime-fill для athlete/provider, orange-fill для admin) + status-бейдж (lime-soft active / red banned / gold через `--ui-gold` для suspended/pending) + ReliabilityBadge (compact, в строке среди других — N B, оставляем) + опц. бейдж «Карантин до DD.MM.YYYY» (red). email + строка статистики «Активных записей: N» / «Публикаций: N».
- **Action правило (правило замены при карантине — N A):**
  - **Атлет в карантине:** btn-ghost «Снять карантин» + btn-primary «Войти как пользователь» (заменяем «Пересчитать рейтинг» — не плодим 3-ю кнопку, action-zone остаётся 2 кнопки)
  - **Атлет НЕ в карантине:** btn-ghost «Пересчитать рейтинг» + btn-primary «Войти как пользователь»
  - **Провайдер:** только btn-primary «Войти как пользователь»
- **Pagination:** добавляем client-side через `useMemo` + `slice` (без расширения API) — 15 пользователей на страницу, pager отображается всегда (numbered + chevron). Wrapper-обработчики `handleSearchChange`/`handleRoleChange`/`handleStatusChange` сбрасывают `currentPage = 1` при смене фильтров (через явные handler'ы, не useEffect/useMemo с setState — react-hooks ESLint правило о cascading renders).
- **Админы продолжаем фильтровать** (как и раньше — N C, не показываем в списке).
- **tag-бейджи «Новый»/«Ожидает» из макета НЕ внедряем** (N D — `ReliabilityBadge` «Новый» этого достаточно для атлетов без истории).

**Тесты:** dashboard.test.tsx, dashboard-reliability-columns.test.tsx — 19 тестов проходят без правок.

**Верификация:** format/lint/test/build зелёные. На 1440 user-card в одну строку с reserved 440px справа, на 1024/768 → 1-col, на 480 кнопки 50/50 (`flex: 1 1 140px`).

Коммит: `feat(design): Step 28.20 — Пользователи под Phase 28 (toolbar + filters-toggle + user-card 1fr+440 + замена кнопки в карантине + pager 15)`.

---

### Step 28.21: Финальная синхронизация документов под 28.16–28.20

**Что делаем:**

- `CLAUDE.md` секция «Текущее состояние»: последний шаг 28.21, описание блока (admin-rebrand + 5 коммитов 28.16–28.20 + fix-коммит 28.17 KPI label).
- `PHASES_OVERVIEW.md`: статус блока 28.16–28.21, расширенное описание Phase 28 в таблице.
- `project-phases/phase-28.md`: переписан старый блок 28.16–28.20 под актуальную структуру 6 степов (этот документ), отмечены шаги выполненными в чек-листе.
- `PROJECT_STATE.md`: компоненты `admin/*` обновлены — описания `AdminNavigation` (segmented-control), `LogsPage` (auto-status pulse + pager 15 + log-card), `ModerationPage` (item-card 1fr+220 + pager 15), `DashboardPage` (toolbar + filters-toggle + user-card 1fr+440 + кнопка карантина), `analytics/{AnalyticsDashboard, AnalyticsFilters, KpiCards}` (sec-head + segmented + 6 KPI без спарклайнов), `BookingStatusHistoryDrawer` (dark-look).
- `STACK_OVERVIEW.md`: «HTML-первоисточники дизайна» дополнены 4 admin-путями (`SportHub Admin {Analytics,Logs,Moderation,Users}.html`); в палитре зафиксирована новая `--ui-gold: #f5c518`.
- `.claude/skills/frontend-design/SKILL.md`: в раздел «Компоненты» добавлены пункты **Admin-страница** (паттерн sec-head + filters-card / toolbar + card-row с reserved action-zone), **Segmented-control** (для AdminNavigation/Analytics-фильтра), **Custom select-wrap** (45° rotated borders псевдо-стрелка), **Pulse-индикатор** (auto-polling в логах с `prefers-reduced-motion`).
- `feature-docs/admin.md`: обновлена «Текущая реализация» (новый дизайн всех 4 страниц + AdminNavigation), связанные домены без изменений.
- `README.md`: одна строка в Phase 28 описании про rebrand админки + admin-блок добавлен в таблицу прогресса.

Все 8 правимых документов в `.gitignore` — отдельного коммита нет.

**Тест:**

- `git status` по `src/` чистый (5 коммитов 28.16–28.20 + 1 fix-коммит уже сделаны).
- `grep -rn "Admin Analytics\|Admin Users\|Admin Moderation\|Admin Logs\|--ui-gold\|admin-pulse-dot" PROJECT_STATE.md STACK_OVERVIEW.md .claude/skills/frontend-design/SKILL.md feature-docs/admin.md` — упоминания обновлены.

**Тесты:**

- `analytics-kpi.test.tsx`: проверить 6 карточек, is-feature класс на 1-й, отсутствие спарклайнов и tred-бейджей, корректная сетка.
- `analytics-filters.test.tsx`: seg-кнопки, активная — `is-active`, селекты переключают `is-active` при ненулевом значении.
- Регрессия `admin-integration.test.ts` — что навигация и страницы не сломаны.

**Верификация:**

- `npm run format / lint / test / build` зелёные.
- Playwright MCP smoke `/service-portal/analytics` на 5 брейкпоинтах: sec-head адаптивный, KPI-grid 2/3/6 col, seg + 2 selects, чарты под KPI отображаются (без перевёрстки), AdminNavigation pill-таб переключается.

---

### Step 28.22: Club Detail rebrand под Phase 28

**Что делаем:**

- `src/components/clubs/ClubDetailPageClient.tsx` — полная перевёрстка визуала страницы `/clubs/[slug]` под handoff `claude-design/sporthub/project/SportHub Club Detail.html`. **Логика хуков, fetch'ей, callbacks, zod-схема формы отзыва, `POST /api/reviews` — НЕ трогаем**.
- Контейнер расширен с `max-w-7xl` до `max-w-[1440px]` + padding `28px 32px` desktop → `18px 16px` на 480.
- **Hero — 1-col без галереи** (поле `photos[]` отсутствует в MVP): meta-tags (city / N отзывов / distance) + eyebrow `Club profile` + Bowlby name 38px (32/30/24 по брейкпоинтам) + addr с пин-иконкой + rating-row stars+num + description (line-clamp-5) + stat-rail 2-col (Контакты | Цена от) + **amenity-row через существующий `ChipMarquee`** (тот же паттерн что в карточках главной — loop+drag+edge-mask, no-loop fallback при коротком контенте) + CTA-row (btn-primary «Записаться на занятие →» + btn-ghost «Связаться с клубом»).
- **Секция «Надёжность» с `ReliabilityBadge showDetails`** — НЕ трогаем (своя стилистика). Trust rail из макета (4 stat-cell + status-pill) НЕ делаем.
- **Направления клуба** (`card-block`) — sec-head + sec-pill + directions-list по `Club.sportIds` (icon-box 40×40 lime-tint + name Bowlby + sub).
- **Тренеры клуба** (`card-block`) — sec-head + sec-pill + coach-grid 2-col: photo-zone 16:9 placeholder + watermark номера ранга (Bowlby ~80px полупрозрачный) + name + bio (line-clamp-2) + stats chips + tags chips. Источник: `getTrainerClubLinks({ clubId, status: 'confirmed' })` (helper уже есть в `db.ts`). Empty-state — testid `club-trainers-empty` (СОХРАНИТЬ).
- **Расписание на неделю** (`card-block`) — sec-head + sec-pill «N слотов» + schedule-tabs (7 day-tabs Пн-Вс с counter, активная lime-fill) + slot-grid 2-col на 1024+/1-col на ≤768. Slot-row: eyebrow (sport) + Bowlby offering name + sub `${time} · ${trainer}` + slot-tags + price + btn-mini «Записаться» (link на `/booking/[scheduleId]` — НЕ меняем href). **Anchor week:** `today` → текущая ISO-неделя; слоты вне этой недели не передаются в компонент. **Empty-state**: «Тренировок нет в этот день» когда `slots[activeDay].length === 0`.
- **Отзывы + Форма** (grid 1.2fr/1fr на 1280+, 1-col на ≤1024). **Форма УЖЕ существует в `ClubDetailPageClient.tsx:647-710`** — перевёрстываем визуал под dark-style, сохраняем zod-схему / handler / `POST /api/reviews` / `htmlFor="club-review-text"` / `aria-label="Отправить отзыв"` / `Rating` компонент с `aria-label="Оценить на N из 5"` / auth-gating через `selectAthleteActionUserId` / состояния guest/non-athlete/athlete. Отзывы: review-list (avatar + body + stars справа), empty-state testid `club-reviews-empty` (СОХРАНИТЬ).
- **Общие компоненты создаём** (`src/components/detail-shared/`): только **`DetailScheduleWeek`** (tabs + slot-grid + empty-state, prop `subFormatter(slot)` для разных строк sub на club/trainer). `ReviewSection` как общий компонент НЕ создаём — форма перевёрстывается in-place в обоих файлах. `AmenityRow` — reuse `ChipMarquee`.
- **Минор-правки в этом же степе:**
  - `src/components/ui/HiddenPublicationNotice.tsx` — перекраска под dark-палитру (`bg-card-2`, `border-line` или red-soft, текст `var(--ui-ink)`/`var(--ui-muted)`), чтобы не было «света в окне» на новой dark-странице.
  - `src/components/layout/Footer.tsx` — расширить контейнер с `max-w-7xl` до `max-w-[1440px]` (унификация с detail/main/admin, чтобы не было визуального сдвига).

**Тесты:**

- `club-detail*.test.tsx` — обновить селекторы под новую структуру. **СОХРАНИТЬ:** `club-directions-section`, `club-trainers-section`, `club-trainers-empty`, `club-reviews-empty`, `club-schedule-empty`, `club-reliability-section`, `reliability-badge-${badge}`, текст «Расписание на неделю», `Записаться на ${title}`, `Отправить отзыв`, `Оценить на N из 5`, label «Отзыв» с `htmlFor="club-review-text"`, format `${startTime} - ${endTime}, ${trainerName}`. **УДАЛИТЬ тесты:** `club-media-gallery`, `club-media-gallery-secondary`, `club-media-empty`, плейсхолдеры «Фото клуба»/«Фото тренера»/«Фото автора» (галерея исчезла).
- Новые тесты для `DetailScheduleWeek` (empty-state + переключение tabs + anchor today). Тесты `auth-gating` формы отзыва — должны пройти БЕЗ правок (логика не тронута).
- Регрессия `cards-design`/`reliability`/`reviews-api`/`db` — не должно сломаться.

**Верификация:**

- `npm run format / lint / test / build` зелёные.
- Playwright MCP `/clubs/[slug]` на 5 брейкпоинтах: hero 1-col, секции по порядку, schedule day-tabs переключаются + empty-state на пустом дне работает, форма отзыва disabled для guest и активна для athlete (логика та же что и до rebrand'а).

Коммит: `feat(design): Step 28.22 — Club Detail под Phase 28 (hero без gallery + week-tabs + перекраска формы отзыва + footer 1440 + dark HiddenPublicationNotice)`.

---

### Step 28.23: Trainer Detail rebrand под Phase 28

**Что делаем:**

- `src/components/trainers/TrainerDetailPageClient.tsx` — полная перевёрстка визуала страницы `/trainers/[slug]` под handoff `SportHub Trainer Detail.html`. Контейнер `max-w-[1440px]`. **Логика, fetch'и, zod-схема формы отзыва, `POST /api/reviews` — НЕ трогаем**.
- **Hero — 1-col без галереи**, слева **avatar-disc 132×132** (rounded-full, bg-card-2, инициалы Bowlby 44px через `getTrainerInitials` из `trainer-utils.ts` — reuse, не переписываем), справа meta-col: tags (city / experience «N лет опыта» / N отзывов) + eyebrow `Trainer profile` + Bowlby name 38px + rating-row stars+num+addr + description + **stat-rail 2-col** (Цена от | Услуг) + **отдельный stat-rail 1-col** (Контакты) + **amenity-row через `ChipMarquee`** (специализации тренера) + CTA-row («Записаться к тренеру →» + «Связаться»).
- **Секция «Надёжность» с `ReliabilityBadge showDetails`** — оставляем как есть. Trust rail из макета НЕ делаем.
- **Специализации** (`card-block`) — sec-head + sec-pill + directions-list grid 2-col (на 768/480 → 1-col): direction-item с **orange-icon** 40×40 + name + sub. Источник: `Trainer.sportIds + specialtyIds`.
- **Работает в** (`card-block`) — sec-head + works-card: 64×64 thumb-placeholder + body (Bowlby club-name + addr + meta: stars + rating-num + chip отзывов) + **`<Link>` на `/clubs/[slug]` стилизованный как btn-primary** (НЕ `<button>`, паттерн уже есть в `TrainerDetailPageClient.tsx:481`). Источник: `getTrainerClubLinks({ trainerId, status: 'confirmed' })[0]?.clubId` — берём первый confirmed (helper уже есть в `db.ts:867`). Если нет confirmed — секция скрыта (testid `trainer-affiliated-club-section` СОХРАНИТЬ).
- **Услуги тренера** (`card-block`) — sec-head + sec-pill + services-list (по `Offering[]` для этого тренера): service-row с Bowlby name + desc (line-clamp-3) + tag-row (chips: format «Группа/Персонально», price, duration «N мин», cancellation policy). Empty-state — testid `trainer-offerings-empty` (СОХРАНИТЬ).
- **Расписание** — через **общий `DetailScheduleWeek`** из 28.22. **Slot-row sub на trainer-странице:** `${time} · ${room/venue}` (НЕ trainer name — слот всегда этого тренера, имя дублировать незачем). Передаём через prop `subFormatter`. Empty-state «Тренировок нет в этот день».
- **Отзывы + Форма** — **форма УЖЕ существует в `TrainerDetailPageClient.tsx:699-756`**, перевёрстываем визуал in-place под dark-style, сохраняем zod / handler / `POST /api/reviews` / `htmlFor="trainer-review-text"` / `aria-label="Отправить отзыв"` / `Rating` / auth-gating. Empty-state списка «Тренер пока не получил отзывов» — testid `trainer-reviews-empty` (СОХРАНИТЬ).

**Reuse helpers:**
- `getTrainerInitials` из `src/components/trainers/trainer-utils.ts` — для avatar-диска
- `getTrainerClubLinks({ trainerId, status: 'confirmed' })` из `db.ts:867` — для секции «Работает в»
- `formatPrice`, `formatPhone`, `pluralizeOkno` из `lib/utils.ts`

**Тесты:**

- `trainer-detail*.test.tsx` — обновить селекторы. **СОХРАНИТЬ:** `trainer-affiliated-club-section`, `trainer-reviews-empty`, `trainer-offerings-empty`, `trainer-schedule-section`, `trainer-reliability-section`, `reliability-badge-${badge}`, текст «Расписание»/«Специализации»/«Услуги тренера»/«Работает в», `Перейти к клубу`, `Записаться на ${title}`, `Отправить отзыв`, label «Отзыв» с `htmlFor="trainer-review-text"`, format `${startTime} - ${endTime}, ${room}` (НЕ trainerName).
- Регрессия `DetailScheduleWeek` из 28.22 — должна работать с новым `subFormatter` без правок самого компонента.

**Верификация:**

- `npm run format / lint / test / build` зелёные.
- Playwright MCP `/trainers/[slug]` на 5 брейкпоинтах: hero с avatar-диском (инициалы), секции по порядку, works-at link на клуб работает (проверить с тренером, у которого есть confirmed link), schedule day-tabs + empty-state на пустом дне работают.

Коммит: `feat(design): Step 28.23 — Trainer Detail под Phase 28 (avatar-disc + works-at link + services + перекраска формы отзыва)`.

---

### Step 28.24: Фикс тренерских slot-блоков на главной (фильтр по today)

**Что делаем:**

- `src/components/trainers/trainer-preview.ts` — добавить обязательный параметр `targetDate: string` в обе функции:
  - `getTrainerAvailability` — добавить в цепочку `.filter(slot => slot.date === targetDate)` до `bookedCount<capacity` (симметрично клубному `getUpcomingSessions` в `src/components/schedule/getUpcomingSessions.ts:33`).
  - `buildTrainerDirectory` — расширить `availableSlots` фильтром `slot.date === targetDate` (line ~155). `nextSlotDate`/`availableSlotsCount` больше не цепляют прошлые слоты.
- `src/app/page.tsx` — обоим функциям передать существующий `todayDateKey` (тот же, что для клубного `getUpcomingSessions`).

**Что было не так:**

- На главной блок «Свободные окна тренеров» показывал старые слоты (вне сегодняшней даты), а карточки тренеров в выдаче рендерили «Ближайшее окно» с прошедшей датой.
- У клубного аналога `getUpcomingSessions` фильтр `date === targetDate` есть, поэтому пустые блоки клубов работали корректно.
- Решение симметрично: `=== today` для обеих тренерских функций (вариант «только сегодня», как у клубов). В будущем можно вернуться к более интересной логике (>= today / неделя) для обеих сторон.

**Верификация:**

- `npm run format / lint / test / build` зелёные. Тестов на сами функции нет (только integration через главную) — фикс безопасный.
- Playwright MCP `/` на 1440: блок «Свободные окна тренеров» либо пуст с empty-state, либо показывает только сегодняшние слоты; на карточках тренеров «Ближайшее окно» — либо «Слоты скоро появятся», либо сегодняшняя дата.

Коммит: `fix(home): Step 28.24 — тренерские slot-блоки на главной фильтруются по today`.

---

### Step 28.25: Финальная синхронизация документов под 28.22–28.24

**Что делаем:**

- `CLAUDE.md` секция «Текущее состояние»: последний шаг 28.25, описание блока (Club Detail + Trainer Detail rebrand + photo-placeholder в hero + Footer 1440 + dark HiddenPublicationNotice + фикс тренерских slot-блоков).
- `PHASES_OVERVIEW.md`: статус блока 28.22–28.25 + расширенное описание Phase 28 в таблице (про detail-страницы и фикс).
- `project-phases/phase-28.md`: добавить степы 28.22–28.25 в чек-лист.
- `PROJECT_STATE.md`: описания `ClubDetailPageClient` / `TrainerDetailPageClient` под новый дизайн + новый `detail-shared/{DetailScheduleWeek, utils}` + `Footer` (контейнер 1440) + `HiddenPublicationNotice` (dark-палитра) + `trainer-preview` (targetDate). Дерево проекта — добавить `detail-shared/`.
- `STACK_OVERVIEW.md`: «HTML-первоисточники дизайна» дополнить путями к 2 detail-HTML; «Контейнеры» — `max-w-[1440px]` теперь распространяется и на detail-страницы и Footer.
- `README.md`: расширить описание Phase 28 — упомянуть detail-страницы и фикс slot-блоков.
- `feature-docs/booking.md` — короткая правка: расписание на detail теперь week-anchor (Пн-Вс текущей ISO-недели). SKILL.md НЕ трогаем (общий стандарт без конкретики).

Все 8 правимых документов в `.gitignore` — отдельного коммита нет.

**Тест:**

- `git status` по `src/` чистый (3 коммита 28.22 + 28.23 + 28.24 уже сделаны).
- `grep -rn "ClubDetail\|TrainerDetail\|DetailScheduleWeek\|HiddenPublicationNotice\|targetDate" PROJECT_STATE.md STACK_OVERVIEW.md README.md` — упоминания обновлены.

---

### Чек-лист Phase 28

- [x] **28.0** ✅ — Ветка `phase-28` от `phase-27`, pending `M .gitignore` закоммичен. Commit `6418d2b`.
- [x] **28.1** ✅ — Шрифты Bowlby/Oswald/JetBrains через `next/font/google` + 14 переменных тёмной палитры в `globals.css` с алиасами обратной совместимости + типографические утилиты `.t-*`. Bowlby One без cyrillic — русские заголовки через fallback Impact. Commit `f09a6a2`.
- [x] **28.2** ✅ — Header / MobileNav / NotificationBell перевёрстаны под новый дизайн. Кастомные брейкпоинты `sm 480 / xxl 1440 / 2k 1920`. Commit `e992d1d`.
- [x] **28.3** ✅ — Главная: hero billboard с overlapping FocusCard, sport-rail, leader strip с watermark рангов. Карта Yandex не тронута. Commit `73090ae` + адаптив-фикс `7d3e8e5` (grid + min-w-0 на детях, без horizontal scroll).
- [x] **28.4** ✅ — `SKILL.md` сжат на 48% (убраны generic-блок и pixel-perfect специфика, добавлены «Источники» + «Workflow с Claude Design»). `STACK_OVERVIEW.md` + `CLAUDE.md` обновлены. Без коммита (.gitignore).
- [x] **28.5** ✅ — Синхра документов после фундамента 28.0–28.4. Без коммита.
- [x] **28.6** ✅ — Общие компоненты `CardSlider` (translateX-rail, стрелки, dots, адаптив 1↔2 visible) + `ChipMarquee` (rAF-лента 32 px/sec, drag-scrub, no-loop fallback) + классы `.hero-bg-{lime,orange,blank}` в `globals.css`. 15 новых тестов. Commit `bfbe0e3`.
- [x] **28.7** ✅ — Удалено `isFeatured` из кодовой базы (типы, `db.ts`, JSON, ~32 теста). Commit `5bf480f`.
- [x] **28.8** ✅ — `ClubCard` под новый дизайн: hero+watermark+tone-ротация, body с lime price-pill, ChipMarquee тегов, никакого `<Link>` вокруг article. Commit `c2310e2`.
- [x] **28.9** ✅ — `TrainerCard` под новый дизайн: hero+avatar 84×84+watermark, склонение «окно/окна/окон», meta-box, CTA «К записи». Commit `b13c35b`.
- [x] **28.10** ✅ — `ClubList`/`TrainerList` обёрнуты в `<CardSlider>` с tone-ротацией и watermark рангов. Удалена smoke-страница `/demo-cards`. Глобальный мок `matchMedia` в `setup.ts`. Commit `6044de5`.
- [x] **28.11** ✅ — Синхра документов после блока 28.6–28.10 (карточки + слайдеры + удалённый `isFeatured`). Без коммита.
- [x] **28.12** ✅ — `TrainerSlotCard` + перевёрстка `TrainerAvailability` через `CardSlider`. Расширены props CardSlider — `tools` + `visibleByBp={sm,md,xl}`, адаптивный 3-рядный header на `<lg`. Commit `2ac43f9`.
- [x] **28.13** ✅ — Перенос `TrainerSlotCard` → `ui/SlotCard` с нейтральным контрактом. Новый `ClubAvailability` (mirror `TrainerAvailability` для `UpcomingSessionItem`). 5 новых тестов. Commit `df0829e`.
- [x] **28.14** ✅ — Drag/swipe (mouse + touch) для всех `CardSlider`'ов: pointer-handlers, порог 25%, edge-resistance 0.35, click-suppress >6px, ignore on `<a>`/`<button>`. Commit `dfecd56`.
- [x] **28.15** ✅ — Синхра документов после блока 28.12–28.14 (slot-блоки + drag/swipe). Без коммита.
- [x] **28.16** ✅ — Layout админки расширен до `max-w-[1440px]`, AdminNavigation в стиль segmented-control (`bg-card-2 + rounded-full`, активная по `pathname.startsWith(href + '/')`, на 480 horizontal scroll), новая `--ui-gold: #f5c518` в `globals.css`. ImpersonationBanner НЕ тронут (красный warning). Commit `1bb0067`.
- [x] **28.17** ✅ — Аналитика: sec-head + статичный live-pill, segmented period + 2 кастомных select-wrap, 6 KPI-карточек (без спарклайнов/trend/ring), карточка `is-feature` Пользователи лайм. Графики и TopEntitiesTable не трогаем. Commit `d40450f` + fix `e28f3d9` (label KPI на <480 уменьшен — «ЗАГРУЗКА СЛОТОВ» в одну строку).
- [x] **28.18** ✅ — Логи: sec-head + auto-status pulse `.admin-pulse-dot` с `prefers-reduced-motion`, фильтры в карточке 3-col, log-card grid `1fr auto` с тонами good/warn/danger/neutral, `BookingStatusHistoryDrawer` dark-look. **PAGE_SIZE 20 → 15**, pager всегда видим. Commit `be4868c`.
- [x] **28.19** ✅ — Модерация: toolbar `1.4fr + 4×1fr` (search + 4 select), item-card grid `1fr 220px`, бейджи type/status (lime-fill / lime-soft / muted / gold). `HideReasonModal` rebrand. **`limit` 20 → 15**, pager всегда видим. Commit `ec67ec6`.
- [x] **28.20** ✅ — Пользователи: toolbar (search + lime-solid «Фильтры ⌃»), filters-panel collapsible 2-col, user-card grid `1fr 440px`, **правило замены кнопки при карантине** («Снять карантин» вместо «Пересчитать рейтинг»), client-side pagination 15. Админы фильтруются, tag-бейджи из макета не внедряем. Commit `da0f36d`.
- [x] **28.21** ✅ — Синхра 7 документов после блока 28.16–28.20 (CLAUDE / PHASES_OVERVIEW / phase-28 / PROJECT_STATE / STACK_OVERVIEW / README / feature-docs/admin). SKILL.md не трогали — общий стандарт без конкретики. Без коммита. Коммиты степов 28.16–28.20 + fix-коммит 28.17 KPI label уже в истории (`1bb0067`/`d40450f`/`be4868c`/`ec67ec6`/`da0f36d`/`e28f3d9`).
- [x] **28.22** ✅ — Club Detail rebrand: создан общий `src/components/detail-shared/{DetailScheduleWeek, utils}` (week-tabs anchor today + slot-grid + per-day empty-state), `ClubDetailPageClient` полностью перевёрстан под dark-палитру (hero без gallery, Reliability как было, Sport focus, Coaching team с watermark номера, Schedule через `DetailScheduleWeek`, Reviews+Form — zod/POST/auth-gating без изменений). `HiddenPublicationNotice` перекрашен под dark; `Footer` контейнер расширен `max-w-7xl` → `max-w-[1440px]`. Тесты обновлены: `vi.setSystemTime('2026-03-18')`, удалены проверки галереи. Commit `41e01cd`.
- [x] **28.23** ✅ — Trainer Detail rebrand + photo-placeholder в hero обеих страниц: на Club hero вернули placeholder 16/10 («Фото клуба») слева, hero стал 2-col на lg+; `TrainerDetailPageClient` полностью перевёрстан (hero 2-col с avatar-disc 132×132 / 96 на 480 + «Фото тренера», Reliability, Specializations grid 2-col с lime/orange-icon, Works at через works-card + Link «Перейти к клубу» как btn-primary, Services chips, Schedule через `DetailScheduleWeek` с sub `${time}, ${room}`, Reviews+Form). Тесты обновлены: `setSystemTime`, дублирующие chips через `getAllByText`, slot.sub regex. Commit `6021c9f`.
- [x] **28.24** ✅ — Фикс тренерских slot-блоков на главной: `buildTrainerDirectory` и `getTrainerAvailability` в `trainer-preview.ts` принимают обязательный `targetDate: string`, добавлен фильтр `slot.date === targetDate` (симметрично клубному `getUpcomingSessions`). На `page.tsx` обеим передаётся существующий `todayDateKey`. Эффект: блок «Свободные окна тренеров» и «Ближайшее окно» на TrainerCard больше не показывают прошедшие слоты. Commit `13260b8`.
- [x] **28.25** ✅ — Синхра 8 документов после блока 28.22–28.24 (CLAUDE / PHASES_OVERVIEW / phase-28 / PROJECT_STATE / STACK_OVERVIEW / README / feature-docs/_overview / feature-docs/booking). SKILL.md не трогали — общий стандарт без конкретики. Без коммита. Коммиты степов 28.22–28.24 уже в истории (`41e01cd`/`6021c9f`/`13260b8`).

---

### Статус

🔄 **АКТИВНАЯ** — пройдены шаги 28.0–28.5 (фундамент: тёмная палитра, шрифты, Header, главная), блок 28.6–28.11 (карточки клубов/тренеров + слайдеры на главной с chip-marquee, удалён мёртвый `isFeatured`), блок 28.12–28.15 (slot-блоки availability + общий SlotCard + drag/swipe для CardSlider), блок 28.16–28.21 (админ-панель под новый дизайн), блок 28.22–28.25 (detail-страницы Club + Trainer под новый дизайн с photo-placeholder в hero, общий `DetailScheduleWeek` с week-tabs anchor today, dark `HiddenPublicationNotice`, Footer 1440, фикс тренерских slot-блоков на главной — фильтр `slot.date === today` в `buildTrainerDirectory` + `getTrainerAvailability`). Карту Yandex Maps продолжаем не трогать. Ждём следующих handoff-bundle от Claude Design (футер / hero-апдейт / новые секции).

Контрольные точки: 1378/1378 тестов зелёные на момент закрытия 28.24, build чистый, lint без errors (12 старых warnings не от Phase 28). Адаптив проверен через Playwright MCP на 480/768/1024/1280/1440 для Club Detail, Trainer Detail и главной (фикс slot-блоков).

---

**Выполнено:** Step 28.0–28.5 ✅ — фундамент rebrand'а закрыт. Step 28.6–28.11 ✅ — блок «карточки клубов/тренеров + слайдеры на главной» закрыт. Step 28.12–28.15 ✅ — блок «slot-блоки availability + общий SlotCard + drag/swipe для CardSlider + синхра документов» закрыт. Step 28.16–28.21 ✅ — блок «админ-панель под новый дизайн» закрыт. Step 28.22–28.25 ✅ — блок «detail-страницы Club + Trainer + photo-placeholder в hero + фикс тренерских slot-блоков на главной» закрыт.

**Следующий шаг:** ждём следующий handoff-bundle от Claude Design — Phase 28 остаётся активной, новые степы (28.26+) добавляются по мере поступления (футер / hero-апдейт / новые секции — что пришлёт пользователь).

**Статус Phase 28:** 🔄 АКТИВНАЯ — ждём новых handoff'ов и точечных правок.

---
name: frontend-design
description: Дизайн-система SportHub — палитра, типографика, компоненты, правила адаптивности и workflow с Claude Design. Использовать при создании или изменении любых UI-компонентов и страниц.
license: Complete terms in LICENSE.txt
---

## Источники

Этот скилл — **единственный источник правды** по дизайн-системе SportHub.

HTML-первоисточники (локально, в `.gitignore`):

- `claude-design/sporthub/project/SportHub UI Kit.html` — палитра, типографика, компоненты, состояния, animations (pixel-perfect значения)
- `claude-design/sporthub/project/SportHub Club Detail.html` и `SportHub Trainer Detail.html` — разметка детальных страниц
- `claude-design/sporthub/chats/chat1.md` — intent (какие решения и почему)

При появлении новых компонентов от Claude Design — обновляем этот скилл (правила, не значения).
При конфликте `SKILL.md` ↔ UI Kit.html — `SKILL.md` имеет приоритет.

## Workflow с Claude Design

Триггер: пользователь скидывает команду из Claude Design в формате
`Fetch this design file ... https://api.anthropic.com/v1/design/...`
(копируется по кнопке «Send to local coding agent» в UI Claude Design).

Шаги:

1. **`WebFetch` по присланной URL** → получаем gzip-tar bundle (3-5 MB). Сохраняется в `~/.claude/.../tool-results/*.bin`.
2. **Распаковка в `claude-design/`** через `gzcat ... | tar -xf - -C /Users/misha/Desktop/prosport2.1/claude-design/`. Папка уже в `.gitignore`. Если `claude-design/` существует — `rm -rf` старого содержимого перед распаковкой (или `cp -R` поверх).
3. **Чтение по приоритету:**
   - `README.md` — инструкция от Claude Design (короткая, ~2 KB).
   - `chats/*.md` — переписка с дизайнером (intent). Главный файл для понимания «что и зачем».
   - `project/*Source*.html` (или `*Breakpoints*.html`) — разметка дизайна. Читаем целиком.
   - `project/*UI Kit*.html` — компоненты, состояния, animations.
   - `project/uploads/*.png` — референсы пользователя (контекст).
4. **НЕ открываем `*standalone*.html` для чтения кода** — упакованные бандлы (1.4 MB+ с base64-картинками, нечитаемые). Только для офлайн-просмотра пользователем в браузере.
5. **Доклад пользователю:** что в bundle, какие секции, какие токены/правила/брейкпоинты, что вижу из intent. **НЕ начинаем реализацию без подтверждения.**
6. **Реализация:**
   - Перевожу разметку из vanilla HTML/inline Babel в наш стек: Next.js 16 App Router + React 19 + Tailwind CSS 4 + Zustand + наши CSS-переменные `--ui-*`.
   - Матчу визуал и адаптив (6 брейкпоинтов 480/768/1024/1280/1440/1920), не структуру DOM.
   - НЕ копирую inline Babel-классы 1-в-1; использую Tailwind utility-классы и наши токены.
   - НЕ трогаю компоненты вне scope текущей задачи.
7. **Обновление `SKILL.md`** — только если в новом дизайне появился компонент с собственными правилами (не значениями). Pixel-значения остаются в UI Kit.html.
8. **`claude-design/` живёт постоянно** в проекте как single-source-of-truth. При новом handoff — старое содержимое заменяем (или сохраняем версию через подпапки `claude-design/2026-04-28/...` если важна история).

## Дизайн-философия

- **Стиль:** агрессивный, спортивный, бруталистично-стритовый. Энергия, дерзость, движение.
- **Тема:** СВЕТЛАЯ (фаза 38, макет ПРОСПОРТ). Светло-серый холст `--ui-bg`, белые карточки `--ui-card`, графитовый текст `--ui-ink`, зелёный акцент `--ui-lime` (заливка) и тёмно-зелёный `--ui-lime-hov` (текст на светлом); `--ui-orange/red/gold` держат warning/danger/pending. Контраст-плашки hero и Header — `bg-plate` с текстом `text-plate-ink` / `text-plate-muted` и линиями `border-plate-line`. Точные значения — только в `globals.css`.
- **Тени:** разрешены только на модалках, dropdown и popover. На карточках по умолчанию теней НЕТ — структура держится на обводке.
- **Линии:** обводка 1px (карточки) или 2px (кнопки, аватары, bell). Обводка — главный конструктивный приём.
- **Акценты:** двухцветная семантическая система. Mint = positive (запись/подтверждение/success), оранжевый = warning (cancel/reject). Делятся по семантике, не по иерархии.
- **Декор:** допустим тонкий гранж — штриховка `135deg` (`--ui-decor-hatch*`), слабые радиальные пятна зелёного/оранжевого на body и свечение плашки героя (`--ui-decor-plate-glow`); рисунки объявлены один раз в `globals.css`. Никаких purple gradient mesh, никакого glass-morphism, никакого AI-slop.
- **UPPERCASE** на заголовках, кнопках, навигации, бэйджах, табах. **Mixed case** на user-generated данных (имена, названия клубов, описания, отзывы).

## Цветовая палитра

Точные hex — в `apps/web/src/app/globals.css` и в `claude-design/sporthub/project/SportHub UI Kit.html`.
Здесь — имена и назначение.

| Переменная (`--ui-*`) | Назначение |
|----------------------|-----------|
| `bg` | Основной фон страницы (белый) |
| `bg-deep` | Самый глубокий фон — body wrapper (тоже белый) |
| `card` | Фон карточек (белый) |
| `card-2` | Альтернативный фон секций, фон input-полей (mist) |
| `line` | Границы карточек, разделители |
| `line-2` | Усиленные внутренние разделители |
| `ink` | Основной текст (графит) |
| `muted` | Вторичный текст, мета, подписи (graphite) |
| `disabled` | Disabled-элементы |
| `lime` / `lime-hov` / `lime-soft` | **Зелёный** (имя токена `lime` — семантика, не цвет) — primary positive. ⚠️ `lime` — ЗАЛИВКА и текст на тёмной плашке; **текст на светлом — только `lime-hov`** (яркий зелёный на белом — 1,9:1, нечитаем) |
| `plate` / `plate-ink` / `plate-muted` / `plate-line` | Контраст-плашка героя и шапки: фон, текст, приглушённый текст, линии. На плашке текст не приглушают `opacity` — только `plate-muted` |
| `orange` / `orange-hov` / `orange-soft` | **Оранжевый** — warning (cancel, reject, late, badge нотификаций) |
| `red` | Hard-danger (валидация, удаление навсегда) |

**Семантика трёх акцентов (жёсткая):**

- **Зелёный** (в коде `lime`; значения только в `globals.css`) = записаться, подтвердить, опубликовать, success, активный таб, positive-уведомление. Заливка — `lime`, текст на светлом — `lime-hov`.
- **Оранжевый** = отменить, отклонить, late-cancel предупреждение, badge нотификаций, warning-уведомление.
- **Красный** = валидация формы, danger-бэйдж надёжности, удаление навсегда, hard-delete admin.

Никогда не использовать зелёный для отмены или оранжевый для подтверждения.

**Текст на мягкой зелёной подложке** (`bg-lime-soft`): `text-lime-hov` (тёмно-зелёный) — читаем; яркий `text-lime` на ней теряется. Применяется в ChipMarquee solid lime, capacity-pill, бейджах positive-тона, specialty-чипах.

**Алиасы для обратной совместимости**: `--ui-canvas → bg`, `--ui-panel → card`, `--ui-panel-strong → card-2`, `--ui-accent → lime`, `--ui-warning → orange`, `--ui-danger → red`. Код на старых именах (`bg-canvas`, `text-accent`, ...) получает значения светлой палитры через `var()`.

**Контраст-плашки**: hero на главной и Header — `bg-plate`, текст `text-plate-ink`, приглушённый `text-plate-muted`, обводки `border-plate-line`. Сырых hex в JSX нет вовсе — сторож `no-raw-colors`.

**Hero карточек выдачи**: ClubCard / TrainerCard / Leader Strip 01/02 имеют hero-зону на `bg-card-2` на белом body карточки — медиа-зона серенькая с диагональным mint/orange-лучом и штриховкой 135°, контент-зона ниже остаётся белой. Avatar-disc/инициалы внутри mist hero — `bg-card` (white) для контраста.

## Типографика

Два шрифта (фаза 38), подключаются через `next/font` в `apps/web/src/app/layout.tsx`; стеки собираются в `globals.css`:

| CSS-переменная | Шрифт | Назначение |
|---------------|-------|-----------|
| `--ui-font-display` | **Sofia Sans Extra Condensed** (вариативный, кириллица) — первым в стеке рублёвый глиф из Barlow Condensed | H1–H3, hero, названия карточек, цены, время, кнопки, бейджи |
| `--ui-font-body` | **Inter** (вариативный, кириллица) | текст, подписи, формы |

Своего моно-шрифта нет: `.font-mono` / `.t-mono` — системный моно-стек.

**Шкала заголовков — токены** `--ui-scale-display` (1.069) и веса `--ui-weight-heading` / `--ui-weight-hero` в `globals.css`; классы `.t-display`, `.t-h1`, `.t-h2`, `.t-h3` читают их. Базовое правило: любые `h1`–`h3` получают display-шрифт и вес заголовка — не переопределять на `font-body`.

**Готовые типографические классы** в `globals.css`: `.t-display`, `.t-h1`, `.t-h2`, `.t-h3`, `.t-h4`, `.t-body`, `.t-small`, `.t-eyebrow`, `.t-mono`, `.t-num` (с tabular-nums).

⚠️ **Рубль `₽`.** У Sofia его нет — подставляется по `unicode-range` из четырёх файлов `apps/web/src/fonts/barlow-ruble-*.woff2` (сторож `ruble-glyph`); в цене ничего делать не нужно, знак просто пишется в тексте.

**UPPERCASE-зоны** (обязательно): H1-H3 на секциях, label кнопок, навигация, бэйджи, заголовки внутри карточек, tabs, chips, фильтры, eyebrow-метки.

**Mixed case-зоны** (обязательно): имена, названия клубов, города, описания, отзывы, био, body-параграфы, toast-сообщения, form labels и placeholders, tooltips.

Цены и счётчики — всегда `font-variant-numeric: tabular-nums`.

## Брейкпоинты (mobile-first)

Кастомные значения SportHub в `globals.css` через `@theme inline`:

| Имя | Ширина | Назначение |
|-----|--------|-----------|
| `sm` | 480px | Большие телефоны (перекрыт с дефолтных 640) |
| `md` | 768px | Планшеты (дефолт Tailwind) |
| `lg` | 1024px | Ноутбуки (дефолт Tailwind) |
| `xl` | 1280px | Десктопы (дефолт Tailwind) |
| `xxl` | 1440px | Большие десктопы (новый, потолок главного контейнера) |
| `2k` | 1920px | FullHD+ (новый, симметричные пустые поля выше) |

**Контейнер главной, Header, детальных страниц клуба и тренера, админки**: `max-w-[1440px]`. До 1440 контент тянется по ширине, выше — симметричные поля.
**Кабинеты и плашка работы от чужого лица**: `max-w-7xl` (1280).

## Компоненты

Точные значения (padding, font-size, hex, border, animations) — в `claude-design/sporthub/project/SportHub UI Kit.html`.
В этом скилле фиксируем только правила, которые НЕ должны меняться между iterations.

**Кнопки.** 3 размера (sm/md/lg) + icon-only 44×44. 4 варианта:
- **Primary outline** (90% случаев) — bg-bg, border-lime, hover bg-lime + color-bg.
- **Primary solid** (1 на странице — главный CTA) — bg-lime, hover translateY(-1px). Solid — единственный случай transform на ховере.
- **Warning** (cancel/reject) — bg-bg, border-orange, hover bg-orange.
- **Ghost** (фильтры, второстепенное) — transparent, border-line, hover border-lime.

Радиус кнопок — **`rounded-button` (12px, как в макете; решение заказчика, 38.14a)**, не pill. Hover меняет border/bg/color без подъёма (кроме solid: `-translate-y-px` и тень `shadow-floating`); solid-primary — единственная кнопка со свечением `shadow-glow`. Disabled: `opacity: 0.4; pointer-events: none`. UPPERCASE label display-шрифтом.

**Карточки.** `rounded-[18px]` + 1px line-border + bg-card. Hover: `border-color: lime` без подъёма. Без теней по умолчанию.

**Модалки.** `rounded-[24px]` + 1px line-border + bg-card. Единственное место, где разрешена тень `0 24px 48px rgba(0,0,0,0.6)` (через `--ui-shadow-floating`). Display-шрифт UPPERCASE для заголовка, Inter для body.

**Бэйджи / chips.** `rounded-full`, UPPERCASE. 3 семантических варианта:
- `b-accent` — bg lime-soft + color lime (positive-метка).
- `b-orange` — bg orange-soft + color orange (warning-метка).
- `b-outline` — transparent + ink + line border (нейтральная).

**Strip-badge** (на hero) — body 700 11px letter-spacing 0.14em.
**Status-badge** (статусы записи) — body 500/700 12px.
**Sport-chip** (rail видов спорта) — с инициалом-иконкой 22×22 lime-soft.
**Filter-chip** (фильтры каталога) — active = bg lime + color ink (тёмный текст на зелёной плашке для AA-контраста; на `lime-soft` — `text-lime-hov`).

**Header parts.** Сам `<header>` — `bg-plate` + `text-plate-ink`. Логотип — `ui/BrandLogo` (два бегуна-SVG + словомарка из `BRAND_WORDMARK`, `tone="plate"`). Pill-навигация body 700 UPPERCASE на `bg-plate-ink/5`. NotificationBell 44×44 outline pill с orange-badge. Аватар 44×44 outline pill display-шрифтом. User-info: name body 500 13px + role body 700 9px UPPERCASE letter-spacing 0.16em `text-lime`.

**Hero billboard.** rounded-[24-28px] + `bg-plate` + декор `--ui-decor-plate-glow` через `::before`. На lg+ — overlapping FocusCard (`bg-card`) справа сверху. Внутри hero дефолтный текст — `text-plate-ink`, приглушённый — `text-plate-muted`, CTA primary solid (`bg-lime text-ink`).

**Mobile dock** (нижний навигатор). Виден только на 480-, скрыт на md+. Активный пункт через `usePathname()` подсвечивается lime.

**Карточка в выдаче** (клуб/тренер на главной). Hero-зона сверху с tone-ротацией по индексу (lime → orange → blank → ...) + watermark номера ранга `(index+1).padStart(2,'0')` display-шрифтом крупным opacity ~0.06. Body-зона ниже с фиксированной grid-сеткой строк (одинаковая высота карточек в слайдере). Внутри карточки `<Link>` оборачивает только name и CTA — никогда не оборачиваем `<article>` целиком, иначе nested anchors при наличии других ссылок.

**ChipMarquee** — конструктивный приём для длинных горизонтальных списков (теги клуба, удобства, специализации тренера). rAF-скролл с pause-on-hover и pointer-drag scrub. При overflow ≤ ширины контейнера — fallback `no-loop` (статичный список без анимации). Применяется когда контента может быть много и неизвестна ширина. Solid-вариант (lime/orange) для primary-метки, outline — для нейтральных списков.

**CardSlider** — способ подачи списка карточек на главной (выдача под фильтр, секции «популярное рядом», slot-блоки availability). Структура: eyebrow + title + (pill-счётчик «N в выдаче» **или** кастомный `tools` блок) + стрелки prev/next + dots-индикаторы. Адаптив 1↔2 видимых карточек по умолчанию через matchMedia на 1024px; опц. prop `visibleByBp={sm?,md?,xl?}` расширяет до тернарного 1↔2↔3 через два mediaQuery'я (768/1280). Опц. prop `tools` (кастомный блок справа от title) — при его передаче header автоматически перестраивается из одно-строки на lg+ в три ряда (eyebrow+стрелки / title / tools-без-стрелок) на `<lg`. Передаёт `index` в каждую карточку — это даёт watermark номера и tone-ротацию hero-зоны. Drag/swipe мышью и пальцем работает на любом CardSlider'е автоматически: pointer-handlers с `setPointerCapture`, порог переключения 25% ширины слайда, edge-resistance × 0.35 на крайних, click-suppress если |dx|>6 (drag не превращается в навигацию `<Link>`/CTA внутри). Игнорятся pointer-down на стрелки/dots/`a/button/[role="button"]` — кликабельные элементы внутри карточки сохраняют поведение.

**Slot-card** — общая карточка слота для блоков availability на главной (`SlotCard` в `apps/web/src/components/ui/`). Структура grid из 3 рядов: hero (eyebrow + capacity-pill, name display line-clamp-2, sport body muted line-clamp-1, watermark номера, диагональный lime/orange-луч + штриховка через `::before`) → boxes (Время / Стоимость, цифры display-шрифтом + `tabular-nums` + `white-space: nowrap` + `font-size: clamp(13px, 6cqw, 17px)` + `container-type: inline-size` — никогда не уходят в 2 строки даже при «20 000 ₽» / «19:50 – 20:40») → footer (площадка + опц. комната + CTA «К записи» с `aria-label`). Capacity-pill **всегда лайм** (без orange/red вариантов), склонение «1 место / 2-4 места / 5+ мест». Tone-ротация по `index%3` (lime/orange/blank) — единый паттерн с ClubCard/TrainerCard. `<article>` НЕ оборачивается в `<Link>`/<button> — кликабельна только CTA-кнопка через `onSelect`-callback (auth-guard живёт уровнем выше). Контракт нейтральный (`{eyebrow, name, sport, availableSpots, startTime, endTime, price, venueLabel, room?, index, slotId, onSelect, ctaAriaName}`) — переиспользуется через локальные mapper'ы (`mapTrainerToSlot` в `TrainerAvailability`, `mapSessionToSlot` в `ClubAvailability`).

## Семантический HTML

- Семантические теги: `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<aside>`, `<footer>`.
- Интерактивные элементы: `<button>` или `<a>`, не `<div>` с `onClick`.
- Изображения: всегда `alt`, использовать `next/image`.

## Адаптация под mobile

- Все hover-эффекты заменяются на `:active` + `:focus-visible` для клавиатуры.
- На 480- основная нав скрыта, появляется `MobileNav` (bottom-fixed dock).
- Hero `clamp(36px, 8vw, 84px)` автоматически скейлится.
- Карточки в один столбец на mobile, бэйджи переносятся.
- Кнопки full-width в столбик на 480, в строку с 480+.
- На grid/flex children обязательно `min-w-0` чтобы текст display-шрифтом не растягивал колонку.
- На root-контейнере страницы — `overflow-x-hidden` для защиты от случайного horizontal scroll.

## Запреты (никогда)

- Purple/blue gradient mesh.
- Glass-morphism, frosted-glass.
- Длинные тени на каждом блоке (`shadow-2xl` везде).
- Декор поверх данных, снижающий читаемость.
- Эмодзи как украшения (только если есть в data — например, иконка вида спорта).
- `rounded-md` / `rounded-lg` / `rounded-full` для кнопок (только `rounded-button` = 12px).
- `rounded-sm` для карточек.
- `transform scale-*` на ховере (translateY(-1px) разрешён только на solid-primary).
- Hex-коды, `rgba(`, `-white`/`-black`, оттенки Tailwind (`text-red-500`) в JSX и CSS — сторож `no-raw-colors`, исключений нет: звёзды — `text-gold`, плашки — `bg-plate`.
- Инлайновые `style` — сторож `no-inline-style`; допустимы только динамические значения из данных, парами «файл + свойство».
- Яркий `text-lime` / `text-accent` на светлом фоне — только `text-lime-hov` / `text-accent-strong`; `opacity-*` на тексте внутри `bg-lime` / `bg-plate`.
- Mixed case в кнопках, бэйджах, навигации.
- Тени на дефолтных карточках.

## Чек-лист перед коммитом UI-компонента

- [ ] Используются `var(--ui-*)` CSS-переменные или Tailwind токены, не hex напрямую.
- [ ] Кнопки `rounded-button` (12px), не `rounded-full` и не `rounded-md/lg`.
- [ ] Карточки `rounded-[18px]` или `rounded-2xl/3xl`.
- [ ] Семантика lime/orange/red соблюдена (positive vs warning vs danger).
- [ ] Заголовки и кнопки UPPERCASE, body — mixed case.
- [ ] Заголовки, цены, время — display-шрифт (Sofia Sans Extra Condensed, `font-display`/`.t-*`), текст — Inter; рубль подставляется из донора автоматически.
- [ ] Hover-стейт меняет border/bg/color, не подъём (transform только на solid-primary с -1px).
- [ ] Mobile-first: базовые стили без префикса = мобильные.
- [ ] Семантический HTML (`<button>`, `<a>`, `<section>` на местах).
- [ ] Border 2px на кнопках/аватарах/bell, 1px на карточках.
- [ ] tabular-nums на цифрах (цены, счётчики, рейтинги).
- [ ] Тени только на модалках, dropdown, popover.
- [ ] На grid/flex детях `min-w-0` если внутри есть текст display-шрифтом (без него колонка растягивается под word-content).
- [ ] Адаптив проверен в DevTools на 6 брейкпоинтах (480/768/1024/1280/1440/1920) — нет horizontal scroll, элементы не накладываются.

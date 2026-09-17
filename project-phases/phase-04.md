# Phase 04

> Этот файл содержит одну фазу проекта целиком. Главный вход в контекст — `CLAUDE.md`, навигация по фазам — через `PHASES_OVERVIEW.md`.
> В ежедневной работе открывай прежде всего активную фазу и не перечитывай все phase-файлы подряд без необходимости.
> Структура фазы сохраняется в исходном стиле: заголовок фазы, краткий результат, шаги по порядку, затем чеклист и статус.
> Перед стартом новой фазы проверь, что для неё уже есть отдельный `phase-XX.md`, и после завершения шагов или фазы синхронизируй статус здесь, в `PHASES_OVERVIEW.md`, `CLAUDE.md`, `README.md` и при необходимости в `STACK_OVERVIEW.md`.

## Phase 4: Базовые UI-компоненты

> После этой фазы: библиотека переиспользуемых компонентов готова, визуальный стиль определён.

### Step 4.1: Определить дизайн-токены

- **Действие:** Настроить цвета, шрифты, скругления, тени в `globals.css` через `@theme` (Tailwind 4). Основные цвета бренда, акцентный цвет, серая шкала, цвета состояний (success, error, warning).
- **Проверка:** Визуально — цвета применяются
- **Ожидаемый результат:** Единообразная визуальная система

**Реализация:**

- **Файлы:**
  - `src/app/globals.css` (83 строки) — `@theme inline` блок с CSS-переменными
- **Ключевые токены:**
  - Шрифты: `--ui-font-display` (Avenir Next, SF Pro Display), `--ui-font-body` (Avenir Next, SF Pro Text), `--ui-font-mono` (SF Mono, JetBrains Mono)
  - Цвета бренда: `--ui-accent` (#d85a32 — оранжевый), `--ui-teal` (#0c6f73)
  - Фоны: `--ui-canvas` (#f4ead7), `--ui-panel` (#fff7eb), `--ui-panel-strong`
  - Текст: `--ui-ink` (#15232a), `--ui-muted` (#61717a)
  - Состояния: `--ui-success` (#1e7b56), `--ui-warning` (#cb8b24), `--ui-danger` (#b34536)
  - Модификаторы: `--ui-accent-strong`, `--ui-accent-soft`, `--ui-line`
  - Скругления: `--ui-radius-card` (30px), `--ui-radius-pill` (999px)
  - Тени: `--ui-shadow-card`, `--ui-shadow-floating`
- **Паттерны:** Tailwind 4 `@theme inline` — токены автоматически становятся Tailwind-утилитами (`bg-ui-canvas`, `text-ui-accent`, `rounded-ui-radius-card` и т.д.); gradient body background; custom selection styling
- **Кто использует:** все компоненты проекта через Tailwind-классы

### Step 4.2: Создать базовые UI-компоненты

- **Действие:** Создать в `src/components/ui/`:
  - Button — варианты (primary, secondary, outline, ghost), размеры (sm, md, lg), loading
  - Card — контейнер с тенью и скруглениями
  - Input — текстовое поле с label, error state, иконкой
  - Modal — модальное окно с оверлеем, закрытие по Escape и клику вне
  - Badge — метка/тег для категорий
  - Rating — звёзды (чтение + интерактивный режим)
  - Skeleton — загрузчик для карточек
  - Chip — кнопка-фильтр (active/inactive)
- **Проверка:** `npm run build` без ошибок
- **Ожидаемый результат:** Готовая библиотека UI-компонентов

**Реализация:**

- **Файлы:**
  - `src/components/ui/index.ts` — реэкспорт всех UI-компонентов
  - `src/components/ui/Button.tsx` (89 строк) — Client Component
  - `src/components/ui/Card.tsx` (16 строк) — Server Component
  - `src/components/ui/Input.tsx` (66 строк) — Client Component
  - `src/components/ui/Modal.tsx` (101 строка) — Client Component
  - `src/components/ui/Badge.tsx` (33 строки) — Server Component
  - `src/components/ui/Rating.tsx` (94 строки) — Client Component
  - `src/components/ui/Skeleton.tsx` (22 строки) — Server Component
  - `src/components/ui/Chip.tsx` (32 строки) — Client Component
- **Ключевые экспорты:**
  - `Button` — пропсы: variant (primary/secondary/outline/ghost), size (sm/md/lg), loading, leadingIcon, trailingIcon, fullWidth
  - `Card` — пропсы: elevated (boolean); простой контейнер с border + rounded + padding
  - `Input` — пропсы: label, error, icon; focus ring, отображение ошибки
  - `Modal` — пропсы: open, onClose, title, description, footer, children; закрытие по Escape и overlay; слоты title/description/footer
  - `Badge` — пропсы: tone (neutral/accent/teal/success/warning/danger/outline); inline span
  - `Rating` — пропсы: value, max, interactive, onChange, disabled; clickable звёзды + display mode; русские aria-labels
  - `Skeleton` — пропсы: rounded (card/pill); pulse-анимация
  - `Chip` — пропсы: active (boolean); toggle-кнопка с active state
- **Паттерны:** `'use client'` только для интерактивных компонентов (Button, Input, Modal, Rating, Chip); Server Components для статичных (Card, Badge, Skeleton); все пропсы типизированы через interface + extends
- **Кто использует:**
  - `Button` → Header, AuthModal, PopularNearby, SearchBar, MapPreviewSection, TrainerCard, ClubDetailPageClient, AthleteFeedbackSettingsSection (5+ компонентов)
  - `Card` → ClubCard, ClubDetailPageClient, PopularNearby, MapPreviewSection, page.tsx
  - `Input` → AuthModal, SearchBar
  - `Modal` → AuthModal (единственный потребитель)
  - `Badge` → ClubCard, TrainerCard, ClubDetailPageClient, PopularNearby, MapPreviewSection, UpcomingSessions, booking page
  - `Rating` → ClubCard, TrainerCard, ClubDetailPageClient
  - `Chip` → AuthModal (табы, выбор типа аккаунта), SportFilters, SearchControlsPreview (discovery mode)
  - `Skeleton` → (зарезервирован для loading states)
- **Зависит от:** `src/app/globals.css` — дизайн-токены через Tailwind-классы

### Phase 4 — Чеклист

- [x] Дизайн-токены определены через `@theme`
- [x] Все UI-компоненты созданы и типизированы
- [x] Modal закрывается по Escape и клику вне
- [x] Rating работает в обоих режимах
- [x] `npm run build` без ошибок

---


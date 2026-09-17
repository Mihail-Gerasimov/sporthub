# Phase 01

> Этот файл содержит одну фазу проекта целиком. Главный вход в контекст — `CLAUDE.md`, навигация по фазам — через `PHASES_OVERVIEW.md`.
> В ежедневной работе открывай прежде всего активную фазу и не перечитывай все phase-файлы подряд без необходимости.
> Структура фазы сохраняется в исходном стиле: заголовок фазы, краткий результат, шаги по порядку, затем чеклист и статус.
> Перед стартом новой фазы проверь, что для неё уже есть отдельный `phase-XX.md`, и после завершения шагов или фазы синхронизируй статус здесь, в `PHASES_OVERVIEW.md`, `CLAUDE.md`, `README.md` и при необходимости в `STACK_OVERVIEW.md`.

## Phase 1: Инициализация проекта и инфраструктура

> После этой фазы: проект создан, зависимости установлены, dev-сервер запускается, структура папок готова к работе.

### Step 1.1: Создать проект через create-next-app

- **Действие:** Сгенерировать Next.js-проект **в корне текущего репозитория**, чтобы документация и код жили в одной структуре. Базовый вариант: `npx create-next-app@latest .`. На промптах выбрать: TypeScript — Yes, ESLint — Yes, Tailwind CSS — Yes, `src/` directory — Yes, App Router — Yes, Turbopack — Yes, import alias — `@/*` (по умолчанию). Если корень уже содержит проектные документы и `create-next-app` отказывается инициализироваться в непустой директории, допустимо сначала сгенерировать шаблон во временную папку, затем перенести файлы проекта в корень репозитория без затрагивания `.git`.
- **Проверка:** В корне репозитория выполнить `npm run dev` → открыть `http://localhost:3000` — стартовая страница Next.js
- **Ожидаемый результат:** Проект запускается без ошибок, в браузере отображается дефолтная страница, все файлы Next.js лежат в корне репозитория

**Реализация:**

- **Файлы:**
  - `package.json` (37 строк) — манифест проекта, scripts, зависимости
  - `tsconfig.json` (34 строки) — strict: true, jsx: react-jsx, paths: `@/*` → `./src/*`
  - `next.config.ts` (8 строк) — минимальный конфиг Next.js 16
  - `src/app/layout.tsx` (22 строки) — корневой Server Component, metadata, AppShell-обёртка
  - `src/app/page.tsx` — точка входа главной страницы
  - `scripts/run-next.mjs` — обёртка запуска Next.js, фиксит определение корня проекта при копировании репозитория
- **Ключевые экспорты:**
  - `metadata: Metadata` (layout.tsx) — title «SportHub», description
  - `RootLayout` (layout.tsx) — корневой layout, оборачивает `children` в `AppShell`
- **Паттерны:** create-next-app в корень существующего репо; App Router; `scripts/run-next.mjs` как единая точка запуска dev/build/start
- **Зависит от:** Next.js 16.1.7, React 19.2.3, TypeScript 5.x

### Step 1.2: Проверить и зафиксировать версии зависимостей

- **Действие:** Открыть `package.json`, проверить версии next, react, react-dom, tailwindcss, typescript. Обновить STACK_OVERVIEW.md фактическими версиями если отличаются от запланированных.
- **Проверка:** Версии в STACK_OVERVIEW.md совпадают с `package.json`
- **Ожидаемый результат:** Документация отражает реальность

**Реализация:**

- **Файлы:**
  - `package.json` — фактические версии: next@16.1.7, react@19.2.3, react-dom@19.2.3, typescript@5, tailwindcss@4
  - `STACK_OVERVIEW.md` — обновлён фактическими версиями
- **Паттерны:** версии фиксируются в документации сразу после установки

### Step 1.3: Установить дополнительные зависимости

- **Действие:** Установить пакеты, которые не входят в create-next-app:
  - `npm install zustand` — стейт-менеджер
  - `npm install zod` — валидация данных
  - `npm install --save-dev prettier` — форматирование кода
- **Проверка:** `npm ls zustand zod prettier` — все три пакета в дереве зависимостей
- **Ожидаемый результат:** Пакеты установлены, `package.json` обновлён

**Реализация:**

- **Файлы:**
  - `package.json` — добавлены: zustand@5.0.12 (dependencies), zod@4.3.6 (dependencies), prettier@3.8.1 (devDependencies)
- **Паттерны:** zustand — клиентский стейт; zod — валидация API-запросов; prettier — единообразное форматирование

### Step 1.4: Настроить Prettier

- **Действие:** Создать `.prettierrc` в корне проекта с базовыми правилами (semi, singleQuote, tabWidth, trailingComma, printWidth). Добавить скрипт `"format": "prettier --write ."` в `package.json`.
- **Проверка:** `npm run format` — форматирует файлы без ошибок
- **Ожидаемый результат:** Код отформатирован единообразно

**Реализация:**

- **Файлы:**
  - `.prettierrc` (7 строк) — semi: true, singleQuote: true, tabWidth: 2, trailingComma: all, printWidth: 100
  - `package.json` — скрипт `"format": "prettier --write ."`
- **Кто использует:** `npm run format` — ручной запуск; верификация каждого шага

### Step 1.5: Создать структуру папок

- **Действие:** Внутри `src/` создать папки под архитектуру проекта:
  - `components/ui/` — базовые UI-компоненты
  - `components/clubs/` — компоненты клубов
  - `components/trainers/` — компоненты тренеров
  - `components/schedule/` — компоненты расписания
  - `components/booking/` — компоненты записи
  - `components/reviews/` — компоненты отзывов
  - `components/search/` — поиск и фильтры
  - `components/map/` — карта
  - `components/layout/` — Header, Footer, MobileNav
  - `components/auth/` — модалка авторизации
  - `lib/` — утилиты, абстракция БД, константы
  - `types/` — TypeScript типы и интерфейсы
  - `stores/` — Zustand сторы
  - `data/` — JSON-файлы (БД на MVP)
- **Проверка:** Структура соответствует плану
- **Ожидаемый результат:** Все папки созданы

**Реализация:**

- **Файлы (созданные директории):**
  - `src/components/ui/` — базовые UI-компоненты (Button, Card, Input, Modal, Badge, Rating, Skeleton, Chip)
  - `src/components/clubs/` — ClubCard, ClubList, ClubDetailPageClient, PopularNearby, filterClubs
  - `src/components/trainers/` — TrainerCard, TrainerList, PopularTrainers, TrainerMapView, TrainerAvailability, trainer-preview, filterTrainers
  - `src/components/schedule/` — UpcomingSessions, getUpcomingSessions
  - `src/components/booking/` — (зарезервировано)
  - `src/components/reviews/` — (зарезервировано)
  - `src/components/search/` — SearchBar, SportFilters, SearchControlsPreview
  - `src/components/map/` — MapView, MapPreviewSection
  - `src/components/layout/` — AppShell, Header, Footer, MobileNav
  - `src/components/auth/` — AuthModal
  - `src/components/profile/` — AthleteProfilePage и секции кабинета
  - `src/lib/` — db.ts, utils.ts, constants.ts, projectPaths.ts
  - `src/types/` — index.ts (все интерфейсы и типы)
  - `src/stores/` — useAuthStore, useFilterStore, useUIStore
  - `src/data/` — JSON-файлы (sports, clubs, trainers, offerings, schedule, bookings, reviews, users)
- **Паттерны:** модульная структура — каждый домен в отдельной папке components/*

### Step 1.6: Очистить дефолтный контент

- **Действие:** Очистить `src/app/page.tsx` от стартового шаблона Next.js — оставить минимальный компонент-заглушку. Очистить `src/app/globals.css` — оставить только Tailwind-импорт (`@import "tailwindcss"`) и базовые CSS-переменные для темы.
- **Проверка:** `npm run dev` → на главной пустая страница или текст-заглушка, без ошибок
- **Ожидаемый результат:** Чистый проект без дефолтного контента Next.js

**Реализация:**

- **Файлы:**
  - `src/app/page.tsx` — очищен от шаблона Next.js, минимальный компонент-заглушка
  - `src/app/globals.css` (83 строки) — оставлен `@import 'tailwindcss'`, добавлены CSS-переменные через `@theme inline`:
    - Шрифты: `--ui-font-display` (Avenir Next, SF Pro Display), `--ui-font-body`, `--ui-font-mono`
    - Цвета: `--ui-canvas` (#f4ead7), `--ui-panel` (#fff7eb), `--ui-ink` (#15232a), `--ui-accent` (#d85a32), `--ui-teal` (#0c6f73), `--ui-success`, `--ui-warning`, `--ui-danger`, `--ui-muted`, `--ui-line`
    - Размеры: `--ui-radius-card` (30px), `--ui-radius-pill` (999px)
    - Тени: `--ui-shadow-card`, `--ui-shadow-floating`
  - Глобальные стили: градиентный фон, стилизация selection, scrollbar-утилиты
- **Кто использует:** Tailwind 4 подхватывает `@theme` токены как утилиты; все компоненты используют `bg-ui-canvas`, `text-ui-ink`, `rounded-ui-radius-card` и т.д.

### Step 1.7: Настроить Git-репозиторий

- **Действие:** Проверить `.gitignore` (`node_modules`, `.next`, `.env.local` должны игнорироваться). Убедиться, что история Git ведётся по шагам проекта и каждый завершённый шаг зафиксирован отдельным коммитом.
- **Проверка:** `git log --oneline` — в истории есть отдельные коммиты по шагам Phase 1
- **Ожидаемый результат:** Репозиторий настроен корректно, история шагов зафиксирована и готова к дальнейшей работе

**Реализация:**

- **Файлы:**
  - `.gitignore` — node_modules, .next, .env.local, build-артефакты
  - `eslint.config.mjs` (18 строк) — ESLint 9 flat config: `nextVitals` + `nextTs` + `globalIgnores`
- **Паттерны:** каждый завершённый шаг = отдельный коммит; формат: `тип(модуль): Step X.Y — описание`

### Phase 1 — Чеклист

- [x] `npm run dev` запускает dev-сервер без ошибок
- [x] `http://localhost:3000` открывается
- [x] zustand, zod, prettier установлены
- [x] `npm run format` работает
- [x] Структура папок `src/` создана
- [x] Дефолтный контент очищен
- [x] Git — история шагов Phase 1 зафиксирована коммитами
- [x] STACK_OVERVIEW.md обновлён фактическими версиями

---


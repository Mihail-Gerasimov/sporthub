# SportHub

Маркетплейс спортивных услуг — объединяет клубы, секции, студии и тренеров города в единой экосистеме. Полный цикл для пользователя: поиск → выбор → запись → оплата → отзыв.

## Стек

- **Фреймворк:** Next.js 16.1.7 (App Router) — монолит: фронт + API
- **Язык:** TypeScript 5.9.3
- **UI:** React 19.2.3 + Tailwind CSS 4.2.1
- **Стейт:** Zustand 5.0.12
- **БД (MVP):** JSON-файлы через абстракцию `lib/db.ts`
- **Валидация:** Zod 4.3.6
- **Auth (MVP):** Заглушка (Zustand + localStorage)
- **Качество кода:** ESLint 9 + Prettier 3.8.1 + Vitest

## Требования

- Node.js 20.9+
- npm
- Git

## Быстрый старт

```bash
# 1. Клонировать репозиторий
git clone <repo-url>
cd <repository-folder>

# 2. Установить зависимости
npm install

# 3. Запустить dev-сервер
npm run dev
```

Открыть http://localhost:3000

## Команды

| Команда              | Описание                           |
| -------------------- | ---------------------------------- |
| `npm run dev`        | Dev-сервер (http://localhost:3000) |
| `npm run build`      | Production-сборка                  |
| `npm run start`      | Запуск production-сборки           |
| `npm run lint`       | Линтер (ESLint)                    |
| `npm run format`     | Форматирование (Prettier)          |
| `npm run test`       | Одноразовый прогон тестов          |
| `npm run test:watch` | Vitest в watch-режиме              |

## Структура проекта

```text
./
├── public/                      # Статика Next.js
├── src/
│   ├── app/                     # App Router, страницы, layout и API routes
│   │   └── api/
│   │       ├── bookings/
│   │       ├── clubs/
│   │       ├── reviews/
│   │       ├── schedule/
│   │       ├── sports/
│   │       └── trainers/
│   ├── components/
│   │   ├── auth/
│   │   ├── booking/
│   │   ├── clubs/              # ClubCard и ClubList для выдачи по фильтрам
│   │   ├── layout/             # Header, Footer, MobileNav, AppShell
│   │   ├── map/                # MapView и preview секция карты-заглушки
│   │   ├── reviews/
│   │   ├── schedule/
│   │   ├── search/             # SearchBar, filters и preview секция поиска
│   │   ├── trainers/
│   │   └── ui/                 # Базовые UI-компоненты и витрина библиотеки
│   ├── data/                    # JSON-файлы MVP-базы
│   │   ├── bookings.json
│   │   ├── clubs.json
│   │   ├── reviews.json
│   │   ├── schedule.json
│   │   ├── sports.json
│   │   ├── trainers.json
│   │   └── users.json
│   ├── lib/                     # Утилиты и абстракции
│   │   ├── constants.ts
│   │   ├── db.ts
│   │   └── utils.ts
│   ├── stores/                  # Zustand-сторы фильтров и UI
│   ├── test/                    # Vitest, smoke tests, test setup
│   └── types/
│       └── index.ts             # TypeScript-типы сущностей
├── .prettierrc
├── eslint.config.mjs
├── IMPLEMENTATION_PLAN.md       # План реализации
├── CODEX.md                     # Memory проекта
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── README.md                    # Текущая документация проекта
├── STACK_OVERVIEW.md            # Стек и технологические решения
└── tsconfig.json
```

## Прогресс реализации

| Фаза | Название                   | Статус |
| ---- | -------------------------- | ------ |
| 1    | Инициализация проекта      | ✅     |
| 2    | Типы данных и моковая база | ✅     |
| 3    | API Routes                 | ✅     |
| 4    | Базовые UI-компоненты      | ✅     |
| 5    | Главная страница           | 🔄     |
| 6    | Auth-заглушка              | ⬜     |
| 7    | Страница клуба             | ⬜     |
| 8    | Флоу записи на занятие     | ⬜     |
| 9    | Личный кабинет             | ⬜     |

## Документация

- [Стек и технологические решения](./STACK_OVERVIEW.md)
- [План реализации](./IMPLEMENTATION_PLAN.md)

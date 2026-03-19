# SportHub

Маркетплейс спортивных услуг — объединяет клубы, секции, студии и тренеров города в единой экосистеме. Полный цикл для пользователя: поиск → выбор → запись → оплата → отзыв.

## Стек

- **Фреймворк:** Next.js 16.1.7 (App Router) — монолит: фронт + API
- **Язык:** TypeScript 5.9.3
- **UI:** React 19.2.3 + Tailwind CSS 4.2.1
- **Стейт:** Zustand 5.0.12
- **БД (MVP):** JSON-файлы через абстракцию `lib/db.ts`
- **Валидация:** Zod 4.3.6
- **Auth (MVP):** Auth-модалка на Zustand + localStorage (`provider` / `athlete`)
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
│   │   ├── booking/
│   │   ├── clubs/
│   │   ├── profile/
│   │   └── api/
│   │       ├── bookings/
│   │       ├── clubs/
│   │       ├── reviews/
│   │       ├── schedule/
│   │       ├── sports/
│   │       └── trainers/
│   ├── components/
│   │   ├── auth/               # AuthModal, вход и регистрация
│   │   ├── booking/
│   │   ├── clubs/              # ClubCard, ClubList, PopularNearby и страница клуба
│   │   ├── layout/             # Header, Footer, MobileNav, AppShell
│   │   ├── map/                # MapView и адаптивная основная зона карты/списка
│   │   ├── profile/            # Кабинет спортсмена и его секции
│   │   ├── reviews/
│   │   ├── schedule/           # UpcomingSessions и helper выборки занятий на сегодня
│   │   ├── search/             # SearchBar, filters и preview секция поиска
│   │   ├── trainers/
│   │   └── ui/                 # Базовые UI-компоненты и витрина библиотеки
│   ├── data/                    # JSON-файлы MVP-базы
│   │   ├── bookings.json
│   │   ├── clubs.json
│   │   ├── offerings.json
│   │   ├── reviews.json
│   │   ├── schedule.json
│   │   ├── sports.json
│   │   ├── trainers.json
│   │   └── users.json
│   ├── lib/                     # Утилиты и абстракции
│   │   ├── constants.ts
│   │   ├── db.ts
│   │   └── utils.ts
│   ├── stores/                  # Zustand-сторы фильтров, UI и auth
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
| 5    | Главная страница           | ✅     |
| 6    | Auth-заглушка              | ✅     |
| 7    | Личный кабинет спортсмена  | ✅     |
| 8    | Архитектурное разделение каталогов клубов и тренеров | ✅ |
| 9    | Главная страница и каталог тренеров | ✅ |
| 10   | Личный кабинет             | ⬜     |

## Что Уже Работает

- Главная страница `/` с dual discovery `clubs | trainers`, переключателем режима, фильтрами, fake-картой, подборками и блоком доступных слотов
- REST API в `app/api/*` для `sports`, `clubs`, `trainers`, `schedule`, `bookings`, `reviews`
- MVP data layer уже разделяет профили тренеров, offerings и schedule-слоты через `src/data/*.json` и `lib/db.ts`
- API уже поддерживает `ownerType`-ориентированное расписание, trainer offerings и нейтральный booking contract через `scheduleId`
- Auth-модалка `Вход / Регистрация` с выбором типа аккаунта
- Публичная страница клуба `/clubs/[id]` с athlete-only действиями `Записаться` и `Оставить отзыв`
- Общая slot-based страница записи `/booking/[scheduleId]` для club и trainer услуг
- На главной в режиме `trainers` уже есть отдельные карточки тренеров, блок `Популярные тренеры` и `Свободные окна тренеров`
- Личный кабинет спортсмена `/profile/athlete` со сводкой, записями, ачивками, историей, избранным и отзывами

## Документация

- [Стек и технологические решения](./STACK_OVERVIEW.md)
- [План реализации](./IMPLEMENTATION_PLAN.md)

# SportHub — Снимок проекта

> Технический инвентарь: что сейчас есть в проекте. Обновляется перезаписью после каждой фазы.

## Устройство

Проект — монорепозиторий из двух приложений. `apps/web` (Next.js 16, App Router) отдаёт страницы,
`apps/api` (NestJS 11) отвечает за все данные, общий код — в `packages/types`, `packages/domain`,
`packages/fixtures`. Фронт проксирует `/api/*` на бэкенд, поэтому адреса в браузере совпадают
с адресами бэкенда; страницы при отрисовке на сервере ходят туда же через
`apps/web/src/lib/server-api.ts`. Слоя данных внутри `apps/web` нет — чтение файлов
из страниц стережёт `apps/web/src/test/architecture.test.ts`.

Данные лежат только в PostgreSQL 16 и доступны только через репозитории `apps/api`.

Палитра — светлая мятно-синяя: body белый, текст navy `#0A1029`, primary mint `#83D3B5`
(soft default), hover/press-emphasis `#50BC93`, secondary text `#7A8186` (graphite).
Контраст-плашки hero и Header — navy. Карточки выдачи (`ClubCard`/`TrainerCard`) и Leader
Strip 01/02 имеют hero-зону на `bg-card-2` (mist `#D2D8D6`) на белом body карточки: серый
верх с диагональным mint/orange-лучом, белый низ с контентом.
Токены — `--ui-bg`, `--ui-card`, `--ui-lime`, `--ui-orange`, `--ui-red`, `--ui-gold`
плюс алиасы `--ui-canvas/accent/panel/warning/danger`.
См. `STACK_OVERVIEW.md` → «Дизайн-система».

## Дерево проекта

```text
./
├── docker-compose.yml                  # База, бэкенд и фронт в контейнерах (профиль app)
├── docker/                             # Образы (api/web), инициализация базы, порядок выкатки (PRODUCTION.md)
├── load/                               # Нагрузочный замер: k6-сценарии и README
├── scripts/                            # Сид, ожидание базы, ограничения целостности, уборка сессий, чистка тестовых схем
├── contracts/
│   └── contract-snapshot.json          # Эталон ответов API для сверки контрактов
├── tests/                              # Чек-листы ручных прогонов, отчёты, скриншоты, обвязка E2E фазы 34
├── packages/
│   ├── types/src/                      # Типы сущностей и константы, общие для фронта и бэкенда
│   ├── domain/src/                     # Правила без ввода-вывода: FSM записи, надёжность, права ролей,
│   │                                   # политика сессий и восстановления пароля, типы уведомлений, схемы публикации
│   └── fixtures/src/                   # Тестовые данные: используют и фронт, и сверка контрактов
├── apps/
│   ├── api/                            # Бэкенд (NestJS)
│   │   ├── prisma/                     # Схема базы и миграции
│   │   ├── src/
│   │   │   ├── main.ts                 # Точка входа: читает .env, ставит общий префикс /api
│   │   │   ├── configure-app.ts        # Общая настройка — одна и та же у сервера и тестов
│   │   │   ├── app.module.ts
│   │   │   ├── storage/                # Соединение с базой (Prisma), транзакции, сид
│   │   │   ├── repositories/           # 13 интерфейсов и их единственная реализация на Prisma (repositories/prisma)
│   │   │   ├── dictionaries/           # Справочники и их маршруты
│   │   │   ├── common/                 # Доменные ошибки, форма ответа, перехватчик, фильтр ошибок,
│   │   │   │                           # проверка источника, пределы частоты, argon2id и очередь к нему
│   │   │   ├── auth/                   # Сессии, вход, глобальный guard, блокировка перебора, восстановление пароля
│   │   │   ├── mail/                   # Отправитель писем за интерфейсом (заглушка пишет в журнал)
│   │   │   ├── access/                 # AccessService — проверки владения
│   │   │   ├── health/                 # Проверка живости для контейнера
│   │   │   ├── bookings/               # Сервис записей (FSM, места, уведомления) и 8 маршрутов
│   │   │   ├── catalog/                # Клубы, тренеры, услуги, пользователи, выборки каталога
│   │   │   ├── users/                  # Учётные данные и настройки уведомлений пользователя
│   │   │   ├── publications/           # Публикация и правка: до пяти коллекций в одной транзакции
│   │   │   ├── links/                  # Связи тренер↔клуб
│   │   │   ├── schedule/               # Расписание и контекст слота
│   │   │   ├── reviews/ notifications/ notes/ logs/ moderation/ analytics/ admin/ geo/
│   │   │   └── test/                   # Обвязка контроллер-тестов, сверка с эталоном контрактов и сторожа
│   │   └── .env.example                # Порт, строки подключения, размер пула, ключи карт, пределы частоты
│   └── web/                            # Фронт (Next.js)
│       ├── next.config.ts              # Проксирование /api/* на бэкенд и заголовки безопасности (MAP_HOSTS → CSP)
│       ├── eslint.config.mjs · postcss.config.mjs · vitest.config.ts
│       ├── scripts/run-next.mjs        # Wrapper запуска Next с фиксированным корнем
│       ├── public/                     # Статика Next.js
│       └── src/
│           ├── proxy.ts                # Разворот гостя на входе в закрытые разделы (не защита, а экономия)
│           ├── app/
│           │   ├── booking/[scheduleId]/page.tsx
│           │   ├── clubs/[slug]/page.tsx
│           │   ├── trainers/[slug]/page.tsx
│           │   ├── reset-password/page.tsx
│           │   ├── profile/
│           │   │   ├── me/            # Кабинет ЧЕЛОВЕКА — номера в адресе нет и не будет
│           │   │   │   ├── {dashboard,schedule,stats,favorites,reviews,settings,notifications}/page.tsx + loading.tsx
│           │   │   │   ├── layout.tsx # requirePerson(): пускает любого вошедшего, кроме служебной записи
│           │   │   │   └── page.tsx   # redirect → /profile/me/dashboard
│           │   │   ├── [faceKind]/[faceId]/   # Кабинет ЛИЦА: /profile/club/3/*, /profile/trainer/7/*
│           │   │   │   ├── {dashboard,bookings,clients,stats,links,publications,reviews,settings,finance,notifications}/page.tsx + loading.tsx
│           │   │   │   ├── layout.tsx # requireOwner(вид, номер): сверяет адрес со списком лиц и ОТДАЁТ лицо
│           │   │   │   └── page.tsx   # redirect → .../dashboard
│           │   │   ├── athlete/[[...rest]]/page.tsx   # Прежний адрес → /profile/me/* (постоянный, 308)
│           │   │   └── provider/[[...rest]]/page.tsx  # Прежний адрес → кабинет первого лица (временный, 307)
│           │   ├── service-portal/
│           │   │   ├── (admin)/{analytics,dashboard,finance,logs,moderation,notifications}/page.tsx + loading.tsx
│           │   │   ├── (admin)/layout.tsx  # requireAdmin(): вид учётной записи, а не роль
│           │   │   ├── layout.tsx
│           │   │   └── page.tsx        # Вход в служебный раздел
│           │   ├── globals.css
│           │   ├── layout.tsx
│           │   └── page.tsx
│           ├── components/
│           │   ├── admin/              # AdminGuard, AdminNavigation, AdminSectionLoading, DashboardPage,
│           │   │                       # AdminUpdatePasswordModal, LogsPage, ModerationPage, HideReasonModal,
│           │   │                       # AdminNotificationsPage (лента очереди надзора, фаза 37),
│           │   │                       # BookingStatusHistoryDrawer, ImpersonationBanner, ServicePortalLoginForm, analytics/*
│           │   ├── auth/               # AuthModal, ResetPasswordForm, SessionBootstrap
│           │   ├── booking/            # BookingActionBlock, BookingAuthGate
│           │   ├── clubs/              # ClubCard, ClubList, ClubDetailPageClient, PopularNearby, filterClubs
│           │   ├── detail-shared/      # DetailScheduleWeek, utils — общие компоненты detail-страниц
│           │   ├── home/               # HeroSportMarquee
│           │   ├── layout/             # AppShell, Header, Footer, MobileNav, NotificationBell
│           │   ├── map/                # MapSection, MainMap, YandexMapProvider, useMapMarkers,
│           │   │                       # MapPreviewSection, MapThemeToggle
│           │   ├── profile/            # ЛК-shell, athlete/*, provider/*, notifications/*, публикации, секции, helpers
│           │   ├── reviews/            # Пустой резерв под review-specific UI
│           │   ├── schedule/           # UpcomingSessions, ClubAvailability, getUpcomingSessions
│           │   ├── search/             # SearchBar, SportFilters, SearchControlsPreview, CatalogResultsSection, CitySelector
│           │   ├── trainers/           # TrainerCard, TrainerList, TrainerDetailPageClient, PopularTrainers,
│           │   │                       # TrainerAvailability, trainer-preview, trainer-utils, filterTrainers
│           │   └── ui/                 # Button, Card, Input, Select, Modal, Badge, Rating, Skeleton, Chip,
│           │                           # ToastStack, HiddenPublicationNotice, ReliabilityBadge, CardSlider,
│           │                           # ChipMarquee, SlotCard, StoreShowcase, UiShowcase
│           ├── hooks/                  # useSyncCityFromAuth, useSuggest, useUnreadCountPolling
│           ├── lib/                    # 22 файла + contracts/ (см. секцию «Ключевые утилиты»)
│           ├── stores/                 # useAuthStore, useFilterStore, useUIStore, useToastStore,
│           │                           # useMapThemeStore, useNotificationsStore
│           ├── test/                   # Vitest: 22 каталога + architecture.test.ts, security-headers.test.ts, setup.ts
│           └── types/                  # Пусто: типы живут в packages/types и рядом со своими компонентами
├── .env.example                        # Переменные docker compose (пароль базы, память, пул, ключи карт)
├── .nvmrc · .dockerignore · .prettierrc · .prettierignore
├── package.json · package-lock.json
└── tsconfig.json · tsconfig.base.json
```

Конфигурации Next, ESLint и PostCSS живут в `apps/web`, а не в корне: корень держит только
рабочее пространство npm и общий `tsconfig`.

## Страницы

| Маршрут | Назначение |
|---------|-----------|
| `/` | **Главная — дословно по макету ПРОСПОРТ (фаза 38, довески Э13/Э14):** шесть секций из словаря `lib/home-sections.ts` — герой (плашка «новинки», H1, подзаголовок макета, поисковый виджет с выпадашкой категорий и популярных видов, счётчики DM Mono из `/api/stats/overview`, правая колонка — клуб ближайшего занятия дня: фото, «ВЕРИФИЦИРОВАН», строки занятий с «Записаться / N мест»), «Три шага», «Возможности» (восемь плиток lucide своими цветами; без раздела → `/coming-soon`, «Попробовать бесплатно» → регистрация), «Топовые залы рядом с тобой» (шесть фото-плиток 3×2, `sort=rating&limit=6`, режим `showcase`), «Сертифицированные тренеры» (четыре в ряд) + баннер пробного → каталог тренеров; сетки 2 в ряд с `md`, ниже — `CardSlider`; призыв. Тексты — `lib/home-copy.ts`, снимок строк макета в тесте. Шапка: Клубы · Тренеры · Командные · Маркет; подвал: Клубы · Тренеры · Маркет · Лента; док: Главная · Клубы · Лента · Маркет · Мой |
| `/catalog` | **Рабочая часть (с 16.09.2026):** поиск и фильтры, Яндекс Карта с каплями цвета вида спорта и карточкой выбранной точки, выдача клубов/тренеров, ближайшие слоты — из словаря `lib/catalog-sections.ts` (`#discover`, `#map`, `#results`, `#availability`). Отбор в памяти из полного каталога — действующее ограничение Д-15 |
| `/coming-soon` | «Раздел в разработке» — фиксированная страница (не catch-all), сюда ведут пункты меню «Командные» и «Маркет» |
| `/clubs/[slug]` | Карточка клуба: инфо, знак «проверено» (`verifiedAt`), тренеры, услуги, расписание (auth-gated booking), отзывы |
| `/trainers/[slug]` | Карточка тренера: инфо, знак «проверено», специализации, связанный клуб, услуги, расписание, отзывы |
| `/booking/[scheduleId]` | Страница записи на слот: server-rendered preview + client booking-action block с состояниями guest/provider/full/duplicate, confirm CTA, success/error notice, переход в ЛК |
| `/reset-password` | Смена пароля по одноразовой ссылке из письма (`ResetPasswordForm`) |
| `/profile/me` | `redirect()` → `/profile/me/dashboard` |
| `/profile/me/dashboard` | Ближайшая confirmed-запись, pending-countdown до auto-cancel, KPI (upcoming/completed); шапка зовёт сделать первую запись, пока завершённых ноль |
| `/profile/me/schedule` | Список всех записей: 4 фильтра FSM, группировка по неделям, drawer «Детали» с таймлайном и действиями |
| `/profile/me/stats` | Достижения и метрики (стрики, часы, графики Recharts); окно 12m/all |
| `/profile/me/favorites` | Избранные клубы и тренеры |
| `/profile/me/reviews` | Мои отзывы с раскрытием |
| `/profile/me/settings` | Настройки человека, учётные данные, редактор ЛИЧНЫХ настроек уведомлений |
| `/profile/me/notifications` | Личный ящик: фильтры групп, группировка по датам, отметка о прочтении |
| `/profile/<вид>/<номер>` | `redirect()` → `.../dashboard`. Вид — `club` или `trainer` |
| `/profile/<вид>/<номер>/dashboard` | Сводка ЛИЦА: KPI (заявки/связи/check-in/непрочитанные), публикации лица со знаком «проверено», быстрые действия |
| `/profile/<вид>/<номер>/bookings` | Входящие записи лица: 4 таба FSM, фильтры, действия confirm/reject/check-in/cancel |
| `/profile/<вид>/<номер>/clients` | Клиенты ЛИЦА с метриками и заметками. Заметки живут при лице: управляющий уходит — заметки остаются |
| `/profile/<вид>/<номер>/stats` | KPI лица (в т.ч. no-show rate клиентов — число без порога), разбор по услугам, окно 12m/all, heatmap 7×24 |
| `/profile/<вид>/<номер>/links` | Связи тренер↔клуб: табы pending/confirmed/history, approve/reject/revoke |
| `/profile/<вид>/<номер>/publications` | Публикации лица. У клуба раздел зовётся «Публикации», у карточки тренера — «Моя карточка» |
| `/profile/<вид>/<номер>/reviews` | Отзывы о публикациях лица |
| `/profile/<вид>/<номер>/settings` | Настройки лица, включая ОТДЕЛЬНЫЙ ящик уведомлений этого лица |
| `/profile/<вид>/<номер>/notifications` | Ящик лица. У владельца трёх клубов их три, а не один |
| `/service-portal/notifications` | **Очередь надзора** (фаза 37): общая лента событий администраторов с отбором по теме и состоянию разбора, постраничностью, отметкой разобранного, возвратом в очередь и уборкой |
| `/profile/<вид>/<номер>/finance` | Заглушка — Финансы (в разработке) |
| `/profile/athlete/*` | Прежний адрес личного кабинета → `/profile/me/*`, **постоянный** переезд (308): соответствие одно для всех и навсегда |
| `/profile/provider/*` | Прежний адрес кабинета услуг → кабинет первого лица, **временный** (307): назначение зависит от того, кто открыл ссылку |

| `/service-portal` | Страница входа в служебный раздел |
| `/service-portal/dashboard` | Список людей (без служебных записей), поиск, фильтры (лица услуг, статус), impersonation, блок «Учётные данные» со сменой пароля. Колонка надёжности и «Пересчитать рейтинг» сняты фазой 38 |
| `/service-portal/logs` | Логи активности: фильтры (тип, период, актор), пагинация, автополлинг, drawer «История FSM» для booking-логов |
| `/service-portal/analytics` | KPI-карточки, графики Recharts (записи, спорты, активность платформы), таблица топ-публикаций, фильтры (период, город, спорт) |
| `/service-portal/moderation` | Модерация публикаций: фильтры (статус, тип, город, спорт, **проверенность** — `verified` в запросе), поиск, пагинация; действия из словаря `MODERATION_ACTION_SPECS` — hide/unverify с общей `ReasonModal` причины, unhide с вопросом из поля `confirmation`, **verify** — знак «проверено» гостю |
| `/service-portal/finance` | Placeholder — Финансы (в разработке) |

Динамические страницы (`/`, `/clubs/[slug]`, `/trainers/[slug]`, `/booking/[scheduleId]`,
`/reset-password`, все `/profile/**` и
`/service-portal/{dashboard,logs,analytics,moderation,notifications}`)
объявлены `dynamic = 'force-dynamic'`; то же стоит на трёх лейаутах — `/profile/me`,
`/profile/[faceKind]/[faceId]` и `/service-portal/(admin)`. Прежние `/profile/athlete`
и `/profile/provider` — не лейауты, а перехватчики `[[...rest]]` с `redirect()`
на новые адреса (35.32). `/service-portal/finance` — статическая.

## API

Все маршруты живут в `apps/api` под общим префиксом `/api`; фронт проксирует `/api/*` на бэкенд.
Форма ответа — `{ success, data }`, кроме трёх сохранённых отклонений: ответ без `data`,
счётчики рядом с `data` (журнал, публикации) и счётчики внутри `data` (уведомления).

Всего **69 маршрутов**. Столбец «Доступ»: `публичный` — помечен `@Public()` и открыт гостю
(таких **25**, их список с обоснованиями — в `apps/api/src/test/route-guard.test.ts`);
`сессия` — требует входа, но отдельного права нет; имя права — проверка `@Requires(...)`
или проверка `hasCapability` внутри обработчика (когда режим включается параметром запроса).
Личность всюду берётся из сессии: `userId` в теле и строке запроса больше не принимается.

### Служебное и справочники

| Метод | Эндпоинт | Доступ | Назначение |
|-------|----------|--------|-----------|
| GET | `/api/health` | публичный | Проверка живости — её спрашивает контейнер |
| GET | `/api/sports?popular=<n>` | публичный | Виды спорта (с `color` — цвет капли на карте, колонка `sports.color`). С `popular=n` — первые `n` по числу опубликованных клубов и карточек (`GROUP BY` в запросе, ничья по `id`, поле `publicationCount`) |
| GET | `/api/cities` | публичный | Города |
| GET | `/api/tags` | публичный | Теги клубов |
| GET | `/api/amenities` | публичный | Удобства клубов |
| GET | `/api/specialties` | публичный | Специализации тренеров |
| GET | `/api/work-formats` | публичный | Форматы работы тренеров |

### Каталог

| Метод | Эндпоинт | Доступ | Назначение |
|-------|----------|--------|-----------|
| GET | `/api/clubs?sportId&search&minRating&sort&dir&limit&includeHidden` | публичный | Клубы с фильтрами; `sort=rating` — `ORDER BY rating DESC, review_count DESC, id ASC` в запросе; `limit` без умолчания, потолок 100 только при заданном (витрина главной берёт 6). `excludeDanger` и `sort=reliability` сняты фазой 38. Гостю виден `verifiedAt`, `verifiedByUserId` — никогда (список `HIDDEN_FROM_PUBLIC`). **`managedByUserId` и `awaitingRecheck` не отдаются** (35.20a, 36.21). `includeHidden` учитывается **только модератору**; владельцу выдача несёт его собственные скрытые — условием в запросе, не отбором в памяти (36.14) |
| GET | `/api/clubs/by-slug/:slug` | публичный | Карточка клуба по адресу-ссылке (регистр и кодировка не важны). Без `managedByUserId` |
| GET | `/api/clubs/:id` | публичный | Клуб с тренерами, расписанием, отзывами и `primaryOffering`. Без `managedByUserId` — ни у клуба, ни у его тренеров |
| POST | `/api/clubs` | `manage_own_clubs` | Создать клуб (в одной транзакции: клуб + услуга + слоты) |
| PATCH | `/api/clubs/:id` | `manage_own_clubs` | Обновить клуб (клуб + основная услуга + разница расписания) |
| DELETE | `/api/clubs/:id` | владелец / `moderate_publications` | Убрать клуб. Владельцу — **архивирование**: публикация уходит из каталога, записи, отзывы и связи целы; модератору — стирание каскадом. Исход называется в ответе (`outcome`): исходы различаются необратимостью, и `success: true` на оба врал. Живые записи запрещают уборку (409) |
| GET | `/api/trainers?affiliatedClubId&clubId&sportId&sort&dir&limit&includeHidden` | публичный | Тренеры с фильтрами; `sort=rating` и `limit` — как у клубов (витрина берёт 4). `excludeDanger` снят фазой 38. Правила скрытых те же, что у клубов (36.14) |
| GET | `/api/trainers/by-slug/:slug` | публичный | Карточка тренера по адресу-ссылке. Без `managedByUserId` |
| GET | `/api/trainers/:id` | публичный | Тренер с контекстом (клуб, услуги, `primaryOffering`, слоты, отзывы). Без `managedByUserId` — ни у карточки, ни у клуба-площадки |
| POST | `/api/trainers` | `manage_own_trainer_profile` | Создать карточку тренера (в одной транзакции) |
| PATCH | `/api/trainers/:id` | `manage_own_trainer_profile` | Обновить карточку тренера |
| DELETE | `/api/trainers/:id` | владелец / `moderate_publications` | То же правило и тот же ответ, что у клуба: архив владельцу, стирание модератору, `outcome` в ответе |
| GET | `/api/offerings` | публичный | Услуги — показываются в карточках клубов и тренеров |
| GET | `/api/users?scope=clients` | `manage_own_clients` (со `scope=clients`) / `manage_any_user` (без него) | Люди площадки. Без признака — весь список с почтами, телефонами и **`serviceFaceCount`** (число лиц услуг, считает база группировкой — 35.20a); `scope=clients` — только свои клиенты, без числа лиц. Пароль не отдаётся никогда |

### Расписание и записи

| Метод | Эндпоинт | Доступ | Назначение |
|-------|----------|--------|-----------|
| GET | `/api/schedule?ownerType&clubId&trainerId&sportId&date&includeFull` | публичный | Слоты расписания; `includeFull` добавляет заполненные |
| GET | `/api/schedule/:id/context` | публичный | Слот с услугой, владельцем и клубом-площадкой — для страницы записи. Заполненный слот отдаётся, в отличие от выдачи расписания. Публикации приходят без `managedByUserId` |
| GET | `/api/bookings?scope&clubId&trainerId&status&dateFrom&dateTo&offset&limit` | сессия; `scope=all` → `use_admin_tools`, `scope=owner` → `manage_own_bookings` | По умолчанию — записи спрашивающего. `owner` — записи его публикаций, `all` — срез площадки; словарь `BOOKING_SCOPES`, снятый `scope=clients` отвечает 400 (38.55: читателя не осталось после вырезания надёжности). Отбор и постраничность уходят в запрос к базе |
| POST | `/api/bookings` | `book_sessions` | Создать запись по `{ scheduleId }`; проверки мест и дубля, атомарная запись |
| GET | `/api/bookings/:id` | `use_admin_tools` | Полная запись с историей статусов |
| DELETE | `/api/bookings/:id` | сессия | Отменить запись через FSM (проверка владения + атомарный возврат места) |
| POST | `/api/bookings/:id/cancel` | сессия | Мягкая отмена через FSM; исполнитель — из сессии |
| POST | `/api/bookings/:id/confirm` | `manage_own_bookings` | Провайдер подтверждает pending |
| POST | `/api/bookings/:id/reject` | `manage_own_bookings` | Провайдер отклоняет pending (причина необязательна) |
| POST | `/api/bookings/:id/check-in` | `manage_own_bookings` | Отметка `completed`/`no_show` в окне `endAt..endAt+48h` |

### Уведомления, отзывы, связи, заметки

| Метод | Эндпоинт | Доступ | Назначение |
|-------|----------|--------|-----------|
| GET | `/api/notifications?unreadOnly&readOnly&group&offset&limit&scope&clubId&trainerId` | сессия; `scope=supervision` → `moderate_publications`; лицо — владение | `{ items, total, unreadCount }`; ящик лица (`clubId`/`trainerId`), личный (`scope=personal`), объединённый (без параметров) или **очередь надзора** (`scope=supervision`). Отбор по теме и по состоянию разбора — в запросе. ⚠️ `scope=all` **закрыт** (403) фазой 37: последнее полное чтение ленты площадки в память |
| GET | `/api/notifications/unread-count?scope&clubId&trainerId` | сессия; лицо — владение; очередь — полномочие | Число неразобранного того же ящика, что отдаёт лента (для polling у колокольчика) |
| POST | `/api/notifications/read-all?scope&clubId&trainerId` | сессия; лицо — владение; очередь — полномочие | Пометить разобранным ящик целиком. В очереди надзора гасит её **всем** и подписывает разобравшего |
| POST | `/api/notifications/:id/read` | сессия | Отметить разобранным. Разбор ставится ОДИН раз и не перезаписывается: повторное нажатие возвращает строку как есть. Человеку на строку очереди надзора — **403**, на чужую личную — 404 |
| POST | `/api/notifications/:id/unread` | сессия | **Вернуть строку в очередь** (фаза 37): снять разбор и подпись. Без этого ошибочная отметка в общей очереди необратима для всей команды |
| DELETE | `/api/notifications` | сессия | Удалить свои уведомления по `{ ids }`; в ответе `{ deleted }`. Чужая **личная** строка отбрасывается молча — по коду ответа иначе перебирались бы чужие номера; на строку **очереди надзора** человеку отвечает **403**, а не `200` с `deleted: 0` (37.61: отказ выглядел как успех) |
| GET | `/api/reviews?clubId&trainerId` | публичный | Отзывы; имя автора приезжает в самом отзыве |
| POST | `/api/reviews` | `write_reviews` | Создать отзыв. Одна оценка на посещение: сколько завершённых записей к адресату, столько и отзывов |
| GET | `/api/trainer-club-links?trainerId&clubId&status` | публичный | Связи с фильтрами. Подтверждённые публичны — карточка клуба показывает своих тренеров; заявки и отказы гостю не видны |
| POST | `/api/trainer-club-links` | `manage_own_links` | Создать запрос привязки; сторона определяется по сессии, 409 на дубликат |
| POST | `/api/trainer-club-links/:id/approve` | `manage_own_links` | Подтверждение противоположной стороной |
| POST | `/api/trainer-club-links/:id/reject` | `manage_own_links` | Отказ противоположной стороны |
| POST | `/api/trainer-club-links/:id/revoke` | `manage_own_links` | Разрыв confirmed/pending связи + отвязка услуг |
| GET | `/api/provider-client-notes?clientUserId` | `manage_own_clients` | Заметки провайдера (свежие первыми) |
| POST | `/api/provider-client-notes` | `manage_own_clients` | Создать заметку (проверка «клиент ли это») |
| PATCH | `/api/provider-client-notes/:id` | `manage_own_clients` | Обновить заметку (проверка владения) |
| DELETE | `/api/provider-client-notes/:id` | `manage_own_clients` | Удалить заметку (проверка владения) |

### Учётная запись и настройки

| Метод | Эндпоинт | Доступ | Назначение |
|-------|----------|--------|-----------|
| PATCH | `/api/users/:id` | сессия, только сам себе | Телефон и/или пароль: Zod-валидация, сверка текущего пароля при смене, ответ без пароля; под работой от чужого лица запрещено |
| GET | `/api/users/:id/notification-preferences?faceType&faceId` | сессия, только свои; лицо — только своё | Настройки ОДНОГО ящика: без лица — личные, с лицом — этого лица. У владельца трёх клубов четыре набора (35.29) |
| PATCH | `/api/users/:id/notification-preferences` | сессия, только свои; лицо — только своё | Обновить настройки одного ящика (пара `faceType`/`faceId` необязательна и называется целиком); обязательные типы отбрасываются молча |

### Вход и сессии

| Метод | Эндпоинт | Доступ | Назначение |
|-------|----------|--------|-----------|
| POST | `/api/auth/login` | публичный | Вход со сверкой argon2id. Единое сообщение на все отказы; тип кабинета необязателен. Выдаёт сессию в cookie |
| POST | `/api/auth/register` | публичный | Регистрация: Zod, 409 на дубликат почты, сопоставление роли |
| POST | `/api/auth/logout` | публичный | Отзыв сессии на сервере и очистка cookie; работает и с протухшей сессией |
| GET | `/api/auth/me` | сессия | Профиль вошедшего: вид учётной записи, права, **лица услуг со своим `status`** (архивированное лицо остаётся в списке, но помечено), **избранные клубы** и признак работы от чужого лица. Роли в ответе нет с шага 35.24. Избранное едет здесь, потому что раздел избранного читает его у своего же профиля, а список пользователей площадки закрыт правом администратора |
| POST | `/api/auth/impersonate/:id` | `impersonate` | Начать работу от лица пользователя. Пишет в журнал `admin_impersonate_start` исполнителем-**администратором**, а не целью: ради этого следа имперсонизацию и переносили на сервер, а записи не было вовсе до 10.09.2026 |
| POST | `/api/auth/impersonate/stop` | сессия | Вернуться к себе. Пишет `admin_impersonate_stop` — без второй половины следа не видно, когда работа от чужого лица кончилась |
| POST | `/api/auth/forgot-password` | публичный | Заявка на восстановление. Ответ одинаков для заведённой и незаведённой почты; под пределом частоты |
| POST | `/api/auth/reset-password` | публичный | Смена пароля по ссылке из письма: гасит все сессии пользователя |

### Карты

| Метод | Эндпоинт | Доступ | Назначение |
|-------|----------|--------|-----------|
| POST | `/api/geocode` | публичный | Геокодирование адреса через Яндекс Geocoder; серверный ключ, предел частоты, тайм-аут |
| POST | `/api/suggest` | публичный | Прокси к Яндекс Geosuggest; серверный ключ, отдельный счёт предела частоты |

### Служебный раздел

| Метод | Эндпоинт | Доступ | Назначение |
|-------|----------|--------|-----------|
| GET | `/api/analytics?period&city&sportId` | `view_analytics` | Агрегированные KPI и данные для графиков |
| GET | `/api/logs?action&actorId&from&to&offset&limit` | `view_platform_logs` | Журнал действий: условие, порядок и счёт — одним запросом |
| GET | `/api/publications?status&type&city&sportId&search&awaitingRecheck&verified&offset&limit` | `moderate_publications` | Объединённый список клубов и тренеров для модерации. Строка несёт `hiddenKind`, `awaitingRecheck` и `verifiedAt`; отбор `verified=false|true` — в `where` до среза страницы (38.47); отбор «исправлено, ждёт проверки» — параметром, под ним частичный индекс (36.22) |
| POST | `/api/moderation` | `moderate_publications` | Действие из словаря `MODERATION_ACTION_SPECS` (`packages/domain`): `hide` (с причиной), `unhide`, **`verify`** (предусловия `published` и `not_verified`, 409 повторно), **`unverify`** (причина обязательна). Контроллер не ветвится по действию — читает семь полей записи словаря; журнал `verification_grant`/`verification_revoke`, письма владельцу (неотключаемые), отзыв — в очередь надзора одной строкой на всех администраторов |
| GET | `/api/stats/overview` | публичный | Сводка площадки для счётчиков героя: `clubs`, `trainers`, `people`, `bookings` — четыре `count` в запросе, порог кэширования назван в контроллере (38.30) |
| DELETE | `/api/admin/bookings/:id` | `use_admin_tools` | Жёсткое удаление записи |

| POST | `/api/admin/users/:id/password` | `use_admin_tools` | Сброс пароля любого пользователя; запись `admin_password_change` с исполнителем и целью |
| POST | `/api/admin/trainer-club-links/:id/force-revoke` | `use_admin_tools` | Принудительный разрыв связи (уведомляет обе стороны, `meta.forced=true`) |

## Доступ и безопасность

⚠️ **Заголовки безопасности ставит БЭКЕНД** (`apps/api/src/common/security-headers.ts`),
а не правило `headers()` во фронте: `/api/*` уходит в `rewrites()`, и до переписанного
адреса правило Next не достаёт. Ответы API шли голыми, пока это не нашли браузерным
прогоном 10.09.2026; правило при этом выглядело работающим. Стережёт рантаймовый
сторож `security-headers-guard.test.ts` — он обходит таблицу маршрутов и читает
настоящие заголовки, включая ответы с отказом.

| Что | Как устроено |
| --- | --- |
| Личность | Только из серверной сессии. Таблица `sessions`, идентификатор в cookie `HttpOnly`+`Secure`+`SameSite=Lax`; в базе — его sha256. Возврат личности в тело запроса краснит `identity-boundary.test.ts` |
| Защита маршрутов | Закрыто по умолчанию: глобальный `SessionGuard` через `APP_GUARD`. Публичное помечено `@Public()` — 25 маршрутов из 69. Сторож `route-guard.test.ts` требует от каждого непубличного 401 гостю и проверяет обратное: объявленный публичным маршрут обязан существовать и открываться |
| Права | Один словарь `packages/domain/src/permissions.ts`: шесть админских возможностей по виду учётной записи. Владельческих прав нет — их заменила проверка владения; ролей нет вовсе (шаг 35.24) |
| Владение | `AccessService` (`isAdmin` — по `account_kind`, `isProviderOfBooking`, `getManagedPublicationIds`, `isManagerOfClub`, `isManagerOfTrainer`, `isClientOfProvider`) — «его ли это вещь». Право осталось только у администратора, всё остальное решает владение |
| Работа от чужого лица | Две личности в сессии: права по цели, журнал по настоящему администратору |
| Вход | argon2id со сверкой; единое сообщение на все отказы; сверка выполняется и для несуществующей почты — иначе её видно по времени ответа. Очередь ограничивает число одновременных проверок: 19 МБ на каждую |
| Перебор | Нарастающая блокировка: 5 неудач → 1 мин, дальше +1 мин за каждые пять, потолок 30 мин; верный пароль обнуляет. Счётчики раздельные по почте (порог 5) и по адресу обращения (порог 20) |
| Восстановление пароля | Одноразовая ссылка (таблица `password_reset_tokens`, в базе хеш), отправитель за интерфейсом `apps/api/src/mail` с заглушкой в журнал; сброс гасит все сессии. Адрес ссылки берётся из `SPORT_HUB_PUBLIC_ORIGIN`, а не из заголовка `Host` |
| Пределы частоты | `common/rate-limit.ts`: регистрация, восстановление пароля, геокодер и подсказки — у каждого свой счёт. Значения настраиваются переменными `SPORT_HUB_RATE_LIMIT_*`, мусор и ноль трактуются как «не задано» |
| Страницы | Серверная проверка в трёх лейаутах (`/profile/me`, `/profile/[faceKind]/[faceId]`, `/service-portal/(admin)`) через `requireSession` / `requirePerson` / `requireOwner` / `requireAdmin` из `lib/session.ts` (`requireRole` удалён фазой 35 вместе с ролями), плюс `src/proxy.ts` для дешёвого редиректа гостя. Клиентские плашки — показ, а не защита |
| Заголовки | CSP, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`. Узлы карт объявлены одним списком `MAP_HOSTS` в `apps/web/next.config.ts` и оттуда подставляются в CSP; сторож — `security-headers.test.ts` |
| Источник запроса | `common/origin-check.ts`: отбой по `Sec-Fetch-Site: cross-site` и по чужому `Origin` на изменяющих методах. Список разрешённых берётся из `SPORT_HUB_ALLOWED_ORIGINS`, а если он пуст — из `SPORT_HUB_PUBLIC_ORIGIN`; пустой список не означает «пропускать любой источник» |
| Журнал | Исполнитель и его вид учётной записи — всегда из сессии, у настоящего администратора (`session.actor`), а не у подменённой личности. Литерал вместо `accountKindOf(session.actor)` краснит сторож в `identity-boundary.test.ts`. Поле `actor_role` — исторический снимок: в строках до фазы 35 лежат имена ролей, подпись читает оба вида через `actorLabel` |
| Отзывы | Одна оценка на посещение: сколько у автора завершённых записей к адресату, столько и отзывов. Оба счёта — запросами к базе внутри одной транзакции, под них заведены индексы `(user_id, club_id)` и `(user_id, trainer_id)` |
| Ключи карт | Клиентский `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` вшивается в бандл на сборке; серверные `YANDEX_SUGGEST_API_KEY` и `YANDEX_GEOCODER_API_KEY` читаются бэкендом в рантайме и наружу не уходят |
| Скрытая публикация | Одно правило `AccessService.canSeeHiddenPublication` на **семь** путей: карточка по номеру, по адресу-ссылке, каталог, `includeHidden`, контекст слота, список тренеров клуба, публичное расписание. Гостю и постороннему — **404, а не 403**: отказ по правам сообщал бы, что публикация существует. Владелец и модератор видят (36.13–36.18) |
| Вид скрытия | Колонка `hidden_kind` (`owner_archive` / `moderation`) и словарь `HIDE_KINDS` в `packages/domain`. Прежний различитель — совпадение текста причины с константой — не различитель: владелец волен написать ту же строку руками. Плашка карточки, бейдж кабинета и раздел модерации читают признак (36.12) |
| Правка скрытой | Публикацию, скрытую модератором, правка **не возвращает** в каталог: ставится `awaiting_recheck`, модератор видит счётчик в своей панели. Архив владельца правкой возвращается, как и раньше (36.20, 36.21) |
| Мусорная cookie | Прокси отбивает строку не нашего формата **веткой гостя** (диапазон длины плюс алфавит, не «ровно 43») и гасит cookie при уводе. Форма идентификатора и имена cookie объявлены один раз — `packages/domain`, отдельная точка экспорта без `zod` в графе (36.23–36.25) |
| Уведомления | Настройка применяется при **ОТПРАВКЕ**: выключенный тип не создаёт строки вовсе, и в чтении отбора по настройкам нет (шаги 36.49, 36.50). Спрашивается ящик, которому адресована строка; обязательные типы проверку минуют. Галочка действует вперёд — пришедшее раньше остаётся, и это сказано человеку на странице настроек |
| Ссылка на предмет уведомления | ОДНА форма — `subjectType` + `subjectId`; словарь «тип → допустимые виды предмета» в `packages/domain`. Прежде форм было четыре, и уборка одну из них пропускала (шаг 36.51) |
| Предел на «кто я» | `/api/auth/me` считается **по сессии**, а не по адресу: маршрут зовётся из процесса Next, и счёт по адресу дал бы один счётчик на всю площадку (36.26) |

## Тестовая обвязка

| Что | Как устроено |
| --- | --- |
| Схема | Своя **на файл**: `test_${VITEST_WORKER_ID}` — в Vitest 4 это сквозной счётчик по спекам, а не номер процесса. Полный прогон создаёт **60 схем** (замер 13.09.2026; при замере фазы 36 их было 48 — число растёт вместе с числом наборов, работающих с базой) |
| Пул соединений | **Один на файл**: обвязка работает клиентом поднятого приложения, своего пула не заводит. Размер задан явно — `TEST_CONNECTION_BUDGET` в `db-harness.ts`, применяется в `setup.ts` до загрузки модулей приложения |
| Потолок базы | Локальный стенд считается **отдельно от боевого**: `POSTGRES_MAX_CONNECTIONS=60` против 30 в бою. Локально приложение и прогон работают одновременно, в бою прогонов нет |
| Параллельные прогоны | `SPORTHUB_TEST_SCHEMA_SUFFIX=<свой>` обязателен, когда прогонов несколько: иначе они чистят схемы друг друга и падают дедлоком на `TRUNCATE` |
| Признак среды React | `IS_REACT_ACT_ENVIRONMENT` восстанавливается перед каждым тестом: набор, вызвавший `vi.unstubAllGlobals()`, снимал его для всех следующих файлов, и эффекты переставали выполняться |

## Модели данных

**Сущности:** Sport, Club, Trainer, Offering, Schedule, Booking, Review, User, Session,
PasswordResetToken, LogEntry, City, Tag, Amenity, WorkFormat, Specialty, Notification,
TrainerClubLink, ProviderClientNote.

**Связи id-based:** `Club.{tagIds, amenityIds, sportIds}`, `Trainer.{sportIds, specialtyIds, workFormatIds}`,
`Schedule.sportId`. Контакты у `Club`/`Trainer`: `phone`, `email`, `vk`, `telegram`, `facebook`.
Дополнительные поля: `Offering.{trainerClubLinkId?, cancellationPolicy}`,
`Notification` — **размеченный union по `addresseeKind`** (фаза 37):
`personal` / `club` / `trainer` — человеческий ящик, владелец-человек есть всегда;
`supervision` — общая очередь надзора, у неё поля `userId` НЕТ вовсе, зато есть
`readByUserId` (кто разобрал). Форму строки целиком держит ограничение
`notifications_addressee_shape`, собранное из карты `NOTIFICATION_ADDRESSEE_SHAPE`
в `packages/domain`; `addresseeType` / `addresseeId` остались парой полей лица,
`LogEntry.actorId?` — пусто у событий, которые произвела сама площадка
(разрешено ограничением `logs_actor_or_system` только вместе с `actorRole: 'system'`),
`User.{accountKind?, notificationPreferences?}`,
`Booking.{statusHistory, cancellationPolicySnapshot, cancelledBy, cancelReason, completedAt}`.

**Enums/unions** (источник правды — `packages/types/src/{types,constants}.ts`):
- `AccountKind` — `person | admin` (список — `ACCOUNT_KINDS` в `packages/domain`;
  `UserRole` и `AuthAccountType` удалены шагом 35.24 вместе с колонкой `users.role`)
- `UserStatus` — `active | banned | suspended`
- `OfferingFormat` — `group | personal | mini_group`
- `CatalogOwnerType` — `club | trainer`
- `EntitySource` — `provider | seed`
- `EntityStatus` — `published | draft | hidden`
- `LogEntityType` — `club | trainer | booking | user | trainer_club_link`
- `BookingStatus` (8) — `pending | confirmed | completed | no_show | unmarked | rejected_by_provider | cancelled_by_athlete | cancelled_by_provider`
- `BookingActor` — `athlete | provider | admin | system`
- `CancellationPolicy` — `free_anytime | free_until_24h | free_until_2h | no_refund`
- `CancelReason` — `on_time | late`
- `PaymentStatus` — `unpaid | paid | refunded`
- `SessionLevel` — `beginner | intermediate | advanced | all_levels`
- `NotificationType` (27) — 7 booking-для-атлета + 3 booking-для-провайдера + 4 link
  + 2 review + **9 надзорных** (фаза 37: 4 действия администраторов, 4 каталог
  и модерация, 1 доступ и вход) + **2 решения по публикации её владельцу**
  (`publication_hidden_for_owner`, `publication_unhidden_for_owner`, довесок 37.70). Темы (`NOTIFICATION_GROUP_KEYS`): `booking`, `links`,
  `reviews`, `publications` (решения по публикации — её владельцу, довесок к фазе 37)
  плюс три надзорные — `oversight_admin`, `oversight_catalog`, `oversight_security`. ⚠️ Группа `moderation` удалена: она содержала один тип,
  адресованный администратору, и рисовалась КАЖДОМУ человеку пустой секцией настроек
- `NotificationAddresseeKindValue` — `personal | club | trainer | supervision`
  (список и карта формы строки — `packages/domain/src/notification-addressee.ts`)
- `TrainerClubLinkStatus` — `pending | confirmed | rejected | revoked`
- `LogAction` (23) — записи FSM, связи FSM, публикации, модерация, админские действия,
  `login_lockout` (сработала ступень блокировки входа, 37.27). Карантинных действий
  больше нет: механизм отменён решением заказчика (35.3a). Шаг 37.29 снял два значения
  без писателя — `admin_login` и `moderation_auto_restore`; **строки с ними в журнале
  остались**, их подписи живут отдельным словарём прошлого `LEGACY_ACTION_LABELS`
  в `LogsPage.tsx`
- `BookingStatusTransition` — запись истории статусов
- `DiscoveryMode` (`clubs | trainers`) — UI-тип, объявлен в `stores/useFilterStore.ts`

**UI-типы** живут рядом со своим кодом: `UpcomingSessionItem`
(`components/schedule/getUpcomingSessions.ts`), `TrainerDirectoryItem` и
`TrainerAvailabilityItem` (`components/trainers/trainer-preview.ts`), `AthleteAchievement`,
`AthleteHistoryItem`, `UpcomingProfileBooking`, `ProviderIncomingBooking`
(`components/profile/*`). Надёжность (`ReliabilityResult`, `reliability.ts`) вырезана фазой 38 — долг Д-26.

## Zustand-сторы

| Стор | Состояние | Персистенция |
|------|-----------|-------------|
| `useAuthStore` | user, accountKind, faces, activeFaceKey, capabilities, isAuthenticated, isAdmin, isImpersonating, status; login/register/logout/loadSession/updateUser/setActiveFace/adminLogin/startImpersonation/stopImpersonation. Ни роли, ни типа кабинета в сторе нет — сторожа `role-boundary.test.ts` и `account-type-gone.test.ts` | сервер: `GET /api/auth/me`. Ни localStorage, ни cookie личности нет |
| `useFilterStore` | discoveryMode, searchQuery, selectedSportId, selectedCity | нет |
| `useUIStore` | isAuthModalOpen, isHeaderMenuOpen (меню шапки ниже 960; при открытом меню мобильный док не рисуется — один стор, без новых z-index) | нет |
| `useToastStore` | toasts[], addToast/dismissToast/clearToasts; tone (info/success/warning/error), duration=4000 по умолчанию | нет |
| `useMapThemeStore` | theme: 'light' \| 'dark'; toggleTheme(), setTheme(t) | localStorage `sporthub-map-theme` |
| `useNotificationsStore` | notifications[], unreadCount, loaded, userId; setNotifications/setUnreadCount/markRead/markAllRead/removeMany/setUserId/reset с оптимистичными обновлениями и откатом при отказе сервера | нет (реактивный источник правды для колокольчика и страницы уведомлений; polling через `useUnreadCountPolling` пишет сюда) |

## Ключевые компоненты

| Папка | Компоненты |
|-------|-----------|
| `ui/` | Button (варианты в т.ч. `danger`/`soft`, размеры в т.ч. `xs`; **`href` рисует `next/link` теми же классами** — сторож `button-single`: вид primary-кнопки только здесь), Card, Input, Select, Modal, Badge (тон `pending`), Rating, Skeleton, Chip (≈34px, чип категории витрины), **Hint** (подсказка: наведение/фокус/касание/`Escape`, `aria-describedby`, пузырь прижимается к краю окна `data-align`; имя не `Tooltip` — clash с recharts), **VerifiedBadge** (знак «проверено» по `verifiedAt`, подписи по виду лица из одного `Record`), **BrandLogo** (бегун из растра макета в SVG, словомарка из `BRAND_WORDMARK`, `reduced-motion`), SlotCard (по эталону, ≤2 мест — красная подпись), CardSlider (единственная карусель — сторож `carousel-single`), **PaginationBar** (одна полоса постраничности на все пять прежних копий — лента надзора, панель, журнал, модерация, человеческая лента; шаг 37.67), ToastStack, HiddenPublicationNotice, ReliabilityBadge, StoreShowcase, UiShowcase, **CardSlider** (опц. props `tools` + `visibleByBp` для тернарного 1↔2↔3 + drag/swipe pointer-handlers с порогом 25%, edge-resistance 0.35, click-suppress >6px), **ChipMarquee** (dual-flag pause `pausedByHover`+`pausedByVisibility` через IntersectionObserver, явный `cursor: default` на чипах, IO-mock в `src/test/setup.ts` для jsdom), **SlotCard** (общая карточка слота: hero+watermark+tone-ротация по `index%3`, capacity-pill всегда лайм со склонением, time/price в одну строку через `clamp`+`nowrap`+`tabular-nums`+`container-type: inline-size`; CTA «К записи» на primary fill `rounded-pill bg-lime text-bg` с микро-анимацией стрелочки `hover:gap-2.5`) |
| `layout/` | AppShell (единственный `<main>` — сторож `single-main`), Header (белая липкая 64px, навигация из `HEADER_NAV` с точки `menu` = 960px), **HeaderMenu** (меню ниже 960: оверлей, `Escape`, ловушка фокуса, возврат фокуса на кнопку), **HeaderUser** (три ветви плашки; полное имя — `Hint`), **NavLink** (клик ставит режим выдачи из `NavItem.mode`), Footer (тёмная плашка, ссылки из `FOOTER_NAV`, год не литералом; «Статус» снят), MobileNav (док по эталону, подсветка по паре «путь + хэш» на любой странице, кликом и `popstate`), NotificationBell (форма эталона, логика прежняя), ImpersonationBanner |
| `detail-shared/` | **DetailScheduleWeek** — общий week-блок для Club/Trainer Detail: 7 day-tabs Пн-Вс с counter, активный — сегодняшний день недели; slot-grid 1-col на base/md, 2-col на lg+; per-day empty-state; CTA: атлет → `<Link>` на `/booking/[id]`, не-атлет → button с onGuestSlotAction-toast; контракт `DetailScheduleSlot { id, date, title, sportName, priceLabel, availableSpots, room, sub }` — `sub` собирает вызывающий код: на club `${time}, ${trainerName}`, на trainer `${time}, ${room}`. **utils** — `getCurrentWeekRange()` возвращает `{ mondayIso, sundayIso }` текущей ISO-недели |
| `auth/` | **AuthModal** (вход и регистрация), **ResetPasswordForm** (смена пароля по ссылке из письма), **SessionBootstrap** (подтягивает сессию с сервера при загрузке приложения) |
| `admin/` | **ModerationItemCard** (строка модерации из `Badge` + `VerifiedBadge` + `Button`; кнопки, которые сервер отбил бы 409, не рисуются), **ReasonModal** (одна модалка причины на `hide` и `unverify`; «нужна ли причина» — из `MODERATION_ACTION_SPECS[action].requiresReason`), **ToolbarSelect** (одно поле фильтра тулбара вместо трёх копий), **AdminSectionLoading** — общий skeleton для `loading.tsx` всех 6 admin-подмаршрутов (sec-head + filter-row + KPI-grid 4 col + main-grid `1fr 440px`). AdminGuard, **AdminNavigation** (segmented-control `bg-card-2 + rounded-full + p-1.5`, активная по `pathname.startsWith(href + '/')`, на 480 horizontal scroll), **DashboardPage** (sec-head с eyebrow `Admin · Users`, toolbar `1fr auto`, filters-panel collapsible 2-col, user-card grid `1fr 440px` на 1280+, пагинация 15/стр.; блок «Учётные данные» с masked-паролем и кнопкой «Изменить пароль»), **AdminUpdatePasswordModal** (newPassword + confirm с visibility toggle, Zod min 6, `POST /api/admin/users/:id/password`), **LogsPage** (auto-status pulse `.admin-pulse-dot` с `prefers-reduced-motion`, фильтры 3-col, log-card grid `1fr auto` с тонами good/warn/danger/neutral, пагинация 15 на сервере), **ModerationPage** (toolbar `1.4fr + 4×1fr`, item-card grid `1fr 220px` на 1280+, бейджи type/status, btn-danger «Скрыть» / btn-primary «Показать»), HideReasonModal, **BookingStatusHistoryDrawer** (карточки `bg-card-2` + font-mono tabular-nums для отметок времени), **AdminNotificationsPage** (лента очереди надзора: вкладки тем `role="tablist"`, состояние разбора `group` + `aria-pressed`, вёдра по дате, отметка разобранным с подписью, возврат в очередь, удаление разобранных, постраничность через `PaginationBar`), ImpersonationBanner (намеренно красный/warning контраст), ServicePortalLoginForm, analytics/{AnalyticsDashboard, AnalyticsFilters, KpiCards, BookingsChart, SportPopularityChart, PlatformActivityChart, TopEntitiesTable} |
| `clubs/` | ClubCard (режимы `showcase` — фото-плитка макета, и `catalog`; вся карточка — растянутая ссылка, над ней только знак «проверено»; расстояния нет — Д-17), ClubList, **ClubDetailPageClient** (hero 2-col на lg+ с photo-placeholder 16/10 + meta-col [chips → eyebrow `Club profile` → title → адрес → рейтинг → описание line-clamp-5 → stat-rail Контакты/Цена → ChipMarquee тегов и удобств → CTA «Записаться на занятие →» и «Связаться с клубом»], Reliability с ReliabilityBadge, Sport focus, Coaching team 2-col с watermark номера, Schedule через `DetailScheduleWeek` с фильтром по текущей ISO-неделе, Reviews+Form), PopularNearby, filterClubs |
| `trainers/` | TrainerCard (режимы `showcase` — аватар с точкой «свободен сегодня», имя `t-h4`, рейтинг, «от цена», чип «Доступен сейчас»; и `catalog`), TrainerList, **TrainerDetailPageClient** (hero 2-col с avatar-disc 132×132 (96 на 480) с инициалами, meta-col [chips city/experience/reviews → eyebrow `Trainer profile` → title → рейтинг и адрес → описание → stat-rail Цена/Услуг → stat-rail Контакты → ChipMarquee специализаций → CTA «Записаться к тренеру →» и «Связаться»], Reliability, Specializations 2-col, Works at через первый confirmed-link, Services со chips format/price/duration/venue, Schedule через `DetailScheduleWeek` с sub `${time}, ${room}`, Reviews+Form), PopularTrainers, TrainerAvailability (slot-блок «Свободные окна тренеров» через CardSlider+SlotCard), **trainer-preview** (`buildTrainerDirectory` и `getTrainerAvailability` принимают обязательный `targetDate` и фильтруют слоты по нему), trainer-utils, filterTrainers |
| `search/` | SearchBar (без кнопки «Рядом» — обработчика не было), SportFilters (чипы категорий эталона), SearchControlsPreview, CatalogResultsSection (`#results` — карточки, у карты свой `#map`), CitySelector (поле фильтра эталона; город в бейдже героя — из стора) |
| `catalog/` | Страница `/catalog`: карта «ключ → компонент» секций каталога, `load-catalog-data` (`fetchCatalogSources`/`buildCatalogData`, полный каталог без `limit`, `now` явно) |
| `schedule/` | UpcomingSessions (отбор по стору теми же фильтрами, что выдача — «слоты следуют за чипом»), getUpcomingSessions (шесть шагов: сегодня → не началось → есть места (`isSlotOpenToday`) → фильтры выдачи → по времени → первые N), ClubAvailability (slot-блок «Ближайшие занятия» через CardSlider+SlotCard, зеркало TrainerAvailability), getUpcomingSessions |
| `map/` | MapSection, MainMap, YandexMapProvider, useMapMarkers, MapPreviewSection, **MapThemeToggle** (pill 44×44 в правом верхнем углу `MainMap` как absolute sibling снаружи filter-контейнера, sun/moon SVG, активная горит lime, persist через `useMapThemeStore`, mounted-flag против SSR-mismatch). На тёмной теме CSS-фильтр `grayscale(1) invert(1)` применяется только к `canvas` YMaps3 — DOM-маркеры остаются в исходных цветах |
| `home/` | Витрина главной (фаза 38; `lucide-icons.tsx` — инлайн-SVG lucide 0.487 по ключу, без библиотеки): **HomeHero** (тёмная плашка, свечение токеном, волна, H1 display-шрифтом из `home-copy`; слоты под поиск, счётчики и колонку), **HomeHeroSection** (виджет + лента видов), **HeroSearch** (переключатель в общем `useFilterStore`, «Найти»/Enter → `/catalog#results` без потери запроса, выпадашка по фокусу, закрытие по клику вне/уходу фокуса с защитой от WebKit-`blur`), **SearchSuggest** (категории `getSports()`, популярные виды `?popular=5`, `listbox`, клавиатура), **HomeCounters** (`dl/dt/dd`, анимация с уважением `reduced-motion`, числа из `/stats/overview`), **FocusCard** («Сегодня в фокусе»: занятия дня, строки на `Button href`, «Все слоты» → каталог), **HeroCityBadge**, **HeroSportMarquee** (декор, `aria-hidden`), **HomeSteps** («Три шага», третий без дневника), **HomeFeatures** (четыре плитки; гостю плитка в кабинет открывает модалку входа как призыв), **HomeShowcase**/**ShowcaseAllLink** (карусели «Клубы» 6 и «Тренеры» 4 по рейтингу, порядок = ответу), **HomeCta** (финальный призыв; гостю «Создать аккаунт» → модалка, вошедшему «В кабинет»), **HomeContainer**, `sections.tsx` (карта «ключ → компонент» главной), `home-data.ts`, `load-home-data.ts` (`limit` 6/4, сводка; полный список клубов — только для «Сегодня в фокусе») |
| `booking/` | BookingActionBlock, BookingAuthGate |
| `profile/` (shell) | **ProfileSectionLoading** — общий skeleton для `loading.tsx` всех 17 подмаршрутов ЛК. ProfileLayoutShell, ProfileSidebar, ProfileMobileNav, ProfileBreadcrumb, profile-nav-items, AccessDeniedCard, UserNotificationPreferencesEditor (правит ящик: личный или названного лица), **AccountCredentialsSection** (блок «Учётные данные» в `AthleteSettings`/`ProviderSettings`: read-only почта/имя/тип кабинета, inline-edit телефона через `PATCH /api/users/:id`, свёрнутая секция смены пароля с тремя полями и visibility-toggle, под работой от чужого лица формы заменяются оранжевой плашкой) |
| `profile/` (публикация) | PublishClubModal, PublishTrainerModal, PublishModalShell, TagSelector, CitySuggestInput, AddressGeocoder, ScheduleSlotsEditor, AdditionalOfferingsEditor, publish-validation |
| `profile/` (athlete-секции) | AthleteAchievementsSection, AthleteFavoritesSection, AthleteReviewsSection, AthleteFeedbackSettingsSection (AthleteUpcomingBookingCard снят 38.25 — мёртвый), helpers (athlete-achievements, athlete-bookings, athlete-favorites, athlete-history, athlete-review-items) |
| `profile/` (provider-секции) | ProviderPublicationsSection (знак «проверено» у публикации), ProviderReviewsSection, ProviderSettingsSection, provider-helpers (ProviderBookingsSection снят 38.25 — мёртвый) |
| `profile/` (общее) | booking-status-labels, booking-status-tone — подписи и тона статусов записи |
| `profile/athlete/` | AthleteDashboard, AthleteSchedule, AthleteBookingTimeline, AthleteStats, AthleteFavorites, AthleteReviews, AthleteSettings |
| `profile/provider/` | ProviderDashboard, ProviderBookingsInbox, ProviderClients, ProviderStats, ProviderLinks, ProviderPublications, ProviderReviews, ProviderSettings, ProviderFinance, RejectBookingReasonModal |
| `profile/notifications/` | NotificationsListPage. ⚠️ `notification-copy` здесь больше не живёт: тексты, вёдра по дате и форматтер вынесены в `lib/` шагами 37.39–37.40 — из админки импортировать из `components/profile` нельзя, это стережёт текстовый сторож |
| `reviews/` | Пустой резерв под review-specific UI |

## Ключевые утилиты

### `apps/web/src/lib`

| Файл | Назначение |
|------|-----------|
| `server-api.ts` | Серверный клиент бэкенда для страниц: справочники, каталог, расписание, записи (`getBookings`, `getBookingsWhere`, `getClientBookings`, `getOwnPublicationBookings`, `mergeBookingsById`), отзывы, пользователи (`getUsers`, `getClientUsers`), связи, уведомления, заметки. Свои ошибки `SessionRequiredError` и `BackendUnavailableError` |
| `session.ts` | `readSession`, `requireSession`, `requirePerson`, `requireOwner`, `requireAdmin` — серверная проверка личности в лейаутах через `GET /api/auth/me`. `requireRole` удалён фазой 35 вместе с ролями: `requireAdmin` смотрит на вид учётной записи, `requireOwner` сверяет номер лица из адреса со списком лиц сессии и **отдаёт само лицо** |
| `face-scope.ts` | `loadFaceScope` — набор публикаций лица одним кэшируемым запросом (`cache` из React); срез истории клиентов снят 38.55 |
| `plural.ts` | `pluralRu`, `countRu`, словарь форм `PLURAL` — одно правило склонения по числу (`Intl.PluralRules`) вместо копий |
| `slot-spots.ts` | `isLowSpots`, `spotsLabel` — порог «мало мест» и подпись мест одним правилом для слотов и «Сегодня в фокусе» |
| `home-sections.ts`, `catalog-sections.ts` | Словари секций главной и каталога — только данные (`id`, подпись, порядок), `homeSectionHref`/`catalogSectionHref`; карты «ключ → компонент» — у страниц |
| `navigation.ts` | `HEADER_NAV`, `FOOTER_NAV`, `MOBILE_NAV` — пункты из словарей секций; у пункта необязательный `mode` (клик по «Клубы»/«Тренеры» ставит режим выдачи в сторе) |
| `home-copy.ts` | Тексты витрины одним словарём под ПРОСПОРТ; ключ заводится в коммите первого потребителя; сторож `home-copy-promises` — без обещаний вне фазы |
| `log-action-labels.ts` | Подписи и тона действий журнала; `LEGACY_ACTION_LABELS` — словарь прошлого (`admin_login`, `reliability_recompute`), не пересекается с живыми |
| `month-keys.ts` | `getMonthKey`, `shiftMonthKey`, `getCurrentMonthKey`, `formatMonthLabel`, `generateMonthRange` — помесячные оси графиков |
| `generate-password.ts` | `generatePassword`, `PASSWORD_ALPHABET`, `GENERATED_PASSWORD_LENGTH` — генератор пароля для админской формы |
| `utils.ts` | `cn`, `formatDate`, `formatPrice`, `formatPhone`, `formatCityDisplay`, `formatCityTitleCase`, `getTimeUntil`, `isValidCoordinates`, `getCityBoundingBox`, `resolveNames`, `buildDictMap`, `findBookingSlot`, `getTrainerSportIds`, `getScheduleClubId/TrainerId` + реэкспорт `getDateKeyInTimeZone`, `getTimeKeyInTimeZone`, `getBookingClubId/TrainerId` из `@sporthub/domain` |
| `slot-time.ts` | Реэкспорт `isSlotUpcoming` из `@sporthub/domain` — отсечение прошедших слотов строковым сравнением даты и времени |
| `provider-client-guards.ts` | Реэкспорт `isClientOfProvider` из `@sporthub/domain` |
| `notification-mailbox.ts` | `NotificationsMailbox`, `mailboxQuery`, `SUPERVISION_MAILBOX` — **ящик называется**, а не выводится из пустоты параметров; один словарь на ленту, колокольчик и счётчик (37.42, 37.51) |
| `notification-links.ts` | `subjectHref(subject, place)` — карта «предмет → адрес», зависящая от места (кабинет или служебная панель). При нулевом номере предмета ссылки НЕТ: мёртвая ссылка хуже её отсутствия (37.53, 37.72) |
| `notification-groups.ts` | `GROUP_LABELS`, состав тем ленты — один словарь подписей к словарю ключей `NOTIFICATION_GROUP_KEYS` (37.39) |
| `notification-pagination.ts` | Размеры страниц лент **вне** клиентских модулей: значение, импортированное серверной страницей из модуля с `'use client'`, приезжает заглушкой и уезжает в строку запроса (главная находка приёмки фазы 37) |
| `notification-buckets.ts`, `notification-copy.ts`, `notification-date.ts` | Вёдра по дате, тексты уведомлений и **один** форматтер даты вместо трёх — общие для человеческой ленты, ленты надзора и колокольчика (37.39, 37.40) |
| `service-portal-sections.ts` | Адреса разделов служебной панели — объявлены **один раз**; сторож краснеет на адрес, написанный буквами (37.68) |
| `moderation-filters.ts` | Отбор раздела модерации: живёт в адресе, а не в локальном состоянии — иначе переход из уведомления не может открыть нужную публикацию (37.54) |
| `face-scope.ts`, `face-cabinet-params.ts`, `service-faces.ts` | Лицо открытого кабинета: чьи данные показывать и что считать своим (фаза 35) |
| `contracts/reverse-mapping.ts` | `mapClubToFormState`, `mapTrainerToFormState` — разворот сущности в состояние формы правки |

### `packages/domain/src`

Правила без ввода-вывода, общие для фронта и бэкенда: `booking-fsm`, `booking-status`,
`booking-owner`, `discipline-config` (окно check-in, автоотмена pending; пороги надёжности сняты 38.26),
`booking-fsm` (в т.ч. `computeCancelReason` — переехал из вырезанного `reliability`), `time` (`isSlotAhead`, `isSlotOpenToday` — одно правило «свободное окно дня» для слотов клубов и чипа «Доступен сейчас»),
`moderation-actions` (`MODERATION_ACTION_SPECS` — семь полей на действие: `logAction`, `requiresReason`, `confirmation`, `oversightType`, `ownerNoticeType`, `preconditions`, `patch`), `brand` (`BRAND_NAME`, `BRAND_WORDMARK`), `permissions`
(`CAPABILITIES`, `hasCapability`, `capabilitiesOf`), `session-policy` (сроки по виду учётной
записи: у администратора сутки бездействия, у человека — две недели), `password-reset-policy`,
`notification-addressee` (`NOTIFICATION_ADDRESSEE_KINDS`, `NOTIFICATION_ADDRESSEE_LABELS`,
`NOTIFICATION_ADDRESSEE_SHAPE`, `isNotificationAddresseeKind`, `addresseeKindHasOwner`,
`addresseeKindFromFace` — вид адресата уведомления и карта формы строки, из которой
**собирается** ограничение целостности в базе; фаза 37),
`hide-kind`, `session-cookie`,
`notification-types` (`NOTIFICATION_TYPE_GROUP`, `REQUIRED_NOTIFICATION_TYPES`,
`canDisableNotificationType`, `isNotificationTypeEnabled`; модель «тип → роль»
удалена шагом 35.28a — видимость строки решает адресат), `athlete-streaks`,
`athlete-timeline-format`, `link-status`, `account-kind` (`ACCOUNT_KINDS`, `ACCOUNT_KIND_LABELS`,
`actorLabel`, `hasHumanAbilities`, `isAdminKind`, `accountKindOf`), `sorting`, `text-normalization`,
`trainer-sports`, `time` и Zod-схемы публикации `schemas/publish`.

### `packages/types/src`

`types.ts` — сущности и их поля; `constants.ts` — `DEFAULT_CITY`, `DEFAULT_MAP_CENTER`,
`DEFAULT_MAP_ZOOM`, `DEFAULT_LOCALE`, `DEFAULT_TIME_ZONE`, `USER_STATUSES`,
`BOOKING_STATUSES`, `PAYMENT_STATUSES`, `LOG_ACTIONS`, `LOG_ENTITY_TYPES`, `APP_LIMITS`.
Списка ролей и подписей типов кабинета здесь больше нет — оба удалены шагом 35.24.

## Данные — PostgreSQL

Данные лежат в PostgreSQL 16 (контейнер, порт 5434). Схема — `apps/api/prisma/schema.prisma`,
**29 таблиц**. Файлового хранилища и каталога `data/` в проекте нет: для чистой установки
есть `npm run db:seed`, для восстановления — дамп (`docker/PRODUCTION.md`, §8).

| Команда | Что делает |
| --- | --- |
| `npm run db:up` | Поднять базу. Тестовая база создаётся при первом подъёме тома |
| `npm run db:seed` | Дописать в базу набор для разработки. С шага 36.33 работает и на непустой базе: вставка по естественным ключам, живые строки не переписываются |
| `npm run db:psql` | Консоль базы |
| `npm run db:reset` | ⚠️ Снести том и создать базу заново |
| `npm run db:sessions:prune` | Убрать протухшие сессии |
| `npm run test:db` | Поднять базу, дождаться готовности и прогнать тесты |
| `npm run db:test:clean` | Убрать схемы, оставшиеся от прогонов тестов. Работает только с тестовой базой |
| `npm run app:up` | Поднять базу, бэкенд и фронт в контейнерах (профиль `app`) |

### Таблицы

| Группа | Таблицы |
| --- | --- |
| Справочники | `cities`, `sports`, `tags`, `amenities`, `specialties`, `work_formats` |
| Люди и публикации | `users`, `clubs`, `trainers` |
| Доступ | `sessions`, `password_reset_tokens` |
| Каталог и записи | `offerings`, `schedule`, `bookings`, `reviews` |
| Служебное | `notifications`, `trainer_club_links`, `logs`, `provider_client_notes` |
| Связующие | `club_sports`, `club_tags`, `club_amenities`, `trainer_sports`, `trainer_specialties`, `trainer_work_formats`, `user_favorite_clubs` |
| Вынесенные структуры | `club_images`, `booking_status_transitions`, `user_notification_preferences` |

### Где выполняется отбор

Отбор, порядок и подсчёты выполняет **база**, а не код после чтения.

| Что | Как отбирается |
| --- | --- |
| Расписание | `ScheduleFilter`: владелец, номера, клуб, тренер, вид спорта, день, свободные места, порядок. Всё в `where`/`orderBy` |
| Публикации | `PublicationStatusFilter`: статус (в обе стороны — «кроме скрытых» и «только скрытые»), номера, вид спорта (соединением по связующей таблице), нижняя граница рейтинга, город, поиск по названию без учёта регистра |
| Записи | `BookingsFilter` + подсчёты `count`, `countByCreatedDay`, `countBySport`, `countByOwner` |
| Журнал | `findPage` — условие, порядок, `LIMIT/OFFSET` и счёт одним заходом |
| Уведомления | Постраничность, отбор по настройкам пользователя и счётчик непрочитанных — в запросе |
| Отзывы | Порядок «свежие первыми» с тай-брейкером по номеру — в запросе |
| Места в слотах | `sumSeats` — агрегат `SUM`, а не чтение расписания ради двух чисел |
| Вход | Поиск по уникальному индексу почты |

Что осталось в памяти **осознанно** — и почему:

- **Слияние, порядок и срез в очереди публикаций.** Клубы и тренеры — разные таблицы
  с независимыми последовательностями номеров; честный `UNION ALL` с постраничностью
  дороже пользы при нынешнем размере каталога, а порядок держится на порядке слияния.
  Отбор при этом уехал в запрос, поэтому материализуется только подошедшее.
- **Город у тренеров в сводке.** Правило другое — «тренер без города показывается во всех
  городах», — и точным совпадением оно не выражается. Заводить под него поле фильтра ради
  единственного места значило бы завести абстракцию без второго потребителя.
- **Поиск по подстроке идёт без индекса.** Отбор делает база (`ILIKE`), но полнотекстовый
  поиск изменил бы выдачу и вынесен за границы фазы.
- **Ранжирование верхушек в сводке** — над уже сгруппированным результатом, не над таблицей.

### Что база делает сама

- **Уникальность:** почта пользователя, адрес-ссылка клуба и тренера, нормализованное имя
  города; частичными индексами — одна действующая запись на пару «слот + участник»
  и одна действующая связь на пару «тренер + клуб».
- **Целостность:** ровно один владелец у услуги, слота и записи; ровно один адресат у отзыва;
  оценка от 1 до 5; конец занятия позже начала; **подтверждение публикации — парой**
  `verified_at` / `verified_by_user_id` у `clubs` и `trainers` (односторонний CHECK: «кем»
  только вместе с «когда»; удаление администратора обнуляет «кем», а не дату — 38.40);
  цвет вида спорта `sports.color` — `#rrggbb` строчными (CHECK, 38.80).
- **Каскады:** удаление клуба или тренера уносит услуги, слоты, записи и отзывы; слот
  с записями удалить нельзя — записи сначала отменяются.
- **Счётчик мест** меняется одной операцией с условием: овербукинг невозможен.
- **Индексы** заведены под каждый `where` + `orderBy`: статус и рейтинг публикаций, владелец
  и дата слота, участник и период записей, адресат и свежесть отзывов, действие и время
  в журнале, срок жизни сессий и токенов восстановления.

## Функциональные домены

Каталога `feature-docs/` на диске сейчас нет: он в `.gitignore` и жил только локально,
из истории не восстанавливается. Когда он вернётся, точкой входа снова станет
`feature-docs/_overview.md` — карта доменов и связей между ними.

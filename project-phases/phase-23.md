# Phase 23

> Этот файл содержит одну фазу проекта целиком. Главный вход в контекст — `CLAUDE.md`.
> Навигация по фазам — через `PHASES_OVERVIEW.md`.
> В ежедневной работе открывай прежде всего активную фазу и не перечитывай все phase-файлы подряд без необходимости.
> Структура фазы сохраняется в исходном стиле: заголовок фазы, краткий результат, шаги по порядку, затем чеклист и статус.
> Перед стартом новой фазы проверь, что для неё уже есть отдельный `phase-XX.md`, и после завершения шагов или фазы синхронизируй статус здесь, в `PHASES_OVERVIEW.md`, `CLAUDE.md`, `README.md` и при необходимости в `STACK_OVERVIEW.md`.

## Phase 23: Доработка publish-модалок провайдера — Yandex Suggest, справочники, контакты и UX-правки

> После этой фазы: модалки «Опубликовать клуб» и «Опубликовать тренера» получают живой Yandex Geosuggest для города и адреса, runtime-добавление городов в общую базу, новые JSON-справочники `tags`, `amenities`, `work-formats`, `specialties` с единым UX «поиск + выбор + крестик» (TagSelector). Направления (sports) переиспользуют тот же TagSelector без возможности создания. Появляется новый блок «Контактная информация» с телефоном (обязательным) и опциональными ссылками. Время слотов расписания ограничено шагом 10 минут на уровне UI и Zod. В слотах появляется «Место проведения» (свободный текст) и dropdown направления, ограниченный выбором выше. У тренера мульти-спорт и мультивыбор формата работы. «Формат предоставляемой услуги» остаётся enum из 3 значений и отображается как 3 чипа. Публичные поверхности (каталог, detail-страницы, карта, фильтры) продолжают работать корректно на новой модели данных.

Phase 23 — фаза UX-доработок и расширения модели данных publish/edit-flow. Не затрагивает booking, auth, admin, модерацию и аналитику.

**Пререквизит:** Phase 15 (edit-flow), Phase 19 (Yandex Карты + геокодирование) завершены.

---

### Ключевые решения

**Yandex Geosuggest вместо ручного ввода города и адреса:**

- Новый серверный API route `POST /api/suggest` — прокси к Yandex Geosuggest API (`suggest-maps.yandex.ru/v1/suggest`).
- Ключ — `YANDEX_SUGGEST_API_KEY` (server-only, без `NEXT_PUBLIC_`). Уже настроен в `.env.local`. Запросы идут только с сервера, чтобы не светить ключ в браузере.
- Лимит тарифа — 1000 запросов/день. Для MVP достаточно.
- Клиентский хук `useSuggest` с debounce 250–300 мс и кэшем последнего запроса, чтобы не прожигать лимит.
- Существующий `POST /api/geocode` (Phase 19) остаётся — он отвечает за финальное получение координат по выбранному адресу. Geosuggest отвечает только за подсказки.
- Кнопка «Проверить адрес» в `AddressGeocoder` остаётся, но при выборе подсказки геокодирование срабатывает автоматически.

**Города через JSON-справочник с runtime-добавлением:**

- Константа `AVAILABLE_CITIES` в `src/lib/constants.ts` убирается. Единая точка правды — новый `src/data/cities.json`.
- Коллекция `cities: City[]` добавляется в `DataCollectionMap` в `src/lib/db.ts`. Тип `City = { id, name, coordinates, createdAt }`.
- Seed — текущие 6 городов из `AVAILABLE_CITIES` переносятся в `cities.json`.
- При публикации клуба/тренера в новом городе (которого нет в `cities.json`) — город автоматически добавляется через `appendCity()` с дедупликацией (проверка через `normalizeCity()`). Координаты центра берутся из Geosuggest-результата или из `/api/geocode`-ответа.
- Новый API route `GET /api/cities` — read-only, возвращает `{ success: true, data: City[] }`. Нужен для client-компонентов admin-панели (ModerationPage, AnalyticsFilters), которые не могут получить данные через SSR props.
- `CitySelector` на главной и фильтр каталога читают список городов: серверные компоненты через `getCities()`, клиентские — через `GET /api/cities` или SSR props.
- Все 6 файлов-потребителей `AVAILABLE_CITIES` обновляются: CitySelector, useSyncCityFromAuth, MainMap, ModerationPage, AnalyticsFilters, тесты.

**Справочники тегов, удобств, форматов работы и специализаций:**

- Новые JSON-коллекции: `tags.json`, `amenities.json`, `work-formats.json`, `specialties.json`.
- Каждая сущность со схемой `{ id: EntityId, name: string, createdAt: ISODateTimeString }`.
- Наполнение — вручную через JSON-файлы (провайдер не может создавать новые значения из формы в MVP).
- Типы в `Club`/`Trainer` меняются на `EntityId[]`:
  - `Club.tags: string[]` → `Club.tagIds: EntityId[]`
  - `Club.amenities: string[]` → `Club.amenityIds: EntityId[]`
  - `Trainer.specialties: string[]` → `Trainer.specialtyIds: EntityId[]`
  - Добавляется **новое** поле `Trainer.workFormatIds: EntityId[]` (ранее workFormat существовал только в form-state и не персистился в entity)
- Breaking change по типам допустим, потому что `clubs.json` и `trainers.json` пустые (заполняются через publish-flow). Seed-данных с этими полями нет. Мигрировать нечего.

**Единый TagSelector-компонент:**

- Новый компонент `src/components/profile/TagSelector.tsx` — UI «поиск + выбор из найденного + крестик для удаления».
- Используется для: sports (выбор из `sports.json`, без создания), tags, amenities, work-formats, specialties (все из своих JSON, без создания).
- Один компонент, 5 применений. Никаких кастомных селектов на каждое поле.

**Формат предоставляемой услуги — остаётся enum:**

- `OfferingFormat` в `src/types/index.ts` не трогаем. Остаются 3 значения: `'group' | 'personal' | 'mini_group'`.
- В модалке тренера блок «Тип» переименовывается в «Формат предоставляемой услуги» и превращается в 3 чипа (не TagSelector): «Групповое», «Персональное», «Мини-группа». Выбор одного, клик по выбранному — снятие. При необходимости будущей фазой можно перевести в справочник.

**Мульти-спорт у тренера:**

- `Trainer.sportIds: EntityId[]` уже поддерживает мультивыбор на уровне типа (Phase 8).
- Форма тренера сейчас ограничивает выбор одним значением (form-state `sport: string`). Переводим на TagSelector с мультивыбором в тот же формат, что и у клуба.
- Маппинг `form → trainer.sportIds` в `publish-trainer.ts` и `reverse-mapping.ts` обновляется. Reverse-mapping у существующих тренеров тоже должен корректно восстанавливать мультивыбор.

**Направление в слоте расписания:**

- Сейчас `ScheduleSlotForm.discipline` — свободный текст в form-state. Тип `Schedule` уже имеет `sportId: EntityId` — менять entity не нужно.
- Form-state слота: `discipline: string` → `sportId: EntityId`. Становится dropdown из выбранных выше `sportIds` публикации. Если выбран один — auto-select, поле disabled. Если несколько — обязательный выбор одного из них.
- Маппинг form↔persisted обновляется: `form.sportId` ↔ `Schedule.sportId` (прямой, без lookup по имени).
- Zod-валидация на сервере: `slot.sportId ∈ publication.sportIds`. Защищает от обхода через DevTools.
- При удалении sportId из публикации (в edit-flow), если он использовался в каком-то слоте, — при submit показываем ошибку и просим поправить слоты.

**Время слотов с шагом 10 минут:**

- UI: `<input type="time" step="600">` (600 секунд = 10 минут). Нативный браузерный picker в большинстве случаев даёт шаг 10 минут.
- Zod: `/^([01]\d|2[0-3]):[0-5]0$/` — защита от обхода. Ужесточаем существующую схему слотов.

**«Место проведения» в слоте:**

- В form-state слота поле `location`, в entity Schedule — `room`. Маппинг `form.location → entity.room` уже реализован в contracts, менять не нужно.
- Лейбл UI: «Место проведения», плейсхолдер «Например: Зал №2, Большой ринг, Татами 1».
- Тип не меняется — остаётся свободный текст. Полноценная модель «Gym/Room» — отложенная задача.

**Блок «Контактная информация»:**

- В обеих модалках появляется секция «Контактная информация».
- Поля: `phone` (обязательное), `email` (опциональное), `vk`, `telegram`, `facebook` (все опциональные, трактуются как ссылки в будущем).
- `phone` и `email` уже существуют у Club — переиспользуем.
- Для Trainer `phone` сейчас не в типе — добавляем в тип `Trainer` и в form-state.
- Новые поля `vk?`, `telegram?`, `facebook?` добавляются в оба типа `Club` и `Trainer` как опциональные.
- Валидация: phone обязателен и соответствует базовой маске; остальные — базовая string-валидация без жёстких правил (строки могут быть и username, и полной ссылкой).

**Лимит слотов расписания:**

- Максимум 3 слота сохраняется (ScheduleSlotsEditor, maxSlots prop).
- Лейбл: «Добавьте от 1 до 3 тренировочных слотов».

**Область работы (Scope-Guard):**

- Phase 23 — только publish/edit-flow модалок провайдера и затронутые ими публичные поверхности (карточки, detail-страницы, фильтры каталога, popup на карте, ЛК спортсмена — AthleteFavoritesSection).
- Не трогаем: booking-flow, auth, admin-модерацию (только чтение справочников при необходимости), аналитику, логирование (использует уже существующую инфру Phase 20).
- Логирование: существующие `publish_create`/`publish_update` уже записывают события в `logs.json`. Новых типов `LogAction` не добавляется.

---

### Step 23.1: Справочники — JSON-коллекции, типы и db.ts

- **Действие:**
  - добавить в `src/types/index.ts` интерфейсы:
    - `City extends BaseEntity` — `{ name: string; coordinates: Coordinates }`
    - `Tag extends BaseEntity` — `{ name: string }`
    - `Amenity extends BaseEntity` — `{ name: string }`
    - `WorkFormat extends BaseEntity` — `{ name: string }`
    - `Specialty extends BaseEntity` — `{ name: string }`
  - создать новые JSON-файлы в `src/data/`:
    - `cities.json` — seed из текущих 6 городов (миграция из `AVAILABLE_CITIES` с координатами центров)
    - `tags.json` — стартовый seed (10–20 часто используемых тегов: «для начинающих», «для детей», «парковка», «душевые», etc)
    - `amenities.json` — стартовый seed удобств (10–20 значений)
    - `work-formats.json` — стартовый seed форматов работы тренера («в зале», «на выезде», «онлайн», «с детьми», «взрослые», etc)
    - `specialties.json` — стартовый seed специализаций тренера («подготовка к соревнованиям», «реабилитация», «детские группы», etc)
  - расширить `DataCollectionMap` в `src/lib/db.ts` (строки 23–33): добавить `cities`, `tags`, `amenities`, `workFormats`, `specialties`
  - добавить в `DATA_FILES` (строки 165–175): маппинг коллекций на файлы
  - добавить функции доступа в `src/lib/db.ts`:
    - `getCities()` — чтение списка городов
    - `appendCity(data)` — runtime-добавление города с **дедупликацией**: `const existing = cities.find(c => normalizeCity(c.name) === normalizeCity(name)); if (existing) return existing;`
    - `getTags()`, `getAmenities()`, `getWorkFormats()`, `getSpecialties()` — read-only (провайдер не создаёт)
  - обновить тестовую инфраструктуру: `createIsolatedDataDirectory()` автоматически подхватит новые файлы. В `seedTestData()` (`src/test/helpers/seed-fixtures.ts`) добавить инициализацию новых коллекций (пустые массивы или seed-данные для коллекций). Фикстуры entity (fixtureClub, fixtureTrainer) обновляются позже в Step 23.7.

- **Проверка:**
  - все 5 типов определены и экспортируются из `src/types/index.ts`
  - JSON-файлы существуют и валидны
  - `getCities()` возвращает 6 городов (миграция)
  - `appendCity()` атомарно добавляет новый город с id и createdAt
  - `appendCity()` с существующим городом возвращает его без дубликата
  - `getTags()`, `getAmenities()`, `getWorkFormats()`, `getSpecialties()` возвращают seed-данные
  - существующие тесты `db.ts` (clubs, trainers, bookings, logs) проходят

- **Тесты:**
  - `getCities()` — корректное чтение + порядок
  - `appendCity()` — новый id, createdAt, запись в JSON
  - `appendCity()` — дедупликация: повторный вызов с тем же именем → возвращает существующий
  - `getTags/Amenities/WorkFormats/Specialties()` — каждая возвращает список
  - regression тесты на существующие коллекции `db.ts`

- **Ожидаемый результат:**
  - data-layer готов обслуживать 5 новых справочников без изменений публичного API модели.

### Step 23.2: Yandex Geosuggest — серверный API route и клиентский хук

- **Действие:**
  - проверить, что `YANDEX_SUGGEST_API_KEY` задан в `.env.local` (уже есть) и в `.env.example` добавить placeholder `YANDEX_SUGGEST_API_KEY=your_key_here`
  - создать API route `POST /api/suggest`:
    - принимает `{ text: string, types?: 'locality' | 'street' | 'house' | 'geo'; boundedBy?: [[lng1,lat1],[lng2,lat2]]; results?: number }`
    - вызывает Yandex Geosuggest API (`https://suggest-maps.yandex.ru/v1/suggest`) серверным `fetch`
    - Zod-валидация входного payload
    - возвращает `{ success: true, data: { suggestions: SuggestItem[] } }` или `{ success: false, error }`
    - `SuggestItem = { title: string; subtitle?: string; value: string; type: 'locality' | 'street' | 'house' | 'other' }`
    - обработка ошибок: отсутствие ключа, таймаут API, пустой результат, 429 (rate limit)
  - создать клиентский хук `src/hooks/useSuggest.ts`:
    - `useSuggest({ text, types, boundedBy, enabled })` → `{ suggestions, loading, error }`
    - debounce 250–300 мс
    - кэш последнего запроса (не дёргать API при повторе того же `text`)
    - отмена in-flight запроса при изменении `text` через AbortController
    - не делать запрос если `text.length < 2`

- **Проверка:**
  - `POST /api/suggest` с валидным payload возвращает массив подсказок
  - запрос без ключа → 500 с понятным сообщением
  - пустой text → 400
  - hook с `enabled: false` не вызывает API

- **Тесты:**
  - API route: успешный ответ (mock Yandex), validation error (невалидный payload), server error (отсутствие ключа)
  - hook: debounce, кэш, cancel, gating по длине строки
  - integration: hook → API route → mock Yandex → возвращает подсказки

- **Ожидаемый результат:**
  - инфраструктура подсказок готова к использованию в модалках.

### Step 23.3: Динамический город в обеих модалках — CitySuggestInput

- **Действие:**
  - создать компонент `src/components/profile/CitySuggestInput.tsx`:
    - input с автокомплитом через `useSuggest({ types: 'locality' })`
    - выпадающий список подсказок под input'ом
    - клик по подсказке → сохранение в form-state + сохранение координат центра города (для возможного runtime-добавления)
    - при blur без выбора из списка — нормализация через `normalizeCity()` и проверка: есть ли город в `cities.json`? если нет — помечаем в form-state флагом `isNewCity: true` и сохраняем координаты центра из последней валидной подсказки
  - интегрировать `CitySuggestInput` в `PublishClubModal` и `PublishTrainerModal` вместо текущего поля «Город» (сейчас город — часть `AddressGeocoder`, Select/Input)
  - расширить form-state обеих модалок полем `cityCoordinates?: Coordinates` (для runtime-добавления)
  - при успешной публикации (POST/PATCH) — серверная логика в `db.ts` проверяет: существует ли город в `cities.json`? если нет — вызывает `appendCity({ name, coordinates })` с дедупликацией

- **Проверка:**
  - ввод в поле «Город» подсказывает варианты через Yandex
  - выбор подсказки заполняет поле и сохраняет координаты
  - публикация в новом городе (например, «Новосибирск») автоматически добавляет его в `cities.json`
  - повторная публикация в том же новом городе — дубликат не создаётся

- **Тесты:**
  - render `CitySuggestInput` с mock подсказок
  - выбор подсказки → form-state обновлён
  - blur без выбора → `isNewCity: true` + сохранённые координаты
  - integration: POST /api/clubs в новом городе → `appendCity()` вызван
  - regression: существующие публикации в Самаре работают как раньше

- **Ожидаемый результат:**
  - город в модалках — живой автокомплит с runtime-добавлением.

### Step 23.4: Миграция AVAILABLE_CITIES → getCities() + GET /api/cities

- **Действие:**
  - создать API route `GET /api/cities`:
    - вызывает `getCities()` из `db.ts`
    - возвращает `{ success: true, data: City[] }`
  - обновить все 6 файлов-потребителей `AVAILABLE_CITIES`:
    - `src/components/search/CitySelector.tsx` — получать города через SSR props из корневого `page.tsx` (главная) или через `GET /api/cities`
    - `src/hooks/useSyncCityFromAuth.ts` — дефолт через `DEFAULT_CITY` (остаётся), список городов через SSR props или zustand-state, инициализированный на корневом layout
    - `src/components/map/MainMap.tsx` — координаты центра города при смене: через SSR props или lookup из списка городов
    - `src/components/admin/ModerationPage.tsx` — фильтр по городу: города через `GET /api/cities`
    - `src/components/admin/analytics/AnalyticsFilters.tsx` — фильтр по городу: аналогично через `GET /api/cities`
    - `src/test/lib/map-constants.test.ts` — обновить тест
  - удалить константу `AVAILABLE_CITIES` из `src/lib/constants.ts`. Все импорты заменить. Константу `DEFAULT_CITY` оставить.
  - паттерн замены: серверные компоненты → `getCities()` из db.ts напрямую; клиентские → SSR props или `GET /api/cities`

- **Проверка:**
  - `AVAILABLE_CITIES` нигде не импортируется (grep возвращает 0 результатов)
  - `CitySelector` на главной показывает все 6 seed-городов + новые (если были добавлены)
  - фильтры в ModerationPage и AnalyticsFilters работают с динамическим списком городов
  - MainMap корректно центрируется при смене города
  - `useSyncCityFromAuth` дефолтит на `DEFAULT_CITY` как раньше
  - существующий мульти-город flow (фильтрация каталога по городу) работает

- **Тесты:**
  - `GET /api/cities` — возвращает массив City
  - regression: `CitySelector` отображает все города
  - regression: MainMap центрирование по городу
  - regression: ModerationPage фильтр по городу
  - regression: AnalyticsFilters фильтр по городу

- **Ожидаемый результат:**
  - `AVAILABLE_CITIES` удалена, единая точка правды — `cities.json`, все потребители обновлены.

### Step 23.5: Рефактор AddressGeocoder — Geosuggest адреса

- **Действие:**
  - дорабатать существующий компонент `src/components/profile/AddressGeocoder.tsx` (НЕ создавать новый):
    - убрать из него логику выбора города (она перенесена в `CitySuggestInput` в Step 23.3)
    - заменить текстовый input адреса на автокомплит через `useSuggest({ types: 'street|house|geo', boundedBy: cityBounds })`
    - `cityBounds` — вычисляется из координат центра города +/- ~15 км (грубый bounding box). Хелпер `getCityBoundingBox(center: Coordinates)` в `src/lib/utils.ts`
    - подсказки включают улицу + дом + округ, если есть
    - клик по подсказке → заполнение form-state `address` + авто-вызов `POST /api/geocode` для точных координат
    - кнопка «Проверить адрес» и geocode-логика **остаются** (fallback, если провайдер не выбрал подсказку)
  - обновить интеграцию `AddressGeocoder` в обеих модалках: компонент теперь отвечает только за адрес (город — отдельный CitySuggestInput)
  - если `cityCoordinates` в form-state отсутствуют (старая публикация или edit без Suggest) — fallback на Suggest без boundedBy, только `types: 'geo'`

- **Проверка:**
  - ввод в поле «Адрес» после выбора города даёт подсказки улиц и домов в рамках этого города
  - выбор подсказки заполняет адрес и автоматически определяет координаты
  - смена города очищает поле адреса (чтобы не остались невалидные данные для нового города)
  - кнопка «Проверить адрес» по-прежнему работает

- **Тесты:**
  - render `AddressGeocoder` с mock подсказок
  - выбор подсказки → вызывается geocode, координаты в form-state
  - смена города → поле адреса очищено
  - кнопка «Проверить адрес» → вызывается geocode
  - integration: полный flow «ввести город (CitySuggestInput) → ввести адрес (AddressGeocoder) → выбрать подсказку → получить координаты»

- **Ожидаемый результат:**
  - адрес заполняется живым автокомплитом с привязкой к выбранному городу, существующая geocode-логика сохранена.

### Step 23.6: TagSelector-компонент — единый UI «поиск + выбор + крестик»

- **Действие:**
  - создать компонент `src/components/profile/TagSelector.tsx`:
    - пропсы: `{ label, items: { id, name }[], selectedIds, onChange, placeholder, multi = true, disabled }`
    - UI: кнопка «+ Добавить» → открывает поиск (input + выпадающий список)
    - поиск: фильтрация `items` по подстроке с нормализацией через `.trim().toLocaleLowerCase('ru-RU')`
    - клик по найденному item'у → добавляется в `selectedIds`, вызывается `onChange`
    - выбранные items отображаются чипами с крестиком
    - клик по крестику → удаление из `selectedIds`
    - если `multi: false` → при выборе заменяет текущий (для одиночного выбора, если понадобится)
    - empty state: «Ничего не найдено. Обратитесь к администратору для добавления.»
  - test-driven: сначала написать тесты, потом компонент

- **Проверка:**
  - render без выбранных — показывает только «+ Добавить»
  - клик на «+ Добавить» открывает поиск
  - ввод подстроки фильтрует список
  - клик по item'у добавляет в selectedIds
  - клик по крестику удаляет
  - `multi: false` не даёт выбрать больше одного

- **Тесты:**
  - render empty
  - open search → filter by query
  - select item → onChange called with updated ids
  - remove item via крестик
  - multi: false behavior
  - accessibility: keyboard navigation (Enter для выбора, Escape для закрытия)

- **Ожидаемый результат:**
  - готовый переиспользуемый компонент для 5 применений в обеих модалках.

### Step 23.7: Расширение типов Club и Trainer — tagIds, amenityIds, workFormatIds, specialtyIds, контакты

- **Действие:**
  - в `src/types/index.ts`:
    - `Club`:
      - удалить `tags: string[]` → добавить `tagIds: EntityId[]`
      - удалить `amenities: string[]` → добавить `amenityIds: EntityId[]`
      - добавить опциональные `vk?: string`, `telegram?: string`, `facebook?: string` (phone и email уже есть)
    - `Trainer`:
      - удалить `specialties: string[]` → добавить `specialtyIds: EntityId[]`
      - добавить **новое** поле `workFormatIds: EntityId[]` (ранее workFormat существовал только в form-state, не персистился в entity; это добавление, не замена)
      - добавить `phone?: string` (обязательное на уровне формы, опциональное на уровне типа для обратной совместимости seed)
      - добавить опциональные `vk?`, `telegram?`, `facebook?`
  - обновить Zod-схемы в `src/lib/schemas/publish.ts`:
    - `publishClubSchema` — `tagIds: z.array(z.number())`, `amenityIds: z.array(z.number())`, контакты
    - `publishTrainerSchema` — `sportIds: z.array(z.number()).min(1)` (мульти), `workFormatIds: z.array(z.number()).min(1)`, `specialtyIds: z.array(z.number()).min(1)`, `phone` обязательный, опциональные ссылки
    - Убрать `workFormat: z.string()`, `sport: z.string()`, `specializations: z.array(z.string())` — заменить на id-based
  - обновить form-state shape обеих модалок под новые поля:
    - `ClubFormState`: `disciplines: string[]` → `sportIds: EntityId[]`, `tags: string[]` → `tagIds: EntityId[]`, `amenities: string[]` → `amenityIds: EntityId[]`, добавить `vk`, `telegram`, `facebook`
    - `TrainerFormState`: `sport: string` → `sportIds: EntityId[]`, `specializations: string[]` → `specialtyIds: EntityId[]`, `workFormat: string` → `workFormatIds: EntityId[]`, добавить `phone`, `vk`, `telegram`, `facebook`
  - обновить контракты маппинга:
    - `src/lib/contracts/publish-club.ts` — form → payload с `tagIds`, `amenityIds`, контакты (прямой маппинг id, без lookup по имени)
    - `src/lib/contracts/publish-trainer.ts` — form → payload с `sportIds`, `workFormatIds`, `specialtyIds`, контакты
    - `src/lib/contracts/reverse-mapping.ts` — persisted entity → form-state: `club.tagIds → form.tagIds`, `trainer.specialtyIds → form.specialtyIds`, `trainer.workFormatIds → form.workFormatIds`
  - обновить `createClubPublication()` / `updateClubPublication()` / `createTrainerPublication()` / `updateTrainerPublication()` в `db.ts` — читают/пишут новые поля
  - обновить `src/components/profile/publish-validation.ts` — валидация `workFormatIds` вместо `workFormat`, `specialtyIds` вместо `specializations`
  - обновить тестовые фикстуры в `src/test/helpers/seed-fixtures.ts`:
    - `fixtureClub`, `fixtureClub2`, `fixtureClub3` — `tags: string[]` → `tagIds: EntityId[]`, `amenities: string[]` → `amenityIds: EntityId[]`
    - `fixtureTrainer`, `fixtureTrainer3`, `fixtureTrainer5` — `specialties: string[]` → `specialtyIds: EntityId[]`, добавить `workFormatIds`
  - обновить все тестовые файлы, использующие старые поля (10+ файлов):
    - `publish-club-contract.test.ts`, `publish-trainer-contract.test.ts`, `reverse-mapping.test.ts`, `publish-validation.test.ts`, `publish-schema.test.ts`, `edit-contract.test.ts`, `trainers.route.test.ts`, `logs-integration.test.ts`, `geocode-publish-flow.test.ts`, `dynamic-publish-flow.test.tsx`, `edit-public-surfaces-flow.test.tsx`, `publish-trainer-modal.test.tsx`, `helpers/publish-flow.ts`

- **Проверка:**
  - TypeScript компилируется без ошибок после breaking change типов
  - Zod отклоняет невалидный payload
  - create-flow и edit-flow работают с новыми полями
  - все существующие тесты обновлены и проходят

- **Тесты:**
  - unit: Zod-схемы на валидные и невалидные payload
  - unit: mapping `form → payload` для клуба и тренера
  - unit: reverse-mapping `persisted → form` — все id корректно восстанавливаются
  - integration: POST /api/clubs с новым payload → клуб создан корректно
  - integration: PATCH /api/clubs/[id] → обновление `tagIds` корректно
  - regression: booking-flow на клуб/тренера с новыми полями не ломается

- **Ожидаемый результат:**
  - модель данных готова к новым справочникам, форма и API синхронизированы.

### Step 23.8: Применение TagSelector, блок «Контактная информация» и лейблы в обеих модалках

- **Действие:**
  - `PublishClubModal`:
    - блок «Направления клуба» — заменить текущие Chip-чекбоксы на `TagSelector` (items из `sports.json`, multi)
    - блок «Добавить теги» — `TagSelector` (items из `tags.json`, multi)
    - блок «Удобства клуба» — `TagSelector` (items из `amenities.json`, multi)
    - блок **«Контактная информация»**:
      - `phone` — обязательное (существующий Input)
      - `email` — опциональное (существующий Input)
      - `vk` — опциональное (новый Input, плейсхолдер «vk.com/your-club или username»)
      - `telegram` — опциональное («@yourclub или ссылка»)
      - `facebook` — опциональное («ссылка на страницу»)
    - обновить лейблы и плейсхолдеры (батч-правка копирайта):
      - «Краткое описание» → **«Описание о вашем клубе»**, плейсхолдер → **«Расскажите о вашем клубе»**
      - «Цена от (₽)» → **«Укажите минимальную стоимость услуги "от"»**
      - «Стартовое расписание» → **«Добавить тренировочный слот»**
      - «Добавьте от 1 до 3 слотов расписания.» → **«Добавьте от 1 до 3 тренировочных слотов»**
      - в слоте: «Название занятия» → **«Укажите название тренировочного слота»**, плейсхолдер → **«Например: Тренировка по боксу»**
      - в слоте: «Цена (₽)» → **«Укажите цену данной тренировки»**
      - в слоте: «Зал» → **«Место проведения»**, плейсхолдер → **«Например: Зал №2, Большой ринг, Татами 1»**
  - `PublishTrainerModal`:
    - блок «Специализация»:
      - «Основной вид спорта» → `TagSelector` (items из `sports.json`, multi) — **мульти-спорт**
      - «Специализация» → `TagSelector` (items из `specialties.json`, multi)
    - блок «Формат работы» → `TagSelector` (items из `work-formats.json`, multi)
    - блок «Формат предоставляемой услуги» (бывший «Тип») — **НЕ TagSelector**, а 3 чипа: «Групповое», «Персональное», «Мини-группа». Выбор одного. Реализация: 3 button'а с `aria-pressed`, один selected
    - «Связать себя с клубом» — **не трогаем**, остаётся как есть
    - блок **«Контактная информация»** — аналогично клубу: phone обязательный, остальные опциональные
    - обновить лейблы и плейсхолдеры:
      - «Тип» → **«Формат предоставляемой услуги»**
      - «Цена (₽)» (в блоке услуги) → **«Укажите цену данной услуги»**
      - «Стартовое расписание» → **«Добавить тренировочный слот»**
      - «Добавьте от 1 до 3 слотов расписания.» → **«Добавьте от 1 до 3 тренировочных слотов»**
      - в слоте: «Название занятия» → **«Укажите название тренировочного слота»**, плейсхолдер → **«Например: Тренировка по боксу»**
      - в слоте: «Цена (₽)» → **«Укажите цену данной тренировки»**
      - в слоте: «Зал» → **«Место проведения»**, плейсхолдер → **«Например: Зал №2, Большой ринг, Татами 1»**
  - серверная часть: справочники передаются в модалки через `/profile/provider` page (Server Component) как props

- **Проверка:**
  - в обеих модалках все новые блоки используют TagSelector с правильными items
  - «Формат услуги» — 3 чипа, только один выбран, клик по выбранному снимает
  - «Контактная информация» — phone required, остальные optional
  - все лейблы и плейсхолдеры обновлены по списку
  - справочники подгружаются на сервере (нет лишних клиентских запросов)

- **Тесты:**
  - render `PublishClubModal` с mock справочниками — все блоки видны
  - выбор tag через TagSelector → form-state обновлён
  - render `PublishTrainerModal` — мульти-спорт работает
  - «Формат услуги» chips — клик по одному переключает выбор
  - phone пустой → валидация блокирует submit
  - vk/telegram/facebook пустые → submit проходит
  - регрессия render-тестов модалок (обновить ожидаемые строки на новые лейблы)
  - integration: полный flow «открыть модалку клуба → выбрать sportIds, tagIds, amenityIds → заполнить контакты → submit → в JSON корректные id»

- **Ожидаемый результат:**
  - UX выбора тегов и справочников единообразный, контакты собираются корректно, копирайт обновлён.

### Step 23.9: Слоты расписания — шаг 10 минут, «Место проведения», dropdown направления

- **Действие:**
  - в `ScheduleSlotsEditor` и соответствующем UI слота внутри обеих модалок:
    - поля «Начало» и «Окончание» — `<input type="time" step="600">`
    - поле `location` — лейбл «Место проведения» (уже обновлён в Step 23.8, здесь проверяем что реализация не противоречит). Маппинг `form.location → entity.room` уже существует в contracts.
    - поле «Направление» в слоте — переделать из текстового input в dropdown/select:
      - source — `formState.sportIds` публикации (id → name через sports справочник)
      - если `sportIds.length === 1` → auto-select, поле disabled
      - если `sportIds.length > 1` → обязательный выбор из списка
      - в form-state слота заменить `discipline: string` на `sportId: EntityId`
  - обновить Zod-схему слота в `src/lib/schemas/publish.ts`:
    - `startTime`, `endTime` — regex `/^([01]\d|2[0-3]):[0-5]0$/` (только шаг 10 минут)
    - `sportId: z.number().int().positive()` — обязательное (вместо `discipline: z.string()`)
    - серверная cross-field валидация: `slot.sportId ∈ publication.sportIds` (проверка в `publishClubSchema.refine()` / `publishTrainerSchema.refine()`)
  - обновить маппинг слотов в contracts:
    - `form → payload`: `form.sportId` → `Schedule.sportId` (прямой, без lookup по имени)
    - `persisted → form`: `Schedule.sportId` → `form.sportId` (прямой)
  - при edit: если провайдер удаляет sportId из публикации, а в слотах он используется → Zod на сервере отклоняет payload с ошибкой «В слотах используется направление, которое вы удалили из публикации. Поправьте слоты или верните направление.»

- **Проверка:**
  - `<input type="time">` с `step="600"` даёт только значения кратные 10 минутам
  - Zod отклоняет `startTime: "14:17"` как невалидное
  - dropdown направления показывает только выбранные выше sportIds
  - auto-select при одном sportId + поле disabled
  - при submit с невалидным sportId слота → 400 с понятным сообщением
  - при edit с удалённым sportId слота → 400

- **Тесты:**
  - unit: Zod regex `^([01]\d|2[0-3]):[0-5]0$` — валидные/невалидные
  - unit: refine на `slot.sportId ∈ publication.sportIds`
  - unit: UI слота с одним sportId → auto-select + disabled
  - unit: UI слота с несколькими sportIds → select работает
  - integration: POST /api/clubs с `startTime: "14:17"` → 400
  - integration: POST /api/clubs с `slot.sportId` не в publication.sportIds → 400
  - regression: существующие слоты со шагом 10 (например, `10:00`, `11:30`) остаются валидными

- **Ожидаемый результат:**
  - слот расписания имеет строгие правила по времени и направлению, защищён и на клиенте, и на сервере.

### Step 23.10: Публичные поверхности — карточки, detail-страницы, фильтры, popup карты на новой модели

- **Действие:**
  - **Перед началом реализации** — выполнить финальный grep по `.tagIds`, `.amenityIds`, `.specialtyIds`, `.workFormatIds` чтобы убедиться, что все точки чтения из Step 23.7 закрыты. Полная карта файлов для обновления:
    - `src/components/clubs/ClubCard.tsx:36` — `club.tags.slice()` → резолв `tagIds` → names
    - `src/components/clubs/ClubDetailPageClient.tsx:317-326` — `.map()` по tags и amenities → резолв
    - `src/components/clubs/ClubDetailPageClient.tsx:429` — affiliated trainer specialties → резолв `specialtyIds`
    - `src/components/clubs/filterClubs.ts:37` — `club.tags.join(' ')` для searchText → `resolveNames(club.tagIds, tagsDict).join(' ')`
    - `src/app/api/clubs/route.ts:71` — `...club.tags` для search index → `...resolveNames(club.tagIds, tagsDict)`
    - `src/components/trainers/TrainerCard.tsx:22,155` — `trainer.specialties.slice/map` → резолв `specialtyIds`
    - `src/components/trainers/TrainerDetailPageClient.tsx:371,374,390` — `.length` и `.map()` → резолв `specialtyIds`
    - `src/components/trainers/trainer-preview.ts:142,161` — `.join(' ')` и assign → `resolveNames(specialtyIds, ...)` для searchText и `TrainerDirectoryItem.specialties`
    - `src/components/profile/AthleteFavoritesSection.tsx:81` — `trainer.specialties.join(' • ')` → `resolveNames(trainer.specialtyIds, specialtiesDict).join(' • ')`
  - **Контакты на detail-страницах** (только detail, НЕ в карточках каталога — карточки позже, отдельной задачей):
    - `src/components/clubs/ClubDetailPageClient.tsx` — добавить блок «Контакты»: phone (уже есть), email (уже есть), + новые vk, telegram, facebook (если заполнены). Отображать иконками/ссылками.
    - `src/components/trainers/TrainerDetailPageClient.tsx` — добавить блок «Контакты»: phone (новое поле), email (если есть у тренера), + vk, telegram, facebook (если заполнены).
    - В карточках каталога (`ClubCard`, `TrainerCard`) контакты **НЕ отображаем** — это задача следующей фазы.
  - popup маркера на карте (`useMapMarkers` / `MainMap`) — проверить: если показывает amenities/tags/specialties, резолвить. Текущий popup показывает name, sportName, address, rating — **не затронут**, но верифицировать.
  - фильтры каталога — если фильтруются по tags/amenities, обновить на `tagIds`
  - паттерн резолвинга: на уровне Server Component страницы (`page.tsx`) загружаются справочники один раз и передаются как props. Клиентские компоненты используют Map-хелперы для O(1) lookup.
  - добавить хелперы в `src/lib/utils.ts`:
    - `resolveNames(ids: EntityId[], dict: { id: EntityId; name: string }[]): string[]`
    - `buildDictMap<T extends { id: EntityId }>(items: T[]): Map<EntityId, T>`

- **Проверка:**
  - карточки клубов и тренеров в каталоге корректно показывают теги и удобства (как имена, не как id)
  - detail-страницы корректно отображают все справочные значения
  - detail-страницы `/clubs/[slug]` и `/trainers/[slug]` показывают блок «Контакты» (phone, email, vk, telegram, facebook — если заполнены)
  - карточки каталога (`ClubCard`, `TrainerCard`) НЕ показывают контакты
  - popup маркера на карте работает
  - фильтры каталога работают
  - поиск в каталоге по тегам работает (searchText резолвится)
  - AthleteFavoritesSection корректно показывает специализации тренеров
  - ничего не падает с runtime-ошибкой

- **Тесты:**
  - unit: `resolveNames()`, `buildDictMap()`
  - render: `ClubCard` с tagIds → показывает names
  - render: `/clubs/[slug]` с новой моделью + блок контактов (phone, email, vk, telegram, facebook)
  - render: `/trainers/[slug]` с новой моделью + блок контактов
  - render: `AthleteFavoritesSection` с specialtyIds
  - integration: каталог клубов с поиском по тегу
  - regression: карта, popup, booking-страница

- **Ожидаемый результат:**
  - все публичные поверхности совместимы с новой моделью данных, ничего не сломалось.

### Step 23.11: Регрессия admin-панели, логов, аналитики и модерации

- **Действие:**
  - проверить что следующие поверхности корректно работают с новой моделью (они не должны были сломаться, но верифицируем явно):
    - страница модерации `/service-portal/moderation` — список публикаций, hide/unhide
    - страница логов `/service-portal/logs` — логи `publish_create`, `publish_update`, `moderation_*`
    - страница аналитики `/service-portal/analytics` — KPI и графики
    - booking-flow — `POST /api/bookings` на новых клубах/тренерах
    - auth — вход и impersonation
  - если какая-то из поверхностей читает старые поля Club/Trainer (`tags`, `amenities`, `specialties` как строки) — обновить чтение
  - если в аналитике были агрегации по `sport` через `trainer.sportId` (одиночный) — обновить на `sportIds[0]` или другую логику

- **Проверка:**
  - все admin-страницы открываются без ошибок на новой модели
  - модерация корректно скрывает/открывает публикации с новыми полями
  - логи записываются при publish/edit с новыми полями
  - booking создаётся на новых публикациях

- **Тесты:**
  - e2e / integration smoke test каждой поверхности

- **Ожидаемый результат:**
  - изменения Phase 23 не затрагивают admin-контур и booking, все регрессионные сценарии зелёные.

### Step 23.12: Финальная верификация и синхронизация документации

- **Действие:**
  - прогнать:
    - `npm run format`
    - `npm run lint`
    - `npm run test`
    - `npm run build`
  - ручной сценарий:
    - открыть `/profile/provider` → кнопка «Опубликовать клуб» → модалка
    - ввести «С» в поле «Город» → увидеть подсказки (Санкт-Петербург, Самара, Саратов…)
    - выбрать «Новосибирск» (нового в `cities.json` нет) — город runtime-добавляется
    - ввести адрес → увидеть подсказки улиц Новосибирска
    - выбрать улицу + дом → координаты определились
    - заполнить описание (новый плейсхолдер «Расскажите о вашем клубе»)
    - выбрать через TagSelector: 2 направления, 3 тега, 4 удобства
    - заполнить «Контактную информацию»: phone (обяз.), email, telegram
    - добавить 2 слота с временем 10:00, 11:30 — попробовать 14:17 → UI не даёт, Zod не пропускает
    - «Направление» в слоте — dropdown из 2 выбранных выше
    - «Место проведения» в слоте → свободный текст
    - submit → публикация создана
    - открыть `/` (главную) → Новосибирск появился в `CitySelector`, клуб виден на карте, в каталоге
    - открыть `/clubs/[slug]` → все теги, удобства, контакты отображаются именами (не id)
    - повторить публикацию в Новосибирске → дубликат города НЕ создаётся
    - повторить полный flow для тренера (включая мульти-спорт, мультивыбор workFormats, 3 чипа «Формат услуги»)
    - edit существующего клуба → reverse-mapping подхватывает tagIds, amenityIds, контакты
    - попробовать удалить из `sportIds` направление, которое используется в слоте → submit → понятная ошибка
    - admin: hide клуб → провайдер видит badge → edit → auto-restore → снова в каталоге
    - проверить booking-flow на новый клуб
    - проверить логи — `publish_create` и `publish_update` записаны
    - проверить AthleteFavoritesSection — специализации тренеров отображаются именами
  - синхронизировать документацию:
    - `CLAUDE.md` — обновить «Текущее состояние»
    - `PHASES_OVERVIEW.md` — статус Phase 23
    - `phase-23.md` — чек-лист
    - `PROJECT_STATE.md` — новые типы (City, Tag, Amenity, WorkFormat, Specialty), новые API routes (`/api/suggest`, `/api/cities`), новые/обновлённые компоненты (`TagSelector`, `CitySuggestInput`, рефакторённый `AddressGeocoder`), обновлённые поля Club/Trainer, новые JSON-файлы
    - `README.md` — прогресс
    - `STACK_OVERVIEW.md` — добавить Yandex Geosuggest в раздел интеграций
    - `feature-docs/publish-flow.md` — обновить «Текущая реализация», «Ограничения MVP», «План расширения» (справочники переехали в runtime JSON, Geosuggest, мульти-спорт, контакты)
    - `feature-docs/yandex-maps.md` — добавить Geosuggest в раздел геокодирования
    - `feature-docs/data-layer.md` — 5 новых коллекций, runtime-добавление городов
    - `feature-docs/_overview.md` — проверить связи, обновить статусы

- **Проверка:**
  - полный цикл publish → edit → hide → restore → booking работает на новой модели
  - существующие flows не сломаны
  - документация синхронизирована

- **Ожидаемый результат:**
  - Phase 23 закрыта, модалки провайдера получили живой Geosuggest, справочники и контактные поля; публичные поверхности стабильны.

---

### Чек-лист Phase 23

**Инфраструктура справочников (Step 23.1):**

- [x] Типы `City`, `Tag`, `Amenity`, `WorkFormat`, `Specialty` в `src/types/index.ts`
- [x] JSON-файлы `cities.json`, `tags.json`, `amenities.json`, `work-formats.json`, `specialties.json` с seed
- [x] Миграция 6 городов из `AVAILABLE_CITIES` в `cities.json`
- [x] `DataCollectionMap`, `DATA_FILES` расширены
- [x] `getCities`, `appendCity` (с дедупликацией), `getTags`, `getAmenities`, `getWorkFormats`, `getSpecialties` в `db.ts`
- [x] Тестовая инфраструктура подхватывает новые коллекции

**Yandex Geosuggest (Step 23.2):**

- [x] `YANDEX_SUGGEST_API_KEY` в `.env.local` (есть), placeholder в `.env.example`
- [x] `POST /api/suggest` работает через серверный прокси
- [x] Zod-валидация входа, обработка ошибок
- [x] Клиентский хук `useSuggest` с debounce, кэшем, cancel

**Динамический город (Step 23.3):**

- [x] `CitySuggestInput` создан и используется в обеих модалках
- [x] Runtime-добавление нового города в `cities.json` при публикации (с дедупликацией)

**Миграция AVAILABLE_CITIES (Step 23.4):**

- [x] `GET /api/cities` route создан
- [x] `AVAILABLE_CITIES` удалена из `constants.ts`
- [x] Все 6 потребителей обновлены: CitySelector, useSyncCityFromAuth, MainMap, ModerationPage, AnalyticsFilters, тесты
- [x] Существующий мульти-город flow не сломан

**Рефактор AddressGeocoder (Step 23.5):**

- [x] `AddressGeocoder` доработан: Geosuggest для адреса с привязкой к городу
- [x] Кнопка «Проверить адрес» и geocode-логика сохранены
- [x] Смена города очищает адрес

**TagSelector (Step 23.6):**

- [x] Компонент `TagSelector` реализован и покрыт тестами
- [x] Поддерживает multi и single режимы
- [x] Фильтрация по подстроке с нормализацией
- [x] Empty state «Ничего не найдено»

**Расширение типов и контракты (Step 23.7):**

- [x] `Club.tagIds`, `Club.amenityIds`, `Club.vk/telegram/facebook` (опц.)
- [x] `Trainer.workFormatIds` (новое поле), `Trainer.specialtyIds`, `Trainer.phone`, `Trainer.vk/telegram/facebook` (опц.)
- [x] Zod-схемы обновлены
- [x] Form-state обеих модалок обновлён на id-based поля
- [x] Контракты `publish-club.ts`, `publish-trainer.ts`, `reverse-mapping.ts` обновлены
- [x] `publish-validation.ts` обновлён
- [x] `db.ts` create/update работают с новыми полями
- [x] Тестовые фикстуры (6 entity) и тесты (10+ файлов) обновлены

**Применение TagSelector, контакты и лейблы (Step 23.8):**

- [x] Модалка клуба: направления, теги, удобства — TagSelector
- [x] Модалка тренера: sports (мульти), specialties, workFormats — TagSelector
- [x] «Формат услуги» — 3 чипа (НЕ TagSelector)
- [x] Блок «Контактная информация» в обеих модалках: phone required, остальные optional
- [x] Все лейблы и плейсхолдеры обновлены по списку (батч-правка копирайта)
- [x] Справочники передаются через SSR props

**Слоты расписания (Step 23.9):**

- [x] `<input type="time" step="600">` в обеих модалках
- [x] Zod regex `^([01]\d|2[0-3]):[0-5]0$` для startTime/endTime
- [x] Form-state слота: `discipline: string` → `sportId: EntityId`
- [x] Dropdown «Направление» в слоте из выбранных sportIds
- [x] Auto-select при одном sportId, disabled
- [x] Cross-field refine: `slot.sportId ∈ publication.sportIds`
- [x] Edit с удалённым sportId слота → понятная ошибка

**Публичные поверхности (Step 23.10):**

- [x] `ClubCard`, `ClubDetailPageClient` резолвят tagIds, amenityIds → names
- [x] `TrainerCard`, `TrainerDetailPageClient` резолвят specialtyIds → names
- [x] `AthleteFavoritesSection` резолвит specialtyIds → names
- [x] `filterClubs.ts` и `api/clubs/route.ts` резолвят tagIds для searchText
- [x] `trainer-preview.ts` резолвит specialtyIds для searchText и TrainerDirectoryItem
- [x] Detail-страницы `/clubs/[slug]` и `/trainers/[slug]` показывают блок «Контакты» (phone, email, vk, telegram, facebook)
- [x] Карточки каталога (`ClubCard`, `TrainerCard`) НЕ показывают контакты (задача следующей фазы)
- [x] Popup маркера карты работает (не затронут, но верифицирован)
- [x] Хелперы `resolveNames`, `buildDictMap` добавлены в `src/lib/utils.ts`
- [x] Тестовые фикстуры мигрированы

**Регрессия (Step 23.11):**

- [x] Модерация, логи, аналитика, booking, auth — работают
- [x] Нет чтения старых string-полей `tags`/`amenities`/`specialties`

**Финализация (Step 23.12):**

- [x] format / lint / test / build проходят (878 тестов; 1 flaky `provider-profile-page` проходит при повторе)
- [ ] Полный ручной сценарий — делает пользователь в браузере (нужен Yandex API ключ + UI)
- [x] Существующие flows (publish, edit, booking, admin, модерация) не сломаны (verified Step 23.11)
- [x] Документация синхронизирована (CLAUDE, PHASES_OVERVIEW, PROJECT_STATE, README, STACK_OVERVIEW, feature-docs: publish-flow, yandex-maps, data-layer, _overview)

**Выполнено:** Step 23.1 ✅, Step 23.2 ✅, Step 23.3 ✅, Step 23.4 ✅, Step 23.5 ✅, Step 23.6 ✅, Step 23.7 ✅, Step 23.8 ✅, Step 23.9 ✅, Step 23.10 ✅, Step 23.11 ✅, Step 23.12 ✅

**Следующий шаг:** — (Phase 23 закрыта, ждём определения Phase 24)

**Статус Phase 23:** ✅ ЗАВЕРШЕНА

### Принцип масштабирования

- Справочники (`tags`, `amenities`, `work-formats`, `specialties`, `cities`) при переходе на Prisma превращаются в полноценные таблицы; many-to-many связи `Club ↔ Tag`, `Club ↔ Amenity`, `Trainer ↔ WorkFormat`, `Trainer ↔ Specialty` реализуются через join-таблицы.
- `Trainer.sportIds: EntityId[]` на Prisma — join-таблица `TrainerSport`.
- `Trainer.workFormatIds: EntityId[]` на Prisma — join-таблица `TrainerWorkFormat`.
- Yandex Geosuggest остаётся как есть (внешний HTTP API); добавляется server-side кэш в Redis для популярных запросов.
- `appendCity()` при росте трафика переезжает в админ-модерацию: новые города требуют подтверждения админа (сейчас runtime-добавление без модерации).
- Пре-валидация адреса через Geosuggest + Geocoder → на Prisma дополняется индексом по `coordinates` (PostGIS) для быстрого spatial-поиска «клубы в радиусе 5 км».
- `OfferingFormat` enum можно будет перевести в справочник в отдельной фазе, если появится потребность в 5+ значениях.
- UI-справочники на клиенте — предзагруженные через SSR props; при росте — lazy-load через React Query / SWR c кэшем.

### Полная карта потребителей старых полей (справочник для Step 23.7 и 23.10)

> При реализации шагов 23.7 и 23.10 — сверяться с этим списком, чтобы не пропустить файлы.

**`Club.tags → Club.tagIds` (14 мест):**
- `src/lib/db.ts:877` — property assignment при create
- `src/lib/contracts/reverse-mapping.ts:63` — reverse mapping
- `src/lib/contracts/publish-club.ts:107,185` — form → entity
- `src/components/clubs/ClubCard.tsx:36` — `.slice()` для preview
- `src/components/clubs/filterClubs.ts:37` — `.join(' ')` для searchText
- `src/components/clubs/ClubDetailPageClient.tsx:317` — `.map()` для Badge
- `src/app/api/clubs/route.ts:71` — `...club.tags` для search index
- `src/components/profile/PublishClubModal.tsx:129,157,483` — form-state и UI
- `src/test/lib/publish-club-contract.test.ts:58` — assertion
- `src/test/lib/reverse-mapping.test.ts:217` — assertion
- `src/test/profile/publish-validation.test.ts:181` — validation

**`Club.amenities → Club.amenityIds` (11 мест):**
- `src/lib/db.ts:876` — property assignment
- `src/lib/contracts/reverse-mapping.ts:64` — reverse mapping
- `src/lib/contracts/publish-club.ts:106,184` — form → entity
- `src/components/clubs/ClubDetailPageClient.tsx:322` — `.map()` для Badge
- `src/components/profile/PublishClubModal.tsx:130,158,503` — form-state и UI
- `src/test/lib/publish-club-contract.test.ts:59` — assertion
- `src/test/lib/reverse-mapping.test.ts:218` — assertion
- `src/test/profile/publish-validation.test.ts:182` — validation

**`Trainer.specialties → Trainer.specialtyIds` (12 мест):**
- `src/lib/db.ts:1020` — property assignment
- `src/lib/contracts/reverse-mapping.ts:98` — reverse mapping
- `src/components/trainers/TrainerCard.tsx:22` — `.slice()` для preview
- `src/components/trainers/TrainerDetailPageClient.tsx:371,374,390` — `.length` и `.map()`
- `src/components/clubs/ClubDetailPageClient.tsx:429` — affiliated trainer specialties
- `src/components/profile/AthleteFavoritesSection.tsx:81` — `.join(' • ')`
- `src/components/trainers/trainer-preview.ts:142,161` — searchText и TrainerDirectoryItem
- `src/test/lib/publish-trainer-contract.test.ts:61` — assertion

**`workFormat` (form-state, 25+ мест — переход на workFormatIds):**
- `src/lib/schemas/publish.ts:66,133` — Zod и form-state type
- `src/components/profile/publish-validation.ts:34,198-199` — валидация
- `src/components/profile/PublishTrainerModal.tsx:60,136,472-482` — form-state и UI
- `src/lib/contracts/reverse-mapping.ts:99` — derived from offering.format
- `src/test/helpers/publish-flow.ts:98` — test helper
- `src/test/api/trainers.route.test.ts:22,54` — test
- `src/test/ui/edit-public-surfaces-flow.test.tsx:118` — test
- `src/test/lib/edit-contract.test.ts:80,148` — test
- `src/test/lib/geocode-publish-flow.test.ts:53` — test
- `src/test/lib/reverse-mapping.test.ts:359-365` — test
- `src/test/lib/publish-trainer-contract.test.ts:16,188-191` — test
- `src/test/profile/publish-validation.test.ts:48,249-250` — test
- `src/test/profile/publish-trainer-modal.test.tsx:29,170,277` — test
- `src/test/profile/publish-schema.test.ts:50` — test
- `src/test/ui/dynamic-publish-flow.test.tsx:120` — test
- `src/test/api/logs-integration.test.ts:59` — test

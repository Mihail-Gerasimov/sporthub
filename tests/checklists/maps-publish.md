# E2E: Maps и Publish-flow (Phase 19 + Phase 23)

**Role:** cross-role (guest + provider)
**Base URL:** http://localhost:3000
**Preconditions:**

- Seed; хотя бы 2 клуба и 2 тренера с координатами в одном городе
- `.env.local` содержит `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` и `YANDEX_SUGGEST_API_KEY`
- dev-сервер запущен

## Scenario: Главная карта

**Role:** guest

- [ ] **step-1** Navigate `/` — expect живая Яндекс-карта в секции (CDN-bootstrap не упал)
- [ ] **step-2** Assert маркеры клубов/тренеров текущего города виден
- [ ] **step-3** Click по маркеру — expect popup с названием сущности и кнопкой «Открыть»
- [ ] **step-4** Click «Открыть» — expect redirect на `/clubs/[slug]` или `/trainers/[slug]`
- [ ] **step-5** Переключить город через `CitySelector` — expect карта пересчитала центр и маркеры

## Scenario: Geosuggest при публикации города и адреса

**Role:** provider (id=2)

- [ ] **step-1** Login, `/profile/provider/publications` → «Опубликовать клуб» → модалка `PublishClubModal`
- [ ] **step-2** `CitySuggestInput` — начать вводить «Сам» → expect подсказки от Yandex Geosuggest
- [ ] **step-3** Выбрать подсказку — expect `cityCoordinates` проставлены
- [ ] **step-4** `AddressGeocoder` — ввести часть адреса → expect suggest, выбрать → координаты подставлены (геокодер)
- [ ] **step-5** Save publication → `/clubs/[slug]` — expect маркер на карте с корректными координатами

## Scenario: Справочники (tags, amenities, work-formats, specialties)

**Role:** provider (id=2)

- [ ] **step-1** В `PublishClubModal` секция тегов — expect `TagSelector` с уже существующими тегами, нет ручного ввода произвольных
- [ ] **step-2** Секция amenities — аналогично
- [ ] **step-3** В `PublishTrainerModal` секции specialties + work-formats — `TagSelector`'ы со справочниками
- [ ] **step-4** Assert выбор — id-based (в форме `specialtyIds`/`workFormatIds`/`tagIds`/`amenityIds`)

## Scenario: Мульти-спорт и multi-offering у тренера

**Role:** provider (id=5, `anna@trainer.local`)

- [ ] **step-1** Login, `/profile/provider/publications` → «Опубликовать тренера»
- [ ] **step-2** Секция «Спорт» — выбрать ≥2 вида спорта (мульти-выбор) → expect чипы
- [ ] **step-3** В секции `AdditionalOfferingsEditor` добавить 2 offering'а с разными параметрами
- [ ] **step-4** Save — expect публикация с `sportIds` массивом и тремя offering'ами (primary + 2 additional)
- [ ] **step-5** Edit этой публикации → expect все поля и доп-offerings заполнены из reverse-mapping
- [ ] **step-6** Изменить один additional offering → save → assert изменения сохранились, остальные не затронуты

## Scenario: Runtime-добавление нового города

**Role:** provider (id=2)

- [ ] **step-1** В `PublishClubModal` выбрать город, которого нет в `cities.json` (подсказка из Yandex Geosuggest)
- [ ] **step-2** Save клуб — expect появилась запись в `cities.json` через `appendCity()` (дедупликация)
- [ ] **step-3** `CitySelector` на главной теперь видит этот город

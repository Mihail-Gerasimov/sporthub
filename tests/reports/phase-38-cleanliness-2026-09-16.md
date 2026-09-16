# Чистота кода фазы 38 — сверка на 16.09.2026 (шаг 38.102)

Точка отсчёта — `425054e` (шаг 38.2, реестры фазы), сверка — HEAD после `2ecd1c5` (38.94).
Числа сняты из истории: версия сторожа в коммите, где он появился, против HEAD.

## 1. Сторожа чистоты — списки только убывают

| Сторож (файл в `src/test/design/`)                                                                                                                                      | Список                 | На старте (коммит)                   | Сейчас                                                             | Что ушло / примечание                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `no-raw-colors`                                                                                                                                                         | `LEGACY_CEILINGS`      | 30 файлов с потолком (`d65b6df`)     | **0**                                                              | все сырые цвета переведены на токены (38.14a и далее); `MASK_FILES` — только `globals.css`                         |
| `no-inline-style`                                                                                                                                                       | `LEGACY_IMPERATIVE`    | 1 файл, `MainMap.tsx: 9` (`07f96f9`) | **0**                                                              | `MainMap` переписан на DOM-узлы и классы (38.80)                                                                   |
| `no-inline-style`                                                                                                                                                       | `ALLOWED_PAIRS`        | 2 пары (`c1c8d74`)                   | 4 файла / 5 пар                                                    | ⚠️ вырос по ревью 38.13b: `CardSlider.transform`, `ChipMarquee.transform`, `Modal.overflow` — значения из рантайма |
| `component-size`                                                                                                                                                        | `LEGACY_CEILINGS`      | 32 файла (`c8ad3f8`)                 | **29**                                                             | ушли `app/page.tsx` (38.66/38.76), `MainMap.tsx` (38.80), `TrainerCard.tsx` (38.74); потолки остальных не выросли  |
| `no-dead-exports`                                                                                                                                                       | `LEGACY_DEAD_EXPORTS`  | 17 файлов / 35 имён (`64decf1`)      | **15 / 29**, число приколото `≤ 15`                                | ⚠️ на HEAD красный не по списку: `lib/slot-spots.ts: LOW_SPOTS` (38.81, Бэкенд) читает только его тест             |
| `file-header-comment`                                                                                                                                                   | `LEGACY_HEADERLESS`    | 66 файлов (`cfee176`)                | **50**                                                             | шапки дописаны по мере переноса                                                                                    |
| `green-text-on-light`                                                                                                                                                   | `LEGACY_CEILINGS`      | 0 (`3a1ecda`)                        | 0                                                                  | `RENDERED_ON_PLATE`: HeroSportMarquee, HomeCounters; `BRAND_MARK`: BrandLogo                                       |
| `single-instance`                                                                                                                                                       | приколотые ожидания    | карточки `[]`, карусели 3 файла      | клуб `[ClubCard]`, тренер `[TrainerCard]`, карусель `[CardSlider]` | 38.73/38.74/38.79                                                                                                  |
| `testid-registry` (приложение А)                                                                                                                                        | строки реестра         | 20 + 2 шаблона                       | 22 строки: 15 «остаётся», 7 «снят», 0 «переехал»                   | снятые названы с причиной (надёжность ×2, `map-placeholder`, «популярное» ×4)                                      |
| `stub-registry`                                                                                                                                                         | строки реестра         | 4 (`cfee176`)                        | **8**                                                              | ⚠️ вырос честно: четыре заглушки фото (Д-10) получили `STUB:` и строки (38.73/38.74/38.94)                         |
| `tokens-contract`                                                                                                                                                       | —                      | —                                    | + правило декора (38.87)                                           | сокращённый `background:` с декор-токеном — только у псевдоэлементов                                               |
| `button-single`, `responsive-contract`, `brand-single`, `menu-routes-exist`, `sport-dictionary-single`, `home-copy-promises`, `anchors-exist`, `client-boundary-values` | без списков исключений | —                                    | зелёные                                                            | сторожа без «наследия»: любая находка — красная сразу                                                              |

`npm run typecheck` на HEAD: импортов удалённых модулей нет (красные строки — только WIP Фронта 38.92 в `home-leaders.test.tsx`/`trainer-preview.test.ts`, не про удалённое).

## 2. Удалённые файлы `apps/web/src` с `425054e` — у каждого запись

| Файл                                                                        | Снят шагом       | Запись                                                                             |
| --------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `components/ui/ReliabilityBadge.tsx` + `test/ui/reliability-badge.test.tsx` | Э3 (38.22–38.27) | `phase-38-reliability-cut.md`; приложение А № 6–7 «снят»                           |
| `lib/reliability-map.ts`, `test/lib/reliability.test.ts`                    | Э3 (38.22–38.27) | `phase-38-reliability-cut.md`                                                      |
| `components/profile/AthleteUpcomingBookingCard.tsx` + тест                  | Э3 (38.22–38.27) | `phase-38-reliability-cut.md`                                                      |
| `components/profile/ProviderBookingsSection.tsx` + тест                     | Э3 (38.22–38.27) | `phase-38-reliability-cut.md`                                                      |
| `lib/booking-scopes.ts` + `test/lib/booking-scopes.test.ts`                 | Э3 (38.22–38.27) | `phase-38-reliability-cut.md`                                                      |
| `test/admin/dashboard-reliability-columns.test.tsx`                         | Э3 (38.22–38.27) | `phase-38-reliability-cut.md`                                                      |
| `components/map/MapPreviewSection.tsx` + `test/map/map-preview.test.tsx`    | 38.11            | реестр № 75 «ВЫКИНУТЬ»; приложение А № 21 «снят»                                   |
| `components/trainers/PopularTrainers.tsx`                                   | 38.79            | реестр § 7; приложение А № 11–12 «снят» (→ `CardSlider`)                           |
| `components/admin/HideReasonModal.tsx`                                      | 38.54            | ⚠️ **записи нет** — заменён общей `admin/ReasonModal` (Бэкенд)                     |
| `components/ui/StoreShowcase.tsx`                                           | 38.11            | ⚠️ **записи нет** — мёртвый компонент, снят сторожем `no-dead-exports` (`64decf1`) |
| `components/ui/UiShowcase.tsx`                                              | 38.11            | ⚠️ **записи нет** — то же                                                          |

Три файла без записи — вне дерева главной (приложение А их не покрывает) и вне среза
надёжности; «Проверке» — строка «снятые компоненты вне главной» в `phase-38-transfer.md`
(файл, шаг, чем заменён).

## 3. Новые компоненты фазы — «почему не `ui/*`»

| Компонент                                                                                                                | Шаг             | Строка в шапке                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------ | --------------- | -------------------------------------------------------------------------------------------------------- |
| `home/HomeHero.tsx`                                                                                                      | 38.65           | секция-плашка с собственной сеткой и волной — единственная; кнопки и карточки внутри — слотами из `ui/*` |
| `home/FocusCard.tsx`                                                                                                     | 38.70           | не `ui/Card`: тёмная верхняя зона и тень «парящего» слоя на плашке                                       |
| `home/HomeCta.tsx`                                                                                                       | 38.75           | primary — `ui/Button`; ссылка-«призрак» на плашке — у `Button` нет варианта для тёмной поверхности       |
| `home/HeroCityBadge.tsx`                                                                                                 | 38.78           | не `ui/Badge`: ссылка на тёмной плашке, `Badge` — статичная метка светлого холста                        |
| `home/HeroSearch.tsx`                                                                                                    | 38.67           | не `ui/Input`: рамка 1.5px в цвет каретки, иконка внутри (Фронт)                                         |
| `home/SearchSuggest.tsx`                                                                                                 | 38.68           | не `ui/Chip`/`ui/Modal`: `option` несовместим с `aria-pressed`, список при поле — не диалог (Фронт)      |
| `home/HomeCounters.tsx`                                                                                                  | 38.69           | не карточка и не бейдж — четыре числа с подписями на плашке (Фронт)                                      |
| `home/HomeSteps.tsx`                                                                                                     | 38.71           | не `ui/Card`: одна полоса с общей рамкой, карточки не самостоятельны (Фронт)                             |
| `home/HomeFeatures.tsx`                                                                                                  | 38.72           | не `ui/Card`: плитка — ссылка или кнопка целиком, `Card` — `div` (Фронт)                                 |
| `home/HomeLeaders.tsx`                                                                                                   | 38.66           | не `ui/Card`: у лидера тон, номер и плашка цены (Фронт)                                                  |
| `map/MapActiveCard.tsx`                                                                                                  | 38.80           | не `ui/Card`: слой над картой с собственным положением, без ховера                                       |
| `map/MapLegend.tsx`                                                                                                      | 38.80           | не `ui/Badge`: список, а не метка; слой над картой                                                       |
| `layout/HeaderMenu.tsx`                                                                                                  | 38.58           | не `ui/Modal`: панель навигации, прижатая к шапке, в её стекинге, под плашкой подмены (дописано 38.102)  |
| `layout/HeaderUser.tsx`                                                                                                  | 38.57           | «Войти» — `ui/Button`; плашка и аватар-ссылка — элементы шапки своих размеров (дописано 38.102)          |
| `ui/BrandLogo.tsx`, `ui/Hint.tsx`, `ui/VerifiedBadge.tsx`                                                                | 38.34, 38.51–52 | сами `ui/*` — вопрос не стоит                                                                            |
| `map/map-marker-element.ts`                                                                                              | 38.80           | не компонент: DOM-узел для `YMapMarker` без React                                                        |
| `home/home-data.ts`, `home/sections.tsx`, `home/HomeContainer.tsx`, `home/HomeHeroSection.tsx`, `home/HomeWorkbench.tsx` | 38.66/38.76     | словарь, карта и обёртки секций без собственного вида (Фронт) — строка не требуется                      |

**Строки нет — назвать владельцу:**

| Файл                           | Владелец | Замечание                                            |
| ------------------------------ | -------- | ---------------------------------------------------- |
| `admin/ModerationItemCard.tsx` | Бэкенд   | карточка строки модерации — почему не `ui/Card`      |
| `admin/ReasonModal.tsx`        | Бэкенд   | собран на `ui/Modal`? — строка про то, что добавляет |
| `admin/ToolbarSelect.tsx`      | Бэкенд   | почему не `ui/Select`                                |
| `home/HomeAvailability.tsx`    | Бэкенд   | секция слотов (38.81) — обёртка или свой вид         |

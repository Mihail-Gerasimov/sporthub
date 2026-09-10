# E2E: Phase 32 — переезд бэкенда на отдельный процесс

> 📌 **Историческая запись приёмки фазы 32.** Прогон снят
> (`tests/reports/phase-32-2026-08-19T02-38-49.md`), отметки в боксах не расставлялись.
> Модель площадки тогда была **ролевой**, и если этот чек-лист перегоняется ради
> проверки двухпроцессной схемы, три ожидания читать по текущему устройству:
> вход не шлёт тип кабинета (`POST /api/auth/login` — это `{ email, password }`,
> служебный вход админа — плюс `portal: 'service'`); «спортсмен / провайдер / админ»
> ниже означают **человека без лиц услуг / владельца лиц / служебную запись**;
> в кабинет `/profile/provider/*` пускает наличие лица, а `/profile/athlete/*`
> открыт любому вошедшему человеку. Санкций за неявки в продукте нет.

**Role:** cross-role (guest → athlete → provider → admin)
**Base URL:** http://localhost:3000
**Preconditions:**

- Собраны общие пакеты и бэкенд: `npm run build --workspace @sporthub/types`,
  `@sporthub/domain`, `@sporthub/api`.
- Подняты ОБА процесса: `npm run start --workspace @sporthub/api` (порт 3001) и
  `npm run dev --workspace @sporthub/web` (порт 3000).
  ⚠️ `npm run dev` в корне поднимает только фронт. Без бэкенда страницы откроются,
  но данных на них не будет — и это не даст ошибки, см. пояснение к step-1.
- `apps/api/.env` содержит ключи внешних служб карт: геокодер и подсказки адресов
  вызывает бэкенд. Ключ самой карты (`NEXT_PUBLIC_YANDEX_MAPS_API_KEY`) нужен фронту,
  а в контейнерном контуре compose читает корневой `.env`.
- База поднята и засеяна: `npm run db:up`, `npm run db:seed`. Шаги ниже меняют данные —
  вернуть исходное состояние можно так: `npm run db:reset`, затем
  `npm run db:migrate --workspace @sporthub/api` и `npm run db:seed`.

## Scenario: Проверка двухпроцессной схемы

- [ ] **step-1** GET /api/health через фронт — expect 200.
      ⚠️ Ключевой шаг. Серверный клиент `apiGet` при любой ошибке молча отдаёт
      пустой массив, поэтому страница без бэкенда вернёт 200 и будет выглядеть
      просто «пустой». Проверять надо данные, а не код ответа.
- [ ] **step-2** Navigate `/` — expect в выдаче карточки клубов и тренеров, счётчик направлений
- [ ] **step-3** Navigate `/clubs/<кириллический-slug>` — expect направления клуба, тренеры, отзывы с именами авторов
- [ ] **step-4** Navigate `/trainers/<slug>` — expect карточка тренера с услугами
- [ ] **step-5** Navigate `/booking/<id>` — expect блок записи с числом мест

## Scenario: Спортсмен

- [ ] **step-6** Login как athlete через `/api/auth/login` — сервер ставит cookie сессии; после логина обязательна навигация (стор наполняется ответом `GET /api/auth/me`)
- [ ] **step-7** Navigate `/profile/athlete/dashboard` — expect счётчик посещений и рейтинг надёжности
- [ ] **step-8** Проверить страницы кабинета: schedule, stats, favorites, reviews, notifications, settings — expect данные, а не пустые списки
- [ ] **step-9** POST /api/bookings на будущий слот — expect 201, статус pending
- [ ] **step-10** Повторная запись на тот же слот — expect 409 «Пользователь уже записан на это занятие»
- [ ] **step-11** DELETE или cancel своей записи — expect статус cancelled_by_athlete и освобождение места

## Scenario: Провайдер

- [ ] **step-12** Login как provider (`accountType: 'provider'`), navigate `/profile/provider/publications` — expect список публикаций с кнопками
- [ ] **step-13** Click «Редактировать» у клуба — expect модалка заполнена данными: название, адрес, направления, теги, удобства, слоты
- [ ] **step-14** Click «Сохранить изменения» — expect тост об успехе
- [ ] **step-15** `browser_evaluate`: fetch `/api/clubs/<id>` — expect адрес-ссылка, источник и картинки не затёрты, а занятые места в слотах сохранены
- [ ] **step-16** Подтверждение чужой записи — expect 403
- [ ] **step-17** Подтверждение своей записи — expect confirmed и уведомление атлету

## Scenario: Связи, карты, админ

- [ ] **step-18** POST /api/trainer-club-links — expect 201 pending
- [ ] **step-19** approve чужой стороной — expect 403; своей — expect confirmed; revoke — expect revoked
- [ ] **step-20** POST /api/geocode — expect координаты (ключ живёт на бэкенде)
- [ ] **step-21** POST /api/suggest — expect список подсказок
- [ ] **step-22** GET /api/analytics, /api/logs, /api/publications под сессией админа — expect непустые данные; без сессии те же маршруты отвечают 401
- [ ] **step-23** POST /api/moderation не-админом — expect 403; админом hide и unhide — expect 200
- [ ] **step-24** Navigate `/service-portal/dashboard` — expect список пользователей

## Известные ограничения прогона

- Карта на главной в браузере под Playwright не грузится: внешний домен карт
  заблокирован настройкой `--allowed-origins` в `.mcp.json`. Ключ при этом
  подставляется верно — видно в запросе. Проверять карту вручную.
- Слоты в рабочих данных могут быть в прошлом. Запись на прошедший слот сразу
  уходит в автоотмену — это верное поведение, для проверки цикла нужен будущий слот.

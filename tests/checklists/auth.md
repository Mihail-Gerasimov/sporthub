# E2E: Auth

**Role:** cross-face (гость / человек без лиц / человек с лицами / админ)
**Base URL:** http://localhost:3000
**Preconditions:**

- База поднята и засеяна: `npm run db:up`, затем `npm run db:seed`
- Подняты оба процесса: бэкенд `npm run start --workspace @sporthub/api` (`:3001`)
  и фронт `npm run dev --workspace @sporthub/web` (`:3000`)
- Браузер стартует без cookie: сессии предыдущих прогонов не переносятся
- ⚠️ Имя cookie сессии зависит от окружения: `sh-session` без `Secure`,
  `__Host-sh-session` с ним (`SESSION_COOKIE_NAME` в `apps/api/src/auth/session-cookie.ts`).
  В контейнерном контуре она приходит с `Secure` — по HTTP `curl` её вернуть надо руками

⚠️ **Ролей в продукте нет (фаза 35).** Учётки сида различаются не ролью, а **набором лиц
услуг**: лицо — это карточка тренера или клуб. Учётки берутся из
`apps/api/src/storage/seed/dev-seed.ts`, общий пароль — константа `DEV_PASSWORD` там же:

| id  | Учётная запись                                  | Лица услуг                                    |
| --- | ----------------------------------------------- | --------------------------------------------- |
| 1   | `admin@sporthub.local` «Администратор SportHub» | нет; служебная запись, `accountKind: 'admin'` |
| 2   | `owner@sporthub.local` «Ольга Владелец»         | клубы 1 «Ритм» и 2 «Баланс»                   |
| 3   | `trainer@sporthub.local` «Павел Тренеров»       | карточка тренера 1 «Мария Орлова»             |
| 4   | `athlete@sporthub.local` «Ирина Спортсменова»   | нет                                           |
| 5   | `both@sporthub.local` «Егор Двулицев»           | клуб 3 «Свобода» **и** карточка тренера 2     |

⚠️ **Адреса кабинета адресные (шаг 35.31).** Личный — `/profile/me/*`; кабинет лица —
`/profile/<вид>/<номер>/*`, где вид это `club` или `trainer`: `/profile/club/1/dashboard`,
`/profile/trainer/1/dashboard`. Прежние адреса живы и уводят на новые: `/profile/athlete/*`
отвечает **308** на `/profile/me/*` (соответствие одно для всех), `/profile/provider/*` —
**307** на кабинет первого лица из сессии (назначение зависит от вошедшего, поэтому
постоянным быть не может). Мусор в адресе (`/profile/venue/1`, `/profile/club/abc`)
и чужой номер лица дают один и тот же ответ — увод на `/`.

⚠️ **Сид и живая база — два разных набора учёток.** Шаги ниже написаны под **сид**
(`npm run db:seed`), и на свежей базе он воспроизводится целиком: id=1 `admin@`,
id=2 `owner@`, id=3 `trainer@`, id=4 `athlete@`, id=5 `both@`, клубы «Ритм» / «Баланс» /
«Свобода». На **живой** базе, где идут браузерные прогоны, набор другой — уборка данных
фазы 36 (этап Э7) снесла 22 мусорных клуба и 9 карточек прежних прогонов, и после неё
живых лиц осталось пять. Соответствие для ручного прогона по живой базе:

| Роль в шагах                | Учётка сида                   | Живая база (после уборки 36)   | Лица                                   |
| --------------------------- | ----------------------------- | ------------------------------ | -------------------------------------- |
| администратор               | id=1 `admin@sporthub.local`   | id=3 `admin@sporthub.local`    | нет, служебная                         |
| человек без лиц             | id=4 `athlete@sporthub.local` | id=1 `alexey@sporthub.local`   | нет                                    |
| владелец клубов             | id=2 `owner@sporthub.local`   | id=2 `marina@studio.local`     | клубы 1, 2, 3 **и** карточки 1, 2      |
| человек с двумя видами лиц  | id=5 `both@sporthub.local`    | id=2 `marina@studio.local`     | тот же: у неё есть и клубы, и карточки |
| ровно одна карточка тренера | id=3 `trainer@sporthub.local` | id=12 `trainer@sporthub.local` | карточка **85** «Павел Тренеров»       |

Пароль на живой базе тот же — `sporthub123`. ⚠️ `anna@trainer.local` (id=5) в этот список
**не входит**: её единственная карточка ушла с уборкой, лиц у неё теперь нет. Прогон
`tests/e2e-profile-auth-run.mjs` держал её как «человека ровно с одной карточкой»
и после уборки падал тремя шагами — привязка исправлена на `trainer@sporthub.local`.

## Scenario: Вход человеком без лиц

**Role:** id=4, `athlete@sporthub.local` / `sporthub123`

- [x] **step-1** Navigate `/` — expect кнопка «Войти» в Header'е
- [x] **step-2** Click «Войти» — expect модалка открылась, активна вкладка «Вход»
- [x] **step-3** Fill email=`athlete@sporthub.local`, password=`sporthub123`. Assert: **выбора
      типа кабинета в форме нет вовсе** — ни чипов «Спортсмен / Представитель услуг», ни
      блока «Тип аккаунта»; тело запроса `POST /api/auth/login` — ровно `{ email, password }`
- [x] **step-4** Submit — expect модалка закрылась, в Header видно имя «Ирина Спортсменова» и колокольчик
- [x] **step-5** Assert: личность живёт в серверной сессии — cookie сессии выставлена
      с флагом `HttpOnly` (из JS не читается), в `localStorage` личности нет вовсе,
      а `GET /api/auth/me` отдаёт `id=4`, `accountKind: 'person'`, **`faces: []`**
      и список `capabilities`. Поля `role` в ответе нет
- [x] **step-6** Assert: ссылка кабинета в Header ведёт в `/profile/me` — лиц нет,
      личный кабинет единственный. Открыть её: `/profile/me` отвечает 307 на
      `/profile/me/dashboard`

## Scenario: Вход человеком с лицами и перезалогин

**Role:** id=2, `owner@sporthub.local` / `sporthub123` (два клуба)

- [x] **step-1** Login как id=4 через POST `/api/auth/login` (см. scenario выше)
- [x] **step-2** Click «Выйти» в Header — expect имя исчезло, Header показывает «Войти».
      Assert: cookie сессии очищена, повтор её прежнего значения доступа не даёт
- [x] **step-3** Open AuthModal, вкладка «Вход», email=`owner@sporthub.local`, password=`sporthub123`
- [x] **step-4** Submit — expect вход успешный, Header «Ольга Владелец»
- [x] **step-5** Assert `GET /api/auth/me`: `faces` — **два элемента** `{ kind: 'club', id, name }`
      (клубы 1 и 2), `accountKind: 'person'`
- [x] **step-6** Assert: ссылка кабинета в Header ведёт в кабинет **активного лица** —
      `/profile/club/1`, а не в общий `/profile/provider`. Подпись ссылки — имя лица
      («Ритм»), а не «Кабинет представителя спортивных услуг»
- [x] **step-7** Прежний адрес: `/profile/provider/dashboard` — expect **307** на
      `/profile/club/1/dashboard` (кабинет первого лица из сессии). Адрес закладки
      и письма не отдаёт 404

## Scenario: Человек с двумя разными лицами

**Role:** id=5, `both@sporthub.local` — клуб **и** карточка тренера

Живой случай заказчика, ради которого затевалась фаза: свой зал плюс персоналки.

- [x] **step-1** Login `both@sporthub.local` — вход прошёл, Header «Егор Двулицев»
- [x] **step-2** Assert `GET /api/auth/me`: в `faces` **два элемента разного вида** —
      `{ kind: 'club' }` и `{ kind: 'trainer' }`
- [x] **step-3** Navigate `/profile/club/3/dashboard` — expect переключатель лиц
      (`data-testid="profile-face-switcher"`) виден, над ним подпись «Кабинет лица»,
      у кнопок `title` — «Клуб» и «Карточка тренера»
- [x] **step-4** Click по второму лицу в переключателе — expect адрес сменился на
      `/profile/trainer/2/dashboard`: кабинет принадлежит лицу, и номер стоит в адресе
- [x] **step-5** Logout, login `trainer@sporthub.local` (id=3, одно лицо), navigate
      `/profile/trainer/1/dashboard` — expect переключателя **нет в разметке вовсе**
      (не скрыт стилями): лицо одно, выбирать не из чего
- [x] **step-6** Под id=3 navigate `/profile/club/3/dashboard` (чужое лицо) — expect
      увели на `/`. Тот же ответ даёт `/profile/venue/1` и `/profile/club/99999`:
      по разнице ответов посторонний перебирал бы номера

## Scenario: Валидация на логине

**Role:** guest

- [x] **step-1** AuthModal, вход `notexisting@test` / `x` — expect 401 «Неверная почта или пароль».
      Тем же ответом отвечает и верная почта с неверным паролем: сообщение одно на все отказы,
      иначе форма становится перечислителем заведённых почт
- [x] **step-2** `POST /api/auth/login` с телом `{ email, password, accountType: 'athlete' }` —
      expect **400** «Некорректные данные запроса»: схема входа `.strict()`, типов кабинета
      больше нет и лишнее поле схема не принимает
- [x] **step-3** Вход `admin@sporthub.local` / `sporthub123` из обычной модалки — expect 403
      «Администраторы входят через /service-portal»
- [x] **step-4** `POST /api/auth/login` с телом
      `{ email: 'athlete@sporthub.local', password, portal: 'service' }` — expect 403
      «Служебный вход только для администраторов».
      Assert: обычного человека служебный признак не пускает, а не просто игнорируется

## Scenario: Регистрация с переживанием рестарта

**Role:** guest → человек

- [x] **step-1** AuthModal, вкладка «Регистрация». Assert: полей ровно четыре — имя, почта,
      телефон, пароль. **Выбора типа учётной записи нет вовсе**, кнопка отправки
      не заблокирована ожиданием такого выбора
- [x] **step-2** Заполнить email=`test-e2e-<timestamp>@local`, password=`qwerty1`, name=«Тест»,
      телефон. Submit — expect залогинен сразу, Header показывает имя
- [x] **step-3** Assert `GET /api/auth/me`: `accountKind: 'person'`, **`faces: []`** — регистрация
      заводит человека, лицо услуг заводится потом отдельным действием
- [x] **step-4** `POST /api/auth/register` с полем `accountType` — expect **400**
      «Некорректные данные регистрации»: схема `.strict()`
- [ ] **step-5** Повторная регистрация на тот же email — expect ошибка «Email уже зарегистрирован» (409)
- [x] **step-6** Logout + login этим же email — expect вход проходит (пользователь сохранён
      в базе и переживает рестарт процессов)

## Scenario: Вход админом

**Role:** admin (id=1, `admin@sporthub.local` / `sporthub123`)

- [x] **step-1** Navigate `/service-portal` — expect страница служебного входа
- [x] **step-2** Fill email и password — expect redirect в `/service-portal/dashboard`.
      Assert: тело запроса несёт **явный** признак `portal: 'service'` — служебность входа
      выражена полем, а не отсутствием поля
- [x] **step-3** Assert Header показывает «Администратор SportHub / Администратор» + ссылку
      «Панель управления» + кнопку «Выйти». `ImpersonationBanner` в этом сценарии **НЕ**
      рендерится — он появляется только при работе от чужого лица,
      см. `src/components/admin/ImpersonationBanner.tsx`
- [x] **step-4** Assert: колокольчика у служебной записи в Header **нет** — уведомляться
      не о чем, базового набора человека у админа нет (решение 13)
- [x] **step-5** Navigate `/profile/me/dashboard` под админом — expect увели на главную `/`
      (`requirePerson()`): личного кабинета у служебной записи нет. Прежний адрес
      `/profile/athlete/dashboard` приводит туда же — сначала 308, потом увод
- [x] **step-6** Navigate `/profile/provider/dashboard` под админом — expect увели
      на главную `/`: лиц у служебной записи нет, вести некуда

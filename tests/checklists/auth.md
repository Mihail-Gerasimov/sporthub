# E2E: Auth

**Role:** cross-face (гость / человек без лиц / человек с лицами / админ)
**Base URL:** http://localhost:3000
**Preconditions:**

- База поднята и засеяна: `npm run db:up`, затем `npm run db:seed`
- Подняты оба процесса: бэкенд `npm run start --workspace @sporthub/api` (`:3001`)
  и фронт `npm run dev --workspace @sporthub/web` (`:3000`)
- Браузер стартует без cookie: сессии предыдущих прогонов не переносятся

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

⚠️ **Адреса кабинета в коде прежние:** личный — `/profile/athlete/*`, лицо услуг —
`/profile/provider/*`. Адресных `/profile/me/*`, `/profile/club/[id]/*` из решения 5.8
на диске пока нет; когда появятся, адреса в чек-листе меняются вместе с ними.

## Scenario: Вход человеком без лиц

**Role:** id=4, `athlete@sporthub.local` / `sporthub123`

- [ ] **step-1** Navigate `/` — expect кнопка «Войти» в Header'е
- [ ] **step-2** Click «Войти» — expect модалка открылась, активна вкладка «Вход»
- [ ] **step-3** Fill email=`athlete@sporthub.local`, password=`sporthub123`. Assert: **выбора
      типа кабинета в форме нет вовсе** — ни чипов «Спортсмен / Представитель услуг», ни
      блока «Тип аккаунта»; тело запроса `POST /api/auth/login` — ровно `{ email, password }`
- [ ] **step-4** Submit — expect модалка закрылась, в Header видно имя «Ирина Спортсменова» и колокольчик
- [ ] **step-5** Assert: личность живёт в серверной сессии — cookie `sh-session` выставлена
      с флагом `HttpOnly` (из JS не читается), в `localStorage` личности нет вовсе,
      а `GET /api/auth/me` отдаёт `id=4`, `accountKind: 'person'`, **`faces: []`**
      и список `capabilities`. Поля `role` в ответе нет
- [ ] **step-6** Assert: ссылка кабинета в Header ведёт в `/profile/athlete` — лиц нет,
      личный кабинет единственный

## Scenario: Вход человеком с лицами и перезалогин

**Role:** id=2, `owner@sporthub.local` / `sporthub123` (два клуба)

- [ ] **step-1** Login как id=4 через POST `/api/auth/login` (см. scenario выше)
- [ ] **step-2** Click «Выйти» в Header — expect имя исчезло, Header показывает «Войти».
      Assert: cookie сессии очищена, повтор её прежнего значения доступа не даёт
- [ ] **step-3** Open AuthModal, вкладка «Вход», email=`owner@sporthub.local`, password=`sporthub123`
- [ ] **step-4** Submit — expect вход успешный, Header «Ольга Владелец»
- [ ] **step-5** Assert `GET /api/auth/me`: `faces` — **два элемента** `{ kind: 'club', id, name }`
      (клубы 1 и 2), `accountKind: 'person'`
- [ ] **step-6** Assert: ссылка кабинета в Header ведёт в кабинет лица (`/profile/provider`),
      подпись — имя активного лица, а не «Кабинет представителя спортивных услуг»

## Scenario: Человек с двумя разными лицами

**Role:** id=5, `both@sporthub.local` — клуб **и** карточка тренера

Живой случай заказчика, ради которого затевалась фаза: свой зал плюс персоналки.

- [ ] **step-1** Login `both@sporthub.local` — вход прошёл, Header «Егор Двулицев»
- [ ] **step-2** Assert `GET /api/auth/me`: в `faces` **два элемента разного вида** —
      `{ kind: 'club' }` и `{ kind: 'trainer' }`
- [ ] **step-3** Navigate `/profile/provider/dashboard` — expect переключатель лиц
      (`FaceSwitcher`) виден, заголовок «Кабинет лица», подписи вида — «Клуб»
      и «Карточка тренера»
- [ ] **step-4** Logout, login `trainer@sporthub.local` (id=3, одно лицо), navigate тот же
      адрес — expect переключателя **нет в разметке вовсе** (не скрыт стилями): лицо одно,
      выбирать не из чего

## Scenario: Валидация на логине

**Role:** guest

- [ ] **step-1** AuthModal, вход `notexisting@test` / `x` — expect 401 «Неверная почта или пароль».
      Тем же ответом отвечает и верная почта с неверным паролем: сообщение одно на все отказы,
      иначе форма становится перечислителем заведённых почт
- [ ] **step-2** `POST /api/auth/login` с телом `{ email, password, accountType: 'athlete' }` —
      expect **400** «Некорректные данные запроса»: схема входа `.strict()`, типов кабинета
      больше нет и лишнее поле схема не принимает
- [ ] **step-3** Вход `admin@sporthub.local` / `sporthub123` из обычной модалки — expect 403
      «Администраторы входят через /service-portal»
- [ ] **step-4** `POST /api/auth/login` с телом
      `{ email: 'athlete@sporthub.local', password, portal: 'service' }` — expect 403
      «Служебный вход только для администраторов».
      Assert: обычного человека служебный признак не пускает, а не просто игнорируется

## Scenario: Регистрация с переживанием рестарта

**Role:** guest → человек

- [ ] **step-1** AuthModal, вкладка «Регистрация». Assert: полей ровно четыре — имя, почта,
      телефон, пароль. **Выбора типа учётной записи нет вовсе**, кнопка отправки
      не заблокирована ожиданием такого выбора
- [ ] **step-2** Заполнить email=`test-e2e-<timestamp>@local`, password=`qwerty1`, name=«Тест»,
      телефон. Submit — expect залогинен сразу, Header показывает имя
- [ ] **step-3** Assert `GET /api/auth/me`: `accountKind: 'person'`, **`faces: []`** — регистрация
      заводит человека, лицо услуг заводится потом отдельным действием
- [ ] **step-4** `POST /api/auth/register` с полем `accountType` — expect **400**
      «Некорректные данные регистрации»: схема `.strict()`
- [ ] **step-5** Повторная регистрация на тот же email — expect ошибка «Email уже зарегистрирован» (409)
- [ ] **step-6** Logout + login этим же email — expect вход проходит (пользователь сохранён
      в базе и переживает рестарт процессов)

## Scenario: Вход админом

**Role:** admin (id=1, `admin@sporthub.local` / `sporthub123`)

- [ ] **step-1** Navigate `/service-portal` — expect страница служебного входа
- [ ] **step-2** Fill email и password — expect redirect в `/service-portal/dashboard`.
      Assert: тело запроса несёт **явный** признак `portal: 'service'` — служебность входа
      выражена полем, а не отсутствием поля
- [ ] **step-3** Assert Header показывает «Администратор SportHub / Администратор» + ссылку
      «Панель управления» + кнопку «Выйти». `ImpersonationBanner` в этом сценарии **НЕ**
      рендерится — он появляется только при работе от чужого лица,
      см. `src/components/admin/ImpersonationBanner.tsx`
- [ ] **step-4** Assert: колокольчика у служебной записи в Header **нет** — уведомляться
      не о чем, базового набора человека у админа нет (решение 13)
- [ ] **step-5** Navigate `/profile/athlete/dashboard` под админом — expect увели на главную `/`:
      личного кабинета у служебной записи нет

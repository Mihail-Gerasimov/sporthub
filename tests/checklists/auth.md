# E2E: Auth

**Role:** cross-role (guest / athlete / provider / admin)
**Base URL:** http://localhost:3000
**Preconditions:**

- База поднята и засеяна: `npm run db:up`, затем `npm run db:seed`
- Учётки берутся из сида `apps/api/src/storage/seed/dev-seed.ts` — по одной на каждую роль,
  общий пароль объявлен там же константой `DEV_PASSWORD`
- Подняты оба процесса: бэкенд `npm run start --workspace @sporthub/api` (`:3001`)
  и фронт `npm run dev --workspace @sporthub/web` (`:3000`)
- Браузер стартует без cookie: сессии предыдущих прогонов не переносятся

## Scenario: Вход атлетом через AuthModal

**Role:** athlete (id=4, `athlete@sporthub.local` / `sporthub123`)

- [ ] **step-1** Navigate `/` — expect кнопка «Войти» в Header'е
- [ ] **step-2** Click «Войти» — expect модалка открылась, активна вкладка «Вход»
- [ ] **step-3** Fill email=`athlete@sporthub.local`, password=`sporthub123`, выбрать тип кабинета «Спортсмен»
- [ ] **step-4** Submit — expect модалка закрылась, в Header видно имя «Ирина Спортсменова» и колокольчик
- [ ] **step-5** Assert: личность живёт в серверной сессии — cookie `sh-session` выставлена с флагом `HttpOnly` (из JS не читается), в `localStorage` личности нет вовсе, а `GET /api/auth/me` отдаёт профиль `id=4`, `role=athlete`

## Scenario: Вход провайдером и перезалогин

**Role:** provider (id=2, `owner@sporthub.local` / `sporthub123`, роль `club_owner`)

- [ ] **step-1** Login как athlete через POST `/api/auth/login` (см. scenario выше)
- [ ] **step-2** Click «Выйти» в Header — expect имя исчезло, Header показывает «Войти». Assert: cookie сессии очищена, повтор её прежнего значения доступа не даёт
- [ ] **step-3** Open AuthModal, вкладка «Вход», email=`owner@sporthub.local`, password=`sporthub123`, тип кабинета «Представитель спортивных услуг»
- [ ] **step-4** Submit — expect вход успешный, Header «Ольга Владелец»

## Scenario: Валидация на логине

**Role:** guest

- [ ] **step-1** AuthModal, вход `notexisting@test` / `x` — expect 401 «Неверная почта или пароль». Тем же ответом отвечает и верная почта с неверным паролем: сообщение одно на все отказы, иначе форма становится перечислителем заведённых почт
- [ ] **step-2** Вход `owner@sporthub.local` / `sporthub123`, но выбран тип кабинета «Спортсмен» — expect 403 «Неверный тип кабинета для этого email»
- [ ] **step-3** Вход `admin@sporthub.local` / `sporthub123` из обычной модалки — expect 403 «Администраторы входят через /service-portal»

## Scenario: Регистрация с переживанием рестарта

**Role:** guest → athlete

- [ ] **step-1** AuthModal, вкладка «Регистрация», заполнить email=`test-e2e-<timestamp>@local`, password=`qwerty1`, name=«Тест», тип кабинета «Спортсмен»
- [ ] **step-2** Submit — expect залогинен сразу, Header показывает имя
- [ ] **step-3** Повторная регистрация на тот же email — expect ошибка «Email уже зарегистрирован» (409)
- [ ] **step-4** Logout + login этим же email — expect вход проходит (пользователь сохранён в базе и переживает рестарт процессов)

## Scenario: Вход админом

**Role:** admin (id=1, `admin@sporthub.local` / `sporthub123`)

- [ ] **step-1** Navigate `/service-portal` — expect страница служебного входа
- [ ] **step-2** Fill email и password — expect redirect в `/service-portal/dashboard`. Служебная форма тип кабинета не шлёт: у администратора его нет ни одного
- [ ] **step-3** Assert Header показывает «Администратор SportHub / Администратор» + ссылку «Панель управления» + кнопку «Выйти». `ImpersonationBanner` в этом сценарии **НЕ** рендерится — он появляется только при работе от чужого лица, см. `src/components/admin/ImpersonationBanner.tsx`

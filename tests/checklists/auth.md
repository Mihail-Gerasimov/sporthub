# E2E: Auth (Phase 6 + Phase 26 Step 26.7)

**Role:** cross-role (guest / athlete / provider / admin)
**Base URL:** http://localhost:3000
**Preconditions:**

- seed актуальный (`src/data/users.json` содержит id=1..7)
- dev-сервер запущен (`npm run dev`)

## Scenario: Вход атлетом через AuthModal

**Role:** athlete (id=1, `alexey@sporthub.local` / `sporthub123`)

- [ ] **step-1** Navigate `/` — expect кнопка «Войти» в Header'е
- [ ] **step-2** Click «Войти» — expect модалка открылась, активна вкладка «Вход»
- [ ] **step-3** Fill email=`alexey@sporthub.local`, password=`sporthub123`, выбрать accountType=«Спортсмен»
- [ ] **step-4** Submit — expect модалка закрылась, в Header видно имя «Алексей Смирнов» и колокольчик
- [ ] **step-5** Assert `localStorage['sporthub-auth-store']` содержит `{ state: { user: { id: 1, ... }, accountType: 'athlete', isAuthenticated: true, ... }, version: 0 }` (ключ из `AUTH_STORAGE_KEY` в `src/stores/useAuthStore.ts`)

## Scenario: Вход провайдером и перезалогин

**Role:** provider (id=2, `marina@studio.local` / `sporthub123`)

- [ ] **step-1** Login как athlete через POST `/api/auth/login` (см. scenario выше)
- [ ] **step-2** Click «Выйти» в Header — expect имя исчезло, Header показывает «Войти»
- [ ] **step-3** Open AuthModal, вкладка «Вход», email=`marina@studio.local`, password=`sporthub123`, accountType=«Провайдер»
- [ ] **step-4** Submit — expect вход успешный, Header «Марина Крылова»

## Scenario: Валидация на логине

**Role:** guest

- [ ] **step-1** AuthModal, вход `notexisting@test` / `x` — expect ошибка «Пользователь не найден»
- [ ] **step-2** Вход `marina@studio.local` / `sporthub123`, но выбрана роль «Спортсмен» — expect ошибка «Неверный тип кабинета» / `role_mismatch`
- [ ] **step-3** Вход `admin@sporthub.local` / `admin-sporthub-2026` из обычной модалки — expect ошибка «Администраторы входят через /service-portal»

## Scenario: Регистрация с переживанием рестарта

**Role:** guest → athlete

- [ ] **step-1** AuthModal, вкладка «Регистрация», заполнить email=`test-e2e-<timestamp>@local`, password=`qwerty1`, name=«Тест», accountType=«Спортсмен»
- [ ] **step-2** Submit — expect залогинен сразу, Header показывает имя
- [ ] **step-3** Повторная регистрация на тот же email — expect ошибка «Email уже зарегистрирован» (409)
- [ ] **step-4** Logout + login этим же email — expect вход проходит (запись в `users.json` сохраняется runtime)

## Scenario: Вход админом

**Role:** admin (id=3, `admin@sporthub.local` / `admin-sporthub-2026`)

- [ ] **step-1** Navigate `/service-portal` — expect страница admin-login
- [ ] **step-2** Fill email и password — expect redirect в `/service-portal/dashboard`
- [ ] **step-3** Assert Header показывает «Администратор SportHub / Администратор» + ссылку «Панель управления» + кнопку «Выйти». `ImpersonationBanner` в этом сценарии **НЕ** рендерится — он активируется только при impersonation (`useAuthStore.isImpersonating === true`), см. `src/components/admin/ImpersonationBanner.tsx`

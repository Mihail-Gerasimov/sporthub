'use client';

import { useId, useState } from 'react';
import { z } from 'zod';

import { PASSWORD_RESET_TTL_MINUTES } from '@sporthub/domain';
import { DEFAULT_CITY } from '@sporthub/types';
import { formatPhone } from '@/lib/utils';

import { Button, Input, Modal } from '@/components/ui';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

type AuthTab = 'login' | 'register';

/**
 * Что показывает модалка: обычные вкладки или заявку на восстановление.
 *
 * Третьей вкладкой восстановление НЕ сделано намеренно: это не сценарий выбора
 * («войти или зарегистрироваться»), а тупиковая ветка одного из них — человек
 * попал сюда, потому что войти не может.
 */
type AuthView = 'tabs' | 'forgot';

type LoginFormState = {
  email: string;
  password: string;
};

type RegisterFormState = {
  name: string;
  email: string;
  phone: string;
  password: string;
};

type LoginFormErrors = Partial<Record<keyof LoginFormState, string>>;
type RegisterFormErrors = Partial<Record<keyof RegisterFormState, string>>;

const DEFAULT_LOGIN_FORM: LoginFormState = {
  email: '',
  password: '',
};

const DEFAULT_REGISTER_FORM: RegisterFormState = {
  name: '',
  email: '',
  phone: '',
  password: '',
};

const DEFAULT_LOGIN_ERRORS: LoginFormErrors = {};
const DEFAULT_REGISTER_ERRORS: RegisterFormErrors = {};

const loginFormSchema = z.object({
  email: z.email('Укажи корректный email.'),
  password: z.string().min(6, 'Пароль должен быть не короче 6 символов.'),
});

const forgotFormSchema = z.object({
  email: z.email('Укажи корректный email.'),
});

const registerFormSchema = z.object({
  name: z.string().trim().min(1, 'Укажи имя.'),
  email: z.email('Укажи корректный email.'),
  phone: z.string().refine((value) => getNormalizedRussianPhoneDigits(value) !== null, {
    message: 'Укажи телефон в формате +7 (999) 000-00-00.',
  }),
  password: z.string().min(6, 'Пароль должен быть не короче 6 символов.'),
});

function getLoginValidationErrors(form: LoginFormState): LoginFormErrors {
  const validationResult = loginFormSchema.safeParse(form);

  if (validationResult.success) {
    return DEFAULT_LOGIN_ERRORS;
  }

  return validationResult.error.issues.reduce<LoginFormErrors>((accumulator, issue) => {
    const fieldName = issue.path[0];

    if (fieldName === 'email' || fieldName === 'password') {
      accumulator[fieldName] = issue.message;
    }

    return accumulator;
  }, {});
}

function getNormalizedRussianPhoneDigits(value: string): string | null {
  const digits = value.replace(/\D/g, '');

  if (digits.length === 10) {
    return `7${digits}`;
  }

  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return `7${digits.slice(1)}`;
  }

  return null;
}

function maskRussianPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '');

  if (digits.length === 0) {
    return '';
  }

  let normalizedDigits = digits;

  if (digits.startsWith('8')) {
    normalizedDigits = `7${digits.slice(1)}`;
  } else if (!digits.startsWith('7')) {
    normalizedDigits = `7${digits}`;
  }

  normalizedDigits = normalizedDigits.slice(0, 11);

  const countryCode = normalizedDigits.slice(0, 1);
  const areaCode = normalizedDigits.slice(1, 4);
  const firstPart = normalizedDigits.slice(4, 7);
  const secondPart = normalizedDigits.slice(7, 9);
  const thirdPart = normalizedDigits.slice(9, 11);

  let maskedValue = `+${countryCode}`;

  if (areaCode) {
    maskedValue += ` (${areaCode}`;
  }

  if (areaCode.length === 3) {
    maskedValue += ')';
  }

  if (firstPart) {
    maskedValue += ` ${firstPart}`;
  }

  if (secondPart) {
    maskedValue += `-${secondPart}`;
  }

  if (thirdPart) {
    maskedValue += `-${thirdPart}`;
  }

  return maskedValue;
}

function getRegisterValidationErrors(form: RegisterFormState): RegisterFormErrors {
  const validationResult = registerFormSchema.safeParse(form);

  if (validationResult.success) {
    return DEFAULT_REGISTER_ERRORS;
  }

  return validationResult.error.issues.reduce<RegisterFormErrors>((accumulator, issue) => {
    const fieldName = issue.path[0];

    if (
      fieldName === 'name' ||
      fieldName === 'email' ||
      fieldName === 'phone' ||
      fieldName === 'password'
    ) {
      accumulator[fieldName] = issue.message;
    }

    return accumulator;
  }, {});
}

/** Кнопка-иконка переключения видимости пароля */
function PasswordToggle({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
      className="text-muted transition-colors hover:text-ink"
      onClick={onClick}
    >
      {visible ? (
        /* Иконка «глаз перечёркнутый» — пароль виден, нажми чтобы скрыть */
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        /* Иконка «глаз» — пароль скрыт, нажми чтобы показать */
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}

/**
 * Заявка на восстановление пароля.
 *
 * ⚠️ Ответ показывается ОДИН на все случаи — и для заведённой почты, и для
 * незаведённой. Так отвечает сервер (иначе маршрут стал бы перечислителем
 * аккаунтов), и интерфейс обязан не выдать разницу там, где её нет: никаких
 * «такой адрес не найден».
 */
function ForgotPasswordPanel({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const normalizedEmail = email.trim();
    const validationResult = forgotFormSchema.safeParse({ email: normalizedEmail });

    if (!validationResult.success) {
      setError(validationResult.error.issues[0]?.message ?? 'Укажи корректный email.');
      return;
    }

    setError(undefined);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        // Сюда попадают только отказы, не связанные с существованием почты:
        // разбор тела и превышение частоты. Их текст показываем как есть.
        setError(json.error ?? 'Не удалось отправить письмо');
        setIsSubmitting(false);
        return;
      }

      setIsSent(true);
      setIsSubmitting(false);
    } catch {
      setError('Сетевая ошибка, попробуй позже');
      setIsSubmitting(false);
    }
  }

  if (isSent) {
    return (
      <section className="space-y-5" aria-label="Письмо отправлено">
        <p className="text-sm text-muted">
          Если такой адрес зарегистрирован, мы отправили на него ссылку для смены пароля. Ссылка
          действует {PASSWORD_RESET_TTL_MINUTES} минут и сработает один раз.
        </p>
        <Button fullWidth type="button" onClick={onBack}>
          Вернуться ко входу
        </Button>
      </section>
    );
  }

  return (
    <form
      noValidate
      className="space-y-5"
      aria-label="Восстановление пароля"
      onSubmit={handleSubmit}
    >
      <p className="text-sm text-muted">
        Укажи почту, на которую заведён аккаунт. Пришлём ссылку для смены пароля.
      </p>

      <Input
        label="Email"
        type="email"
        placeholder="name@example.com"
        value={email}
        error={error}
        disabled={isSubmitting}
        onChange={(event) => {
          setEmail(event.target.value);
          setError(undefined);
        }}
      />

      <div className="grid gap-3">
        <Button fullWidth type="submit" loading={isSubmitting}>
          Отправить ссылку
        </Button>
        <Button fullWidth type="button" variant="ghost" onClick={onBack}>
          Вернуться ко входу
        </Button>
      </div>
    </form>
  );
}

export function AuthModal() {
  const isAuthModalOpen = useUIStore((state) => state.isAuthModalOpen);
  const closeAuthModal = useUIStore((state) => state.closeAuthModal);
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  // ⚠️ Шаг 35.35. Лица услуг привозит только ответ «кто я»: у ответа входа их
  // нет. Без этого запроса шапка после входа вела бы владельца клуба в личный
  // кабинет, а не в кабинет его лица, — и чинилось бы это перезагрузкой страницы.
  const loadSession = useAuthStore((state) => state.loadSession);
  const [activeTab, setActiveTab] = useState<AuthTab>('login');
  const [view, setView] = useState<AuthView>('tabs');
  const [loginForm, setLoginForm] = useState<LoginFormState>(DEFAULT_LOGIN_FORM);
  const [loginErrors, setLoginErrors] = useState<LoginFormErrors>(DEFAULT_LOGIN_ERRORS);
  const [isLoginSubmitting, setIsLoginSubmitting] = useState(false);
  const [registerForm, setRegisterForm] = useState<RegisterFormState>(DEFAULT_REGISTER_FORM);
  const [registerErrors, setRegisterErrors] = useState<RegisterFormErrors>(DEFAULT_REGISTER_ERRORS);
  const [isRegisterSubmitting, setIsRegisterSubmitting] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const loginTabId = useId();
  const registerTabId = useId();
  const loginPanelId = useId();
  const registerPanelId = useId();
  function resetModalState() {
    setActiveTab('login');
    setView('tabs');
    setLoginForm(DEFAULT_LOGIN_FORM);
    setLoginErrors(DEFAULT_LOGIN_ERRORS);
    setIsLoginSubmitting(false);
    setRegisterForm(DEFAULT_REGISTER_FORM);
    setRegisterErrors(DEFAULT_REGISTER_ERRORS);
    setIsRegisterSubmitting(false);
    setShowLoginPassword(false);
    setShowRegisterPassword(false);
  }

  function handleCloseModal() {
    closeAuthModal();
    resetModalState();
  }

  // Вход: пароль сверяет сервер, он же ставит cookie сессии.
  //
  // ⚠️ Пароль в теле запроса появился в фазе 34. До неё форма спрашивала его
  // у человека, но НЕ ОТПРАВЛЯЛА: сервер пускал по одной лишь почте, и поле
  // пароля было украшением.
  async function handleLoginSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isLoginSubmitting) {
      return;
    }

    const normalizedLoginForm = {
      email: loginForm.email.trim(),
      password: loginForm.password,
    } satisfies LoginFormState;
    const validationErrors = getLoginValidationErrors(normalizedLoginForm);

    setLoginErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setIsLoginSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // ⚠️ Тип учётной записи в теле больше не передаётся (шаг 35.35): его
        // не существует. Служебный вход отличается явным признаком
        // `portal: 'service'` — здесь его нет, значит вход обычный, людской.
        body: JSON.stringify({
          email: normalizedLoginForm.email,
          password: normalizedLoginForm.password,
        }),
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        setLoginErrors({ email: json.error ?? 'Не удалось войти' });
        setIsLoginSubmitting(false);
        return;
      }

      login({ user: json.data });
      // Лица услуг и вид учётной записи знает только сессия — спрашиваем её.
      await loadSession();
      handleCloseModal();
    } catch {
      setLoginErrors({ email: 'Сетевая ошибка, попробуй позже' });
      setIsLoginSubmitting(false);
    }
  }

  // Регистрация: сервер заводит пользователя, хеширует пароль и сразу открывает
  // сессию — отдельный вход после неё ничего не проверял бы заново.
  async function handleRegisterSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isRegisterSubmitting) {
      return;
    }

    const normalizedRegisterForm = {
      name: registerForm.name.trim(),
      email: registerForm.email.trim(),
      phone: registerForm.phone,
      password: registerForm.password,
    } satisfies RegisterFormState;
    const validationErrors = getRegisterValidationErrors(normalizedRegisterForm);

    setRegisterErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setIsRegisterSubmitting(true);

    try {
      const normalizedPhoneDigits = getNormalizedRussianPhoneDigits(normalizedRegisterForm.phone);
      const formattedPhone = normalizedPhoneDigits ? formatPhone(normalizedPhoneDigits) : '';

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: normalizedRegisterForm.name,
          email: normalizedRegisterForm.email,
          phone: formattedPhone,
          password: normalizedRegisterForm.password,
          city: DEFAULT_CITY,
        }),
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        // 409 — email занят; прочие — общее сообщение в поле email.
        const errorMessage =
          response.status === 409
            ? 'Email уже зарегистрирован'
            : (json.error ?? 'Не удалось создать аккаунт');
        setRegisterErrors({ email: errorMessage });
        setIsRegisterSubmitting(false);
        return;
      }

      register({ user: json.data });
      // Регистрация заводит человека без лиц услуг, но признак вида учётной
      // записи всё равно берём у сессии, а не назначаем сами.
      await loadSession();
      handleCloseModal();
    } catch {
      setRegisterErrors({ email: 'Сетевая ошибка, попробуй позже' });
      setIsRegisterSubmitting(false);
    }
  }

  return (
    <Modal
      open={isAuthModalOpen}
      onClose={handleCloseModal}
      title="Войти или создать профиль"
      description="Выбери сценарий и продолжи работу с SportHub. Клуб или карточку тренера можно завести позже — учётная запись у всех одна."
    >
      <div className="space-y-6">
        {view === 'forgot' ? (
          <ForgotPasswordPanel
            onBack={() => {
              setView('tabs');
            }}
          />
        ) : (
          <>
            <div
              role="tablist"
              aria-label="Сценарии авторизации"
              className="grid grid-cols-2 gap-2 rounded-card border border-line bg-canvas p-1"
            >
              <button
                id={loginTabId}
                role="tab"
                type="button"
                aria-controls={loginPanelId}
                aria-selected={activeTab === 'login'}
                className={`rounded-pill px-4 py-3 text-sm font-semibold transition-colors ${
                  activeTab === 'login'
                    ? 'bg-lime text-ink shadow-card'
                    : 'text-ink hover:bg-panel hover:text-accent'
                }`}
                onClick={() => {
                  setActiveTab('login');
                }}
              >
                Вход
              </button>
              <button
                id={registerTabId}
                role="tab"
                type="button"
                aria-controls={registerPanelId}
                aria-selected={activeTab === 'register'}
                className={`rounded-pill px-4 py-3 text-sm font-semibold transition-colors ${
                  activeTab === 'register'
                    ? 'bg-lime text-ink shadow-card'
                    : 'text-ink hover:bg-panel hover:text-accent'
                }`}
                onClick={() => {
                  setActiveTab('register');
                }}
              >
                Регистрация
              </button>
            </div>

            {activeTab === 'login' ? (
              <form
                id={loginPanelId}
                noValidate
                role="tabpanel"
                aria-labelledby={loginTabId}
                className="space-y-5"
                onSubmit={handleLoginSubmit}
              >
                <div className="grid gap-4">
                  <Input
                    label="Email"
                    type="email"
                    placeholder="name@example.com"
                    value={loginForm.email}
                    error={loginErrors.email}
                    disabled={isLoginSubmitting}
                    onChange={(event) => {
                      setLoginForm((currentValue) => ({
                        ...currentValue,
                        email: event.target.value,
                      }));
                      setLoginErrors((currentValue) => ({
                        ...currentValue,
                        email: undefined,
                      }));
                    }}
                  />
                  <Input
                    label="Пароль"
                    type={showLoginPassword ? 'text' : 'password'}
                    placeholder="Введите пароль"
                    value={loginForm.password}
                    error={loginErrors.password}
                    disabled={isLoginSubmitting}
                    endAdornment={
                      <PasswordToggle
                        visible={showLoginPassword}
                        onClick={() => {
                          setShowLoginPassword((v) => !v);
                        }}
                      />
                    }
                    onChange={(event) => {
                      setLoginForm((currentValue) => ({
                        ...currentValue,
                        password: event.target.value,
                      }));
                      setLoginErrors((currentValue) => ({
                        ...currentValue,
                        password: undefined,
                      }));
                    }}
                  />
                </div>

                <Button fullWidth type="submit" loading={isLoginSubmitting}>
                  Продолжить вход
                </Button>

                <button
                  type="button"
                  className="w-full text-sm font-semibold text-muted underline-offset-4 transition-colors hover:text-accent hover:underline"
                  onClick={() => {
                    setView('forgot');
                  }}
                >
                  Забыли пароль?
                </button>
              </form>
            ) : (
              <form
                id={registerPanelId}
                noValidate
                role="tabpanel"
                aria-labelledby={registerTabId}
                className="space-y-5"
                onSubmit={handleRegisterSubmit}
              >
                <div className="grid gap-4">
                  <Input
                    label="Имя"
                    placeholder="Как к тебе обращаться"
                    value={registerForm.name}
                    error={registerErrors.name}
                    disabled={isRegisterSubmitting}
                    onChange={(event) => {
                      setRegisterForm((currentValue) => ({
                        ...currentValue,
                        name: event.target.value,
                      }));
                      setRegisterErrors((currentValue) => ({
                        ...currentValue,
                        name: undefined,
                      }));
                    }}
                  />
                  <Input
                    label="Email"
                    type="email"
                    placeholder="name@example.com"
                    value={registerForm.email}
                    error={registerErrors.email}
                    disabled={isRegisterSubmitting}
                    onChange={(event) => {
                      setRegisterForm((currentValue) => ({
                        ...currentValue,
                        email: event.target.value,
                      }));
                      setRegisterErrors((currentValue) => ({
                        ...currentValue,
                        email: undefined,
                      }));
                    }}
                  />
                  <Input
                    label="Телефон"
                    placeholder="+7 (999) 000-00-00"
                    value={registerForm.phone}
                    error={registerErrors.phone}
                    disabled={isRegisterSubmitting}
                    onChange={(event) => {
                      setRegisterForm((currentValue) => ({
                        ...currentValue,
                        phone: maskRussianPhoneInput(event.target.value),
                      }));
                      setRegisterErrors((currentValue) => ({
                        ...currentValue,
                        phone: undefined,
                      }));
                    }}
                  />
                  <Input
                    label="Пароль"
                    type={showRegisterPassword ? 'text' : 'password'}
                    placeholder="Минимум 6 символов"
                    value={registerForm.password}
                    error={registerErrors.password}
                    disabled={isRegisterSubmitting}
                    endAdornment={
                      <PasswordToggle
                        visible={showRegisterPassword}
                        onClick={() => {
                          setShowRegisterPassword((v) => !v);
                        }}
                      />
                    }
                    onChange={(event) => {
                      setRegisterForm((currentValue) => ({
                        ...currentValue,
                        password: event.target.value,
                      }));
                      setRegisterErrors((currentValue) => ({
                        ...currentValue,
                        password: undefined,
                      }));
                    }}
                  />
                </div>

                <Button fullWidth type="submit" loading={isRegisterSubmitting}>
                  Создать аккаунт
                </Button>
              </form>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

// Кластер пользователя в шапке (шаги 38.57, 38.60): колокольчик, плашка с именем
// и подписью кабинета, аватар-ссылка и кнопка «Выйти» — либо «Войти» для гостя.
//
// Три ветви аватара по модели фазы 35: администратор без подмены → служебная панель;
// человек с лицами услуг → кабинет текущего лица, подписанный его именем; человек
// без лиц → личный кабинет. Подпись доступности НАЗЫВАЕТ ТО, КУДА ВЕДЁТ (дефект,
// найденный MCP-прогоном 10.09.2026: «личный кабинет» вело в клуб).
//
// Полное имя (шаг 38.60) — подсказкой `Hint` на аватаре, а не `title=` на обрезанной
// строке: `title` не читается с клавиатуры и не показывается на касание; `Hint`
// открывается по наведению, фокусу и касанию и всегда описывает аватар для диктора.
//
// Выход: работу от чужого лица заканчивает сервер — без его ответа со страницы
// не уходим; обычный выход ждёт сервер, иначе главная отрисуется под ещё живой сессией.
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { NotificationBell } from '@/components/layout/NotificationBell';
import { Button } from '@/components/ui/Button';
import { Hint } from '@/components/ui/Hint';
import { SERVICE_PORTAL_SECTIONS } from '@/lib/service-portal-sections';
import { useAuthFaces, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

/** Аватар-пилюля: одинаковый вид у ссылки и у картинки без ссылки. */
const AVATAR_CLASS =
  'flex size-10 shrink-0 items-center justify-center rounded-button border border-line bg-bg font-display text-[15px] font-bold uppercase text-ink no-underline transition-colors hover:border-lime hover:text-lime-hov';

export function HeaderUser() {
  const openAuthModal = useUIStore((state) => state.openAuthModal);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const isImpersonating = useAuthStore((state) => state.isImpersonating);
  const logout = useAuthStore((state) => state.logout);
  const stopImpersonation = useAuthStore((state) => state.stopImpersonation);
  const router = useRouter();
  // Кабинет считается от лиц услуг: есть лица — кабинет текущего лица, нет — личный.
  const { primaryCabinet } = useAuthFaces();
  const isAdminDirect = isAdmin && !isImpersonating;

  const handleLogout = async () => {
    if (isImpersonating) {
      if (!(await stopImpersonation())) return;
      router.push(SERVICE_PORTAL_SECTIONS.users);
      router.refresh();
      return;
    }

    await logout();
    // replace, не push — выход не оставляет кабинет в истории; refresh сбрасывает RSC-кэш.
    router.replace('/');
    router.refresh();
  };

  if (!isAuthenticated || !user) {
    return (
      <Button size="sm" onClick={openAuthModal} className="shrink-0">
        Войти
      </Button>
    );
  }

  const accountInitial = user.name.trim().charAt(0).toUpperCase() || 'П';
  const cabinetLabel = isAdminDirect ? 'Администратор' : (primaryCabinet?.title ?? null);

  return (
    <>
      <NotificationBell />

      {/* Плашка: имя и подпись кабинета — с точки меню и выше */}
      <div className="hidden min-w-0 flex-col items-end text-right leading-tight menu:flex">
        <p className="max-w-[140px] truncate font-body text-[12px] font-bold text-ink">
          {user.name}
        </p>
        {cabinetLabel ? (
          <p className="font-body text-[9px] font-semibold tracking-[0.07em] text-muted uppercase">
            {cabinetLabel}
          </p>
        ) : null}
      </div>

      <Hint text={user.name}>
        {isAdminDirect ? (
          <Link
            href={SERVICE_PORTAL_SECTIONS.users}
            aria-label="Панель управления"
            className={AVATAR_CLASS}
          >
            {accountInitial}
          </Link>
        ) : primaryCabinet ? (
          <Link
            href={primaryCabinet.href}
            aria-label={`Перейти в кабинет: ${primaryCabinet.title}`}
            className={AVATAR_CLASS}
          >
            {accountInitial}
          </Link>
        ) : (
          <div role="img" aria-label={`Аватар ${user.name}`} tabIndex={0} className={AVATAR_CLASS}>
            {accountInitial}
          </div>
        )}
      </Hint>

      <button
        type="button"
        aria-label="Выйти"
        title="Выйти"
        onClick={() => {
          void handleLogout();
        }}
        className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-button border border-line bg-bg text-ink transition-colors hover:border-orange hover:text-orange-hov"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-[18px]"
          aria-hidden="true"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </>
  );
}

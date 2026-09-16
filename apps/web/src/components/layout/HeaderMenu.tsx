// Меню шапки на узких экранах (шаг 38.58): кнопка-«гамбургер» ниже точки 960 и
// выпадающая панель по эталону — оверлей `rgba(0,0,0,.35)`, панель под шапкой
// с отступами 12/20/18 и мягкой тенью, пункты 14px 700 display-шрифтом высотой 47.
//
// ⚠️ Панель и оверлей позиционируются от `<header>` (`absolute top-full`), а не от окна:
// высота шапки объявлена один раз — в самой шапке, — и над ней может стоять плашка
// работы от чужого лица (шаг 38.63); `fixed top-64px` лёг бы на шапку.
//
// Отличие от макета — сознательное: `Escape` закрывает панель (в макете — только клик
// по оверлею), фокус после закрытия возвращается на кнопку, первый пункт получает
// фокус при открытии. Панель — это диалог навигации: `aria-expanded` на кнопке,
// `aria-controls` на панель, оверлей без роли и без табуляции.
//
// Пункты — те же `HEADER_NAV`, что и в широкой навигации: второго списка нет.
//
// Почему не `ui/Modal`: та — диалог по центру с затемнением всего окна и ловушкой
// фокуса внутри; здесь панель навигации, прижатая к шапке, живущая в её потоке
// стекинга и уступающая место плашке подмены над шапкой.
//
// Состояние «открыто» живёт в UI-сторе (шаг 38.62): мобильный док читает его и прячется,
// пока панель открыта. Фокус заперт в меню: Tab с последнего пункта возвращается
// на кнопку, Shift+Tab с кнопки — на последний пункт; под оверлей он не уходит.
'use client';

import { useCallback, useEffect, useId, useRef } from 'react';

import { NavLink } from '@/components/layout/NavLink';
import { HEADER_NAV } from '@/lib/navigation';
import { useUIStore } from '@/stores/useUIStore';

export function HeaderMenu() {
  const open = useUIStore((state) => state.isHeaderMenuOpen);
  const setOpen = useUIStore((state) => state.setHeaderMenuOpen);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const lastLinkRef = useRef<HTMLAnchorElement>(null);
  const panelId = useId();

  // Закрытие возвращает фокус на кнопку — иначе он падает на body, и клавиатура
  // начинает страницу заново.
  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, [setOpen]);

  // Уход со страницы с открытым меню не оставляет док спрятанным.
  useEffect(() => () => setOpen(false), [setOpen]);

  useEffect(() => {
    if (!open) return;

    firstLinkRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        return;
      }

      if (event.key !== 'Tab') return;

      // Ловушка фокуса: кольцо «кнопка → пункты → кнопка».
      if (!event.shiftKey && document.activeElement === lastLinkRef.current) {
        event.preventDefault();
        buttonRef.current?.focus();
      } else if (event.shiftKey && document.activeElement === buttonRef.current) {
        event.preventDefault();
        lastLinkRef.current?.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  return (
    <div className="menu:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close() : setOpen(true))}
        className="flex size-10 cursor-pointer items-center justify-center rounded-button border border-line bg-bg text-ink transition-colors hover:border-lime hover:text-lime-hov"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>

      {open ? (
        <>
          {/* Оверлей: клик закрывает; для экранного диктора невидим — закрыть можно Escape и кнопкой */}
          <div
            aria-hidden="true"
            onClick={close}
            className="absolute inset-x-0 top-full z-[199] h-screen bg-ink/35"
          />
          <nav
            id={panelId}
            aria-label="Меню"
            className="absolute inset-x-0 top-full z-[200] border-b border-line bg-card px-5 pt-3 pb-[18px] shadow-floating"
          >
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {HEADER_NAV.map((item, index) => (
                <li key={item.label}>
                  <NavLink
                    ref={
                      index === 0
                        ? firstLinkRef
                        : index === HEADER_NAV.length - 1
                          ? lastLinkRef
                          : undefined
                    }
                    item={item}
                    onClick={close}
                    className="flex min-h-[47px] items-center rounded-[12px] px-3.5 py-3 font-display text-[14px] font-bold tracking-[0.02em] text-ink uppercase no-underline transition-colors hover:bg-bg hover:text-lime-hov"
                  />
                </li>
              ))}
            </ul>
          </nav>
        </>
      ) : null}
    </div>
  );
}

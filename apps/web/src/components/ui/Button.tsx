'use client';

// Кнопка дизайн-системы: семь вариантов, четыре размера, состояние загрузки.
// Вид — по эталону ПРОСПОРТ (шаги 38.14, 38.14a): радиус 12px (`rounded-button`, как
// в макете — решение заказчика), подпись display-шрифтом в верхнем регистре,
// solid-primary с зелёным свечением и подъёмом на 1px при наведении — единственный
// вариант с тенью и с transform; остальные меняют только обводку, фон и цвет.
// Цвета — только токенами: перекраска кнопки = правка `globals.css`.
//
// С адресом (`href`) кнопка рисуется ссылкой `next/link` в тех же классах (ревью 38.80):
// путь к странице обязан быть ссылкой, а второй «кнопки-ссылки» со своими классами
// быть не должно. У ссылки нет `disabled` и загрузки — она ведёт, а не ждёт: `loading`
// в ветке ссылки не участвует (ни спиннера, ни `aria-busy`).

import Link from 'next/link';
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react';

import { LOW_SPOTS_TONE } from '@/lib/slot-spots';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'outline' | 'ghost' | 'danger' | 'alert';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

/**
 * Варианты:
 * - `primary` — solid: зелёный фон, свечение, подъём при наведении (один главный CTA);
 * - `secondary` — outline positive: зелёная обводка, при наведении заливается;
 * - `soft` — мягкая зелёная подложка с тёмно-зелёным текстом (строка расписания
 *   эталона `HomePage.tsx:448`), при наведении заливается;
 * - `outline` — нейтральная обводка, при наведении зеленеет обводка и текст;
 * - `ghost` — без обводки и фона, при наведении светлая подложка;
 * - `danger` — красная обводка для необратимого или строгого действия (скрыть,
 *   отозвать), при наведении заливается красным;
 * - `alert` — «мало мест» (38.70): тон пилюли слота из `lib/slot-spots` — красные обводка
 *   и подложка, буквы чернилами (`text-red` на светлом ниже AA); одни классы с пилюлей.
 */
const variantClassNames: Record<ButtonVariant, string> = {
  primary: 'border-transparent bg-lime text-ink focus-visible:ring-lime/30',
  secondary: 'border-lime bg-card text-ink hover:bg-lime hover:text-ink focus-visible:ring-lime/25',
  soft: 'border-lime/30 bg-lime-soft text-lime-hov hover:bg-lime hover:text-ink focus-visible:ring-lime/25',
  outline:
    'border-line bg-card text-ink hover:border-lime hover:text-lime-hov focus-visible:ring-lime/20',
  ghost: 'border-transparent bg-transparent text-ink hover:bg-card-2 focus-visible:ring-ink/10',
  danger:
    'border-red/45 bg-card text-red hover:border-red hover:bg-red hover:text-card focus-visible:ring-red/20',
  alert: `${LOW_SPOTS_TONE} hover:border-red/70 focus-visible:ring-red/20`,
};

/**
 * Размеры — числами макета (аудит 17.09, п. 3), высота вместе с обводкой (border-box):
 * `xs` — мини-кнопка слоёв поверх карты и строк расписания (`App.tsx:1481`,
 * `HomePage.tsx:448`): радиус 9, обводка 1px, подпись 12px; `sm` — «Войти» в шапке
 * (`App.tsx:2852`: 9/20, 13px); `md` — «Найти» (`HomePage.tsx:346`: 13/24, 14px);
 * `lg` — призыв (`HomePage.tsx:868`: 14/34, 15px). Радиус 12px (`rounded-button`),
 * обводка 2px (у primary прозрачная — считается в высоте).
 */
const sizeClassNames: Record<ButtonSize, string> = {
  xs: 'min-h-8 rounded-[9px] border px-3.5 text-[12px]',
  sm: 'min-h-[37px] rounded-button border-2 px-5 text-[13px]',
  md: 'min-h-[47px] rounded-button border-2 px-6 text-sm',
  lg: 'min-h-[51px] rounded-button border-2 px-[34px] text-[15px]',
};

/** Свечение и подъём primary — по умолчанию есть; «Найти» в макете без тени (`glow={false}`). */
const GLOW_CLASS = 'shadow-glow hover:-translate-y-px hover:shadow-floating';

/* Вес — `font-black`: Barlow Condensed 900 макета, кириллицу подписи берёт Inter 900
   из стека (38.113). */
const BASE_CLASS =
  'inline-flex items-center justify-center gap-2 font-display font-black tracking-[0.04em] uppercase transition-[background-color,border-color,color,box-shadow,transform] outline-none focus-visible:ring-4 disabled:pointer-events-none disabled:opacity-40';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
  /** Адрес: с ним кнопка — ссылка `next/link` в тех же классах; `disabled` и `loading` не участвуют. */
  href?: string;
  /** Свечение и подъём у primary; `false` — плоская зелёная («Найти» в макете без тени). */
  glow?: boolean;
};

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  (
    {
      className,
      children,
      disabled,
      fullWidth = false,
      glow = true,
      href,
      leadingIcon,
      loading = false,
      size = 'md',
      trailingIcon,
      type = 'button',
      variant = 'primary',
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;
    const classes = cn(
      BASE_CLASS,
      variantClassNames[variant],
      variant === 'primary' && glow && GLOW_CLASS,
      sizeClassNames[size],
      fullWidth && 'w-full',
      className,
    );
    // Содержимое: значки по краям; у кнопки в загрузке вместо левого значка — спиннер.
    const content = (busy: boolean) => (
      <>
        {busy ? (
          <>
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-pill border-2 border-current border-t-transparent"
            />
            <span className="text-[11px]">Загрузка</span>
          </>
        ) : (
          leadingIcon && <span aria-hidden="true">{leadingIcon}</span>
        )}
        <span>{children}</span>
        {!busy && trailingIcon ? <span aria-hidden="true">{trailingIcon}</span> : null}
      </>
    );

    if (href !== undefined) {
      // Выше сняты `type` и `disabled`; остальные атрибуты кнопки (aria, id, title,
      // onClick) у ссылки те же. Поля формы (`form*`, `name`, `value`) ссылке-кнопке
      // не задают — на `<a>` они бессмысленны, и типом их не отсекаем.
      const anchorProps = props as AnchorHTMLAttributes<HTMLAnchorElement>;

      return (
        <Link
          ref={ref as Ref<HTMLAnchorElement>}
          href={href}
          className={cn(classes, 'no-underline')}
          {...anchorProps}
        >
          {content(false)}
        </Link>
      );
    }

    return (
      <button
        ref={ref as Ref<HTMLButtonElement>}
        type={type}
        className={classes}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        {...props}
      >
        {content(loading)}
      </button>
    );
  },
);

Button.displayName = 'Button';

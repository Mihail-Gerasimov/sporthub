'use client';

// Подсказка дизайн-системы (фаза 38, шаг 38.51): короткий текст к элементу,
// доступный и диктору, и зрячему.
//
// Имя `Hint`, а не `Tooltip`: `Tooltip` уже занят `recharts` в пяти файлах статистики,
// и одноимённый компонент сталкивался бы с ним в импортах.
//
// Как устроена доступность. Текст подсказки — ОПИСАНИЕ триггера: он привязан через
// `aria-describedby` всегда, независимо от того, виден ли пузырь. Так экранный диктор
// читает его с самого элемента, а не ждёт наведения, которого у него нет. Пузырь —
// для зрячих: открывается по наведению, по фокусу с клавиатуры и по касанию,
// закрывается по уходу курсора, потере фокуса, второму касанию и `Escape`.
//
// ⚠️ Касание на телефоне порождает вслед за собой эмулированные `mouseenter`
// и `focus`. Без защиты второе касание закрывало бы пузырь и тут же открывало снова —
// поэтому после касания эмулированный хвост игнорируется короткое окно.
//
// Прежде полное имя человека в шапке жило в `title=` — атрибуте, который не читается
// с клавиатуры и не показывается на касание. Второй потребитель — шапка (38.60).

import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactElement,
} from 'react';

import { cn } from '@/lib/utils';

/** Сколько миллисекунд после касания эмулированные события мыши считаются его эхом. */
const TOUCH_ECHO_MS = 700;

type HintProps = {
  /** Текст подсказки — он же доступное описание триггера. */
  text: string;
  /** Единственный элемент-триггер; получает `aria-describedby`. */
  children: ReactElement<{ 'aria-describedby'?: string }>;
  /** Классы обёртки: положение в потоке решает потребитель. */
  className?: string;
};

export function Hint({ text, children, className }: HintProps) {
  const id = useId();
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const lastTouchAt = useRef(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);

  const open = hovered || focused || touched;

  /** Эхо касания: событие мыши или фокуса, пришедшее сразу за touchstart. */
  const isTouchEcho = useCallback(() => Date.now() - lastTouchAt.current < TOUCH_ECHO_MS, []);

  const closeAll = useCallback(() => {
    setHovered(false);
    setFocused(false);
    setTouched(false);
  }, []);

  // `Escape` гасит пузырь, где бы ни был фокус: курсор над триггером — тоже случай.
  // Касание вне обёртки закрывает открытое касанием — как любой popover.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') closeAll();
    };
    const onTouchOutside = (event: TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) closeAll();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('touchstart', onTouchOutside);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('touchstart', onTouchOutside);
    };
  }, [open, closeAll]);

  const handleBlur = (event: FocusEvent<HTMLSpanElement>) => {
    // Фокус ушёл наружу обёртки — закрываем целиком, включая открытое касанием.
    if (!rootRef.current?.contains(event.relatedTarget as Node | null)) closeAll();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'Escape') closeAll();
  };

  const handleTouchStart = () => {
    lastTouchAt.current = Date.now();
    setTouched((value) => !value);
    setHovered(false);
    setFocused(false);
  };

  return (
    <span
      ref={rootRef}
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => {
        if (!isTouchEcho()) setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => {
        if (!isTouchEcho()) setFocused(true);
      }}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onTouchStart={handleTouchStart}
    >
      {cloneElement(children, { 'aria-describedby': id })}
      <span
        role="tooltip"
        id={id}
        hidden={!open}
        className="absolute left-1/2 top-full z-30 mt-2 w-max max-w-[16rem] -translate-x-1/2 rounded-[10px] border border-line bg-card px-3 py-2 font-body text-xs font-medium normal-case tracking-normal text-ink shadow-floating"
      >
        {text}
      </span>
    </span>
  );
}

/**
 * Счётчики площадки в герое главной: спортсмены, тренеры, клубы, отзывы (шаг 38.69).
 *
 * Числа приходят пропсом из ответа `GET /api/stats/overview` — их спрашивает
 * серверная страница; сам компонент за данными не ходит и ничего не считает
 * по длине массивов (диверсия д-20: счётчик из `clubs.length` — красный тест).
 *
 * Анимация счёта — по эталону (`HomePage.tsx:58-77`): запускается один раз, когда
 * блок попадает в поле зрения (`IntersectionObserver` отключается после первого
 * срабатывания), идёт через `requestAnimationFrame` ~900 мс с замедлением к концу.
 * При `prefers-reduced-motion: reduce` — сразу конечное число: у эталона гасителя
 * не было (эталон, step-90), у нас есть. Без `IntersectionObserver` (jsdom, старые
 * браузеры) счёт стартует сразу.
 *
 * Почему не `ui/*`: это не карточка и не бейдж — четыре числа с подписями на плашке
 * героя; переиспользовать нечего, кроме токенов и типографики.
 */
'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { PlatformOverview } from '@sporthub/types';

import { COUNTER_LABELS } from '@/lib/home-copy';

/** Ключи счётчиков в порядке эталона: спортсмены, тренеры, клубы, отзывы. */
const COUNTER_KEYS = ['athletes', 'trainers', 'clubs', 'reviews'] as const;

/** Длительность счёта. Эталон: 55 шагов по 18 мс ≈ 1 с; здесь — по кадрам. */
const COUNT_DURATION_MS = 900;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Есть ли в окружении сам `matchMedia` (сервер и старые окружения — нет). */
const hasMatchMedia = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function';

/** Подписка на смену настройки «меньше движения» — внешняя система для React. */
function subscribeReducedMotion(onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => undefined;

  const query = window.matchMedia(REDUCED_MOTION_QUERY);

  query.addEventListener('change', onChange);

  return () => query.removeEventListener('change', onChange);
}

const readReducedMotion = (): boolean =>
  hasMatchMedia() && window.matchMedia(REDUCED_MOTION_QUERY).matches;

/** На сервере настройки нет — считаем «движение разрешено», клиент уточнит после гидрации. */
const readReducedMotionOnServer = (): boolean => false;

/** Настройка «меньше движения» — через подписку, а не через состояние в эффекте. */
function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, readReducedMotion, readReducedMotionOnServer);
}

/** Замедление к концу: последние единицы «дотягиваются», а не пролетают. */
function easeOut(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

/**
 * Значение счётчика во времени: от нуля к `target` за `COUNT_DURATION_MS`.
 * Считает один раз — после первого появления в поле зрения. При «меньше движения»
 * счёта нет вовсе — конечное число отдаётся сразу, без кадров и без состояния.
 */
function useCountUp(target: number, start: boolean): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    // Нечего считать: не стартовали, движение отключено или цель — ноль.
    if (!start || reduced || target === 0) return;

    let frame = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / COUNT_DURATION_MS);

      setValue(Math.round(target * easeOut(progress)));

      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [target, start, reduced]);

  return reduced ? target : value;
}

/**
 * Одно число с подписью — пара «термин → определение» списка `dl`: диктор читает
 * «Клубов — 52». Бегущее число скрыто от него (`aria-hidden`), конечное — в `sr-only`:
 * иначе незрячий слышал бы либо каждый кадр счёта, либо ничего (ревью 38.69: `aria-label`
 * на абзаце запрещён ARIA 1.2 и пропускается). Визуально число над подписью —
 * `flex-col-reverse`, порядок в разметке остаётся «подпись, число».
 * `tabular-nums` — цифры не «прыгают» по ширине при счёте.
 */
function Counter({ label, target, start }: { label: string; target: number; start: boolean }) {
  const value = useCountUp(target, start);

  return (
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="mt-1 font-body text-[10px] font-semibold uppercase tracking-[0.07em] text-plate-muted">
        {label}
      </dt>
      <dd className="m-0 font-display text-[20px] font-black leading-none text-lime tabular-nums">
        <span aria-hidden="true">{value.toLocaleString('ru-RU')}</span>
        <span className="sr-only">{target.toLocaleString('ru-RU')}</span>
      </dd>
    </div>
  );
}

type HomeCountersProps = {
  overview: PlatformOverview;
};

export function HomeCounters({ overview }: HomeCountersProps) {
  const rootRef = useRef<HTMLDListElement>(null);
  // Нет наблюдателя пересечений — нет и ожидания: стартуем сразу. Разметка от этого
  // не зависит (число до первого кадра — ноль в обоих случаях), гидрация цела.
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const root = rootRef.current;

    if (root === null || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;

        // Один раз: прокрутка из вида и обратно счёт не перезапускает (эталон, step-22).
        setInView(true);
        observer.disconnect();
      },
      { threshold: 0.4 },
    );

    observer.observe(root);

    return () => observer.disconnect();
  }, []);

  return (
    <dl ref={rootRef} className="m-0 flex flex-wrap gap-7" aria-label="Площадка в числах">
      {COUNTER_KEYS.map((key) => (
        <Counter key={key} label={COUNTER_LABELS[key]} target={overview[key]} start={inView} />
      ))}
    </dl>
  );
}

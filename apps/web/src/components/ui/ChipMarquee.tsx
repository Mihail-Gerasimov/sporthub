'use client';

/*
 * ChipMarquee — бесконечная горизонтальная лента чипов с pause-on-hover
 * и pointer-drag scrub. Реализация 1-в-1 с setupMarquee() из
 * claude-design/cards-trainers/sporthub/project/SportHub Cards - Clubs.html.
 *
 * Логика:
 * - Если контент влезает в контейнер (scrollWidth ≤ containerW) —
 *   добавляется класс .no-loop, marquee становится статикой без анимации,
 *   без mask-fade и без cursor:grab.
 * - Иначе клонируем оригинальные чипы пока контент не покроет контейнер
 *   с запасом, и запускаем requestAnimationFrame на скорости speedPxPerSec.
 * - Hover на marquee → пауза. Pointer drag (мышь+touch) → скраб с
 *   setPointerCapture, отпустил → возобновляется автоплей с текущей
 *   позиции (lastT обнуляется чтобы не было прыжка).
 * - Resize → пересчёт loopLen с дебаунсом 120 мс.
 *
 * При items.length === 0 — компонент не рендерится (returns null).
 */
import { useEffect, useRef } from 'react';

export type ChipMarqueeItem = { label: string };

type ChipMarqueeProps = {
  items: ChipMarqueeItem[];
  /** outline (border+ink) или solid (lime/orange-soft с accent text) */
  variant: 'outline' | 'solid';
  /** Цвет акцента для solid-варианта */
  accent: 'lime' | 'orange';
  /** Скорость прокрутки, px/sec. Дефолт 32. */
  speedPxPerSec?: number;
  /** Если true — добавить нижний отступ (последний marquee в карточке). */
  isLast?: boolean;
};

export function ChipMarquee({
  items,
  variant,
  accent,
  speedPxPerSec = 32,
  isLast = false,
}: ChipMarqueeProps) {
  const marqueeRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const marquee = marqueeRef.current;
    const track = trackRef.current;
    if (!marquee || !track) return;

    // Снимаем класс no-loop перед измерением (мог остаться от предыдущего запуска).
    marquee.classList.remove('no-loop');

    // Удаляем все клоны от предыдущего эффекта, оставляем только оригиналы.
    Array.from(track.children).forEach((ch) => {
      if (!(ch instanceof HTMLElement)) return;
      if (ch.dataset.chipOriginal !== 'true') ch.remove();
    });

    const originals = Array.from(
      track.querySelectorAll<HTMLElement>('[data-chip-original="true"]'),
    );
    if (originals.length === 0) return;

    // Измеряем: влезает ли контент в видимый контейнер?
    const containerW = marquee.clientWidth;
    const contentW = track.scrollWidth;

    if (contentW <= containerW + 1) {
      // Влезает → no-loop, не клонируем, не запускаем анимацию.
      marquee.classList.add('no-loop');
      return;
    }

    // Не влезает → клонируем оригинал и запускаем rAF.
    const gap = parseFloat(getComputedStyle(track).gap) || 10;

    function firstSetWidth(): number {
      const first = originals[0];
      const last = originals[originals.length - 1];
      if (!first || !last) return 0;
      return last.offsetLeft + last.offsetWidth - first.offsetLeft + gap;
    }
    let loopLen = firstSetWidth();

    // Клонируем как минимум одну копию + добавляем ещё пока не покроем
    // контейнер с запасом 40px (страховка от пограничных значений).
    originals.forEach((ch) => track.appendChild(ch.cloneNode(true)));
    while (track.scrollWidth < containerW + loopLen + 40) {
      originals.forEach((ch) => track.appendChild(ch.cloneNode(true)));
    }

    // Состояние анимации.
    // Phase 30.8: разделили один paused на два независимых флага.
    // pausedByHover управляется mouseenter/leave, pausedByVisibility — IntersectionObserver.
    // Активная пауза — pausedByHover || pausedByVisibility. Иначе при scroll-in
    // обратно во viewport IO выставит paused=false, даже если мышь всё ещё над marquee
    // (browser не шлёт mouseleave при scroll).
    let offset = 0;
    let lastT = 0;
    let pausedByHover = false;
    let pausedByVisibility = false;
    let dragging = false;
    let dragStartX = 0;
    let dragStartOffset = 0;
    let rafId = 0;

    function applyTransform() {
      track!.style.transform = `translate3d(${offset}px, 0, 0)`;
    }
    function normalize() {
      // Нормализуем offset в диапазоне (-loopLen, 0]
      while (offset <= -loopLen) offset += loopLen;
      while (offset > 0) offset -= loopLen;
    }
    function tick(t: number) {
      if (!lastT) lastT = t;
      const dt = (t - lastT) / 1000;
      lastT = t;
      if (!pausedByHover && !pausedByVisibility && !dragging) {
        offset -= speedPxPerSec * dt;
        normalize();
        applyTransform();
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    function handleEnter() {
      pausedByHover = true;
    }
    function handleLeave() {
      pausedByHover = false;
      lastT = 0;
    }
    marquee.addEventListener('mouseenter', handleEnter);
    marquee.addEventListener('mouseleave', handleLeave);

    // Phase 30.8: IntersectionObserver — пауза rAF когда marquee вне viewport.
    // Сбрасываем lastT при возврате во viewport, чтобы следующий dt был ≈0
    // (без накопленной delta) и анимация не делала «прыжок».
    const observer = new IntersectionObserver(
      ([entry]) => {
        pausedByVisibility = !entry.isIntersecting;
        if (entry.isIntersecting) lastT = 0;
      },
      { threshold: 0 },
    );
    observer.observe(marquee);

    function handleDown(e: PointerEvent) {
      dragging = true;
      dragStartX = e.clientX;
      dragStartOffset = offset;
      track!.classList.add('is-dragging');
      try {
        track!.setPointerCapture(e.pointerId);
      } catch {
        /* setPointerCapture может отсутствовать в jsdom */
      }
    }
    function handleMove(e: PointerEvent) {
      if (!dragging) return;
      const dx = e.clientX - dragStartX;
      offset = dragStartOffset + dx;
      normalize();
      applyTransform();
    }
    function endDrag(e: PointerEvent) {
      if (!dragging) return;
      dragging = false;
      track!.classList.remove('is-dragging');
      lastT = 0;
      try {
        if (e?.pointerId != null) track!.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    track.addEventListener('pointerdown', handleDown);
    track.addEventListener('pointermove', handleMove);
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    track.addEventListener('lostpointercapture', endDrag as EventListener);

    let resizeTO: ReturnType<typeof setTimeout> | null = null;
    function handleResize() {
      if (resizeTO) clearTimeout(resizeTO);
      resizeTO = setTimeout(() => {
        loopLen = firstSetWidth();
        normalize();
        applyTransform();
      }, 120);
    }
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      marquee.removeEventListener('mouseenter', handleEnter);
      marquee.removeEventListener('mouseleave', handleLeave);
      track.removeEventListener('pointerdown', handleDown);
      track.removeEventListener('pointermove', handleMove);
      track.removeEventListener('pointerup', endDrag);
      track.removeEventListener('pointercancel', endDrag);
      track.removeEventListener('lostpointercapture', endDrag as EventListener);
      window.removeEventListener('resize', handleResize);
      if (resizeTO) clearTimeout(resizeTO);
    };
  }, [items, speedPxPerSec]);

  if (items.length === 0) return null;

  // Tailwind-классы конкретного чипа в зависимости от variant и accent.
  const tagClass =
    variant === 'solid'
      ? accent === 'lime'
        ? 'border border-lime/30 bg-lime-soft text-lime-hov'
        : 'border border-orange/30 bg-orange-soft text-orange-text'
      : 'border border-[var(--ui-line)] bg-transparent text-[var(--ui-ink)]';

  return (
    <div
      ref={marqueeRef}
      className={`chip-marquee relative mt-4 h-9 overflow-hidden ${isLast ? 'mb-[22px] sm:mb-4' : ''}`}
    >
      <div
        ref={trackRef}
        // Абсолютное позиционирование вытаскивает track из flow родителя:
        // его «требуемая» ширина (max-content) больше не давит на ширину
        // карточки, overflow:hidden родителя корректно обрезает выезжающие
        // чипы. Без этого min-content propagation расширял slide на 1440.
        className="chip-track absolute top-0 left-0 flex h-full w-max cursor-grab touch-pan-y select-none items-center gap-2.5 px-[22px] will-change-transform"
      >
        {items.map((item, i) => (
          <span
            key={i}
            data-chip-original="true"
            // Phase 30.8: cursor-default явно — иначе наследуется grab от .chip-track
            // и чипы выглядят как drag-handle, хотя они контентные (не интерактивны).
            className={`inline-flex flex-shrink-0 cursor-default items-center whitespace-nowrap rounded-full px-3 py-[7px] font-body text-[10px] font-bold uppercase tracking-[0.18em] ${tagClass}`}
          >
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

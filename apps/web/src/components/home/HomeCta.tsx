/**
 * Финальный призыв (шаг 38.75) — по эталону (`HomePage.tsx:843-895`, чек-лист step-62–64):
 * тёмная секция с отступами 80, свечение по центру, рубрика зелёным, H2 в две строки
 * (вторая — зелёная), подзаголовок 15px на приглушённом белом шириной 440, две кнопки:
 * зелёная «Создать аккаунт» со свечением и подъёмом на 2px при наведении и прозрачная
 * «Смотреть клубы» с тонкой светлой обводкой, зеленеющей при наведении. Подпись
 * с числами макета («12 000+ спортсменов… Москва и СПб») не переносится: числа живут
 * в счётчиках героя, а города у нас один.
 *
 * Логика наша: гостю первая кнопка открывает модалку входа (регистрация там же),
 * вошедшему регистрироваться некуда — она ведёт в его кабинет. Вторая — к выдаче
 * на главной (`#results`).
 *
 * Собран из `ui/Button` для primary (гостю — кнопка, вошедшему — `Button href`).
 * Почему не `ui/*` целиком: вторая кнопка — ссылка-«призрак» на тёмной плашке,
 * у `Button` нет варианта для тёмной поверхности, а заводить его ради одного места —
 * абстракция впрок; сама секция-плашка со свечением по центру — единственная.
 */
'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { CTA } from '@/lib/home-copy';
import { HOME_SECTIONS, homeSectionHref } from '@/lib/home-sections';
import { useAuthFaces, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

/**
 * Главная кнопка призыва: шире обычной и поднимается на 2px, а не на 1px, как `primary`
 * по умолчанию — сознательно, по эталону (`HomePage.tsx:873`: `translateY(-2px)`
 * у CTA «Создать аккаунт»).
 */
const CTA_LIFT_CLASS = 'px-[34px] hover:-translate-y-0.5';

/** Ссылка-«призрак» на тёмной плашке: как «Смотреть клубы» в эталоне. */
const GHOST_LINK_CLASS =
  'inline-flex items-center justify-center rounded-button border border-plate-line px-7 py-3.5 font-body text-[14px] font-bold text-plate-muted no-underline transition-colors hover:border-lime hover:text-plate-ink';

export function HomeCta() {
  const openAuthModal = useUIStore((state) => state.openAuthModal);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { primaryCabinet } = useAuthFaces();

  return (
    <section
      id={HOME_SECTIONS.cta.id}
      aria-label={HOME_SECTIONS.cta.label}
      className="relative overflow-hidden bg-plate py-20 text-plate-ink before:pointer-events-none before:absolute before:inset-0 before:[background:var(--ui-decor-plate-glow-center)]"
    >
      <div className="relative mx-auto flex w-full max-w-[1320px] flex-col items-center px-6 text-center">
        <p className="t-eyebrow mb-4 text-lime">{CTA.eyebrow}</p>
        <h2 className="t-cta mb-3.5 text-plate-ink">
          {CTA.titleLines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
          <span className="block text-lime">{CTA.titleAccent}</span>
        </h2>
        <p className="mb-8 max-w-[440px] font-body text-[15px] leading-[1.7] text-plate-muted">
          {CTA.body}
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          {isAuthenticated && primaryCabinet ? (
            <Button href={primaryCabinet.href} size="lg" className={CTA_LIFT_CLASS}>
              {CTA.primaryAuthenticated}
            </Button>
          ) : (
            <Button size="lg" onClick={openAuthModal} className={CTA_LIFT_CLASS}>
              {CTA.primary}
            </Button>
          )}
          <Link href={homeSectionHref('results')} className={GHOST_LINK_CLASS}>
            {CTA.secondary}
          </Link>
        </div>
      </div>
    </section>
  );
}

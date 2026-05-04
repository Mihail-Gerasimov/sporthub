/*
 * STUB: временная демо-страница Step 28.6 для проверки CardSlider + ChipMarquee
 * через Playwright MCP. Удаляется в Step 28.10 после интеграции в реальные
 * ClubList/TrainerList. Маршрут /_demo-cards (с подчёркиванием) намеренно
 * не виден в обычной навигации.
 */
import { CardSlider, ChipMarquee } from '@/components/ui';

export const dynamic = 'force-dynamic';

const SHORT_TAGS = [{ label: 'Бокс' }, { label: 'Йога' }];
const LONG_TAGS = [
  { label: 'Йога' },
  { label: 'Бокс' },
  { label: 'Кроссфит' },
  { label: 'Пилатес' },
  { label: 'Единоборства' },
  { label: 'Тренажёрный зал' },
  { label: 'Танцы' },
  { label: 'Восстановление' },
];

function DemoCard({
  index,
  title,
  marqueeItems,
  marqueeAccent,
}: {
  index: number;
  title: string;
  marqueeItems: { label: string }[];
  marqueeAccent: 'lime' | 'orange';
}) {
  return (
    <article
      className="flex h-full flex-col gap-4 rounded-[18px] border border-[var(--ui-line)] bg-[var(--ui-card)] p-6"
      data-demo-card-index={index}
    >
      <span className="font-body text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ui-muted)]">
        Demo card #{String(index + 1).padStart(2, '0')}
      </span>
      <h3 className="font-display text-[22px] uppercase leading-[1.05] tracking-[-0.005em] text-[var(--ui-ink)]">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-[var(--ui-muted)]">
        Это карточка-заглушка для проверки CardSlider и ChipMarquee. Реальные карточки клубов и
        тренеров будут в шагах 28.8 / 28.9.
      </p>
      <ChipMarquee items={marqueeItems} variant="solid" accent={marqueeAccent} isLast />
    </article>
  );
}

export default function DemoCardsPage() {
  const demoClubs = Array.from({ length: 6 }, (_, i) => ({
    id: i,
    title: `Клуб #${i + 1}`,
  }));
  const demoTrainers = Array.from({ length: 6 }, (_, i) => ({
    id: i,
    title: `Тренер #${i + 1}`,
  }));

  return (
    <main className="mx-auto w-full max-w-[1440px] space-y-12 px-4 py-12 sm:px-6 lg:px-10">
      <header className="flex flex-col gap-2">
        <span className="font-body text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ui-lime)]">
          Step 28.6 · Smoke demo
        </span>
        <h1 className="font-display text-[40px] uppercase leading-[0.95] text-[var(--ui-ink)]">
          CardSlider + ChipMarquee
        </h1>
        <p className="max-w-[760px] text-sm leading-relaxed text-[var(--ui-muted)]">
          Smoke-страница для визуальной проверки слайдера и бегущей строки на 5 брейкпоинтах
          (480/768/1024/1280/1440). Удаляется в Step 28.10 после интеграции в ClubList/TrainerList.
        </p>
      </header>

      {/* Слайдер с lime-акцентом и длинным набором тегов (marquee должен крутиться) */}
      <CardSlider
        eyebrow="Demo · clubs"
        title="Slider lime · marquee long"
        accent="lime"
        sliderId="demo-clubs"
        total={demoClubs.length}
      >
        {demoClubs.map((club, i) => (
          <DemoCard
            key={club.id}
            index={i}
            title={club.title}
            marqueeItems={LONG_TAGS}
            marqueeAccent="lime"
          />
        ))}
      </CardSlider>

      {/* Слайдер с orange-акцентом и коротким набором тегов (marquee no-loop) */}
      <CardSlider
        eyebrow="Demo · trainers"
        title="Slider orange · marquee short (no-loop)"
        accent="orange"
        sliderId="demo-trainers"
        total={demoTrainers.length}
      >
        {demoTrainers.map((trainer, i) => (
          <DemoCard
            key={trainer.id}
            index={i}
            title={trainer.title}
            marqueeItems={SHORT_TAGS}
            marqueeAccent="orange"
          />
        ))}
      </CardSlider>

      {/* Empty state слайдера */}
      <CardSlider
        eyebrow="Demo · empty"
        title="Empty state"
        accent="lime"
        sliderId="demo-empty"
        total={0}
        emptyMessage="Карточек нет — empty-state из Step 28.6."
      >
        {[]}
      </CardSlider>
    </main>
  );
}

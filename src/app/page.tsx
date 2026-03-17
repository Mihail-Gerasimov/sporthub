import { UiShowcase } from '@/components/ui';

const colorTokens = [
  {
    name: 'Canvas',
    value: '#F4EAD7',
    swatchClassName: 'bg-canvas',
    textClassName: 'text-ink',
  },
  {
    name: 'Panel',
    value: '#FFF7EB',
    swatchClassName: 'bg-panel',
    textClassName: 'text-ink',
  },
  {
    name: 'Accent',
    value: '#D85A32',
    swatchClassName: 'bg-accent',
    textClassName: 'text-[var(--ui-panel)]',
  },
  {
    name: 'Teal',
    value: '#0C6F73',
    swatchClassName: 'bg-teal',
    textClassName: 'text-[var(--ui-panel)]',
  },
];

const signalTokens = [
  {
    label: 'Success',
    className: 'bg-success',
  },
  {
    label: 'Warning',
    className: 'bg-warning',
  },
  {
    label: 'Danger',
    className: 'bg-danger',
  },
];

export default function Home() {
  return (
    <main className="min-h-screen px-6 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="rounded-card border border-line bg-panel p-6 shadow-card sm:p-8 lg:p-10">
          <div className="flex flex-wrap gap-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
            <span className="rounded-pill border border-line bg-canvas px-4 py-2">
              Brand system
            </span>
            <span className="rounded-pill bg-accent px-4 py-2 text-[var(--ui-panel)]">Phase 4</span>
            <span className="rounded-pill border border-line bg-panel-strong px-4 py-2">
              Design tokens
            </span>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.25fr_0.9fr]">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.28em] text-muted">SportHub</p>
              <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl lg:text-6xl">
                MVP в разработке
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-8 text-muted sm:text-lg">
                Главная страница будет собрана в следующих шагах. Сейчас проект и инфраструктура
                подготовлены к дальнейшей разработке.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <span className="rounded-pill bg-accent-soft px-4 py-2 text-sm font-medium text-accent-strong">
                  mobile-first
                </span>
                <span className="rounded-pill border border-line bg-canvas px-4 py-2 text-sm font-medium text-ink">
                  warm editorial palette
                </span>
                <span className="rounded-pill border border-line bg-canvas px-4 py-2 text-sm font-medium text-teal">
                  soft athletic contrast
                </span>
              </div>
            </div>

            <div className="rounded-card border border-line bg-panel-strong p-5 shadow-floating sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
                Typography & surfaces
              </p>
              <div className="mt-4 space-y-4">
                <div className="rounded-card bg-panel p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">Display</p>
                  <p className="mt-2 font-display text-2xl font-semibold text-ink">
                    Strong, clean, deliberate
                  </p>
                </div>
                <div className="rounded-card border border-line bg-canvas p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">Body</p>
                  <p className="mt-2 text-sm leading-7 text-muted">
                    Базовая тема собрана на мягком фоне, тёплых карточках и акценте без стандартного
                    фиолетового вайба.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-card border border-line bg-panel p-6 shadow-card">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
                  Color system
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">Базовые токены палитры</h2>
              </div>
              <p className="text-sm text-muted">canvas / panel / accent / teal</p>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {colorTokens.map((token) => (
                <article
                  key={token.name}
                  className={`${token.swatchClassName} rounded-card border border-line p-4 shadow-card`}
                >
                  <p className={`text-xs uppercase tracking-[0.18em] ${token.textClassName}`}>
                    {token.name}
                  </p>
                  <p className={`mt-10 text-lg font-semibold ${token.textClassName}`}>
                    {token.value}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-card border border-line bg-panel p-6 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
              States & depth
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {signalTokens.map((token) => (
                <span
                  key={token.label}
                  className={`${token.className} rounded-pill px-4 py-2 text-sm font-semibold text-[var(--ui-panel)]`}
                >
                  {token.label}
                </span>
              ))}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-card border border-line bg-canvas p-4 shadow-card">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Radius</p>
                <p className="mt-2 text-sm leading-7 text-ink">
                  Карточки получили крупный радиус для мягкой посадки интерфейса.
                </p>
              </div>
              <div className="rounded-card border border-line bg-panel-strong p-4 shadow-floating">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Shadow</p>
                <p className="mt-2 text-sm leading-7 text-ink">
                  Акцентная глубина выделяет важные блоки и CTA-носители.
                </p>
              </div>
            </div>
          </div>
        </section>

        <UiShowcase />
      </div>
    </main>
  );
}

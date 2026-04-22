import Link from 'next/link';

const mobileNavItems = [
  {
    href: '/',
    label: 'Главная',
    glyph: (
      <path
        d="M4.5 10.5 12 4l7.5 6.5v8a1 1 0 0 1-1 1H14v-5h-4v5H5.5a1 1 0 0 1-1-1v-8Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    ),
  },
  {
    href: '/#discover',
    label: 'Поиск',
    glyph: (
      <>
        <circle cx="11" cy="11" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="m15.5 15.5 4 4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.7"
        />
      </>
    ),
  },
  {
    href: '/#availability',
    label: 'Слоты',
    glyph: (
      <>
        <rect
          x="5"
          y="4.5"
          width="14"
          height="15"
          rx="2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path
          d="M8 8.5h8M8 12h8M8 15.5h5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.7"
        />
      </>
    ),
  },
  {
    href: '/profile/athlete/dashboard',
    label: 'Профиль',
    glyph: (
      <>
        <circle cx="12" cy="8.5" r="3.3" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="M5.5 19c1.7-3 4-4.5 6.5-4.5S16.8 16 18.5 19"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.7"
        />
      </>
    ),
  },
];

export function MobileNav() {
  return (
    <nav
      aria-label="Мобильная навигация"
      className="fixed inset-x-4 bottom-4 z-50 flex items-center justify-between rounded-card border border-line bg-panel/95 px-3 py-2 shadow-floating backdrop-blur md:hidden"
    >
      {mobileNavItems.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-card px-2 py-2 text-center text-[11px] font-semibold text-ink transition-colors hover:bg-canvas hover:text-accent"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
            {item.glyph}
          </svg>
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

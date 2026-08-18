import Link from 'next/link';

const footerLinks = [
  { href: '/#about', label: 'О проекте' },
  { href: '/#clubs', label: 'Каталог клубов' },
  { href: '/#contacts', label: 'Контакты' },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-panel/90" aria-label="Подвал сайта">
      <div className="mx-auto grid w-full max-w-[1440px] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">SportHub</p>
          <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink">
            Городская витрина для спорта без лишнего шума.
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            Сейчас это MVP с фокусом на подбор, запись и понятный интерфейс для клубов, студий и
            тренеров.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Навигация
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {footerLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="text-sm font-medium text-ink transition-colors hover:text-accent"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Статус</p>
            <div className="mt-4 space-y-2 text-sm leading-relaxed text-muted">
              <p>MVP разрабатывается по фазам.</p>
              <p>Следом собираем поиск, фильтры и клубы на главной.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-line/80 px-4 py-4 text-center text-xs text-muted sm:px-6 lg:px-10">
        © 2026 SportHub. Все ссылки в подвале пока работают как заглушки MVP.
      </div>
    </footer>
  );
}

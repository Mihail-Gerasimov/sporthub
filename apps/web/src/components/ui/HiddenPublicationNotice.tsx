/**
 * Уведомление о скрытой публикации.
 * Показывается на detail-странице клуба/тренера вместо основного контента,
 * когда публикация скрыта администратором. Phase 28.22: перевёрстано
 * под dark-палитру (bg-card / border-line / text-ink/muted), кнопка
 * возврата — lime-fill через rounded-pill, без эмодзи.
 */
import Link from 'next/link';

type HiddenPublicationNoticeProps = {
  backHref: string;
  backLabel: string;
};

export function HiddenPublicationNotice({ backHref, backLabel }: HiddenPublicationNoticeProps) {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <div className="max-w-md space-y-5 rounded-[18px] border border-line bg-card px-7 py-8 text-center">
        <p className="font-body text-[11px] font-bold uppercase tracking-[0.22em] text-muted">
          Hidden publication
        </p>
        <h1 className="font-display text-2xl text-ink">Публикация скрыта</h1>
        <p className="text-sm leading-relaxed text-muted">
          Эта публикация временно недоступна. Если вы считаете это ошибкой, свяжитесь с поддержкой.
        </p>
        <Link
          href={backHref}
          className="inline-flex min-h-11 items-center justify-center rounded-pill bg-lime px-6 font-body text-xs font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:bg-lime-hov"
        >
          {backLabel}
        </Link>
      </div>
    </main>
  );
}

/**
 * Уведомление о скрытой публикации.
 * Показывается на detail-странице клуба/тренера вместо основного контента,
 * когда публикация скрыта администратором.
 */
import Link from 'next/link';

type HiddenPublicationNoticeProps = {
  backHref: string;
  backLabel: string;
};

export function HiddenPublicationNotice({ backHref, backLabel }: HiddenPublicationNoticeProps) {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md space-y-4 text-center">
        <div className="text-5xl">🚫</div>
        <h1 className="font-display text-xl font-semibold text-ink">
          Публикация скрыта администратором
        </h1>
        <p className="text-sm text-muted">
          Эта публикация временно недоступна. Если вы считаете это ошибкой, свяжитесь с поддержкой.
        </p>
        <Link
          href={backHref}
          className="inline-block rounded-pill bg-accent px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          {backLabel}
        </Link>
      </div>
    </main>
  );
}

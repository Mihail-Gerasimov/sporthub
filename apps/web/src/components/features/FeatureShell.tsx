import type { ReactNode } from 'react';

import { Card } from '@/components/ui';

type FeatureShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function FeatureShell({
  actions,
  children,
  description,
  eyebrow,
  title,
}: FeatureShellProps) {
  return (
    <div className="min-h-screen bg-bg">
      <section className="relative overflow-hidden bg-plate px-4 py-10 text-plate-ink sm:px-6 lg:py-14">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 [background-image:var(--ui-decor-plate-glow)]"
        />
        <div className="relative mx-auto flex max-w-7xl flex-col gap-5">
          <p className="t-eyebrow text-lime">{eyebrow}</p>
          <h1 className="t-h1 max-w-4xl text-plate-ink">{title}</h1>
          <p className="max-w-2xl font-body text-sm leading-relaxed text-plate-muted sm:text-base">
            {description}
          </p>
          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:py-10">{children}</div>
    </div>
  );
}

export function HonestEmptyState({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <Card className="flex min-h-64 flex-col items-center justify-center gap-4 border-dashed text-center">
      <p className="t-card-title text-ink">{title}</p>
      <p className="max-w-lg font-body text-sm leading-relaxed text-muted">{description}</p>
      {action}
    </Card>
  );
}

export function FeatureError({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-card border border-red/40 bg-card p-4 text-sm text-red">
      {message}
    </div>
  );
}

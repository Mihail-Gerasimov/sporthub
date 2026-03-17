import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

type BadgeTone = 'neutral' | 'accent' | 'teal' | 'success' | 'warning' | 'danger' | 'outline';

const toneClassNames: Record<BadgeTone, string> = {
  neutral: 'border-transparent bg-panel-strong text-ink',
  accent: 'border-transparent bg-accent-soft text-accent-strong',
  teal: 'border-transparent bg-teal/12 text-teal',
  success: 'border-transparent bg-success/12 text-success',
  warning: 'border-transparent bg-warning/14 text-warning',
  danger: 'border-transparent bg-danger/12 text-danger',
  outline: 'border-line bg-panel text-ink',
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em]',
        toneClassNames[tone],
        className,
      )}
      {...props}
    />
  );
}

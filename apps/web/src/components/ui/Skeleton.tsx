import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  rounded?: 'card' | 'pill';
};

export function Skeleton({ className, rounded = 'card', ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse bg-panel-strong/80',
        rounded === 'pill' ? 'rounded-pill' : 'rounded-card',
        className,
      )}
      {...props}
    />
  );
}

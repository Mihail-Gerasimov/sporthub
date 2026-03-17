import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

export type CardProps = ComponentPropsWithoutRef<'div'> & {
  elevated?: boolean;
};

export function Card({ className, elevated = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-line bg-panel p-5',
        elevated ? 'shadow-floating' : 'shadow-card',
        className,
      )}
      {...props}
    />
  );
}

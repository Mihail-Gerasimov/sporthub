import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

export type CardProps = ComponentPropsWithoutRef<'div'> & {
  elevated?: boolean;
};

export function Card({ className, elevated = false, ...props }: CardProps) {
  void elevated;

  return (
    <div className={cn('rounded-card border border-line bg-panel p-5', className)} {...props} />
  );
}

import type { ReactNode } from 'react';

import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { MobileNav } from '@/components/layout/MobileNav';

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 pb-28 md:pb-0">{children}</main>
      <Footer />
      <MobileNav />
    </div>
  );
}

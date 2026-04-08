import type { ReactNode } from 'react';

import { ImpersonationBanner } from '@/components/admin/ImpersonationBanner';
import { AuthModal } from '@/components/auth';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { MobileNav } from '@/components/layout/MobileNav';

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Sticky-обёртка: баннер и хедер прилипают как единый блок */}
      <div className="sticky top-0 z-40">
        <ImpersonationBanner />
        <Header />
      </div>
      <main className="flex-1 pb-28 md:pb-0">{children}</main>
      <AuthModal />
      <Footer />
      <MobileNav />
    </div>
  );
}

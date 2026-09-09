import type { ReactNode } from 'react';

import { ImpersonationBanner } from '@/components/admin/ImpersonationBanner';
import { AuthModal, SessionBootstrap } from '@/components/auth';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { MobileNav } from '@/components/layout/MobileNav';
// Phase 24 (Step 24.6): глобальный стек toast-уведомлений для собственных действий.
import { ToastStack } from '@/components/ui/ToastStack';

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Личность спрашивается у сервера один раз на всё дерево — до того,
          как её прочитают шапка, колокольчик и кабинеты. Ничего не рисует. */}
      <SessionBootstrap />
      {/* Sticky-обёртка: баннер и хедер прилипают как единый блок */}
      <div className="sticky top-0 z-40">
        <ImpersonationBanner />
        <Header />
      </div>
      <main className="flex-1 pb-28 md:pb-0">{children}</main>
      <AuthModal />
      <Footer />
      <MobileNav />
      <ToastStack />
    </div>
  );
}

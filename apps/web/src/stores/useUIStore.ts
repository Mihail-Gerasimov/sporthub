'use client';

// Стор интерфейса: открытые слои, о которых должны знать сразу несколько компонентов —
// модалка входа и меню шапки (шаг 38.62: при открытом меню мобильный док прячется,
// иначе он висел бы поверх оверлея — у обёртки шапки свой контекст наложения).
import { create } from 'zustand';

type UIState = {
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  /** Меню шапки на узких экранах открыто. */
  isHeaderMenuOpen: boolean;
  setHeaderMenuOpen: (open: boolean) => void;
};

export const useUIStore = create<UIState>()((set) => ({
  isAuthModalOpen: false,
  isHeaderMenuOpen: false,
  setHeaderMenuOpen: (open) => {
    set({ isHeaderMenuOpen: open });
  },
  openAuthModal: () => {
    set({
      isAuthModalOpen: true,
    });
  },
  closeAuthModal: () => {
    set({
      isAuthModalOpen: false,
    });
  },
}));

'use client';

import { create } from 'zustand';

type UIState = {
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
};

export const useUIStore = create<UIState>()((set) => ({
  isAuthModalOpen: false,
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

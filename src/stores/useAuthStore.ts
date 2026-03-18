'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AuthAccountType } from '@/types';

export type AuthSessionUser = {
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
};

export type PersonalCabinetConfig = {
  accountType: AuthAccountType;
  profilePath: '/profile/provider' | '/profile/athlete';
  title: string;
};

type AuthSessionPayload = {
  accountType: AuthAccountType;
  user: AuthSessionUser;
};

type AuthState = {
  user: AuthSessionUser | null;
  accountType: AuthAccountType | null;
  isAuthenticated: boolean;
  login: (payload: AuthSessionPayload) => void;
  register: (payload: AuthSessionPayload) => void;
  logout: () => void;
};

export const AUTH_STORAGE_KEY = 'sporthub-auth-store';

export const AUTH_STORE_DEFAULT_STATE = {
  user: null,
  accountType: null,
  isAuthenticated: false,
} satisfies Pick<AuthState, 'user' | 'accountType' | 'isAuthenticated'>;

function createAuthenticatedState(payload: AuthSessionPayload) {
  return {
    user: payload.user,
    accountType: payload.accountType,
    isAuthenticated: true,
  } satisfies Pick<AuthState, 'user' | 'accountType' | 'isAuthenticated'>;
}

export const PERSONAL_CABINET_CONFIG: Record<AuthAccountType, PersonalCabinetConfig> = {
  provider: {
    accountType: 'provider',
    profilePath: '/profile/provider',
    title: 'Кабинет представителя спортивных услуг',
  },
  athlete: {
    accountType: 'athlete',
    profilePath: '/profile/athlete',
    title: 'Кабинет спортсмена',
  },
};

export function selectAuthAccountType(state: Pick<AuthState, 'accountType'>) {
  return state.accountType;
}

export function getPersonalCabinetConfig(accountType: AuthAccountType | null) {
  return accountType ? PERSONAL_CABINET_CONFIG[accountType] : null;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      ...AUTH_STORE_DEFAULT_STATE,
      login: (payload) => {
        set(createAuthenticatedState(payload));
      },
      register: (payload) => {
        set(createAuthenticatedState(payload));
      },
      logout: () => {
        set(AUTH_STORE_DEFAULT_STATE);
      },
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accountType: state.accountType,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);

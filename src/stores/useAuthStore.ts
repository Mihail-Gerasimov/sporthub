'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AuthAccountType, UserRole } from '@/types';

export type AuthSessionUser = {
  id?: number;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  city?: string;
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
  // --- Существующие поля (без изменений) ---
  user: AuthSessionUser | null;
  accountType: AuthAccountType | null;
  isAuthenticated: boolean;
  login: (payload: AuthSessionPayload) => void;
  register: (payload: AuthSessionPayload) => void;
  logout: () => void;

  // --- Новые поля Phase 17: параллельный admin-трек ---
  isAdmin: boolean;
  isImpersonating: boolean;
  adminOriginalUser: AuthSessionUser | null;
  adminLogin: (user: AuthSessionUser) => void;
  startImpersonation: (targetUser: AuthSessionUser, targetAccountType: AuthAccountType) => void;
  stopImpersonation: () => void;
};

export const AUTH_STORAGE_KEY = 'sporthub-auth-store';
export const MVP_ATHLETE_USER_ID = 1;
// Fake-пользователь «представитель спортивных услуг» для MVP-кабинета провайдера
export const MVP_PROVIDER_USER_ID = 2;
// Fake-пользователь «администратор» для сервисной панели
export const MVP_ADMIN_USER_ID = 3;

export const AUTH_STORE_DEFAULT_STATE = {
  user: null,
  accountType: null,
  isAuthenticated: false,
  isAdmin: false,
  isImpersonating: false,
  adminOriginalUser: null,
} satisfies Pick<
  AuthState,
  'user' | 'accountType' | 'isAuthenticated' | 'isAdmin' | 'isImpersonating' | 'adminOriginalUser'
>;

function createAuthenticatedState(payload: AuthSessionPayload) {
  return {
    user: payload.user,
    accountType: payload.accountType,
    isAuthenticated: true,
  } satisfies Pick<AuthState, 'user' | 'accountType' | 'isAuthenticated'>;
}

/**
 * Маппинг DB-роли пользователя в frontend AuthAccountType.
 * athlete → 'athlete', club_owner/trainer → 'provider', admin → null.
 */
export function userRoleToAccountType(role: UserRole): AuthAccountType | null {
  if (role === 'athlete') return 'athlete';
  if (role === 'club_owner' || role === 'trainer') return 'provider';
  return null;
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

export function selectAthleteActionUserId(state: Pick<AuthState, 'accountType' | 'user'>) {
  return state.accountType === 'athlete' ? (state.user?.id ?? null) : null;
}

export function getPersonalCabinetConfig(accountType: AuthAccountType | null) {
  return accountType ? PERSONAL_CABINET_CONFIG[accountType] : null;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
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

      // --- Admin actions ---

      adminLogin: (user) => {
        set({
          user,
          isAuthenticated: true,
          isAdmin: true,
          accountType: null,
          isImpersonating: false,
          adminOriginalUser: null,
        });
      },

      startImpersonation: (targetUser, targetAccountType) => {
        const state = get();

        // Guard: impersonation доступен только для admin
        if (!state.isAdmin) return;

        set({
          adminOriginalUser: state.user,
          user: targetUser,
          accountType: targetAccountType,
          isImpersonating: true,
        });
      },

      stopImpersonation: () => {
        const state = get();

        set({
          user: state.adminOriginalUser,
          accountType: null,
          isImpersonating: false,
          adminOriginalUser: null,
        });
      },
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accountType: state.accountType,
        isAuthenticated: state.isAuthenticated,
        isAdmin: state.isAdmin,
        isImpersonating: state.isImpersonating,
        adminOriginalUser: state.adminOriginalUser,
      }),
    },
  ),
);

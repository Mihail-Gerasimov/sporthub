'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  clearAuthUserIdCookie,
  readAuthUserIdCookie,
  setAuthUserIdCookie,
} from '@/lib/auth-cookie';
import type { AuthAccountType, UserRole } from '@sporthub/types';

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
  /**
   * Phase 29 Step 29.6: точечное обновление полей текущего user в сторе после
   * успешного PATCH /api/users/[id]. Шортхэнд вместо полного login() —
   * не трогаем accountType/isAuthenticated/cookie. Если user=null — no-op.
   */
  updateUser: (patch: Partial<AuthSessionUser>) => void;

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

// Phase 26 post-fix: синхронизация auth-cookie с состоянием store.
// Cookie нужна серверным компонентам (страницы notifications в ЛК), которые
// не могут читать Zustand. Единая точка write/clear — здесь; call-sites не трогаем.
//
// Если в payload нет user.id (edge-case невалидного sign-up) — не пишем cookie,
// чтобы не получить sh-auth-user-id=NaN.
function syncAuthCookie(userId: number | undefined | null): void {
  if (typeof userId === 'number' && Number.isFinite(userId)) {
    setAuthUserIdCookie(userId);
  } else {
    clearAuthUserIdCookie();
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ...AUTH_STORE_DEFAULT_STATE,

      login: (payload) => {
        set(createAuthenticatedState(payload));
        syncAuthCookie(payload.user.id);
      },

      register: (payload) => {
        set(createAuthenticatedState(payload));
        syncAuthCookie(payload.user.id);
      },

      logout: () => {
        set(AUTH_STORE_DEFAULT_STATE);
        clearAuthUserIdCookie();
      },

      updateUser: (patch) => {
        const current = get().user;
        if (!current) return;
        set({ user: { ...current, ...patch } });
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
        syncAuthCookie(user.id);
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
        syncAuthCookie(targetUser.id);
      },

      stopImpersonation: () => {
        const state = get();
        const originalId = state.adminOriginalUser?.id;

        set({
          user: state.adminOriginalUser,
          accountType: null,
          isImpersonating: false,
          adminOriginalUser: null,
        });
        syncAuthCookie(originalId);
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
      /**
       * После гидратации LS проверяем, что cookie согласован с состоянием.
       * Сценарий edge-case: user очистил LS вручную, а cookie осталась. Либо наоборот.
       * LS — single source of truth: приводим cookie к нему.
       */
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const expectedId = state.user?.id ?? null;
        const cookieId = readAuthUserIdCookie();
        if (expectedId !== cookieId) {
          syncAuthCookie(expectedId);
        }
      },
    },
  ),
);

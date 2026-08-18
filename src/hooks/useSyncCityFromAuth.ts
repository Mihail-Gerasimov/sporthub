/**
 * Хук синхронизации города из auth-профиля в filter store.
 * При логине/регистрации/impersonation selectedCity обновляется из user.city.
 * При logout — сбрасывается к DEFAULT_CITY.
 * Step 19.9
 */
import { useEffect } from 'react';

import { DEFAULT_CITY } from '@sporthub/types';
import { useAuthStore } from '@/stores/useAuthStore';
import { useFilterStore } from '@/stores/useFilterStore';

export function useSyncCityFromAuth() {
  const userCity = useAuthStore((state) => state.user?.city);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const setSelectedCity = useFilterStore((state) => state.setSelectedCity);

  useEffect(() => {
    if (isAuthenticated && userCity) {
      setSelectedCity(userCity);
    } else if (!isAuthenticated) {
      setSelectedCity(DEFAULT_CITY);
    }
  }, [isAuthenticated, userCity, setSelectedCity]);
}

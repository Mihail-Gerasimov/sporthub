'use client';

// Один вопрос «кто я» на загрузку страницы.
//
// Раньше браузер отвечал на него сам: личность лежала в localStorage, и стор
// поднимался из неё до первой отрисовки. Теперь ответ знает только сервер,
// а спросить его можно лишь из браузера — cookie сессии для скриптов закрыта.
//
// Компонент стоит в общей оболочке приложения, то есть ровно один раз на всё
// дерево: спрашивать в каждом кабинете значило бы спрашивать по нескольку раз
// за страницу. Ничего не рисует — он только задаёт вопрос.

import { useEffect } from 'react';

import { useAuthStore } from '@/stores/useAuthStore';

export function SessionBootstrap() {
  const loadSession = useAuthStore((state) => state.loadSession);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  return null;
}

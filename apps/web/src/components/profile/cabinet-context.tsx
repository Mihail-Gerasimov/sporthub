// Какой кабинет открыт — для клиентских частей внутри него.
//
// ⚠️ Зачем это понадобилось шагу 35.31. Разделы кабинета лица ссылаются друг
// на друга («перейти к публикациям», «заявки на подтверждение»), а адрес
// кабинета стал адресным: у клуба 3 и клуба 7 разделы одинаковые, а ссылки
// разные. Писать адрес строкой внутри компонента больше нельзя — он вёл бы
// в кабинет вообще без номера.
//
// Источник один и он серверный: лейаут кабинета получает лицо из адреса, сверяет
// владение и кладёт готовый кабинет сюда. Компоненты не разбирают `usePathname`
// сами — иначе разбор адреса размножился бы по десятку файлов.
'use client';

import { createContext, useContext, type ReactNode } from 'react';

import { PERSONAL_CABINET, type CabinetTarget } from '@/lib/service-faces';

/**
 * Умолчание — личный кабинет.
 *
 * Оно означает ровно «кабинета лица вокруг нет»: так отрисовываются разделы
 * человека, у которых лица и не бывает. Компонент раздела лица без провайдера
 * не отрисовывается нигде, кроме проверок в изоляции.
 */
const CabinetContext = createContext<CabinetTarget>(PERSONAL_CABINET);

export function CabinetProvider({
  cabinet,
  children,
}: {
  cabinet: CabinetTarget;
  children: ReactNode;
}) {
  return <CabinetContext.Provider value={cabinet}>{children}</CabinetContext.Provider>;
}

/** Открытый кабинет: его адрес, подпись и лицо (`null` — личный). */
export function useCabinet(): CabinetTarget {
  return useContext(CabinetContext);
}

/** Адрес открытого кабинета — от него собираются ссылки между разделами. */
export function useCabinetPath(): string {
  return useCabinet().href;
}

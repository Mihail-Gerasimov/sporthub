// Адрес кабинета лица, разобранный на вид и номер.
//
// ⚠️ Отдельный модуль, потому что разбирают его ВСЕ страницы кабинета, а не
// только лейаут: срез кабинета мемоизируется `cache`-ем по виду и номеру, и
// страница обязана позвать загрузчик теми же аргументами, что и макет, — иначе
// за навигацию выйдет два одинаковых похода на бэкенд вместо одного.
//
// ⚠️ Разбор здесь — НЕ проверка доступа. Он отсекает только мусор в адресе
// (`/profile/venue/5`, `/profile/club/abc`). Пускать или нет решает лейаут
// кабинета (`requireOwner`), и решает до любого похода за данными.

import 'server-only';

import { redirect } from 'next/navigation';

import { parseFaceCabinetParams, type ServiceFaceRef } from '@/lib/service-faces';

/** Сегменты адреса кабинета лица: `/profile/[faceKind]/[faceId]/...`. */
export type FaceCabinetParams = { faceKind: string; faceId: string };

/**
 * Вид и номер лица из адреса. Мусор в адресе уводит на главную.
 *
 * Уводит, а не показывает «не найдено», намеренно: по разнице ответов
 * посторонний перебирал бы номера и узнавал, какие лица существуют.
 */
export async function requireFaceCabinetParams(
  params: Promise<FaceCabinetParams>,
): Promise<ServiceFaceRef> {
  const ref = parseFaceCabinetParams(await params);

  if (ref === null) redirect('/');

  return ref;
}

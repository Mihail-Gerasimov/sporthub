// Прежний адрес кабинета услуг: `/profile/provider/*` → `/profile/<вид>/<номер>/*`.
//
// ⚠️ Почему маршрут существует. Ровно та же причина, что и у `../athlete`:
// адреса лежат в закладках и в письмах, и 404 на них читался бы как поломка.
//
// ⚠️ Почему редирект здесь ВРЕМЕННЫЙ (307), а не постоянный. У прежнего адреса
// не было номера лица — значит и назначения у него нет одного: владелец трёх
// клубов уедет в кабинет одного из них, а человек без лиц не уедет никуда.
// Ответ зависит от того, кто открыл ссылку, поэтому кэшировать его как
// «навсегда так» нельзя: закэшированный 308 увёл бы в чужой кабинет, а после
// появления второго лица — в неверный собственный.
//
// Куда именно: в кабинет ПЕРВОГО лица из сессии. Другого разумного умолчания
// нет — прежний адрес не нёс ни имени, ни номера, — а у большинства людей лицо
// одно, и для них выбор однозначен. У кого лиц несколько, попадёт в кабинет
// первого и переключится одним нажатием.
import { redirect } from 'next/navigation';

import { requireSession } from '@/lib/session';
import { cabinetSectionPath, faceCabinetPath, legacyCabinetSection } from '@/lib/service-faces';

type LegacyProviderRouteProps = {
  params: Promise<{ rest?: string[] }>;
};

export default async function LegacyFaceCabinetRoute({ params }: LegacyProviderRouteProps) {
  const { rest } = await params;
  // Личность нужна ДО выбора адреса: без неё неизвестно, чей кабинет открывать.
  // Гостя `requireSession` уведёт на главную сам — и уведёт до любых данных.
  const session = await requireSession();
  const [face] = session.faces;

  // Лиц нет — вести некуда: кабинета лица у этого человека не существует.
  // На главную, тем же ответом, каким встречает чужой адрес кабинета.
  if (face === undefined) redirect('/');

  redirect(cabinetSectionPath(faceCabinetPath(face), legacyCabinetSection(rest)));
}

// Корень кабинета лица собственного UI не имеет (Phase 26 Step 26.5): уводит
// на раздел обзора этого же лица. Разделы — `/profile/<вид>/<номер>/{dashboard,
// bookings,clients,stats,links,publications,reviews,settings,finance,notifications}`.
//
// ⚠️ Адрес назначения собирается ИЗ АДРЕСА, а не из сессии: номер лица уже стоит
// в пути, и уводить надо в кабинет именно этого лица. Пускать ли — решает лейаут,
// он отрабатывает на том же запросе.
import { redirect } from 'next/navigation';

import type { FaceCabinetParams } from '@/lib/face-cabinet-params';
import {
  cabinetSectionPath,
  DEFAULT_CABINET_SECTION,
  faceCabinetPath,
  parseFaceCabinetParams,
} from '@/lib/service-faces';

export default async function FaceCabinetRoute({ params }: { params: Promise<FaceCabinetParams> }) {
  const ref = parseFaceCabinetParams(await params);

  if (ref === null) redirect('/');

  redirect(cabinetSectionPath(faceCabinetPath(ref), DEFAULT_CABINET_SECTION));
}

// Прежний адрес личного кабинета: `/profile/athlete/*` → `/profile/me/*`.
//
// ⚠️ Почему маршрут вообще существует, а не удалён вместе с папкой. Эти адреса
// у людей в закладках и разосланы письмами уведомлений — «страница не найдена»
// на них выглядела бы как поломка площадки, а не как переезд. Молчаливого 404
// шаг 35.31 не допускает.
//
// ⚠️ Почему редирект ПОСТОЯННЫЙ (308). Соответствие здесь неизменное и одно
// для всех: `/profile/athlete/reviews` — это всегда `/profile/me/reviews`, кем
// бы ни был вошедший. Такой ответ можно и нужно закэшировать у клиента: письмо
// двухлетней давности перестанет дёргать сервер после первого перехода.
// Ср. с кабинетом лица (`../provider`), где адрес назначения зависит от того,
// кто открыл ссылку, — и постоянным быть не может.
//
// Имя раздела не переводится таблицей: разделы личного кабинета сохранили
// имена, поэтому переезд — это замена начала адреса.
import { permanentRedirect } from 'next/navigation';

import {
  legacyCabinetSection,
  cabinetSectionPath,
  PERSONAL_CABINET_PATH,
} from '@/lib/service-faces';

type LegacyAthleteRouteProps = {
  params: Promise<{ rest?: string[] }>;
};

export default async function LegacyAthleteCabinetRoute({ params }: LegacyAthleteRouteProps) {
  const { rest } = await params;

  permanentRedirect(cabinetSectionPath(PERSONAL_CABINET_PATH, legacyCabinetSection(rest)));
}

// Корень личного кабинета собственного UI не имеет (Phase 26 Step 26.5):
// уводит на раздел обзора. Разделы — `/profile/me/{dashboard,schedule,stats,
// favorites,reviews,notifications,settings}`.
import { redirect } from 'next/navigation';

import {
  cabinetSectionPath,
  DEFAULT_CABINET_SECTION,
  PERSONAL_CABINET_PATH,
} from '@/lib/service-faces';

export default function PersonalCabinetRoute() {
  redirect(cabinetSectionPath(PERSONAL_CABINET_PATH, DEFAULT_CABINET_SECTION));
}

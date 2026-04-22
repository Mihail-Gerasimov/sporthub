// Корневой /profile/athlete больше не имеет собственного UI (Phase 26 Step 26.5):
// перенаправляем на Dashboard-подмаршрут. Все фичи старого AthleteProfilePage
// (удалён) распределены по подмаршрутам /profile/athlete/{dashboard,schedule,
// stats,favorites,reviews,settings,notifications}.
import { redirect } from 'next/navigation';

export default function AthleteProfileRoute() {
  redirect('/profile/athlete/dashboard');
}

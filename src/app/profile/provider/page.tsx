// Корневой /profile/provider больше не имеет собственного UI (Phase 26 Step 26.5):
// перенаправляем на Dashboard-подмаршрут. Все фичи старого ProviderProfilePage
// (удалён) распределены по подмаршрутам /profile/provider/{dashboard,bookings,
// clients,stats,links,publications,reviews,settings,finance,notifications}.
import { redirect } from 'next/navigation';

export default function ProviderProfileRoute() {
  redirect('/profile/provider/dashboard');
}

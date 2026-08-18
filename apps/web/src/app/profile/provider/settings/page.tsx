// Phase 25 Step 25.14: server page раздела «Настройки» провайдера.
// Настройки не требуют серверных данных — всё из useAuthStore на клиенте.
import { ProviderSettings } from '@/components/profile/provider/ProviderSettings';

export const dynamic = 'force-dynamic';

export default function ProviderSettingsRoute() {
  return <ProviderSettings />;
}

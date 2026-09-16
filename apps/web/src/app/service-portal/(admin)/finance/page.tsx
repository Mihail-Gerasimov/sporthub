/**
 * Placeholder — Финансы. Будет реализована в будущих фазах.
 */
import { BRAND_NAME } from '@sporthub/domain';

export const metadata = {
  title: `${BRAND_NAME} — Финансы`,
};

export default function FinancePage() {
  return (
    <div className="rounded-card border border-line bg-panel p-8 text-center">
      <h1 className="font-display text-2xl font-semibold text-ink">Финансы</h1>
      <p className="mt-2 text-muted">Раздел в разработке</p>
    </div>
  );
}

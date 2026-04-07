/**
 * Placeholder для dashboard — будет полноценно реализован в Step 17.4.
 * Пока отображает минимальный заголовок, подтверждающий работу guard'а.
 */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'SportHub — Dashboard',
};

export default function DashboardPage() {
  return (
    <div className="w-full max-w-5xl">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Dashboard</h1>
      <p className="mt-2 text-muted">Панель управления — Step 17.4</p>
    </div>
  );
}

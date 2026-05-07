/**
 * Phase 30.3: skeleton-каркас для подмаршрутов админ-панели
 * (`/service-portal/(admin)/[section]/loading.tsx` ре-экспортит этот компонент).
 *
 * Логика та же, что у ProfileSectionLoading: показывается на холодном dev-кэше,
 * пока Server Component компилируется. Структура повторяет admin-страницы:
 * sec-head + filter-row + KPI-grid + main-grid `1fr 440px` (как в DashboardPage).
 */
import { Skeleton } from '@/components/ui';

export default function AdminSectionLoading() {
  return (
    <section className="flex flex-col gap-6" data-testid="admin-section-loading">
      {/* sec-head: eyebrow + title */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-9 w-72" />
      </div>

      {/* filter-row: search + 3 pill-фильтра */}
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-11 flex-1 min-w-[240px]" />
        <Skeleton rounded="pill" className="h-11 w-28" />
        <Skeleton rounded="pill" className="h-11 w-28" />
        <Skeleton rounded="pill" className="h-11 w-32" />
      </div>

      {/* KPI-grid: 4 карточки */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-card border border-line bg-card p-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-9 w-24" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
        <div className="rounded-card border border-line bg-card p-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-9 w-24" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
        <div className="rounded-card border border-line bg-card p-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-9 w-24" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
        <div className="rounded-card border border-line bg-card p-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-9 w-24" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
      </div>

      {/* main-grid: список карточек */}
      <div className="flex flex-col gap-4">
        <div className="rounded-card border border-line bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton rounded="pill" className="h-9 w-32" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
        <div className="rounded-card border border-line bg-card p-6">
          <Skeleton className="h-5 w-48" />
          <div className="mt-4 flex flex-col gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      </div>
    </section>
  );
}

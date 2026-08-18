/**
 * Phase 30.2: skeleton-каркас для подмаршрутов ЛК
 * (`/profile/{athlete,provider}/[section]/loading.tsx` ре-экспортит этот компонент).
 *
 * В dev-mode при первом обращении Next.js компилирует Server Component страницы,
 * на холодном кэше это даёт 1-5 секунд белого экрана. `loading.tsx` показывает этот
 * каркас сразу — пользователь видит структуру, а не пустоту. На горячем кэше
 * Next.js loading.tsx не показывает.
 *
 * Стилистика — Phase 28 dark-палитра по `frontend-design/SKILL.md`:
 * палитра `--ui-*` (`bg-card`, `border-line`, `bg-panel-strong`), `rounded-[18px]`
 * на карточках, `animate-pulse` на skeleton'ах. Mobile-first: на 480 grid в одну
 * колонку, на 768+ две, на 1024+ три.
 */
import { Skeleton } from '@/components/ui';

export default function ProfileSectionLoading() {
  return (
    <section className="flex flex-col gap-6" data-testid="profile-section-loading">
      {/* sec-head: eyebrow + title + бейдж справа */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-64" />
        </div>
        <Skeleton rounded="pill" className="h-7 w-28" />
      </div>

      {/* основной grid карточек — 1 col на base, 2 на sm, 3 на lg */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-card border border-line bg-card p-6 sm:p-7">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-4 h-8 w-32" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-3/4" />
        </div>
        <div className="rounded-card border border-line bg-card p-6 sm:p-7">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-4 h-8 w-32" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-3/4" />
        </div>
        <div className="rounded-card border border-line bg-card p-6 sm:p-7">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-4 h-8 w-32" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-3/4" />
        </div>
      </div>

      {/* большая карточка-список */}
      <div className="rounded-card border border-line bg-card p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton rounded="pill" className="h-8 w-32" />
        </div>
        <div className="mt-5 flex flex-col gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    </section>
  );
}

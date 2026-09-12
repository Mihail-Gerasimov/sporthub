/**
 * Плашка impersonation — отображается при активном impersonation сверху всех страниц.
 * Показывает имя и ID целевого пользователя, кнопку «Вернуться в панель».
 * Размещается в AppShell ПЕРЕД Header.
 *
 * ⚠️ Признак работы от чужого лица приходит из серверной сессии, поэтому плашка
 * переживает полную перезагрузку страницы. Пока он ставился только в браузере,
 * перезагрузка её убирала, а подмена оставалась: администратор действовал от
 * чужого лица без единого признака на экране.
 */
'use client';

import { useRouter } from 'next/navigation';

import { SERVICE_PORTAL_SECTIONS } from '@/lib/service-portal-sections';
import { useAuthStore } from '@/stores/useAuthStore';

export function ImpersonationBanner() {
  const router = useRouter();
  const isImpersonating = useAuthStore((s) => s.isImpersonating);
  const user = useAuthStore((s) => s.user);
  const actor = useAuthStore((s) => s.adminOriginalUser);
  const stopImpersonation = useAuthStore((s) => s.stopImpersonation);

  if (!isImpersonating) return null;

  async function handleReturn() {
    // ⚠️ Записи в журнал отсюда БОЛЬШЕ НЕТ. Маршрут `POST /api/logs` удалён:
    // браузер называл исполнителя сам, то есть след в журнале был ровно таким,
    // каким его захотел клиент. Событие пишет сервер и берёт исполнителя
    // из сессии.
    //
    // Возврат тоже делает сервер: он гасит подменённую сессию и выдаёт новую.
    // Уходим со страницы только после его ответа — иначе панель отрисовалась бы
    // под ещё живой чужой личностью. Не получилось — остаёмся на месте вместе
    // с плашкой: она и есть признак того, что подмена ещё действует.
    if (!(await stopImpersonation())) return;

    // Адрес раздела приезжает из словаря панели: буквами он написан один раз.
    router.push(SERVICE_PORTAL_SECTIONS.users);
    // Phase 27 Step 27.15: инвалидация RSC-кэша — без обновления админ увидел бы
    // сводку, отрисованную ещё под подменённой личностью.
    router.refresh();
  }

  return (
    <div className="border-b border-warning bg-warning px-4 py-2">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 text-sm">
        <p className="font-medium text-ink">
          Вы работаете от имени <span className="font-semibold">{user?.name}</span>{' '}
          <span className="font-mono text-muted">#{user?.id}</span>
          {/* Кто работает на самом деле — чтобы подмену нельзя было принять за свой вход. */}
          {actor ? <span className="text-muted"> · вы вошли как {actor.name}</span> : null}
        </p>
        <button
          type="button"
          onClick={handleReturn}
          className="rounded-pill border border-warning/40 bg-panel px-3 py-1 text-xs font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Вернуться в панель
        </button>
      </div>
    </div>
  );
}

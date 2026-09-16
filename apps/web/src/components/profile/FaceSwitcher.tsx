// Переключатель лица услуг в кабинете (шаг 35.32).
//
// ⚠️ Решение 5.3: у кого лицо одно — переключателя НЕТ В РАЗМЕТКЕ ВОВСЕ, а не
// спрятан стилями. Это большинство людей, и ровно так снимается большая часть
// возможных ошибок «сказал не от того лица»: выбора нет — ошибиться нечем.
//
// Там, где лицо однозначно выводится из предмета (отзыв на твой клуб, чат по
// записи в твоём зале), переключатель не нужен и не показывается: сторону
// система знает сама. Здесь он про другое — про то, ЧЕЙ КАБИНЕТ открыт, когда
// лиц несколько и человек сам выбирает, чем сейчас занимается.
//
// ⚠️ Шаг 35.31. Выбор стал ПЕРЕХОДОМ, а не переключением состояния в браузере:
// у каждого лица свой адрес, и кабинет другого лица — другая страница со своими
// данными. Поэтому это ссылки, а не кнопки: их видно в строке адреса, ими можно
// поделиться и открыть в новой вкладке. Какое лицо открыто, спрашиваем у самого
// кабинета — то есть у адреса, — а не у состояния стора.
'use client';

import Link from 'next/link';

import { cn } from '@/lib/utils';
import {
  faceCabinetPath,
  faceKey,
  isFaceArchived,
  type ServiceFaceKind,
} from '@/lib/service-faces';
import { useAuthFaces } from '@/stores/useAuthStore';

import { useCabinet } from './cabinet-context';

/** Как называется вид лица в подписи — словарь, а не цепочка условий. */
const FACE_KIND_LABELS: Record<ServiceFaceKind, string> = {
  club: 'Клуб',
  trainer: 'Карточка тренера',
};

export function FaceSwitcher({ className }: { className?: string }) {
  const { faces } = useAuthFaces();
  const cabinet = useCabinet();

  // Одно лицо или ни одного — выбирать не из чего.
  if (faces.length < 2) {
    return null;
  }

  const openKey = cabinet.face === null ? null : faceKey(cabinet.face);

  return (
    <div className={className} data-testid="profile-face-switcher">
      <p className="mb-2 font-body text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
        Кабинет лица
      </p>
      <nav aria-label="Лицо услуг" className="flex flex-wrap gap-2">
        {faces.map((face) => {
          const key = faceKey(face);
          const active = key === openKey;
          // ⚠️ Архивированное лицо остаётся в списке — оно не удалено, и владелец
          // должен иметь возможность вернуть его. Но выглядеть как живое оно
          // не должно: без пометки человек не понимал, почему клуба нет в каталоге.
          const archived = isFaceArchived(face);

          return (
            <Link
              key={key}
              href={faceCabinetPath(face)}
              title={
                archived
                  ? `${FACE_KIND_LABELS[face.kind]} — убран из каталога`
                  : FACE_KIND_LABELS[face.kind]
              }
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 rounded-pill border px-4 py-2 text-sm font-semibold transition-all outline-none focus-visible:ring-4',
                active
                  ? 'border-transparent bg-lime text-ink focus-visible:ring-lime/30'
                  : 'border-line bg-panel text-ink hover:border-accent hover:text-lime-hov focus-visible:ring-accent/15',
                archived && !active && 'text-muted',
              )}
            >
              {face.name}
              {archived ? (
                <span
                  data-testid={`profile-face-archived-${key}`}
                  className="rounded-pill bg-warn/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-warn"
                >
                  В архиве
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

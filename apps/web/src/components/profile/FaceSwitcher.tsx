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
'use client';

import { Chip } from '@/components/ui';
import { faceKey } from '@/lib/service-faces';
import { useAuthFaces, useAuthStore } from '@/stores/useAuthStore';

/** Как называется вид лица в подписи — словарь, а не цепочка условий. */
const FACE_KIND_LABELS: Record<'club' | 'trainer', string> = {
  club: 'Клуб',
  trainer: 'Карточка тренера',
};

export function FaceSwitcher({ className }: { className?: string }) {
  const { faces, activeFace } = useAuthFaces();
  const setActiveFace = useAuthStore((state) => state.setActiveFace);

  // Одно лицо или ни одного — выбирать не из чего.
  if (faces.length < 2) {
    return null;
  }

  return (
    <div className={className} data-testid="profile-face-switcher">
      <p className="mb-2 font-body text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
        Кабинет лица
      </p>
      <div role="group" aria-label="Лицо услуг" className="flex flex-wrap gap-2">
        {faces.map((face) => {
          const key = faceKey(face);

          return (
            <Chip
              key={key}
              active={activeFace !== null && faceKey(activeFace) === key}
              title={FACE_KIND_LABELS[face.kind]}
              onClick={() => {
                setActiveFace(key);
              }}
            >
              {face.name}
            </Chip>
          );
        })}
      </div>
    </div>
  );
}

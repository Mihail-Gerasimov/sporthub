// Раздел «Завести лицо услуг» — в ЛИЧНОМ кабинете человека.
//
// ⚠️ Шаги 36.30–36.32. До этой фазы кнопки «Опубликовать» жили в разделе кабинета
// ЛИЦА, а в кабинет лица не попасть, не имея лица: первое лицо через интерфейс
// завести было нельзя вовсе. Бэкенд при этом был готов — `POST /api/clubs`
// от человека без лиц упирался только в форму.
//
// Место у заведения одно, и оно здесь: завести лицо — действие ЧЕЛОВЕКА, а не
// лица. Раздел кабинета лица остался разделом ПРАВКИ своей публикации.
//
// ⚠️ Источник списка клубов — `useAuthFaces()`, а не `useCabinetFaces()`
// (ловушка 18 файла фазы). Это два разных вопроса: «чей это кабинет» отвечает
// кабинет, «что человек считает своим» — сессия. В личном кабинете первый ответ
// пустой по определению, и взять список оттуда значило бы молча погасить выбор
// клуба-площадки в форме тренера. Тот же регресс фаза 35 уже ловила.
'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useMemo, useState } from 'react';

import { PublishClubModal } from '@/components/profile/PublishClubModal';
import { PublishTrainerModal } from '@/components/profile/PublishTrainerModal';
import { Button, Card } from '@/components/ui';
import { isFaceArchived } from '@/lib/service-faces';
import { useAuthStore, useAuthFaces } from '@/stores/useAuthStore';
import { useToastStore } from '@/stores/useToastStore';
import type { Amenity, Specialty, Sport, Tag, WorkFormat } from '@sporthub/types';

type CreateFaceSectionProps = {
  sports?: Sport[];
  tags?: Tag[];
  amenities?: Amenity[];
  specialties?: Specialty[];
  workFormats?: WorkFormat[];
};

export function CreateFaceSection({
  sports = [],
  tags = [],
  amenities = [],
  specialties = [],
  workFormats = [],
}: CreateFaceSectionProps) {
  const { faces } = useAuthFaces();
  const loadSession = useAuthStore((state) => state.loadSession);
  const addToast = useToastStore((state) => state.addToast);
  const router = useRouter();

  const [isClubModalOpen, setIsClubModalOpen] = useState(false);
  const [isTrainerModalOpen, setIsTrainerModalOpen] = useState(false);

  /**
   * Свои клубы — площадки, которые можно указать новой карточке тренера.
   *
   * Архивированные сюда не попадают: лицо, убранное из каталога, нельзя
   * предлагать как место проведения занятий. Признак читается общим помощником,
   * а не сравнением со строкой — объявление у него одно на весь фронт.
   */
  const clubOptions = useMemo(
    () =>
      faces
        .filter((face) => face.kind === 'club' && !isFaceArchived(face))
        .map((face) => ({ id: face.id, name: face.name })),
    [faces],
  );

  /**
   * Лицо заведено — состояние сессии устарело.
   *
   * Перечитывается ОТВЕТОМ «кто я», а не дописывается в стор руками: список лиц
   * назначает сервер, и от него же зависит, появится ли у человека кабинет лица
   * и ссылка в переключателе. Страница обновляется следом.
   */
  function handlePublishSuccess(message: string) {
    addToast({ message, tone: 'success' });
    void loadSession();
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <section data-testid="create-face-section">
      <Card className="p-6 sm:p-8">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Веду спортивные услуги
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Заведите клуб или карточку тренера — у каждого лица появится свой кабинет с записями,
          расписанием и отзывами. Личный кабинет при этом остаётся вашим.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button fullWidth className="sm:w-auto" onClick={() => setIsClubModalOpen(true)}>
            Опубликовать клуб
          </Button>
          <Button
            variant="outline"
            fullWidth
            className="sm:w-auto"
            onClick={() => setIsTrainerModalOpen(true)}
          >
            Опубликовать карточку тренера
          </Button>
        </div>
      </Card>

      {/* Модалки заведения. Режим только `create`: правка живёт в кабинете лица. */}
      <PublishClubModal
        open={isClubModalOpen}
        onClose={() => setIsClubModalOpen(false)}
        onSuccess={handlePublishSuccess}
        mode="create"
        sports={sports}
        tags={tags}
        amenities={amenities}
      />
      <PublishTrainerModal
        open={isTrainerModalOpen}
        onClose={() => setIsTrainerModalOpen(false)}
        onSuccess={handlePublishSuccess}
        mode="create"
        clubs={clubOptions}
        sports={sports}
        specialties={specialties}
        workFormats={workFormats}
      />
    </section>
  );
}

// Модалка публикации тренера (Step 13.1–13.2).
// Полная форма будет реализована в Steps 13.3–13.8.
'use client';

import { PublishModalShell } from '@/components/profile/PublishModalShell';

type PublishTrainerModalProps = {
  open: boolean;
  onClose: () => void;
};

export function PublishTrainerModal({ open, onClose }: PublishTrainerModalProps) {
  return (
    <PublishModalShell
      open={open}
      onClose={onClose}
      title="Опубликовать тренера"
      description="Заполните информацию о тренере для публикации на платформе."
      primaryLabel="Создать публикацию"
      onPrimary={() => {
        // STUB: submit-flow будет реализован в Step 13.8
      }}
      secondaryLabel="Отмена"
      onSecondary={onClose}
    >
      <p className="text-sm text-muted">Секции формы появятся здесь.</p>
    </PublishModalShell>
  );
}

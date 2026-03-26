// Модалка публикации тренера — минимальная заглушка (Step 13.1).
// Полная форма будет реализована в Steps 13.2–13.8.
'use client';

import { Modal } from '@/components/ui';

type PublishTrainerModalProps = {
  open: boolean;
  onClose: () => void;
};

export function PublishTrainerModal({ open, onClose }: PublishTrainerModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Опубликовать тренера"
      description="Форма публикации тренера будет доступна в ближайшем обновлении."
    >
      <p className="text-sm text-muted">Секции формы появятся здесь.</p>
    </Modal>
  );
}

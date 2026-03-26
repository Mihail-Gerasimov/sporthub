// Модалка публикации клуба — минимальная заглушка (Step 13.1).
// Полная форма будет реализована в Steps 13.2–13.8.
'use client';

import { Modal } from '@/components/ui';

type PublishClubModalProps = {
  open: boolean;
  onClose: () => void;
};

export function PublishClubModal({ open, onClose }: PublishClubModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Опубликовать клуб"
      description="Форма публикации клуба будет доступна в ближайшем обновлении."
    >
      <p className="text-sm text-muted">Секции формы появятся здесь.</p>
    </Modal>
  );
}

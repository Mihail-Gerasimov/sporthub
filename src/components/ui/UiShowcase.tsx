'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Rating } from '@/components/ui/Rating';
import { Skeleton } from '@/components/ui/Skeleton';

const chips = ['Йога', 'Пилатес', 'Теннис'];

export function UiShowcase() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedChip, setSelectedChip] = useState('Йога');
  const [interactiveRating, setInteractiveRating] = useState(4);

  return (
    <>
      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
                Component library
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">Базовые UI-компоненты</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="accent">Step 4.2</Badge>
              <Badge tone="outline">react + next</Badge>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Button>Записаться</Button>
            <Button variant="secondary">Подобрать клуб</Button>
            <Button variant="outline">Сравнить</Button>
            <Button variant="ghost">Подробнее</Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <Input
                label="Поиск по району"
                placeholder="Например, Ленинский"
                icon={<span className="text-base text-muted">⌕</span>}
              />
              <Input
                label="Телефон"
                placeholder="+7 (999) 000-00-00"
                error="Укажите корректный номер для подтверждения записи"
              />
            </div>

            <Card elevated className="bg-panel-strong">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Chip + Rating
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <Chip
                    key={chip}
                    active={selectedChip === chip}
                    onClick={() => {
                      setSelectedChip(chip);
                    }}
                  >
                    {chip}
                  </Chip>
                ))}
              </div>

              <div className="mt-5 space-y-3">
                <div>
                  <p className="text-sm font-medium text-muted">Read only</p>
                  <Rating className="mt-2" value={4.7} />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted">Interactive</p>
                  <Rating
                    className="mt-2"
                    interactive
                    value={interactiveRating}
                    onChange={setInteractiveRating}
                  />
                </div>
              </div>
            </Card>
          </div>
        </Card>

        <Card className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
              Modal & skeleton
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Состояния интерфейса</h2>
          </div>

          <Button fullWidth size="lg" onClick={() => setIsModalOpen(true)}>
            Открыть модалку входа
          </Button>

          <div className="grid gap-3">
            <Skeleton className="h-10 w-32" rounded="pill" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>

          <Button fullWidth loading variant="outline">
            Идёт проверка
          </Button>
        </Card>
      </section>

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Войти в SportHub"
        description="Сейчас это UI-демо для проверки модалки, кнопок и адаптивных состояний."
        footer={
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button fullWidth onClick={() => setIsModalOpen(false)}>
              Продолжить
            </Button>
            <Button fullWidth variant="ghost" onClick={() => setIsModalOpen(false)}>
              Отмена
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="name@example.com"
            icon={<span className="text-base text-muted">@</span>}
          />
          <Input label="Пароль" type="password" placeholder="Введите пароль" />
        </div>
      </Modal>
    </>
  );
}

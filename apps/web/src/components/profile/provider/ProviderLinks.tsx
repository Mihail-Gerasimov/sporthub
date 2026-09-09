// Раздел Links провайдера (Step 25.12). Две условные секции: club-side (для
// провайдера-клуба — приём/отказ запросов от тренеров + invite тренера) и
// trainer-side (для провайдера-тренера — свои pending/confirmed/history + запрос
// новой связи). При revoke confirmed-связи — warning-модалка с числом offerings,
// которые автоматически станут частными.
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startTransition, useMemo, useState } from 'react';

import { getProviderClubs, getProviderTrainers } from '@/components/profile/provider-helpers';
import { Badge, Button, Card, Modal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/useAuthStore';
import { useToastStore } from '@/stores/useToastStore';
import type { Club, Offering, Trainer, TrainerClubLink } from '@sporthub/types';

type LinkTab = 'pending' | 'confirmed' | 'history';

const CLUB_TAB_LABELS: Record<LinkTab, string> = {
  pending: 'Запросы',
  confirmed: 'Подтверждённые',
  history: 'История',
};

const TRAINER_TAB_LABELS: Record<LinkTab, string> = {
  pending: 'Мои запросы',
  confirmed: 'Подтверждённые',
  history: 'История',
};

type ProviderLinksProps = {
  clubs?: Club[];
  trainers?: Trainer[];
  links?: TrainerClubLink[];
  offerings?: Offering[];
};

export function ProviderLinks({
  clubs = [],
  trainers = [],
  links = [],
  offerings = [],
}: ProviderLinksProps) {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const addToast = useToastStore((s) => s.addToast);

  const providerUserId = user?.id ?? null;

  const providerClubs = useMemo(
    () => (providerUserId === null ? [] : getProviderClubs(clubs, providerUserId)),
    [clubs, providerUserId],
  );
  const providerTrainers = useMemo(
    () => (providerUserId === null ? [] : getProviderTrainers(trainers, providerUserId)),
    [trainers, providerUserId],
  );

  const myClubIdSet = useMemo(() => new Set(providerClubs.map((c) => c.id)), [providerClubs]);
  const myTrainerIdSet = useMemo(
    () => new Set(providerTrainers.map((t) => t.id)),
    [providerTrainers],
  );

  const trainerById = useMemo(() => new Map(trainers.map((t) => [t.id, t])), [trainers]);
  const clubById = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);

  // Club-side: связи к моим клубам, инициированные тренерами или invite от меня.
  const clubSideLinks = useMemo(
    () => links.filter((link) => myClubIdSet.has(link.clubId)),
    [links, myClubIdSet],
  );

  // Trainer-side: связи моих тренеров к чужим клубам (если клуб тоже мой — связь
  // показана только в club-side, чтобы избежать дубликатов в обеих секциях).
  const trainerSideLinks = useMemo(
    () =>
      links.filter((link) => myTrainerIdSet.has(link.trainerId) && !myClubIdSet.has(link.clubId)),
    [links, myTrainerIdSet, myClubIdSet],
  );

  const clubByTab = useMemo<Record<LinkTab, TrainerClubLink[]>>(
    () => ({
      pending: clubSideLinks.filter((l) => l.status === 'pending'),
      confirmed: clubSideLinks.filter((l) => l.status === 'confirmed'),
      history: clubSideLinks.filter((l) => l.status === 'rejected' || l.status === 'revoked'),
    }),
    [clubSideLinks],
  );

  const trainerByTab = useMemo<Record<LinkTab, TrainerClubLink[]>>(
    () => ({
      pending: trainerSideLinks.filter((l) => l.status === 'pending'),
      confirmed: trainerSideLinks.filter((l) => l.status === 'confirmed'),
      history: trainerSideLinks.filter((l) => l.status === 'rejected' || l.status === 'revoked'),
    }),
    [trainerSideLinks],
  );

  // offerings-count по linkId — для warning-modal.
  const offeringsCountByLinkId = useMemo(() => {
    const counts = new Map<number, number>();
    for (const offering of offerings) {
      if (offering.trainerClubLinkId !== undefined) {
        counts.set(offering.trainerClubLinkId, (counts.get(offering.trainerClubLinkId) ?? 0) + 1);
      }
    }
    return counts;
  }, [offerings]);

  const [clubTab, setClubTab] = useState<LinkTab>('pending');
  const [trainerTab, setTrainerTab] = useState<LinkTab>('pending');
  const [actionLinkId, setActionLinkId] = useState<number | null>(null);
  const [revokeConfirmLinkId, setRevokeConfirmLinkId] = useState<number | null>(null);

  // Invite-модалка: state.
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteTrainerId, setInviteTrainerId] = useState<number | null>(null);
  const [inviteClubId, setInviteClubId] = useState<number | null>(
    providerClubs.length === 1 ? providerClubs[0].id : null,
  );

  // Request-модалка: state.
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestClubId, setRequestClubId] = useState<number | null>(null);
  const [requestTrainerId, setRequestTrainerId] = useState<number | null>(
    providerTrainers.length === 1 ? providerTrainers[0].id : null,
  );

  async function callAction(linkId: number, action: 'approve' | 'reject' | 'revoke') {
    setActionLinkId(linkId);
    try {
      // ⚠️ Сторону, принимающую решение, сервер определяет по сессии. Правило
      // «решает противоположная инициатору сторона» было правильным и раньше —
      // ему не хватало честного источника личности: номер приходил из тела.
      const response = await fetch(`/api/trainer-club-links/${linkId}/${action}`, {
        method: 'POST',
      });
      const body = (await response.json()) as { success: boolean; error?: string };

      if (!response.ok || !body.success) {
        addToast({ message: body.error ?? 'Не удалось выполнить действие', tone: 'error' });
        return;
      }

      const successMessage =
        action === 'approve'
          ? 'Связь подтверждена'
          : action === 'reject'
            ? 'Запрос отклонён'
            : 'Связь разорвана';
      addToast({ message: successMessage, tone: 'success' });
      startTransition(() => {
        router.refresh();
      });
    } catch {
      addToast({ message: 'Не удалось выполнить действие', tone: 'error' });
    } finally {
      setActionLinkId(null);
    }
  }

  // Phase 27 Step 27.9: `initiatedBy` явно передаётся с клиента в зависимости от
  // открытой модалки. InviteTrainerModal (club-side) → 'club', RequestLinkModal
  // (trainer-side) → 'trainer'. Сервер использует это для роутинга уведомления
  // противоположной стороне + выбора нужного текста в getNotificationCopy.
  async function submitNewLink(
    trainerId: number,
    clubId: number,
    initiatedBy: 'trainer' | 'club',
    onClose: () => void,
  ) {
    try {
      const response = await fetch('/api/trainer-club-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trainerId, clubId, initiatedBy }),
      });
      const body = (await response.json()) as { success: boolean; error?: string };

      if (!response.ok || !body.success) {
        addToast({ message: body.error ?? 'Не удалось отправить запрос', tone: 'error' });
        return;
      }

      addToast({ message: 'Запрос отправлен', tone: 'success' });
      onClose();
      startTransition(() => {
        router.refresh();
      });
    } catch {
      addToast({ message: 'Не удалось отправить запрос', tone: 'error' });
    }
  }

  async function confirmRevoke() {
    if (revokeConfirmLinkId === null) return;
    await callAction(revokeConfirmLinkId, 'revoke');
    setRevokeConfirmLinkId(null);
  }

  // Фильтр кандидатов в invite-модалке: все тренеры, кроме моих (invite внешних).
  // Hooks должны вызываться до early-return, иначе react-hooks/rules-of-hooks.
  const inviteTrainerOptions = useMemo(() => {
    const query = inviteSearch.trim().toLowerCase();
    return trainers.filter((trainer) => {
      if (myTrainerIdSet.has(trainer.id)) return false;
      if (!query) return true;
      return trainer.name.toLowerCase().includes(query);
    });
  }, [trainers, myTrainerIdSet, inviteSearch]);

  // Фильтр клубов для request-модалки: чужие клубы, к которым у выбранного тренера
  // ещё нет active link'а (pending или confirmed).
  const requestClubOptions = useMemo(() => {
    const foreignClubs = clubs.filter((c) => !myClubIdSet.has(c.id));
    if (requestTrainerId === null) return foreignClubs;

    const activeForTrainer = new Set(
      links
        .filter(
          (l) =>
            l.trainerId === requestTrainerId &&
            (l.status === 'pending' || l.status === 'confirmed'),
        )
        .map((l) => l.clubId),
    );
    return foreignClubs.filter((c) => !activeForTrainer.has(c.id));
  }, [clubs, myClubIdSet, requestTrainerId, links]);

  // ⚠️ Шаг 35.34. Здесь стояла плашка «Доступ ограничен» — косметика поверх
  // УЖЕ отданных данных: пускать или нет, решает серверный лейаут, и решает
  // до похода за ними. Осталась одна причина ничего не рисовать: ответ
  // «кто я» ещё в пути, и номера человека нет.
  if (!user) {
    return null;
  }

  const isEmpty = providerClubs.length === 0 && providerTrainers.length === 0;

  const revokeLink =
    revokeConfirmLinkId === null ? null : (links.find((l) => l.id === revokeConfirmLinkId) ?? null);
  const revokeAttachedCount = revokeLink ? (offeringsCountByLinkId.get(revokeLink.id) ?? 0) : 0;

  return (
    <div className="flex flex-col gap-6" data-testid="provider-links">
      <Card className="p-6 sm:p-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
          Связи с тренерами и клубами
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Управляйте привязками тренеров к вашим клубам и отправляйте запросы от ваших тренеров к
          другим клубам.
        </p>
      </Card>

      {isEmpty ? (
        <Card className="p-6 sm:p-8" data-testid="provider-links-empty">
          <p className="text-sm leading-relaxed text-muted">
            У вас пока нет опубликованных клубов или тренеров. Опубликуйте первую услугу, чтобы
            управлять связями.
          </p>
          <div className="mt-5">
            <Link
              href="/profile/provider/publications"
              className="inline-flex min-h-12 items-center justify-center rounded-pill border border-line bg-panel px-5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
            >
              Опубликовать услугу
            </Link>
          </div>
        </Card>
      ) : null}

      {providerClubs.length > 0 ? (
        <Card className="flex flex-col gap-4 p-5 sm:p-6" data-testid="provider-links-club-side">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold text-ink">Связи к моим клубам</h2>
              <p className="mt-1 text-xs text-muted">
                Подтверждайте, отклоняйте или приглашайте тренеров в ваши клубы.
              </p>
            </div>
            <Button
              data-testid="provider-links-invite-button"
              onClick={() => {
                setInviteSearch('');
                setInviteTrainerId(null);
                setInviteClubId(providerClubs.length === 1 ? providerClubs[0].id : null);
                setInviteModalOpen(true);
              }}
            >
              Пригласить тренера
            </Button>
          </header>

          <div className="flex flex-wrap gap-2" role="tablist">
            {(Object.keys(CLUB_TAB_LABELS) as LinkTab[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={clubTab === key}
                data-testid={`provider-links-club-tab-${key}`}
                onClick={() => setClubTab(key)}
                className={cn(
                  'rounded-pill px-4 py-2 text-sm font-semibold transition-colors',
                  clubTab === key
                    ? 'bg-accent text-ink'
                    : 'border border-line bg-panel text-ink hover:border-accent hover:text-accent',
                )}
              >
                {CLUB_TAB_LABELS[key]}{' '}
                <span className="ml-1 text-xs opacity-75">{clubByTab[key].length}</span>
              </button>
            ))}
          </div>

          {clubByTab[clubTab].length === 0 ? (
            <p className="text-sm text-muted">Нет связей в этой категории.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {clubByTab[clubTab].map((link) => {
                const trainer = trainerById.get(link.trainerId);
                const club = clubById.get(link.clubId);
                const isBusy = actionLinkId === link.id;
                return (
                  <li
                    key={link.id}
                    data-testid={`provider-links-card-${link.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-canvas p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">
                        {trainer?.name ?? `Тренер #${link.trainerId}`}
                      </p>
                      <p className="text-xs text-muted">
                        {club?.name ?? `Клуб #${link.clubId}`} ·{' '}
                        {link.initiatedBy === 'trainer' ? 'Запрос от тренера' : 'Приглашён вами'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {/* Phase 27 Step 27.11: в club-side секции pending-карточки различаются
                          по инициатору. trainer-initiated (кто-то попросился к моему клубу) —
                          решаю я, «Подтвердить/Отклонить». club-initiated (я пригласил тренера
                          и жду его ответа) — могу только отозвать собственное приглашение. */}
                      {clubTab === 'pending' && link.initiatedBy === 'trainer' ? (
                        <>
                          <Button
                            size="sm"
                            data-testid={`provider-links-approve-${link.id}`}
                            loading={isBusy}
                            onClick={() => {
                              void callAction(link.id, 'approve');
                            }}
                          >
                            Подтвердить
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid={`provider-links-reject-${link.id}`}
                            loading={isBusy}
                            onClick={() => {
                              void callAction(link.id, 'reject');
                            }}
                          >
                            Отклонить
                          </Button>
                        </>
                      ) : null}
                      {clubTab === 'pending' && link.initiatedBy === 'club' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`provider-links-cancel-invite-${link.id}`}
                          loading={isBusy}
                          onClick={() => {
                            void callAction(link.id, 'revoke');
                          }}
                        >
                          Отозвать приглашение
                        </Button>
                      ) : null}
                      {clubTab === 'confirmed' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`provider-links-revoke-${link.id}`}
                          loading={isBusy}
                          onClick={() => setRevokeConfirmLinkId(link.id)}
                        >
                          Отвязать
                        </Button>
                      ) : null}
                      {clubTab === 'history' ? (
                        <Badge tone="outline">
                          {link.status === 'rejected' ? 'Отклонён' : 'Разорван'}
                        </Badge>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : null}

      {providerTrainers.length > 0 ? (
        <Card className="flex flex-col gap-4 p-5 sm:p-6" data-testid="provider-links-trainer-side">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold text-ink">Связи моих тренеров</h2>
              <p className="mt-1 text-xs text-muted">
                Отправляйте новые запросы к клубам и управляйте своими pending/confirmed связями.
              </p>
            </div>
            <Button
              data-testid="provider-links-request-button"
              onClick={() => {
                setRequestClubId(null);
                setRequestTrainerId(providerTrainers.length === 1 ? providerTrainers[0].id : null);
                setRequestModalOpen(true);
              }}
            >
              Отправить запрос клубу
            </Button>
          </header>

          <div className="flex flex-wrap gap-2" role="tablist">
            {(Object.keys(TRAINER_TAB_LABELS) as LinkTab[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={trainerTab === key}
                data-testid={`provider-links-trainer-tab-${key}`}
                onClick={() => setTrainerTab(key)}
                className={cn(
                  'rounded-pill px-4 py-2 text-sm font-semibold transition-colors',
                  trainerTab === key
                    ? 'bg-accent text-ink'
                    : 'border border-line bg-panel text-ink hover:border-accent hover:text-accent',
                )}
              >
                {TRAINER_TAB_LABELS[key]}{' '}
                <span className="ml-1 text-xs opacity-75">{trainerByTab[key].length}</span>
              </button>
            ))}
          </div>

          {trainerByTab[trainerTab].length === 0 ? (
            <p className="text-sm text-muted">Нет связей в этой категории.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {trainerByTab[trainerTab].map((link) => {
                const trainer = trainerById.get(link.trainerId);
                const club = clubById.get(link.clubId);
                const isBusy = actionLinkId === link.id;
                return (
                  <li
                    key={link.id}
                    data-testid={`provider-links-card-${link.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-canvas p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">
                        {trainer?.name ?? `Тренер #${link.trainerId}`}
                      </p>
                      <p className="text-xs text-muted">
                        К клубу «{club?.name ?? `Клуб #${link.clubId}`}»
                        {link.initiatedBy === 'club' ? ' · Приглашение от клуба' : ''}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {/* Phase 27 Step 27.11: в trainer-side секции pending-карточки
                          симметричны club-side. trainer-initiated (мой тренер попросился) —
                          могу отозвать. club-initiated (меня пригласил клуб) — решаю
                          «Подтвердить/Отклонить». */}
                      {trainerTab === 'pending' && link.initiatedBy === 'trainer' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`provider-links-cancel-own-${link.id}`}
                          loading={isBusy}
                          onClick={() => {
                            void callAction(link.id, 'revoke');
                          }}
                        >
                          Отозвать
                        </Button>
                      ) : null}
                      {trainerTab === 'pending' && link.initiatedBy === 'club' ? (
                        <>
                          <Button
                            size="sm"
                            data-testid={`provider-links-approve-${link.id}`}
                            loading={isBusy}
                            onClick={() => {
                              void callAction(link.id, 'approve');
                            }}
                          >
                            Подтвердить
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid={`provider-links-reject-${link.id}`}
                            loading={isBusy}
                            onClick={() => {
                              void callAction(link.id, 'reject');
                            }}
                          >
                            Отклонить
                          </Button>
                        </>
                      ) : null}
                      {trainerTab === 'confirmed' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`provider-links-revoke-${link.id}`}
                          loading={isBusy}
                          onClick={() => setRevokeConfirmLinkId(link.id)}
                        >
                          Разорвать связь
                        </Button>
                      ) : null}
                      {trainerTab === 'history' ? (
                        <Badge tone="outline">
                          {link.status === 'rejected' ? 'Отклонён' : 'Разорван'}
                        </Badge>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : null}

      {/* Invite-модалка (club-side → пригласить тренера). */}
      <Modal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Пригласить тренера"
        description="Найдите тренера по имени и отправьте ему запрос привязки к вашему клубу."
      >
        <div className="flex flex-col gap-4" data-testid="provider-links-invite-modal">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.10em] text-muted">
            Поиск тренера
            <input
              data-testid="provider-links-invite-search"
              type="text"
              value={inviteSearch}
              onChange={(event) => setInviteSearch(event.target.value)}
              placeholder="Имя тренера…"
              className="rounded-pill border border-line bg-panel px-4 py-2 text-sm font-normal text-ink"
            />
          </label>

          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {inviteTrainerOptions.length === 0 ? (
              <li className="text-sm text-muted">Тренеры не найдены.</li>
            ) : (
              inviteTrainerOptions.map((trainer) => (
                <li key={trainer.id}>
                  <button
                    type="button"
                    data-testid={`provider-links-invite-trainer-option-${trainer.id}`}
                    onClick={() => setInviteTrainerId(trainer.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-card border px-3 py-2 text-left text-sm',
                      inviteTrainerId === trainer.id
                        ? 'border-accent bg-panel text-ink'
                        : 'border-line bg-canvas text-ink hover:border-accent',
                    )}
                  >
                    <span>{trainer.name}</span>
                    {inviteTrainerId === trainer.id ? <Badge tone="success">Выбран</Badge> : null}
                  </button>
                </li>
              ))
            )}
          </ul>

          {providerClubs.length > 1 ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">Клуб</p>
              <ul className="flex flex-col gap-1">
                {providerClubs.map((cl) => (
                  <li key={cl.id}>
                    <button
                      type="button"
                      data-testid={`provider-links-invite-club-option-${cl.id}`}
                      onClick={() => setInviteClubId(cl.id)}
                      className={cn(
                        'w-full rounded-card border px-3 py-2 text-left text-sm',
                        inviteClubId === cl.id
                          ? 'border-accent bg-panel'
                          : 'border-line bg-canvas hover:border-accent',
                      )}
                    >
                      {cl.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setInviteModalOpen(false)}>
              Отмена
            </Button>
            <Button
              data-testid="provider-links-invite-submit"
              disabled={inviteTrainerId === null || inviteClubId === null}
              onClick={() => {
                if (inviteTrainerId === null || inviteClubId === null) return;
                void submitNewLink(inviteTrainerId, inviteClubId, 'club', () =>
                  setInviteModalOpen(false),
                );
              }}
            >
              Отправить приглашение
            </Button>
          </div>
        </div>
      </Modal>

      {/* Request-модалка (trainer-side → отправить запрос клубу). */}
      <Modal
        open={requestModalOpen}
        onClose={() => setRequestModalOpen(false)}
        title="Отправить запрос клубу"
        description="Выберите клуб, к которому хотите привязать своего тренера."
      >
        <div className="flex flex-col gap-4" data-testid="provider-links-request-modal">
          {providerTrainers.length > 1 ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                Ваш тренер
              </p>
              <ul className="flex flex-col gap-1">
                {providerTrainers.map((tr) => (
                  <li key={tr.id}>
                    <button
                      type="button"
                      data-testid={`provider-links-request-trainer-option-${tr.id}`}
                      onClick={() => setRequestTrainerId(tr.id)}
                      className={cn(
                        'w-full rounded-card border px-3 py-2 text-left text-sm',
                        requestTrainerId === tr.id
                          ? 'border-accent bg-panel'
                          : 'border-line bg-canvas hover:border-accent',
                      )}
                    >
                      {tr.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">Клуб</p>
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {requestClubOptions.length === 0 ? (
                <li className="text-sm text-muted">Нет доступных клубов без активных связей.</li>
              ) : (
                requestClubOptions.map((cl) => (
                  <li key={cl.id}>
                    <button
                      type="button"
                      data-testid={`provider-links-request-club-option-${cl.id}`}
                      onClick={() => setRequestClubId(cl.id)}
                      className={cn(
                        'w-full rounded-card border px-3 py-2 text-left text-sm',
                        requestClubId === cl.id
                          ? 'border-accent bg-panel'
                          : 'border-line bg-canvas hover:border-accent',
                      )}
                    >
                      {cl.name}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRequestModalOpen(false)}>
              Отмена
            </Button>
            <Button
              data-testid="provider-links-request-submit"
              disabled={requestTrainerId === null || requestClubId === null}
              onClick={() => {
                if (requestTrainerId === null || requestClubId === null) return;
                void submitNewLink(requestTrainerId, requestClubId, 'trainer', () =>
                  setRequestModalOpen(false),
                );
              }}
            >
              Отправить запрос
            </Button>
          </div>
        </div>
      </Modal>

      {/* Warning-модалка для revoke confirmed-связи. */}
      <Modal
        open={revokeConfirmLinkId !== null}
        onClose={() => setRevokeConfirmLinkId(null)}
        title="Разорвать связь?"
      >
        <div className="flex flex-col gap-4" data-testid="provider-links-revoke-warning-modal">
          <p className="text-sm leading-relaxed text-ink">
            После разрыва связи {revokeAttachedCount} услуг(а) автоматически станут частными — они
            больше не будут отображаться как проходящие «в клубе».
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRevokeConfirmLinkId(null)}>
              Отмена
            </Button>
            <Button
              data-testid="provider-links-revoke-warning-confirm"
              onClick={() => {
                void confirmRevoke();
              }}
            >
              Да, разорвать
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

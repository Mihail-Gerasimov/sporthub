import { Injectable } from '@nestjs/common';
import type { SessionContext } from '../auth/session.service';
import { ConflictError, ForbiddenError, NotFoundError } from '../common/domain-error';
import { PassesRepository } from './passes.repository';

@Injectable()
export class PassesService {
  constructor(private readonly repo: PassesRepository) {}
  async plans(userId: number, offset: number, limit: number) {
    const [items, total] = await this.repo.listPlans(userId, offset, limit);
    return { items, total, offset, limit };
  }
  async updatePlan(id: number, session: SessionContext, data: object) {
    const plan = await this.repo.plan(id);
    if (!plan) throw new NotFoundError('Абонемент не найден');
    if (plan.providerUserId !== session.user.id && session.user.accountKind !== 'admin') throw new ForbiddenError('Недостаточно прав');
    return this.repo.updatePlan(id, data);
  }
  async subscribe(userId: number, planId: number) {
    const plan = await this.repo.plan(planId);
    if (!plan || plan.status !== 'published') throw new NotFoundError('Абонемент не найден');
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + plan.durationDays * 86_400_000);
    return this.repo.subscribe(userId, planId, startsAt, endsAt, plan.visitLimit ?? undefined);
  }
  async cancel(id: number, session: SessionContext) {
    const item = await this.repo.subscription(id);
    if (!item) throw new NotFoundError('Подписка не найдена');
    if (item.userId !== session.user.id && session.user.accountKind !== 'admin') throw new ForbiddenError('Недостаточно прав');
    if (item.status !== 'active') throw new ConflictError('Подписка уже не активна');
    return this.repo.cancel(id);
  }
}

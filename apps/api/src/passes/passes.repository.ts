import { Injectable } from '@nestjs/common';
import { PrismaTransactionRunner } from '../storage/prisma-transaction';

@Injectable()
export class PassesRepository {
  constructor(private readonly prisma: PrismaTransactionRunner) {}
  listPlans(userId: number, offset: number, limit: number) {
    const where = { OR: [{ status: 'published' }, { providerUserId: userId }] };
    return Promise.all([
      this.prisma.client.passPlan.findMany({ where, orderBy: { createdAt: 'desc' }, skip: offset, take: limit }),
      this.prisma.client.passPlan.count({ where }),
    ]);
  }
  plan(id: number) { return this.prisma.client.passPlan.findUnique({ where: { id } }); }
  createPlan(providerUserId: number, data: object) { return this.prisma.client.passPlan.create({ data: { providerUserId, ...data } as never }); }
  updatePlan(id: number, data: object) { return this.prisma.client.passPlan.update({ where: { id }, data: data as never }); }
  subscribe(userId: number, planId: number, startsAt: Date, endsAt: Date, remainingVisits?: number) {
    return this.prisma.client.userSubscription.create({ data: { userId, planId, startsAt, endsAt, remainingVisits } });
  }
  subscriptions(userId: number) {
    return this.prisma.client.userSubscription.findMany({ where: { userId }, include: { plan: true }, orderBy: { createdAt: 'desc' } });
  }
  subscription(id: number) { return this.prisma.client.userSubscription.findUnique({ where: { id } }); }
  cancel(id: number) { return this.prisma.client.userSubscription.update({ where: { id }, data: { status: 'cancelled' } }); }
}

import { Injectable } from '@nestjs/common';
import { PrismaTransactionRunner } from '../storage/prisma-transaction';

@Injectable()
export class CampaignsRepository {
  constructor(private readonly prisma: PrismaTransactionRunner) {}
  list(providerUserId: number, offset: number, limit: number) {
    const where = { providerUserId };
    return Promise.all([
      this.prisma.client.marketingCampaign.findMany({ where, orderBy: { createdAt: 'desc' }, skip: offset, take: limit }),
      this.prisma.client.marketingCampaign.count({ where }),
    ]);
  }
  find(id: number) { return this.prisma.client.marketingCampaign.findUnique({ where: { id } }); }
  create(providerUserId: number, data: { title: string; message: string }) {
    return this.prisma.client.marketingCampaign.create({ data: { providerUserId, ...data } });
  }
  update(id: number, data: object) { return this.prisma.client.marketingCampaign.update({ where: { id }, data: data as never }); }
  send(id: number, providerUserId: number) {
    return this.prisma.runInTransaction(async () => {
      const tx = this.prisma.client;
      const recipientCount = await tx.userFollow.count({ where: { followingId: providerUserId } });
      const campaign = await tx.marketingCampaign.update({ where: { id }, data: { status: 'sent', sentAt: new Date(), recipientCount } });
      await tx.socialPost.create({ data: { authorId: providerUserId, body: `${campaign.title}\n\n${campaign.message}`, visibility: 'followers' } });
      return campaign;
    });
  }
}

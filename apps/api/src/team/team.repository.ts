import { Injectable } from '@nestjs/common';
import { PrismaTransactionRunner } from '../storage/prisma-transaction';

@Injectable()
export class TeamRepository {
  constructor(private readonly prisma: PrismaTransactionRunner) {}

  listEvents(userId: number, offset: number, limit: number) {
    const where = { OR: [{ visibility: 'public' }, { ownerId: userId }, { visibility: 'followers', owner: { followers: { some: { followerId: userId } } } }, { participants: { some: { userId } } }] };
    return Promise.all([
      this.prisma.client.teamEvent.findMany({ where, skip: offset, take: limit, orderBy: { startsAt: 'asc' }, include: { _count: { select: { participants: true } } } }),
      this.prisma.client.teamEvent.count({ where }),
    ]);
  }
  event(id: number) { return this.prisma.client.teamEvent.findUnique({ where: { id }, include: { _count: { select: { participants: true } } } }); }
  participants(eventId: number, offset: number, limit: number) {
    const where = { eventId, status: 'joined' };
    return Promise.all([
      this.prisma.client.eventParticipant.findMany({ where, skip: offset, take: limit, orderBy: { joinedAt: 'asc' }, select: { userId: true, status: true, joinedAt: true } }),
      this.prisma.client.eventParticipant.count({ where }),
    ]);
  }
  createEvent(ownerId: number, data: object) { return this.prisma.client.teamEvent.create({ data: { ownerId, ...data } as never }); }
  updateEvent(id: number, data: object) { return this.prisma.client.teamEvent.update({ where: { id }, data: data as never }); }
  deleteEvent(id: number) { return this.prisma.client.teamEvent.delete({ where: { id } }); }
  join(eventId: number, userId: number) {
    return this.prisma.runInTransaction(async () => {
      const tx = this.prisma.client;
      await tx.$queryRawUnsafe('SELECT id FROM team_events WHERE id = $1 FOR UPDATE', eventId);
      const existing = await tx.eventParticipant.findUnique({ where: { eventId_userId: { eventId, userId } } });
      if (existing) return existing;
      const event = await tx.teamEvent.findUnique({ where: { id: eventId } });
      if (!event) return null;
      if (event.capacity !== null) {
        const count = await tx.eventParticipant.count({ where: { eventId, status: 'joined' } });
        if (count >= event.capacity) return null;
      }
      return tx.eventParticipant.create({ data: { eventId, userId } });
    });
  }
  leave(eventId: number, userId: number) { return this.prisma.client.eventParticipant.deleteMany({ where: { eventId, userId } }); }

  listAds(offset: number, limit: number) {
    return Promise.all([
      this.prisma.client.partnerAd.findMany({ where: { status: 'active' }, skip: offset, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.client.partnerAd.count({ where: { status: 'active' } }),
    ]);
  }
  ad(id: number) { return this.prisma.client.partnerAd.findUnique({ where: { id } }); }
  createAd(ownerId: number, data: object) { return this.prisma.client.partnerAd.create({ data: { ownerId, ...data } as never }); }
  updateAd(id: number, data: object) { return this.prisma.client.partnerAd.update({ where: { id }, data: data as never }); }
  contact(adId: number, requesterId: number, adOwnerId: number, message: string) {
    return this.prisma.client.partnerContactRequest.create({ data: { adId, requesterId, adOwnerId, message } });
  }
  listRequests(adOwnerId: number, offset: number, limit: number) {
    const where = { adOwnerId };
    return Promise.all([
      this.prisma.client.partnerContactRequest.findMany({ where, skip: offset, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.client.partnerContactRequest.count({ where }),
    ]);
  }
  request(id: number) { return this.prisma.client.partnerContactRequest.findUnique({ where: { id } }); }
  updateRequest(id: number, status: string) { return this.prisma.client.partnerContactRequest.update({ where: { id }, data: { status } }); }
  async isFollowing(followerId: number, followingId: number) {
    return (await this.prisma.client.userFollow.count({ where: { followerId, followingId } })) > 0;
  }
}

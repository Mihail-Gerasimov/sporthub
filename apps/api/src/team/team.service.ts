import { Injectable } from '@nestjs/common';
import type { SessionContext } from '../auth/session.service';
import { ConflictError, ForbiddenError, NotFoundError } from '../common/domain-error';
import { TeamRepository } from './team.repository';

@Injectable()
export class TeamService {
  constructor(private readonly repo: TeamRepository) {}

  async listEvents(userId: number, offset: number, limit: number) {
    const [items, total] = await this.repo.listEvents(userId, offset, limit);
    return { items, total, offset, limit };
  }
  async changeEvent(id: number, session: SessionContext, data?: object) {
    const event = await this.repo.event(id);
    if (!event) throw new NotFoundError('Событие не найдено');
    if (event.ownerId !== session.user.id && session.user.accountKind !== 'admin') throw new ForbiddenError('Недостаточно прав');
    return data ? this.repo.updateEvent(id, data) : this.repo.deleteEvent(id);
  }
  async join(eventId: number, userId: number) {
    const event = await this.repo.event(eventId);
    if (!event || !(await this.mayView(event, userId))) throw new NotFoundError('Событие не найдено');
    if (event.status !== 'scheduled') throw new ConflictError('Событие недоступно');
    const joined = await this.repo.join(eventId, userId);
    if (!joined) throw new ConflictError('Свободных мест нет');
    return joined;
  }
  async participants(eventId: number, userId: number, offset: number, limit: number) {
    const event = await this.repo.event(eventId);
    if (!event || !(await this.mayView(event, userId))) throw new NotFoundError('Событие не найдено');
    const [items, total] = await this.repo.participants(eventId, offset, limit);
    return { items, total, offset, limit };
  }
  async listAds(offset: number, limit: number) {
    const [items, total] = await this.repo.listAds(offset, limit);
    return { items, total, offset, limit };
  }
  async contact(adId: number, requesterId: number, message: string) {
    const ad = await this.repo.ad(adId);
    if (!ad || ad.status !== 'active') throw new NotFoundError('Объявление не найдено');
    if (ad.ownerId === requesterId) throw new ForbiddenError('Нельзя связаться с собой');
    return this.repo.contact(adId, requesterId, ad.ownerId, message);
  }
  async resolveRequest(id: number, session: SessionContext, status: string) {
    const request = await this.repo.request(id);
    if (!request) throw new NotFoundError('Запрос не найден');
    if (request.adOwnerId !== session.user.id && session.user.accountKind !== 'admin') throw new ForbiddenError('Недостаточно прав');
    if (request.status !== 'pending') throw new ConflictError('Запрос уже обработан');
    return this.repo.updateRequest(id, status);
  }
  private async mayView(event: { ownerId: number; visibility: string }, userId: number) {
    if (event.ownerId === userId || event.visibility === 'public') return true;
    return event.visibility === 'followers' && this.repo.isFollowing(userId, event.ownerId);
  }
}

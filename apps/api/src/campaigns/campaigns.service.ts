import { Injectable } from '@nestjs/common';
import type { SessionContext } from '../auth/session.service';
import { ConflictError, ForbiddenError, NotFoundError } from '../common/domain-error';
import { AccessService } from '../access/access.service';
import { CampaignsRepository } from './campaigns.repository';

@Injectable()
export class CampaignsService {
  constructor(private readonly repo: CampaignsRepository, private readonly access: AccessService) {}
  async create(session: SessionContext, data: { title: string; message: string }) {
    if (session.user.accountKind !== 'admin') {
      const owned = await this.access.getManagedPublicationIds(session.user.id);
      if (owned.clubIds.length === 0 && owned.trainerIds.length === 0) {
        throw new ForbiddenError('Кампании доступны только провайдерам');
      }
    }
    return this.repo.create(session.user.id, data);
  }
  async list(userId: number, offset: number, limit: number) {
    const [items, total] = await this.repo.list(userId, offset, limit);
    return { items, total, offset, limit };
  }
  async update(id: number, session: SessionContext, data: object) {
    const campaign = await this.owned(id, session);
    if (campaign.status !== 'draft') throw new ConflictError('Отправленную кампанию нельзя изменить');
    return this.repo.update(id, data);
  }
  async send(id: number, session: SessionContext) {
    const campaign = await this.owned(id, session);
    if (campaign.status !== 'draft') throw new ConflictError('Кампания уже обработана');
    return this.repo.send(id, campaign.providerUserId);
  }
  private async owned(id: number, session: SessionContext) {
    const campaign = await this.repo.find(id);
    if (!campaign) throw new NotFoundError('Кампания не найдена');
    if (campaign.providerUserId !== session.user.id && session.user.accountKind !== 'admin') throw new ForbiddenError('Недостаточно прав');
    return campaign;
  }
}

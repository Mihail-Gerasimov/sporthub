import { describe, expect, it, vi } from 'vitest';
import { ForbiddenError, NotFoundError } from '../common/domain-error';
import type { SessionContext } from '../auth/session.service';
import { SocialRepository } from './social.repository';
import { SocialService } from './social.service';

const session = (id: number, accountKind: 'person' | 'admin' = 'person') =>
  ({ user: { id, accountKind } } as SessionContext);

describe('SocialService ownership and visibility', () => {
  it('does not reveal a private post to another user', async () => {
    const repo = {
      findPost: vi.fn().mockResolvedValue({ id: 7, authorId: 1, visibility: 'private' }),
    } as unknown as SocialRepository;
    await expect(new SocialService(repo).assertVisible(7, 2)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('allows only the author or an administrator to delete a post', async () => {
    const repo = {
      findPost: vi.fn().mockResolvedValue({ id: 7, authorId: 1, visibility: 'public' }),
      deletePost: vi.fn().mockResolvedValue({ id: 7 }),
    } as unknown as SocialRepository;
    const service = new SocialService(repo);

    await expect(service.remove(7, session(2))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.remove(7, session(99, 'admin'))).resolves.toEqual({ deleted: 1 });
  });
});

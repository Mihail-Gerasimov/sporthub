import { Injectable } from '@nestjs/common';
import type { SessionContext } from '../auth/session.service';
import { ForbiddenError, NotFoundError, ValidationError } from '../common/domain-error';
import { SocialRepository } from './social.repository';

@Injectable()
export class SocialService {
  constructor(private readonly repo: SocialRepository) {}

  async list(userId: number, offset: number, limit: number) {
    const [items, total] = await this.repo.listPosts(userId, offset, limit);
    return {
      items: items.map(({ _count, bookmarks, ...post }) => ({
        ...post,
        reactionCount: _count.reactions,
        commentCount: _count.comments,
        bookmarked: bookmarks.length > 0,
      })),
      total,
      offset,
      limit,
    };
  }

  create(userId: number, data: { body: string; visibility: string; imageUrl?: string }) {
    return this.repo.createPost(userId, data);
  }

  async bookmarks(userId: number, offset: number, limit: number) {
    const [items, total] = await this.repo.listBookmarks(userId, offset, limit);
    return { items, total, offset, limit };
  }

  async update(id: number, session: SessionContext, data: object) {
    await this.assertOwnerOrAdmin(id, session);
    return this.repo.updatePost(id, data);
  }

  async remove(id: number, session: SessionContext) {
    await this.assertOwnerOrAdmin(id, session);
    await this.repo.deletePost(id);
    return { deleted: 1 };
  }

  async comments(postId: number, userId: number, offset: number, limit: number) {
    await this.assertVisible(postId, userId);
    const [items, total] = await this.repo.listComments(postId, offset, limit);
    return { items, total, offset, limit };
  }

  async comment(postId: number, userId: number, body: string) {
    await this.assertVisible(postId, userId);
    return this.repo.addComment(postId, userId, body);
  }

  async removeComment(id: number, session: SessionContext) {
    const comment = await this.repo.findComment(id);
    if (!comment) throw new NotFoundError('Комментарий не найден');
    if (comment.authorId !== session.user.id && session.user.accountKind !== 'admin') {
      throw new ForbiddenError('Недостаточно прав');
    }
    await this.repo.deleteComment(id);
    return { deleted: 1 };
  }

  async follow(followerId: number, followingId: number) {
    if (followerId === followingId) throw new ValidationError('Нельзя подписаться на себя');
    if (!(await this.repo.userExists(followingId))) throw new NotFoundError('Пользователь не найден');
    return this.repo.follow(followerId, followingId);
  }

  async assertVisible(postId: number, userId: number) {
    const post = await this.repo.findPost(postId);
    if (!post) throw new NotFoundError('Публикация не найдена');
    if (post.visibility === 'private' && post.authorId !== userId) {
      throw new NotFoundError('Публикация не найдена');
    }
    if (post.visibility === 'followers' && post.authorId !== userId) {
      if (!(await this.repo.isFollowing(userId, post.authorId))) {
        throw new NotFoundError('Публикация не найдена');
      }
    }
  }

  private async assertOwnerOrAdmin(id: number, session: SessionContext) {
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Некорректный id');
    const post = await this.repo.findPost(id);
    if (!post) throw new NotFoundError('Публикация не найдена');
    if (post.authorId !== session.user.id && session.user.accountKind !== 'admin') {
      throw new ForbiddenError('Недостаточно прав');
    }
  }
}

import { Injectable } from '@nestjs/common';

import { PrismaTransactionRunner } from '../storage/prisma-transaction';

@Injectable()
export class SocialRepository {
  constructor(private readonly prisma: PrismaTransactionRunner) {}

  listPosts(userId: number, offset: number, limit: number) {
    const where = {
      OR: [
        { visibility: 'public' },
        { authorId: userId },
        { visibility: 'followers', author: { followers: { some: { followerId: userId } } } },
      ],
    };
    return Promise.all([
      this.prisma.client.socialPost.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: limit,
        include: {
          _count: { select: { comments: true, reactions: true } },
          bookmarks: { where: { userId }, select: { userId: true } },
        },
      }),
      this.prisma.client.socialPost.count({ where }),
    ]);
  }

  listBookmarks(userId: number, offset: number, limit: number) {
    const where = {
      bookmarks: { some: { userId } },
      OR: [
        { visibility: 'public' },
        { authorId: userId },
        { visibility: 'followers', author: { followers: { some: { followerId: userId } } } },
      ],
    };
    return Promise.all([
      this.prisma.client.socialPost.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: limit,
        include: { _count: { select: { comments: true, reactions: true } } },
      }),
      this.prisma.client.socialPost.count({ where }),
    ]);
  }

  findPost(id: number) {
    return this.prisma.client.socialPost.findUnique({ where: { id } });
  }

  createPost(authorId: number, data: { body: string; visibility: string; imageUrl?: string }) {
    return this.prisma.client.socialPost.create({ data: { authorId, ...data } });
  }

  updatePost(id: number, data: { body?: string; visibility?: string; imageUrl?: string | null }) {
    return this.prisma.client.socialPost.update({ where: { id }, data });
  }

  deletePost(id: number) {
    return this.prisma.client.socialPost.delete({ where: { id } });
  }

  addComment(postId: number, authorId: number, body: string) {
    return this.prisma.client.postComment.create({ data: { postId, authorId, body } });
  }

  listComments(postId: number, offset: number, limit: number) {
    return Promise.all([
      this.prisma.client.postComment.findMany({
        where: { postId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: offset,
        take: limit,
      }),
      this.prisma.client.postComment.count({ where: { postId } }),
    ]);
  }

  findComment(id: number) {
    return this.prisma.client.postComment.findUnique({ where: { id } });
  }

  deleteComment(id: number) {
    return this.prisma.client.postComment.delete({ where: { id } });
  }

  react(postId: number, userId: number, kind: string) {
    return this.prisma.client.postReaction.upsert({
      where: { postId_userId: { postId, userId } },
      create: { postId, userId, kind },
      update: { kind },
    });
  }

  removeReaction(postId: number, userId: number) {
    return this.prisma.client.postReaction.deleteMany({ where: { postId, userId } });
  }

  bookmark(postId: number, userId: number) {
    return this.prisma.client.postBookmark.upsert({
      where: { postId_userId: { postId, userId } },
      create: { postId, userId },
      update: {},
    });
  }

  removeBookmark(postId: number, userId: number) {
    return this.prisma.client.postBookmark.deleteMany({ where: { postId, userId } });
  }

  follow(followerId: number, followingId: number) {
    return this.prisma.client.userFollow.upsert({
      where: { followerId_followingId: { followerId, followingId } },
      create: { followerId, followingId },
      update: {},
    });
  }

  unfollow(followerId: number, followingId: number) {
    return this.prisma.client.userFollow.deleteMany({ where: { followerId, followingId } });
  }

  async isFollowing(followerId: number, followingId: number) {
    return (
      (await this.prisma.client.userFollow.count({ where: { followerId, followingId } })) > 0
    );
  }

  async userExists(userId: number) {
    return (await this.prisma.client.user.count({ where: { id: userId } })) > 0;
  }
}

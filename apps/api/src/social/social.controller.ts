import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  POST_REACTIONS,
  commentInputSchema,
  pageQuerySchema,
  socialPostInputSchema,
} from '@sporthub/domain';
import { z } from 'zod';

import { CurrentUser } from '../auth/access.decorators';
import type { SessionContext } from '../auth/session.service';
import { ValidationError } from '../common/domain-error';
import { SocialRepository } from './social.repository';
import { SocialService } from './social.service';

const id = (raw: string) => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new ValidationError('Некорректный id');
  return value;
};
const parse = <T>(schema: z.ZodType<T>, raw: unknown): T => {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ValidationError('Некорректные данные');
  return result.data;
};

@Controller('social')
export class SocialController {
  constructor(
    private readonly service: SocialService,
    private readonly repo: SocialRepository,
  ) {}

  @Get('posts')
  list(@CurrentUser() session: SessionContext, @Query() query: unknown) {
    const page = parse(pageQuerySchema, query);
    return this.service.list(session.user.id, page.offset, page.limit);
  }

  @Post('posts')
  create(@CurrentUser() session: SessionContext, @Body() body: unknown) {
    return this.service.create(session.user.id, parse(socialPostInputSchema, body));
  }

  @Get('bookmarks')
  bookmarks(@CurrentUser() session: SessionContext, @Query() query: unknown) {
    const page = parse(pageQuerySchema, query);
    return this.service.bookmarks(session.user.id, page.offset, page.limit);
  }

  @Patch('posts/:id')
  update(@Param('id') rawId: string, @CurrentUser() session: SessionContext, @Body() body: unknown) {
    return this.service.update(id(rawId), session, parse(socialPostInputSchema.partial(), body));
  }

  @Delete('posts/:id')
  remove(@Param('id') rawId: string, @CurrentUser() session: SessionContext) {
    return this.service.remove(id(rawId), session);
  }

  @Get('posts/:id/comments')
  comments(@Param('id') rawId: string, @CurrentUser() session: SessionContext, @Query() query: unknown) {
    const page = parse(pageQuerySchema, query);
    return this.service.comments(id(rawId), session.user.id, page.offset, page.limit);
  }

  @Post('posts/:id/comments')
  comment(@Param('id') rawId: string, @CurrentUser() session: SessionContext, @Body() body: unknown) {
    return this.service.comment(id(rawId), session.user.id, parse(commentInputSchema, body).body);
  }

  @Delete('comments/:id')
  removeComment(@Param('id') rawId: string, @CurrentUser() session: SessionContext) {
    return this.service.removeComment(id(rawId), session);
  }

  @Post('posts/:id/reaction')
  async react(@Param('id') rawId: string, @CurrentUser() session: SessionContext, @Body() body: unknown) {
    const postId = id(rawId);
    await this.service.assertVisible(postId, session.user.id);
    const value = parse(z.object({ kind: z.enum(POST_REACTIONS).default('like') }), body);
    return this.repo.react(postId, session.user.id, value.kind);
  }

  @Delete('posts/:id/reaction')
  async unreact(@Param('id') rawId: string, @CurrentUser() session: SessionContext) {
    const postId = id(rawId);
    await this.service.assertVisible(postId, session.user.id);
    return this.repo.removeReaction(postId, session.user.id);
  }

  @Post('posts/:id/bookmark')
  async bookmark(@Param('id') rawId: string, @CurrentUser() session: SessionContext) {
    const postId = id(rawId);
    await this.service.assertVisible(postId, session.user.id);
    return this.repo.bookmark(postId, session.user.id);
  }

  @Delete('posts/:id/bookmark')
  unbookmark(@Param('id') rawId: string, @CurrentUser() session: SessionContext) {
    return this.repo.removeBookmark(id(rawId), session.user.id);
  }

  @Post('users/:id/follow')
  follow(@Param('id') rawId: string, @CurrentUser() session: SessionContext) {
    return this.service.follow(session.user.id, id(rawId));
  }

  @Delete('users/:id/follow')
  unfollow(@Param('id') rawId: string, @CurrentUser() session: SessionContext) {
    return this.repo.unfollow(session.user.id, id(rawId));
  }
}

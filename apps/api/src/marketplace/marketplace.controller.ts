import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { pageQuerySchema, productInputSchema } from '@sporthub/domain';
import { z } from 'zod';
import { CurrentUser } from '../auth/access.decorators';
import type { SessionContext } from '../auth/session.service';
import { ForbiddenError, ValidationError } from '../common/domain-error';
import { MarketplaceRepository } from './marketplace.repository';
import { MarketplaceService } from './marketplace.service';

const parse = <T>(schema: z.ZodType<T>, raw: unknown): T => {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ValidationError('Некорректные данные');
  return result.data;
};
const id = (raw: string) => parse(z.coerce.number().int().positive(), raw);

@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly service: MarketplaceService, private readonly repo: MarketplaceRepository) {}

  @Get('categories')
  categories() { return this.repo.categories(); }
  @Post('categories')
  createCategory(@CurrentUser() session: SessionContext, @Body() body: unknown) {
    if (session.user.accountKind !== 'admin') throw new ForbiddenError('Недостаточно прав');
    return this.repo.createCategory(parse(z.object({ name: z.string().trim().min(1).max(200), slug: z.string().regex(/^[a-z0-9-]+$/).max(200) }), body));
  }
  @Get('products')
  products(@CurrentUser() session: SessionContext, @Query() query: unknown) {
    const value = parse(pageQuerySchema.extend({ categoryId: z.coerce.number().int().positive().optional() }), query);
    return this.service.products(session.user.id, value.offset, value.limit, value.categoryId);
  }
  @Post('products')
  async createProduct(@CurrentUser() session: SessionContext, @Body() body: unknown) {
    const value = parse(productInputSchema, body);
    const category = await this.repo.category(value.categoryId);
    if (!category?.active) throw new ValidationError('Категория не найдена');
    if (value.kind === 'digital' && !value.program) throw new ValidationError('Для цифрового товара нужна программа');
    if (value.kind === 'physical' && value.program) throw new ValidationError('Программа допустима только для цифрового товара');
    return this.repo.createProduct(session.user.id, value);
  }
  @Patch('products/:id')
  updateProduct(@Param('id') rawId: string, @CurrentUser() session: SessionContext, @Body() body: unknown) {
    const schema = productInputSchema.omit({ program: true }).partial().extend({ status: z.enum(['draft', 'published', 'archived']).optional() });
    return this.service.updateProduct(id(rawId), session, parse(schema, body));
  }
  @Get('cart')
  cart(@CurrentUser() session: SessionContext) { return this.repo.cart(session.user.id); }
  @Post('cart/items')
  addCart(@CurrentUser() session: SessionContext, @Body() body: unknown) {
    const value = parse(z.object({ productId: z.number().int().positive(), quantity: z.number().int().positive().max(100) }), body);
    return this.service.addToCart(session.user.id, value.productId, value.quantity);
  }
  @Delete('cart/items/:productId')
  removeCart(@CurrentUser() session: SessionContext, @Param('productId') rawId: string) {
    return this.repo.removeCartItem(session.user.id, id(rawId));
  }
  @Post('orders')
  checkout(@CurrentUser() session: SessionContext) { return this.service.checkout(session.user.id); }
  @Get('orders')
  async orders(@CurrentUser() session: SessionContext, @Query() query: unknown) {
    const page = parse(pageQuerySchema, query);
    const [items, total] = await this.repo.orders(session.user.id, session.user.accountKind === 'admin', page.offset, page.limit);
    return { items, total, ...page };
  }
  @Post('orders/:id/confirm')
  confirm(@Param('id') rawId: string, @CurrentUser() session: SessionContext) {
    if (session.user.accountKind !== 'admin') throw new ForbiddenError('Недостаточно прав');
    return this.service.confirm(id(rawId));
  }
  @Get('entitlements')
  entitlements(@CurrentUser() session: SessionContext) { return this.repo.entitlements(session.user.id); }
}

import { Injectable } from '@nestjs/common';
import type { SessionContext } from '../auth/session.service';
import { ConflictError, ForbiddenError, NotFoundError } from '../common/domain-error';
import { MarketplaceRepository } from './marketplace.repository';

@Injectable()
export class MarketplaceService {
  constructor(private readonly repo: MarketplaceRepository) {}
  async products(userId: number, offset: number, limit: number, categoryId?: number) {
    const [items, total] = await this.repo.listProducts(userId, offset, limit, categoryId);
    return { items, total, offset, limit };
  }
  async updateProduct(id: number, session: SessionContext, data: object) {
    const product = await this.repo.product(id);
    if (!product) throw new NotFoundError('Товар не найден');
    if (product.sellerId !== session.user.id && session.user.accountKind !== 'admin') throw new ForbiddenError('Недостаточно прав');
    return this.repo.updateProduct(id, data);
  }
  async addToCart(userId: number, productId: number, quantity: number) {
    const product = await this.repo.product(productId);
    if (!product || product.status !== 'published') throw new NotFoundError('Товар не найден');
    if (product.stock !== null && product.stock < quantity) throw new ConflictError('Недостаточно товара');
    return this.repo.setCartItem(userId, productId, quantity);
  }
  async checkout(userId: number) {
    const result = await this.repo.checkout(userId);
    if (!result) throw new ConflictError('Корзина пуста');
    if ('invalidProductId' in result) throw new ConflictError(`Товар ${result.invalidProductId} недоступен`);
    return result;
  }
  async confirm(orderId: number) {
    const order = await this.repo.order(orderId);
    if (!order) throw new NotFoundError('Заказ не найден');
    if (order.status !== 'pending_confirmation') throw new ConflictError('Заказ уже обработан');
    return this.repo.confirm(orderId);
  }
}

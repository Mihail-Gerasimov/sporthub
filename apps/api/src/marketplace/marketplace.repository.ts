import { Injectable } from '@nestjs/common';
import { PrismaTransactionRunner } from '../storage/prisma-transaction';

@Injectable()
export class MarketplaceRepository {
  constructor(private readonly prisma: PrismaTransactionRunner) {}

  categories() { return this.prisma.client.marketplaceCategory.findMany({ where: { active: true }, orderBy: { name: 'asc' } }); }
  createCategory(data: { name: string; slug: string }) { return this.prisma.client.marketplaceCategory.create({ data }); }
  category(id: number) { return this.prisma.client.marketplaceCategory.findUnique({ where: { id } }); }
  product(id: number) { return this.prisma.client.product.findUnique({ where: { id }, include: { program: true } }); }
  listProducts(userId: number, offset: number, limit: number, categoryId?: number) {
    const where = { categoryId, OR: [{ status: 'published' }, { sellerId: userId }] };
    return Promise.all([
      this.prisma.client.product.findMany({ where, skip: offset, take: limit, orderBy: { createdAt: 'desc' }, include: { program: true } }),
      this.prisma.client.product.count({ where }),
    ]);
  }
  createProduct(sellerId: number, input: { categoryId: number; name: string; description: string; price: number; kind: string; stock?: number; program?: { programType: string; content: object } }) {
    const { program, ...data } = input;
    return this.prisma.client.product.create({
      data: { ...data, sellerId, program: program ? { create: program as never } : undefined },
      include: { program: true },
    });
  }
  updateProduct(id: number, data: object) { return this.prisma.client.product.update({ where: { id }, data: data as never }); }
  cart(userId: number) {
    return this.prisma.client.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      include: { items: { include: { product: true } } },
    });
  }
  async setCartItem(userId: number, productId: number, quantity: number) {
    const cart = await this.prisma.client.cart.upsert({ where: { userId }, create: { userId }, update: {} });
    return this.prisma.client.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId } },
      create: { cartId: cart.id, productId, quantity },
      update: { quantity },
    });
  }
  async removeCartItem(userId: number, productId: number) {
    const cart = await this.prisma.client.cart.findUnique({ where: { userId } });
    if (!cart) return { count: 0 };
    return this.prisma.client.cartItem.deleteMany({ where: { cartId: cart.id, productId } });
  }
  checkout(userId: number) {
    return this.prisma.runInTransaction(async () => {
      const tx = this.prisma.client;
      const cart = await tx.cart.findUnique({ where: { userId }, include: { items: { include: { product: true } } } });
      if (!cart || cart.items.length === 0) return null;
      const invalid = cart.items.find(({ product, quantity }) => product.status !== 'published' || product.stock !== null && product.stock < quantity);
      if (invalid) return { invalidProductId: invalid.productId } as const;
      const total = cart.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
      const order = await tx.order.create({
        data: {
          userId,
          total,
          items: { create: cart.items.map((item) => ({ productId: item.productId, productName: item.product.name, unitPrice: item.product.price, quantity: item.quantity })) },
        },
        include: { items: true },
      });
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      return order;
    });
  }
  orders(userId: number, isAdmin: boolean, offset: number, limit: number) {
    const where = isAdmin ? {} : { userId };
    return Promise.all([
      this.prisma.client.order.findMany({ where, include: { items: true }, orderBy: { createdAt: 'desc' }, skip: offset, take: limit }),
      this.prisma.client.order.count({ where }),
    ]);
  }
  order(id: number) { return this.prisma.client.order.findUnique({ where: { id }, include: { items: { include: { product: { include: { program: true } } } } } }); }
  confirm(id: number) {
    return this.prisma.runInTransaction(async () => {
      const tx = this.prisma.client;
      const order = await tx.order.update({ where: { id }, data: { status: 'confirmed' }, include: { items: { include: { product: { include: { program: true } } } } } });
      for (const item of order.items) {
        if (item.product?.program) {
          await tx.programEntitlement.upsert({
            where: { userId_programId: { userId: order.userId, programId: item.product.program.id } },
            create: { userId: order.userId, programId: item.product.program.id, orderId: order.id },
            update: {},
          });
        }
      }
      return order;
    });
  }
  entitlements(userId: number) {
    return this.prisma.client.programEntitlement.findMany({ where: { userId }, include: { program: { include: { product: true } } }, orderBy: { createdAt: 'desc' } });
  }
}

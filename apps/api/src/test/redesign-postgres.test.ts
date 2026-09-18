import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './db-harness';
import { ensureTestSchema } from './db-setup';

let db: TestDatabase;

beforeAll(async () => {
  await ensureTestSchema();
  db = await createTestDatabase();
  await db.truncateAll();
}, 180_000);

afterAll(async () => db?.close());

describe('redesign PostgreSQL persistence', () => {
  it('persists social ownership and cascades dependent content', async () => {
    const user = await db.prisma.user.create({
      data: {
        name: 'Real test user',
        email: 'redesign-pg@example.test',
        phone: '+70000000000',
        passwordHash: 'not-a-production-password',
      },
    });
    const post = await db.prisma.socialPost.create({
      data: { authorId: user.id, body: 'PostgreSQL-backed post', visibility: 'public' },
    });
    await db.prisma.postComment.create({
      data: { postId: post.id, authorId: user.id, body: 'Stored comment' },
    });

    expect(await db.prisma.postComment.count({ where: { postId: post.id } })).toBe(1);
    await db.prisma.socialPost.delete({ where: { id: post.id } });
    expect(await db.prisma.postComment.count({ where: { postId: post.id } })).toBe(0);
  });

  it('creates pending-confirmation orders from real products', async () => {
    const seller = await db.prisma.user.create({
      data: {
        name: 'Seller',
        email: 'redesign-seller@example.test',
        phone: '+70000000001',
        passwordHash: 'not-a-production-password',
      },
    });
    const category = await db.prisma.marketplaceCategory.create({
      data: { name: 'Programs', slug: 'programs-test' },
    });
    const product = await db.prisma.product.create({
      data: {
        sellerId: seller.id,
        categoryId: category.id,
        name: 'Training plan',
        description: 'A persisted plan',
        price: 1500,
        kind: 'digital',
        status: 'published',
      },
    });
    const order = await db.prisma.order.create({
      data: {
        userId: seller.id,
        total: product.price,
        items: {
          create: { productId: product.id, productName: product.name, unitPrice: product.price, quantity: 1 },
        },
      },
    });
    expect(order.status).toBe('pending_confirmation');
  });
});

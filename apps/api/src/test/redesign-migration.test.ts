import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_ROOT } from './repo-root';

const migrationPath = path.join(
  API_ROOT,
  'prisma/migrations/20260918123000_redesign_backend_foundation/migration.sql',
);

describe('redesign PostgreSQL migration', () => {
  it('creates every MVP domain without seeding user or content data', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    for (const table of [
      'social_posts',
      'team_events',
      'partner_ads',
      'products',
      'orders',
      'digital_programs',
      'workout_entries',
      'food_entries',
      'pass_plans',
      'user_subscriptions',
      'marketing_campaigns',
    ]) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }
    expect(sql).not.toMatch(/\bINSERT\s+INTO\b/i);
  });

  it('contains integrity constraints for unsafe cross-row inputs', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql).toContain('user_follows_not_self');
    expect(sql).toContain('team_events_time_order');
    expect(sql).toContain('cart_items_quantity_positive');
    expect(sql).toContain('user_subscriptions_time_order');
  });
});

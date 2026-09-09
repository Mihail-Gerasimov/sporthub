// Сторож заголовков безопасности.
//
// Заголовки легко потерять: они живут в конфигурации, их не видно ни в одном
// компоненте, и молчаливая пропажа обнаруживается только при разборе инцидента.
// Тест читает ту же конфигурацию, что уходит в сборку, и требует набор поимённо.

import { describe, expect, it } from 'vitest';

import nextConfig from '../../next.config';

describe('Заголовки безопасности', () => {
  it('конфигурация отдаёт заголовки на все пути', async () => {
    const headers = await nextConfig.headers?.();

    expect(headers).toBeDefined();
    expect(headers?.[0]?.source).toBe('/:path*');
  });

  it('набор заголовков полон', async () => {
    const headers = await nextConfig.headers?.();
    const names = (headers?.[0]?.headers ?? []).map((header) => header.key);

    // Каждый — про свою угрозу, поэтому список проверяется поимённо, а не длиной.
    expect(names).toContain('Content-Security-Policy');
    expect(names).toContain('X-Frame-Options');
    expect(names).toContain('X-Content-Type-Options');
    expect(names).toContain('Referrer-Policy');
    expect(names).toContain('Permissions-Policy');
    expect(names).toContain('Strict-Transport-Security');
  });

  it('страницу нельзя вложить в чужой фрейм', async () => {
    const headers = await nextConfig.headers?.();
    const byName = new Map((headers?.[0]?.headers ?? []).map((h) => [h.key, h.value]));

    // Два заголовка про одно и то же: современные браузеры смотрят на первый,
    // старые — на второй. Потеря любого возвращает возможность подмены нажатий.
    expect(byName.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(byName.get('X-Frame-Options')).toBe('DENY');
  });

  it('правила источников не разрешают всё подряд', async () => {
    const headers = await nextConfig.headers?.();
    const csp = new Map((headers?.[0]?.headers ?? []).map((h) => [h.key, h.value])).get(
      'Content-Security-Policy',
    );

    // `default-src *` свело бы всю политику к украшению.
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toContain('default-src *');
    expect(csp).toContain("object-src 'none'");
  });
});

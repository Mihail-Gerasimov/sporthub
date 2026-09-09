// Сторож заголовков безопасности.
//
// Заголовки легко потерять: они живут в конфигурации, их не видно ни в одном
// компоненте, и молчаливая пропажа обнаруживается только при разборе инцидента.
// Тест читает ту же конфигурацию, что уходит в сборку, и требует набор поимённо.

import { describe, expect, it } from 'vitest';

import nextConfig, { MAP_HOSTS } from '../../next.config';

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

  // ⚠️ Найдено браузерным прогоном чек-листа (шаг 24): карта на главной НЕ
  // грузилась вовсе. В правилах источников перечислен только адрес самого API
  // карт, а загрузчик третьей версии тянет свой пакет и стили с отдельного узла
  // раздачи — браузер их отбивал, и на месте карты оставалась пустота.
  //
  // Проверка идёт по общему списку узлов, а не по строке: список объявлен один
  // раз рядом с самими правилами, и подключение нового узла нельзя забыть
  // в одном из двух мест.
  it('правила источников разрешают все узлы, с которых грузятся карты', async () => {
    const headers = await nextConfig.headers?.();
    const csp = new Map((headers?.[0]?.headers ?? []).map((h) => [h.key, h.value])).get(
      'Content-Security-Policy',
    );
    const directive = (name: string) =>
      String(csp)
        .split('; ')
        .find((part) => part.startsWith(`${name} `)) ?? '';

    // Пакет загрузчика и его стили лежат на узле раздачи, а не на адресе API.
    expect(directive('script-src')).toContain(MAP_HOSTS.bundle);
    expect(directive('style-src')).toContain(MAP_HOSTS.bundle);
    // Сам API и плитки карты — на своих адресах.
    expect(directive('script-src')).toContain(MAP_HOSTS.api);
    expect(directive('connect-src')).toContain(MAP_HOSTS.api);
    expect(directive('connect-src')).toContain(MAP_HOSTS.tiles);
  });
});

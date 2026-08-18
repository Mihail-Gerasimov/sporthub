import path from 'node:path';

import type { NextConfig } from 'next';

// Корень монорепозитория — на два уровня выше apps/web.
const monorepoRoot = path.join(__dirname, '..', '..');

/**
 * Адрес бэкенда. Фронт и бэк — два процесса; в разработке второй слушает 3001.
 * Значение задаётся переменной окружения, чтобы в бою указать реальный адрес,
 * не трогая код.
 */
const apiOrigin = process.env.SPORT_HUB_API_ORIGIN ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  // Next 16 сам ищет корень, поднимаясь по дереву в поисках lockfile. В монорепо
  // с несколькими package.json это определение нестабильно, поэтому фиксируем явно.
  // outputFileTracingRoot — для трассировки файлов, turbopack.root — для резолва
  // модулей: разные механизмы, но корень у них один и тот же.
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
  /**
   * Все обращения к `/api/*` уходят на бэкенд как есть. Благодаря этому
   * клиентский код не изменился ни в одном из полусотни мест вызова: адреса
   * остались прежними, поменялся лишь процесс, который на них отвечает.
   */
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

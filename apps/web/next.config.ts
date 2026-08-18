import path from 'node:path';

import type { NextConfig } from 'next';

// Корень монорепозитория — на два уровня выше apps/web.
const monorepoRoot = path.join(__dirname, '..', '..');

const nextConfig: NextConfig = {
  // Next 16 сам ищет корень, поднимаясь по дереву в поисках lockfile. В монорепо
  // с несколькими package.json это определение нестабильно, поэтому фиксируем явно.
  // outputFileTracingRoot — для трассировки файлов, turbopack.root — для резолва
  // модулей: разные механизмы, но корень у них один и тот же.
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;

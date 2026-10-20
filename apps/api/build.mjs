// Bundles the API and the @ajh/* workspace packages into dist/main.js.
// Third-party packages stay external and are resolved from apps/api/node_modules,
// so every runtime dependency of a workspace package is also listed in apps/api/package.json.
import { build } from 'esbuild';
import { cpSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  plugins: [
    {
      name: 'externalize-third-party',
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) =>
          args.path.startsWith('@ajh/') ? undefined : { path: args.path, external: true },
        );
      },
    },
  ],
});
cpSync('../../packages/database/migrations', 'dist/migrations', { recursive: true });
console.log('API built to apps/api/dist');

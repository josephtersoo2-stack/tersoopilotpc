import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
process.chdir(rootDir);

function getEsbuild() {
  const pnpmDir = path.resolve('node_modules/.pnpm');
  const entries = fs.readdirSync(pnpmDir).filter((e) => e.startsWith('esbuild@'));
  if (entries.length > 0) {
    const pkg = path.join(pnpmDir, entries[0], 'node_modules', 'esbuild');
    return require(pkg);
  }
  return require('esbuild');
}

async function buildDesktop() {
  const esbuild = getEsbuild();

  console.log('Bundling Electron main process...');
  await esbuild.build({
    entryPoints: ['apps/desktop/src/main/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: 'apps/desktop/dist/main/index.cjs',
    alias: {
      '@tersoo/core': path.resolve('packages/core/src/index.ts'),
      '@tersoo/contracts': path.resolve('packages/contracts/src/index.ts'),
      '@tersoo/stealth': path.resolve('packages/stealth/src/index.ts'),
    },
    external: [
      'electron',
      'better-sqlite3',
      'bun:sqlite',
      'keytar',
      'impit',
      'impit-win32-x64-msvc',
      'camoufox-js',
      '@heretic-tech/apostate',
      'patchright',
      'playwright-core',
      'rebrowser-playwright-core',
    ],
    loader: {
      '.node': 'file',
    },
    sourcemap: true,
  });

  console.log('Bundling Electron preload script...');
  await esbuild.build({
    entryPoints: ['apps/desktop/src/preload/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: 'apps/desktop/dist/preload/index.cjs',
    external: ['electron'],
    sourcemap: true,
  });

  const rendererDist = path.resolve('apps/renderer/dist');
  const targetRenderer = path.resolve('apps/desktop/dist/renderer');
  if (fs.existsSync(rendererDist)) {
    fs.cpSync(rendererDist, targetRenderer, { recursive: true });
    console.log('Copied renderer bundle into desktop dist/renderer');
  }

  console.log('Electron desktop bundle built successfully!');
}

buildDesktop().catch((err) => {
  console.error('Failed to bundle desktop:', err);
  process.exit(1);
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FingerprintBundle } from '@tersoo/contracts';

let cachedShimSource: string | null = null;

export function getStealthShimPath(): string {
  let dir = '';
  try {
    dir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    dir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
  }

  const candidates = [
    path.resolve(dir, 'stealth_shim.js'),
    path.resolve(dir, '../dist/stealth_shim.js'),
    path.resolve(dir, '../src/stealth_shim.js'),
    path.resolve(process.cwd(), 'packages/stealth/dist/stealth_shim.js'),
    path.resolve(process.cwd(), 'packages/stealth/src/stealth_shim.js'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0]!;
}

export function getStealthShimSource(): string {
  if (cachedShimSource) {
    return cachedShimSource;
  }

  const filePath = getStealthShimPath();
  cachedShimSource = fs.readFileSync(filePath, 'utf8');
  return cachedShimSource;
}

let cachedSelfTestHtmlSource: string | null = null;

export function getSelfTestHtmlPath(): string {
  let dir = '';
  try {
    dir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    dir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
  }

  const candidates = [
    path.resolve(dir, 'self-test.html'),
    path.resolve(dir, '../dist/self-test.html'),
    path.resolve(dir, '../src/self-test.html'),
    path.resolve(process.cwd(), 'packages/stealth/dist/self-test.html'),
    path.resolve(process.cwd(), 'packages/stealth/src/self-test.html'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0]!;
}

export function getSelfTestHtmlSource(): string {
  if (cachedSelfTestHtmlSource) {
    return cachedSelfTestHtmlSource;
  }

  const filePath = getSelfTestHtmlPath();
  cachedSelfTestHtmlSource = fs.readFileSync(filePath, 'utf8');
  return cachedSelfTestHtmlSource;
}

/**
 * Builds the complete script string to inject before document creation via CDP:
 * Page.addScriptToEvaluateOnNewDocument
 */
export function buildStealthScript(bundle: FingerprintBundle): string {
  const shim = getStealthShimSource();
  const serializedBundle = JSON.stringify(bundle);
  return `globalThis.__TERSOO_BUNDLE__ = ${serializedBundle};\n${shim}`;
}

import fs from 'node:fs';
import path from 'node:path';

import { TersooError } from '../../util/errors';

/**
 * Guard rails for the extra Chromium/Firefox command-line arguments accepted by
 * the launch path.
 *
 * The engines append `additionalArgs` verbatim to the spawned process command
 * line. A caller that controls that array controls the browser: a second
 * `--user-data-dir` or `--proxy-server` silently replaces the isolated one, and
 * flags such as `--load-extension` or `--disable-web-security` remove the
 * protections the rest of the launch sequence establishes.
 *
 * Two mechanisms are used together:
 *   1. `sanitizeAdditionalArgs` — deny by default, allow only flags on the
 *      list below.
 *   2. `assertArgvInvariants` — a post-condition check on the final argv, so a
 *      future edit that reintroduces an unsafe flag fails loudly in tests rather
 *      than silently weakening isolation at runtime.
 */

/**
 * Flags that may be supplied through `additionalArgs`.
 *
 * Only flags that affect presentation or fingerprint-adjacent rendering are
 * allowed. Anything that changes the network path, the profile directory, the
 * debugging surface, or the origin/extension sandbox is deliberately absent.
 */
const ALLOWED_EXTRA_FLAGS: ReadonlySet<string> = new Set([
  '--lang',
  '--accept-lang',
  '--window-size',
  '--force-color-profile',
  '--force-device-scale-factor',
  '--font-render-hinting',
  '--disable-lcd-text',
  '--disable-font-subpixel-positioning',
  '--disable-partial-raster',
  '--deterministic-mode',
]);

/**
 * Flags that must never appear in any launch argv, regardless of source.
 * Their presence means isolation has been compromised.
 */
const FORBIDDEN_FLAGS: ReadonlySet<string> = new Set([
  '--user-data-dir',
  '--disk-cache-dir',
  '--crash-dumps-dir',
  '--proxy-server',
  '--proxy-bypass-list',
  '--remote-debugging-port',
  '--remote-debugging-address',
  '--remote-debugging-pipe',
  '--remote-allow-origins',
  '--load-extension',
  '--disable-extensions-except',
  '--disable-web-security',
  '--allow-running-insecure-content',
  '--allow-file-access-from-files',
  '--disable-site-isolation-trials',
  '--no-sandbox',
  '--disable-gpu-sandbox',
  '--auto-open-devtools-for-tabs',
]);

/** Schemes that must never appear in a positional argument. */
const FORBIDDEN_POSITIONAL_SCHEMES =
  /^(javascript|data|vbscript|blob|about|chrome|chrome-extension|devtools|view-source|ws|wss|ftp):/i;

/**
 * A positional argument is a start-up navigation target for the browser, not a
 * flag, so it cannot override the profile directory, the proxy path, or the
 * debugger lockdown. That makes a local file acceptable, and the test suite
 * relies on it to point a launch at a script that makes the process fail.
 *
 * The check is deliberately narrow: an absolute path to a file that actually
 * exists, and nothing carrying a URL scheme. That refuses an injected remote or
 * script start page (`http://`, `javascript:`, `data:`, `file://`, …) while
 * keeping the failure-simulation path available.
 */
function isLocalFilePositional(value: string): boolean {
  if (value.includes('://')) return false;
  if (FORBIDDEN_POSITIONAL_SCHEMES.test(value)) return false;
  if (!path.isAbsolute(value)) return false;
  try {
    return fs.statSync(value).isFile();
  } catch {
    return false;
  }
}

/** Extracts the flag name from `--flag=value` or `--flag`. */
function flagName(arg: string): string {
  const withoutDashes = arg.replace(/^--?/, '');
  const eq = withoutDashes.indexOf('=');
  return `--${eq === -1 ? withoutDashes : withoutDashes.slice(0, eq)}`;
}

export class BrowserArgError extends TersooError {
  constructor(message: string) {
    super('POLICY_VIOLATION', message);
  }
}

/**
 * Filters `additionalArgs` down to the allowlist.
 *
 * @throws BrowserArgError when an argument is not permitted.
 */
export function sanitizeAdditionalArgs(
  additionalArgs: string[] | undefined | null,
): string[] {
  if (!additionalArgs || additionalArgs.length === 0) return [];

  const accepted: string[] = [];
  for (const raw of additionalArgs) {
    if (typeof raw !== 'string' || raw.length === 0) {
      throw new BrowserArgError(`Invalid browser argument: ${String(raw)}`);
    }
    if (raw.startsWith('-') && raw !== '--') {
      const name = flagName(raw);
      if (FORBIDDEN_FLAGS.has(name)) {
        throw new BrowserArgError(
          `Browser flag '${name}' is not permitted: it would override isolation, ` +
            `the proxy path, or the debugger lockdown.`,
        );
      }
      if (!ALLOWED_EXTRA_FLAGS.has(name)) {
        throw new BrowserArgError(
          `Browser flag '${name}' is not on the allowlist and was rejected.`,
        );
      }
      accepted.push(raw);
      continue;
    }

    // Bare positional values: only an existing local file, never a URL.
    if (isLocalFilePositional(raw)) {
      accepted.push(raw);
      continue;
    }

    throw new BrowserArgError(
      `Unexpected positional browser argument '${raw}'. Only flags starting with '--' ` +
        `or an absolute path to an existing local file are accepted; URLs and other ` +
        `schemes are refused.`,
    );
  }

  return accepted;
}

/**
 * Post-condition check over a fully built argv.
 *
 * `ownedFlags` are the flags the builder itself is responsible for; each must
 * appear exactly once. `maxOnceFlags` may appear at most once, so an
 * `additionalArgs` entry cannot append a second copy. `forbidDuplicates` are
 * flags that must not appear at all.
 *
 * @throws BrowserArgError when an invariant is violated.
 */
export function assertArgvInvariants(
  args: string[],
  opts: { ownedFlags: string[]; maxOnceFlags?: string[]; forbidDuplicates?: string[] },
): void {
  const countOf = (name: string): number =>
    args.reduce((n, arg) => (arg === name || arg.startsWith(`${name}=`) ? n + 1 : n), 0);

  for (const name of opts.ownedFlags) {
    const count = countOf(name);
    if (count !== 1) {
      throw new BrowserArgError(
        `Expected exactly one '${name}' in the launch argv, found ${count}. ` +
          `A duplicate would silently override the configured value.`,
      );
    }
  }

  for (const name of opts.maxOnceFlags ?? []) {
    const count = countOf(name);
    if (count > 1) {
      throw new BrowserArgError(
        `Flag '${name}' appears ${count} times in the launch argv; a later copy would ` +
          `silently override the earlier one.`,
      );
    }
  }

  for (const name of opts.forbidDuplicates ?? []) {
    const count = countOf(name);
    if (count > 0) {
      throw new BrowserArgError(
        `Forbidden flag '${name}' present ${count} time(s) in the launch argv.`,
      );
    }
  }
}

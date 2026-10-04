import crypto from 'node:crypto';

/**
 * Shared helpers for the authenticated local forwarder.
 *
 * The forwarder holds the user's paid upstream proxy credentials. Before
 * hardening it answered every SOCKS5 greeting with NO_AUTH and accepted plain
 * HTTP CONNECT, so any process running as the same OS user could point traffic
 * at the loopback port and spend the account's bandwidth under the profile's
 * exit IP. Each forwarder instance now mints a random token that the client must
 * present before any upstream connection is made.
 */

export interface ForwarderCredentials {
  username: string;
  password: string;
}

/** Fixed client username; the secret is the password. */
export const FORWARDER_USERNAME = 'tersoopilot';

/** Mints a fresh per-instance token. */
export function createForwarderToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** URL-encodes a credential for safe inclusion in a proxy URL. */
export function encodeProxyCredential(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Builds the `--proxy-server` value, including credentials when present.
 *
 * Note on residual risk: the value ends up on the Chromium command line, which
 * other processes running as the same OS user can read on Windows. This raises
 * the bar from "any local process" to "a process that is already running as
 * this user", but it is not equivalent to a channel that only this process can
 * read. Chromium has no supported way to receive SOCKS5 credentials out of band
 * without an extension, so this is the best available trade-off.
 */
export function buildAuthenticatedProxyUrl(
  port: number,
  credentials?: ForwarderCredentials | null | undefined,
): string {
  if (!credentials?.password) {
    return `socks5://127.0.0.1:${port}`;
  }
  const user = encodeProxyCredential(credentials.username || FORWARDER_USERNAME);
  const pass = encodeProxyCredential(credentials.password);
  return `socks5://${user}:${pass}@127.0.0.1:${port}`;
}

/** Constant-time string comparison that does not leak length via early exit. */
export function secretsMatch(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    // Still burn a comparison so the failure path costs the same.
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

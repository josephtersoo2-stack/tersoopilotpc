/**
 * Detection helpers for provider API keys that were written directly into
 * plaintext configuration instead of being referenced from the secret vault.
 *
 * `llm_config.api_key_ref` is meant to hold a *reference* such as
 * `llm/openrouter/key`. Earlier builds accepted a literal key in that column as
 * a convenience, which put recoverable credentials in an unencrypted SQLite
 * file and in every database backup. These helpers let the write path reject
 * such values and let startup migrate any that already exist.
 */

/** Prefixes of the provider keys this app supports. */
const RAW_KEY_PATTERNS: RegExp[] = [
  /^sk-or-v1-[A-Za-z0-9_-]{16,}$/, // OpenRouter
  /^sk-[A-Za-z0-9]{20,}$/, // OpenAI-style
  /^AIza[0-9A-Za-z_-]{30,}$/, // Google / Gemini
  /^gsk_[A-Za-z0-9]{20,}$/, // Groq
  /^xai-[A-Za-z0-9]{20,}$/, // xAI
];

/**
 * True when the value looks like a literal provider API key rather than a
 * vault reference.
 */
export function looksLikeRawProviderApiKey(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return RAW_KEY_PATTERNS.some((re) => re.test(trimmed));
}

/**
 * Validates a value destined for a secret-reference column.
 *
 * @throws when the value is a literal API key.
 */
export function assertNotRawProviderApiKey(value: unknown, field: string): void {
  if (looksLikeRawProviderApiKey(value)) {
    throw new Error(
      `${field} must be a secret reference (e.g. "llm/openrouter/key"), not a literal API key. ` +
        `Use the "save API key" action so the value is stored in the OS-backed vault.`,
    );
  }
}

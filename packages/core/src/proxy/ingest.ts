import fs from 'node:fs/promises';

export type SupportedProxyProtocol = 'socks5' | 'http' | 'https';

export interface ParsedProxyItem {
  line: number;
  raw: string;
  protocol: SupportedProxyProtocol;
  host: string;
  port: number;
  username?: string | undefined;
  password?: string | undefined;
}

export interface ParseError {
  line: number;
  raw: string;
  reason: string;
}

export interface ParseResult {
  items: ParsedProxyItem[];
  errors: ParseError[];
  totalLines: number;
}

export interface ParseOptions {
  format?: 'auto' | 'ip:port:user:pass' | 'url' | 'ip:port' | undefined;
  defaultProtocol?: SupportedProxyProtocol | undefined;
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function normalizeProtocol(proto: string): SupportedProxyProtocol | null {
  const p = proto.toLowerCase().replace(/:$/, '');
  if (p === 'socks5' || p === 'socks5h') return 'socks5';
  if (p === 'http') return 'http';
  if (p === 'https') return 'https';
  return null;
}

function stripBrackets(host: string): string {
  if (host.startsWith('[') && host.endsWith(']')) {
    return host.slice(1, -1);
  }
  return host;
}

/**
 * Parses a single line representing a proxy into a ParsedProxyItem or returns a ParseError.
 */
export function parseProxyLine(
  line: string,
  lineNumber: number,
  options?: ParseOptions,
): ParsedProxyItem | ParseError | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
    return null; // Empty line or comment
  }

  const format = options?.format ?? 'auto';
  const defaultProto = options?.defaultProtocol ?? 'socks5';

  try {
    if (format === 'url') {
      return parseUrlFormat(trimmed, lineNumber, defaultProto);
    }
    if (format === 'ip:port') {
      return parseIpPortFormat(trimmed, lineNumber, defaultProto);
    }
    if (format === 'ip:port:user:pass') {
      return parseIpPortUserPassFormat(trimmed, lineNumber, defaultProto);
    }

    // Auto format
    return parseAutoFormat(trimmed, lineNumber, defaultProto);
  } catch (err: unknown) {
    return {
      line: lineNumber,
      raw: trimmed,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

function parseUrlFormat(
  raw: string,
  line: number,
  defaultProto: SupportedProxyProtocol,
): ParsedProxyItem | ParseError {
  let urlString = raw;
  if (!urlString.includes('://')) {
    urlString = `${defaultProto}://${urlString}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { line, raw, reason: 'Invalid URL format' };
  }

  const protocol = normalizeProtocol(parsed.protocol);
  if (!protocol) {
    return { line, raw, reason: `Unsupported protocol: ${parsed.protocol}` };
  }

  const host = stripBrackets(parsed.hostname);
  if (!host) {
    return { line, raw, reason: 'Missing host' };
  }

  let port = parsed.port ? Number.parseInt(parsed.port, 10) : NaN;
  if (Number.isNaN(port)) {
    if (protocol === 'socks5') port = 1080;
    else if (protocol === 'http') port = 80;
    else if (protocol === 'https') port = 443;
  }

  if (!isValidPort(port)) {
    return { line, raw, reason: `Invalid port: ${parsed.port}` };
  }

  const username = parsed.username ? decodeURIComponent(parsed.username) : undefined;
  const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;

  const item: ParsedProxyItem = {
    line,
    raw,
    protocol,
    host,
    port,
  };
  if (username) item.username = username;
  if (password) item.password = password;

  return item;
}

function parseIpPortFormat(
  raw: string,
  line: number,
  defaultProto: SupportedProxyProtocol,
): ParsedProxyItem | ParseError {
  let host = '';
  let portStr = '';

  if (raw.startsWith('[')) {
    const closeBracket = raw.indexOf(']');
    if (closeBracket === -1) {
      return { line, raw, reason: 'Unclosed IPv6 bracket' };
    }
    host = raw.slice(1, closeBracket);
    const rest = raw.slice(closeBracket + 1);
    if (!rest.startsWith(':')) {
      return { line, raw, reason: 'Missing port after IPv6 address' };
    }
    portStr = rest.slice(1);
  } else {
    const parts = raw.split(':');
    if (parts.length !== 2) {
      return { line, raw, reason: `Expected host:port, got ${parts.length} tokens` };
    }
    host = parts[0]?.trim() ?? '';
    portStr = parts[1]?.trim() ?? '';
  }

  if (!host) {
    return { line, raw, reason: 'Missing host' };
  }

  const port = Number.parseInt(portStr, 10);
  if (!isValidPort(port)) {
    return { line, raw, reason: `Invalid port: ${portStr}` };
  }

  return {
    line,
    raw,
    protocol: defaultProto,
    host,
    port,
  };
}

function parseIpPortUserPassFormat(
  raw: string,
  line: number,
  defaultProto: SupportedProxyProtocol,
): ParsedProxyItem | ParseError {
  const parts = raw.split(':');
  if (parts.length < 4) {
    return { line, raw, reason: `Expected host:port:user:pass, got ${parts.length} tokens` };
  }

  const host = parts[0]?.trim() ?? '';
  const portStr = parts[1]?.trim() ?? '';
  const username = parts[2]?.trim() ?? '';
  const password = parts.slice(3).join(':').trim();

  if (!host) {
    return { line, raw, reason: 'Missing host' };
  }

  const port = Number.parseInt(portStr, 10);
  if (!isValidPort(port)) {
    return { line, raw, reason: `Invalid port: ${portStr}` };
  }

  const item: ParsedProxyItem = {
    line,
    raw,
    protocol: defaultProto,
    host,
    port,
  };
  if (username) item.username = username;
  if (password) item.password = password;

  return item;
}

function parseAutoFormat(
  raw: string,
  line: number,
  defaultProto: SupportedProxyProtocol,
): ParsedProxyItem | ParseError {
  // 1. If explicit URL scheme (e.g. socks5:// or http://)
  if (raw.includes('://')) {
    return parseUrlFormat(raw, line, defaultProto);
  }

  // 2. Check for IPv6 with brackets: [2001:db8::1]:1080 or [2001:db8::1]:1080:user:pass
  if (raw.startsWith('[')) {
    const closeBracket = raw.indexOf(']');
    if (closeBracket === -1) {
      return { line, raw, reason: 'Unclosed IPv6 bracket' };
    }
    const host = raw.slice(1, closeBracket);
    const rest = raw.slice(closeBracket + 1);
    if (!rest.startsWith(':')) {
      return { line, raw, reason: 'Missing port after IPv6 address' };
    }
    const parts = rest.slice(1).split(':');
    const portStr = parts[0] ?? '';
    const port = Number.parseInt(portStr, 10);
    if (!isValidPort(port)) {
      return { line, raw, reason: `Invalid port: ${portStr}` };
    }
    const username = parts[1]?.trim();
    const password = parts.slice(2).join(':').trim();
    const item: ParsedProxyItem = {
      line,
      raw,
      protocol: defaultProto,
      host,
      port,
    };
    if (username) item.username = username;
    if (password) item.password = password;
    return item;
  }

  // 3. Check for standard colon-separated 4+ parts (host:port:user:pass or user:pass:host:port)
  const parts = raw.split(':');
  if (parts.length >= 4) {
    const p1Str = parts[1] ?? '';
    const p1 = /^\d+$/.test(p1Str) ? Number.parseInt(p1Str, 10) : NaN;
    if (isValidPort(p1) && !parts[0]?.includes('@')) {
      const host = parts[0]?.trim() ?? '';
      const username = parts[2]?.trim();
      const password = parts.slice(3).join(':').trim();
      const item: ParsedProxyItem = {
        line,
        raw,
        protocol: defaultProto,
        host,
        port: p1,
      };
      if (username) item.username = username;
      if (password) item.password = password;
      return item;
    }

    const p3Str = parts[3] ?? '';
    const p3 = /^\d+$/.test(p3Str) ? Number.parseInt(p3Str, 10) : NaN;
    if (isValidPort(p3) && parts.length === 4) {
      const username = parts[0]?.trim();
      const password = parts[1]?.trim();
      const host = parts[2]?.trim() ?? '';
      const item: ParsedProxyItem = {
        line,
        raw,
        protocol: defaultProto,
        host,
        port: p3,
      };
      if (username) item.username = username;
      if (password) item.password = password;
      return item;
    }
  }

  // 4. Check for credentials delimiter '@' (e.g. user:pass@host:port or user@host:port)
  if (raw.includes('@')) {
    const atIdx = raw.lastIndexOf('@');
    const credsPart = raw.slice(0, atIdx);
    const hostPortPart = raw.slice(atIdx + 1);

    const credParts = credsPart.split(':');
    const username = credParts[0]?.trim();
    const password = credParts.slice(1).join(':').trim();

    const hostRes = parseIpPortFormat(hostPortPart, line, defaultProto);
    if ('reason' in hostRes) {
      return hostRes;
    }

    const item: ParsedProxyItem = {
      ...hostRes,
      raw,
    };
    if (username) item.username = username;
    if (password) item.password = password;
    return item;
  }

  // 5. Tab, comma, or pipe delimited lines
  const altDelimMatch = raw.match(/[\t,|]/);
  if (altDelimMatch && altDelimMatch[0]) {
    const delim = altDelimMatch[0];
    const tokens = raw.split(delim).map((t) => t.trim());
    if (tokens.length === 2) {
      const h = tokens[0] ?? '';
      const pStr = tokens[1] ?? '';
      const port = Number.parseInt(pStr, 10);
      if (!h) return { line, raw, reason: 'Missing host' };
      if (!isValidPort(port)) return { line, raw, reason: `Invalid port: ${pStr}` };
      return { line, raw, protocol: defaultProto, host: h, port };
    }
    if (tokens.length >= 4) {
      const t0 = tokens[0] ?? '';
      const t1 = tokens[1] ?? '';
      const t2 = tokens[2] ?? '';
      const p1 = Number.parseInt(t1, 10);
      const p3 = Number.parseInt(tokens[3] ?? '', 10);
      if (isValidPort(p1)) {
        const item: ParsedProxyItem = {
          line,
          raw,
          protocol: defaultProto,
          host: t0,
          port: p1,
        };
        if (t2) item.username = t2;
        const pass = tokens.slice(3).join(delim);
        if (pass) item.password = pass;
        return item;
      }
      if (isValidPort(p3)) {
        const item: ParsedProxyItem = {
          line,
          raw,
          protocol: defaultProto,
          host: t2,
          port: p3,
        };
        if (t0) item.username = t0;
        const pass = t1;
        if (pass) item.password = pass;
        return item;
      }
    }
  }

  // 6. Standard 2-token host:port
  if (parts.length === 2) {
    return parseIpPortFormat(raw, line, defaultProto);
  }

  return { line, raw, reason: `Unrecognized proxy format: ${raw}` };
}

/**
 * Parses multi-line text containing proxy configurations.
 */
export function parseProxyText(text: string, options?: ParseOptions): ParseResult {
  const lines = text.split(/\r?\n/);
  const items: ParsedProxyItem[] = [];
  const errors: ParseError[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const currentLine = lines[i];
    if (currentLine === undefined) continue;
    const res = parseProxyLine(currentLine, lineNum, options);
    if (!res) continue;
    if ('reason' in res) {
      errors.push(res);
    } else {
      items.push(res);
    }
  }

  return {
    items,
    errors,
    totalLines: lines.length,
  };
}

/**
 * Reads and parses proxies from a file path.
 */
export async function parseProxyFile(filePath: string, options?: ParseOptions): Promise<ParseResult> {
  const content = await fs.readFile(filePath, 'utf-8');
  return parseProxyText(content, options);
}

/**
 * Parses either raw text or reads from a file path based on the input object.
 */
export async function parseProxyInput(input: {
  text?: string | undefined;
  filePath?: string | undefined;
  format?: 'auto' | 'ip:port:user:pass' | 'url' | 'ip:port' | undefined;
  defaultProtocol?: SupportedProxyProtocol | undefined;
}): Promise<ParseResult> {
  const options: ParseOptions = {};
  if (input.format !== undefined) options.format = input.format;
  if (input.defaultProtocol !== undefined) options.defaultProtocol = input.defaultProtocol;

  if (input.text !== undefined && input.text.trim().length > 0) {
    return parseProxyText(input.text, options);
  }

  if (input.filePath) {
    return parseProxyFile(input.filePath, options);
  }

  return {
    items: [],
    errors: [{ line: 0, raw: '', reason: 'Neither text nor filePath was provided' }],
    totalLines: 0,
  };
}

/**
 * Deduplicates parsed proxy items based on protocol, host, port, and username.
 */
export function deduplicateParsedProxies(items: ParsedProxyItem[]): {
  unique: ParsedProxyItem[];
  duplicates: ParsedProxyItem[];
} {
  const seen = new Set<string>();
  const unique: ParsedProxyItem[] = [];
  const duplicates: ParsedProxyItem[] = [];

  for (const item of items) {
    const key = `${item.protocol.toLowerCase()}://${(item.username ?? '').toLowerCase()}@${item.host.toLowerCase()}:${item.port}`;
    if (seen.has(key)) {
      duplicates.push(item);
    } else {
      seen.add(key);
      unique.push(item);
    }
  }

  return { unique, duplicates };
}

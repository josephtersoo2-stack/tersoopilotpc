import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, afterEach } from 'vitest';

import { BrowserArgError, assertArgvInvariants, sanitizeAdditionalArgs } from '../src/engines/shared/argSanitizer';
import { buildArgs } from '../src/supervisor/buildArgs';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-argsec-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failure.
      }
    }
  }
});

describe('security: browser argument allowlist', () => {
  it('accepts allowlisted presentation flags', () => {
    expect(sanitizeAdditionalArgs(['--lang=en-US', '--window-size=800,600'])).toEqual([
      '--lang=en-US',
      '--window-size=800,600',
    ]);
  });

  it('rejects flags that would override isolation', () => {
    for (const flag of [
      '--user-data-dir=/tmp/evil',
      '--proxy-server=socks5://1.2.3.4:9050',
      '--remote-debugging-port=9333',
      '--load-extension=/tmp/evil-ext',
      '--disable-web-security',
      '--no-sandbox',
      '--allow-file-access-from-files',
    ]) {
      expect(() => sanitizeAdditionalArgs([flag])).toThrow(BrowserArgError);
    }
  });

  it('rejects an arbitrary unknown flag', () => {
    expect(() => sanitizeAdditionalArgs(['--incognito'])).toThrow(BrowserArgError);
  });

  it('rejects a positional that is a URL', () => {
    for (const pos of [
      'https://evil.example/phish',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
    ]) {
      expect(() => sanitizeAdditionalArgs([pos])).toThrow(BrowserArgError);
    }
  });

  it('rejects a positional path that does not exist', () => {
    const missing = path.join(makeTempDir(), 'not-here.js');
    expect(() => sanitizeAdditionalArgs([missing])).toThrow(BrowserArgError);
  });

  it('accepts an existing local file as a positional', () => {
    const file = path.join(makeTempDir(), 'start.js');
    fs.writeFileSync(file, '// dummy');
    expect(sanitizeAdditionalArgs([file])).toEqual([file]);
  });
});

describe('security: launch argv post-conditions', () => {
  it('never emits the wildcard CDP origin allowance', () => {
    const dir = makeTempDir();
    const args = buildArgs({
      profileId: 'p1',
      userDataDir: path.join(dir, 'p1'),
      forwarderPort: 1080,
    });
    expect(args.some((a) => a.startsWith('--remote-allow-origins'))).toBe(false);
  });

  it('keeps the debugging port on loopback only', () => {
    const dir = makeTempDir();
    const args = buildArgs({
      profileId: 'p1',
      userDataDir: path.join(dir, 'p1'),
      forwarderPort: 1080,
    });
    expect(args).toContain('--remote-debugging-port=0');
    expect(args).toContain('--remote-debugging-address=127.0.0.1');
  });

  it('carries the forwarder credential in the proxy URL', () => {
    const dir = makeTempDir();
    const args = buildArgs({
      profileId: 'p1',
      userDataDir: path.join(dir, 'p1'),
      forwarderPort: 1080,
      forwarderAuth: { username: 'tersoopilot', password: 'tok-123' },
    });
    const proxyArg = args.find((a) => a.startsWith('--proxy-server='));
    expect(proxyArg).toBe('--proxy-server=socks5://tersoopilot:tok-123@127.0.0.1:1080');
  });

  it('emits exactly one of each isolation-critical flag', () => {
    const dir = makeTempDir();
    const args = buildArgs({
      profileId: 'p1',
      userDataDir: path.join(dir, 'p1'),
      forwarderPort: 1080,
    });
    const countOf = (name: string): number =>
      args.filter((a) => a === name || a.startsWith(`${name}=`)).length;
    expect(countOf('--user-data-dir')).toBe(1);
    expect(countOf('--proxy-server')).toBe(1);
    expect(countOf('--disk-cache-dir')).toBe(1);
    expect(countOf('--remote-debugging-port')).toBe(1);
  });

  it('detects a duplicated owner flag', () => {
    expect(() =>
      assertArgvInvariants(['--user-data-dir=/a', '--user-data-dir=/b'], {
        ownedFlags: ['--user-data-dir'],
      }),
    ).toThrow(BrowserArgError);
  });
});

describe('security: forwarder refuses unauthenticated clients', () => {
  it('rejects a non-loopback bind', async () => {
    const { LocalForwarder } = await import('../src/proxy/LocalForwarder');
    const forwarder = new LocalForwarder();
    await expect(
      forwarder.start({
        upstream: { protocol: 'socks5', host: '127.0.0.1', port: 1 },
        bind: '0.0.0.0',
      }),
    ).rejects.toThrow(/non-loopback/);
  });

  it('mints a distinct token per instance', async () => {
    const { LocalForwarder } = await import('../src/proxy/LocalForwarder');
    const forwarder = new LocalForwarder();
    const upstream = { protocol: 'socks5' as const, host: '127.0.0.1', port: 1 };
    const a = await forwarder.start({ upstream });
    const b = await forwarder.start({ upstream });
    expect(a.credentials.password).not.toBe(b.credentials.password);
    expect(a.credentials.password.length).toBeGreaterThanOrEqual(32);
    expect(a.port).not.toBe(b.port);
    await forwarder.stopAll();
  });

  it('rejects a SOCKS5 client that offers no authentication', async () => {
    const { LocalForwarder } = await import('../src/proxy/LocalForwarder');
    const forwarder = new LocalForwarder();
    const handle = await forwarder.start({
      upstream: { protocol: 'socks5', host: '127.0.0.1', port: 1 },
    });

    const client = net.connect(handle.port, '127.0.0.1');
    const chunks: Buffer[] = [];
    const reply = new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 4000);
      client.on('data', (c: Buffer) => {
        chunks.push(c);
        const buf = Buffer.concat(chunks);
        if (buf.length >= 2) {
          clearTimeout(timer);
          resolve(buf);
        }
      });
      client.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });

    // Greeting offering only "no authentication" (0x00).
    client.write(Buffer.from([0x05, 0x01, 0x00]));

    const buf = await reply;
    // Server must answer 0x05 0xFF (no acceptable methods), not 0x05 0x00.
    expect(buf[0]).toBe(0x05);
    expect(buf[1]).toBe(0xff);

    client.destroy();
    await forwarder.stopAll();
  });
});

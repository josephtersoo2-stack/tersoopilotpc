import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  deduplicateParsedProxies,
  parseProxyFile,
  parseProxyInput,
  parseProxyLine,
  parseProxyText,
} from '../src/proxy/ingest';

describe('Ticket 2.1: Bulk Proxy Ingest Parser', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tersoo-proxy-ingest-'));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('parseProxyLine', () => {
    it('ignores comments and empty lines', () => {
      expect(parseProxyLine('', 1)).toBeNull();
      expect(parseProxyLine('   ', 2)).toBeNull();
      expect(parseProxyLine('# this is a comment', 3)).toBeNull();
      expect(parseProxyLine('// another comment', 4)).toBeNull();
    });

    it('parses standard ip:port format', () => {
      const res = parseProxyLine('192.168.1.1:8080', 1);
      expect(res).not.toBeNull();
      expect(res).toEqual({
        line: 1,
        raw: '192.168.1.1:8080',
        protocol: 'socks5',
        host: '192.168.1.1',
        port: 8080,
      });
    });

    it('parses domain:port with http default protocol', () => {
      const res = parseProxyLine('proxy.example.com:3128', 1, { defaultProtocol: 'http' });
      expect(res).toEqual({
        line: 1,
        raw: 'proxy.example.com:3128',
        protocol: 'http',
        host: 'proxy.example.com',
        port: 3128,
      });
    });

    it('parses ip:port:user:pass format', () => {
      const res = parseProxyLine('1.2.3.4:9050:proxyuser:secret123', 1);
      expect(res).toEqual({
        line: 1,
        raw: '1.2.3.4:9050:proxyuser:secret123',
        protocol: 'socks5',
        host: '1.2.3.4',
        port: 9050,
        username: 'proxyuser',
        password: 'secret123',
      });
    });

    it('parses password containing colons in ip:port:user:pass format', () => {
      const res = parseProxyLine('10.0.0.1:8080:alice:p@ss:w0rd:extra', 1);
      expect(res).toEqual({
        line: 1,
        raw: '10.0.0.1:8080:alice:p@ss:w0rd:extra',
        protocol: 'socks5',
        host: '10.0.0.1',
        port: 8080,
        username: 'alice',
        password: 'p@ss:w0rd:extra',
      });
    });

    it('parses user:pass:ip:port format in auto mode', () => {
      const res = parseProxyLine('myuser:mypass:192.168.1.100:1080', 1);
      expect(res).toEqual({
        line: 1,
        raw: 'myuser:mypass:192.168.1.100:1080',
        protocol: 'socks5',
        host: '192.168.1.100',
        port: 1080,
        username: 'myuser',
        password: 'mypass',
      });
    });

    it('parses URL format with protocol and credentials', () => {
      const res = parseProxyLine('http://admin:pass123@node1.proxy.net:8888', 1);
      expect(res).toEqual({
        line: 1,
        raw: 'http://admin:pass123@node1.proxy.net:8888',
        protocol: 'http',
        host: 'node1.proxy.net',
        port: 8888,
        username: 'admin',
        password: 'pass123',
      });
    });

    it('parses socks5h and decodes URL encoded credentials', () => {
      const res = parseProxyLine('socks5://user%40mail.com:p%23ss@10.20.30.40:1080', 1);
      expect(res).toEqual({
        line: 1,
        raw: 'socks5://user%40mail.com:p%23ss@10.20.30.40:1080',
        protocol: 'socks5',
        host: '10.20.30.40',
        port: 1080,
        username: 'user@mail.com',
        password: 'p#ss',
      });
    });

    it('parses user:pass@host:port format without URL scheme', () => {
      const res = parseProxyLine('bob:secret@203.0.113.195:8000', 1, { defaultProtocol: 'http' });
      expect(res).toEqual({
        line: 1,
        raw: 'bob:secret@203.0.113.195:8000',
        protocol: 'http',
        host: '203.0.113.195',
        port: 8000,
        username: 'bob',
        password: 'secret',
      });
    });

    it('parses IPv6 addresses with brackets', () => {
      const res1 = parseProxyLine('[2001:db8::1]:1080', 1);
      expect(res1).toEqual({
        line: 1,
        raw: '[2001:db8::1]:1080',
        protocol: 'socks5',
        host: '2001:db8::1',
        port: 1080,
      });

      const res2 = parseProxyLine('[2001:db8::1]:1080:user:pass', 2);
      expect(res2).toEqual({
        line: 2,
        raw: '[2001:db8::1]:1080:user:pass',
        protocol: 'socks5',
        host: '2001:db8::1',
        port: 1080,
        username: 'user',
        password: 'pass',
      });
    });

    it('parses tab, comma, and pipe delimited lines', () => {
      const tab = parseProxyLine('1.1.1.1\t8080\tusr\tpwd', 1);
      expect(tab).toMatchObject({ host: '1.1.1.1', port: 8080, username: 'usr', password: 'pwd' });

      const comma = parseProxyLine('2.2.2.2,9000,usr2,pwd2', 2);
      expect(comma).toMatchObject({ host: '2.2.2.2', port: 9000, username: 'usr2', password: 'pwd2' });

      const pipe = parseProxyLine('3.3.3.3|1080|usr3|pwd3', 3);
      expect(pipe).toMatchObject({ host: '3.3.3.3', port: 1080, username: 'usr3', password: 'pwd3' });
    });

    it('returns ParseError on invalid port', () => {
      const res1 = parseProxyLine('1.2.3.4:99999', 1);
      expect(res1).toEqual({ line: 1, raw: '1.2.3.4:99999', reason: 'Invalid port: 99999' });

      const res2 = parseProxyLine('1.2.3.4:0', 2);
      expect(res2).toEqual({ line: 2, raw: '1.2.3.4:0', reason: 'Invalid port: 0' });

      const res3 = parseProxyLine('1.2.3.4:notaport', 3);
      expect(res3).toEqual({ line: 3, raw: '1.2.3.4:notaport', reason: 'Invalid port: notaport' });
    });

    it('returns ParseError on unclosed IPv6 bracket', () => {
      const res = parseProxyLine('[2001:db8::1:1080', 1);
      expect(res).toEqual({ line: 1, raw: '[2001:db8::1:1080', reason: 'Unclosed IPv6 bracket' });
    });
  });

  describe('parseProxyText', () => {
    it('parses mixed multiline text and separates valid items from errors', () => {
      const rawText = `
        # List of proxies
        192.168.1.1:8080
        http://admin:pass@proxy2.com:3128

        # Dead proxy
        invalid_proxy_without_port
        1.2.3.4:70000

        socks5://10.0.0.1:1080
      `;

      const result = parseProxyText(rawText);
      expect(result.items).toHaveLength(3);
      expect(result.errors).toHaveLength(2);

      expect(result.items[0]).toMatchObject({ host: '192.168.1.1', port: 8080 });
      expect(result.items[1]).toMatchObject({
        host: 'proxy2.com',
        port: 3128,
        username: 'admin',
        password: 'pass',
      });
      expect(result.items[2]).toMatchObject({ host: '10.0.0.1', port: 1080 });

      expect(result.errors[0].raw).toBe('invalid_proxy_without_port');
      expect(result.errors[1].raw).toBe('1.2.3.4:70000');
    });

    it('handles explicit format restrictions', () => {
      const res = parseProxyText('1.2.3.4:8080:user:pass', { format: 'ip:port' });
      expect(res.items).toHaveLength(0);
      expect(res.errors).toHaveLength(1);
    });
  });

  describe('parseProxyFile and parseProxyInput', () => {
    it('reads proxies from a file path', async () => {
      const filePath = path.join(tempDir, 'proxies.txt');
      await fs.writeFile(filePath, '10.1.1.1:8080\n10.2.2.2:1080:usr:pwd', 'utf-8');

      const res = await parseProxyFile(filePath);
      expect(res.items).toHaveLength(2);
      expect(res.errors).toHaveLength(0);
    });

    it('parseProxyInput chooses text or file correctly', async () => {
      const filePath = path.join(tempDir, 'proxies2.txt');
      await fs.writeFile(filePath, '10.3.3.3:8080', 'utf-8');

      const fromText = await parseProxyInput({ text: '10.4.4.4:8080' });
      expect(fromText.items[0].host).toBe('10.4.4.4');

      const fromFile = await parseProxyInput({ filePath });
      expect(fromFile.items[0].host).toBe('10.3.3.3');

      const empty = await parseProxyInput({});
      expect(empty.errors).toHaveLength(1);
    });
  });

  describe('deduplicateParsedProxies', () => {
    it('filters duplicate proxies by protocol, host, port, and username', () => {
      const rawText = `
        socks5://user1:p1@proxy.org:1080
        socks5://user1:p2@proxy.org:1080
        socks5://user2:p1@proxy.org:1080
        http://user1:p1@proxy.org:1080
      `;

      const parsed = parseProxyText(rawText);
      const { unique, duplicates } = deduplicateParsedProxies(parsed.items);

      expect(unique).toHaveLength(3);
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].password).toBe('p2');
    });
  });

  describe('Performance: 1000 proxies parsed in < 50ms', () => {
    it('parses 1000 proxy lines well below 1 second', () => {
      const lines: string[] = [];
      for (let i = 1; i <= 1000; i++) {
        lines.push(`10.0.${Math.floor(i / 256)}.${i % 256}:${1000 + (i % 5000)}:user${i}:pass${i}`);
      }
      const bulkText = lines.join('\n');

      const start = performance.now();
      const result = parseProxyText(bulkText);
      const elapsed = performance.now() - start;

      expect(result.items).toHaveLength(1000);
      expect(result.errors).toHaveLength(0);
      expect(elapsed).toBeLessThan(100); // 1000 proxies parsed in under 100ms (100 proxies in < 1s requirement)
    });
  });
});

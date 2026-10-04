import {
  DEFAULT_PRESET_IDS,
  type CommandInput,
  type CommandName,
  type CommandOutput,
  type EventName,
  type EventPayload,
  type FingerprintBundle,
  type HealthResult,
  type ImportReport,
  type LeaseSummary,
  type ProfileCreateInput,
  type ProfileDetail,
  type ProfileSummary,
  type ProxySummary,
} from '@tersoo/contracts';

import type { TersooApi } from '../types/window';

interface FilterQuery {
  search?: string;
  platform?: string;
  state?: string;
  tag?: string;
  tags?: string[];
}

function createBundle(
  platform: 'windows' | 'macos' | 'android',
  seed: string,
): FingerprintBundle {
  const isAndroid = platform === 'android';
  const isMac = platform === 'macos';

  return {
    seed,
    platform,
    userAgent: isAndroid
      ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'
      : isMac
        ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    uaMetadata: {
      brands: [
        { brand: 'Chromium', version: '128' },
        { brand: 'Not;A=Brand', version: '24' },
      ],
      platform: isAndroid ? 'Android' : isMac ? 'macOS' : 'Windows',
      platformVersion: isAndroid ? '14.0.0' : isMac ? '14.5.0' : '15.0.0',
      architecture: isAndroid ? 'arm64' : isMac ? 'arm64' : 'x86_64',
      model: isAndroid ? 'Pixel 8 Pro' : '',
      mobile: isAndroid,
    },
    screen: {
      width: isAndroid ? 412 : isMac ? 1728 : 1920,
      height: isAndroid ? 915 : isMac ? 1117 : 1080,
      availWidth: isAndroid ? 412 : isMac ? 1728 : 1920,
      availHeight: isAndroid ? 891 : isMac ? 1079 : 1040,
      colorDepth: 24,
      dpr: isAndroid ? 2.625 : isMac ? 2.0 : 1.0,
    },
    webgl: {
      vendor: isAndroid ? 'Qualcomm' : isMac ? 'Apple' : 'Google Inc. (NVIDIA)',
      renderer: isAndroid
        ? 'Adreno (TM) 750'
        : isMac
          ? 'Apple M3 Pro'
          : 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11)',
      unmaskedVendor: isAndroid ? 'Qualcomm' : isMac ? 'Apple' : 'Google Inc. (NVIDIA)',
      unmaskedRenderer: isAndroid
        ? 'Qualcomm / Adreno (TM) 750'
        : isMac
          ? 'Apple / ANGLE (Apple, Apple M3 Pro, OpenGL 4.1)'
          : 'NVIDIA Corporation / NVIDIA GeForce RTX 4090 Direct3D11',
    },
    canvasNoise: {
      enabled: true,
      algorithm: 'perlin',
      intensity: 0.15,
    },
    audioNoise: {
      enabled: true,
      algorithm: 'gaussian',
      intensity: 0.08,
    },
    hardware: {
      cores: isAndroid ? 8 : 16,
      memoryGb: isAndroid ? 8 : 32,
      maxTouchPoints: isAndroid ? 5 : 0,
    },
    locales: {
      languages: isAndroid ? ['en-US', 'en'] : ['en-US', 'en-GB'],
      acceptLanguage: 'en-US,en;q=0.9',
    },
    timezone: 'America/New_York',
    geolocation: {
      lat: 40.7128,
      lng: -74.006,
      accuracy: 15,
    },
    webrtcPolicy: 'disable_non_proxied_udp',
    webdriverHidden: true,
  };
}

export function installDevMockBridge(): void {
  if (typeof window === 'undefined' || window.tersoo) {
    return;
  }

  // eslint-disable-next-line no-console
  console.info('[Tersoo Dev] Initializing standalone browser mock IPC bridge.');

  const listeners = new Map<string, Set<(payload: unknown) => void>>();

  const emit = (event: string, payload: unknown) => {
    const set = listeners.get(event);
    if (set) {
      set.forEach((fn) => fn(payload));
    }
  };

  const mockProfiles: ProfileSummary[] = [
    {
      id: 'e3a89047-97d8-4f24-9b55-d3c631c50001',
      name: 'Pixel 8 Pro #04 (US Mobile)',
      tags: ['farming', 'us-east'],
      presetId: DEFAULT_PRESET_IDS.android14,
      state: 'running',
      platform: 'android',
      engine: 'apostate',
      captchaBudgetUsed: 1,
      proxyId: 'prx-residential-01',
      lastLaunchedAt: Date.now() - 45000,
      createdAt: Date.now() - 86400000 * 3,
      updatedAt: Date.now() - 45000,
    },
    {
      id: 'e3a89047-97d8-4f24-9b55-d3c631c50002',
      name: 'Win11 Workstation Pro (Banking)',
      tags: ['banking', 'secure'],
      presetId: DEFAULT_PRESET_IDS.windows11,
      state: 'idle',
      platform: 'windows',
      engine: 'apostate',
      captchaBudgetUsed: 0,
      proxyId: 'prx-dedicated-us',
      lastLaunchedAt: Date.now() - 3600000 * 2,
      createdAt: Date.now() - 86400000 * 5,
      updatedAt: Date.now() - 3600000 * 2,
    },
    {
      id: 'e3a89047-97d8-4f24-9b55-d3c631c50003',
      name: 'macOS Sonoma Studio (Crypto Tier 1)',
      tags: ['crypto', 'vip'],
      presetId: DEFAULT_PRESET_IDS.macosSonoma,
      state: 'idle',
      platform: 'macos',
      engine: 'camoufox',
      captchaBudgetUsed: 2,
      proxyId: 'prx-eu-central',
      lastLaunchedAt: Date.now() - 86400000,
      createdAt: Date.now() - 86400000 * 7,
      updatedAt: Date.now() - 86400000,
    },
    {
      id: 'e3a89047-97d8-4f24-9b55-d3c631c50004',
      name: 'Pixel 8 Pro #09 (Ad Research)',
      tags: ['ad-spying', 'mobile'],
      presetId: DEFAULT_PRESET_IDS.android14,
      state: 'idle',
      platform: 'android',
      engine: 'apostate',
      captchaBudgetUsed: 0,
      proxyId: null,
      lastLaunchedAt: null,
      createdAt: Date.now() - 86400000 * 2,
      updatedAt: Date.now() - 86400000 * 2,
    },
    {
      id: 'e3a89047-97d8-4f24-9b55-d3c631c50005',
      name: 'Win11 E-Commerce Lead Bot',
      tags: ['e-commerce', 'automation'],
      presetId: DEFAULT_PRESET_IDS.windows11,
      state: 'crashed',
      platform: 'windows',
      engine: 'camoufox',
      captchaBudgetUsed: 0,
      proxyId: 'prx-residential-de',
      lastLaunchedAt: Date.now() - 3600000 * 12,
      createdAt: Date.now() - 86400000 * 10,
      updatedAt: Date.now() - 3600000 * 12,
    },
  ];

  const profileDetails = new Map<string, ProfileDetail>();

  mockProfiles.forEach((p) => {
    profileDetails.set(p.id, {
      ...p,
      fingerprintSeed: `seed-${p.id.slice(0, 8)}`,
      fingerprintBundle: createBundle(
        p.platform as 'windows' | 'macos' | 'android',
        `seed-${p.id.slice(0, 8)}`,
      ),
      userDataDir: `C:\\Users\\AppData\\Roaming\\tersoopilot\\profiles\\${p.id}`,
      notes: `Dedicated profile for ${p.tags.join(', ')} workflows. Coherent anti-detect preset.`,
    });
  });

  const mockProxies: ProxySummary[] = [
    {
      id: 'f1a89047-97d8-4f24-9b55-d3c631c50001',
      protocol: 'socks5',
      host: '198.51.100.42',
      port: 1080,
      username: 'resi_us_pool',
      geoCountry: 'US',
      geoCity: 'Ashburn',
      geoTz: 'America/New_York',
      geoIsp: 'Cogent Communications',
      exitIp: '198.51.100.42',
      status: 'healthy',
      statusReason: null,
      lastCheckedAt: Date.now() - 120000,
      lastLatencyMs: 38,
      createdAt: Date.now() - 86400000 * 4,
    },
    {
      id: 'f1a89047-97d8-4f24-9b55-d3c631c50002',
      protocol: 'http',
      host: '185.190.140.22',
      port: 8080,
      username: 'eu_mobile_04',
      geoCountry: 'DE',
      geoCity: 'Frankfurt',
      geoTz: 'Europe/Berlin',
      geoIsp: 'Deutsche Telekom AG',
      exitIp: '185.190.140.22',
      status: 'healthy',
      statusReason: null,
      lastCheckedAt: Date.now() - 300000,
      lastLatencyMs: 74,
      createdAt: Date.now() - 86400000 * 2,
    },
    {
      id: 'f1a89047-97d8-4f24-9b55-d3c631c50003',
      protocol: 'socks5',
      host: '103.152.112.50',
      port: 1080,
      username: 'ap_datacenter',
      geoCountry: 'JP',
      geoCity: 'Tokyo',
      geoTz: 'Asia/Tokyo',
      geoIsp: 'SoftBank Corp.',
      exitIp: '103.152.112.50',
      status: 'slow',
      statusReason: 'High latency (2740ms)',
      lastCheckedAt: Date.now() - 600000,
      lastLatencyMs: 2740,
      createdAt: Date.now() - 86400000,
    },
    {
      id: 'f1a89047-97d8-4f24-9b55-d3c631c50004',
      protocol: 'https',
      host: '194.26.29.11',
      port: 8443,
      username: 'uk_dedicated',
      geoCountry: 'GB',
      geoCity: 'London',
      geoTz: 'Europe/London',
      geoIsp: 'British Telecommunications',
      exitIp: '194.26.29.11',
      status: 'healthy',
      statusReason: null,
      lastCheckedAt: Date.now() - 45000,
      lastLatencyMs: 52,
      createdAt: Date.now() - 86400000 * 6,
    },
    {
      id: 'f1a89047-97d8-4f24-9b55-d3c631c50005',
      protocol: 'socks5',
      host: '45.138.16.89',
      port: 1080,
      username: 'auth_expired',
      geoCountry: 'CA',
      geoCity: 'Montreal',
      geoTz: 'America/Toronto',
      geoIsp: 'OVH SAS',
      exitIp: null,
      status: 'auth_error',
      statusReason: '407 Proxy Authentication Required',
      lastCheckedAt: Date.now() - 900000,
      lastLatencyMs: null,
      createdAt: Date.now() - 86400000 * 5,
    },
    {
      id: 'f1a89047-97d8-4f24-9b55-d3c631c50006',
      protocol: 'http',
      host: '203.0.113.88',
      port: 3128,
      username: null,
      geoCountry: 'US',
      geoCity: 'Dallas',
      geoTz: 'America/Chicago',
      geoIsp: 'AT&T Services',
      exitIp: null,
      status: 'dead',
      statusReason: 'Connection refused (ECONNREFUSED)',
      lastCheckedAt: Date.now() - 1800000,
      lastLatencyMs: null,
      createdAt: Date.now() - 86400000 * 10,
    },
  ];

  const mockLeases = new Map<string, LeaseSummary>();
  // Active lease for profile 1
  mockLeases.set('e3a89047-97d8-4f24-9b55-d3c631c50001', {
    id: 'lse-11111111-1111-1111-1111-111111111001',
    proxyId: 'f1a89047-97d8-4f24-9b55-d3c631c50001',
    profileId: 'e3a89047-97d8-4f24-9b55-d3c631c50001',
    state: 'active',
    acquiredAt: Date.now() - 1800000,
    expiresAt: Date.now() + 1800000,
    heartbeatAt: Date.now() - 10000,
  });

  const api: TersooApi = {
    invoke: async <C extends CommandName>(
      channel: C,
      input?: CommandInput<C>,
    ): Promise<CommandOutput<C>> => {
      // Simulate real IPC asynchronous roundtrip latency
      await new Promise((resolve) => setTimeout(resolve, 15));

      // eslint-disable-next-line no-console
      console.log(`[IPC Mock Invoke] ${channel}`, input);

      if (channel === 'profile.list') {
        const query = (input as { filter?: FilterQuery } | undefined)?.filter;
        let list = [...mockProfiles];

        if (query?.search) {
          const s = query.search.toLowerCase();
          list = list.filter((p) => p.name.toLowerCase().includes(s));
        }
        if (query?.platform && query.platform !== 'all') {
          list = list.filter((p) => p.platform === query.platform);
        }
        if (query?.state && query.state !== 'all') {
          list = list.filter((p) => p.state === query.state);
        }
        if (query?.tag && query.tag !== 'all') {
          list = list.filter((p) => p.tags.includes(query.tag!));
        }
        return list;
      }

      if (channel === 'profile.get') {
        const { id } = (input ?? {}) as { id: string };
        const found = profileDetails.get(id);
        if (!found) {
          throw new Error(`Profile ${id} not found`);
        }
        return found;
      }

      if (channel === 'profile.create') {
        const createInput = input as ProfileCreateInput;
        const newId = `e3a89047-97d8-4f24-9b55-d3c631c5000${mockProfiles.length + 1}`;
        const platform =
          createInput.presetId === DEFAULT_PRESET_IDS.android14
            ? 'android'
            : createInput.presetId === DEFAULT_PRESET_IDS.macosSonoma
              ? 'macos'
              : 'windows';

        const newProfile: ProfileSummary = {
          id: newId,
          name: createInput.name,
          tags: createInput.tags ?? ['custom'],
          presetId: createInput.presetId,
          state: 'idle',
          platform,
          engine: createInput.engine ?? 'apostate',
          captchaBudgetUsed: 0,
          proxyId: null,
          lastLaunchedAt: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        mockProfiles.unshift(newProfile);

        const newDetail: ProfileDetail = {
          ...newProfile,
          fingerprintSeed: `seed-${newId.slice(0, 8)}`,
          fingerprintBundle: createBundle(platform, `seed-${newId.slice(0, 8)}`),
          userDataDir: `C:\\Users\\AppData\\Roaming\\tersoopilot\\profiles\\${newId}`,
          notes: createInput.notes ?? 'Newly created profile',
        };

        profileDetails.set(newId, newDetail);
        emit('profile.state_changed', { profileId: newId, state: 'idle' });
        return newDetail;
      }

      if (channel === 'profile.update') {
        const { id, patch } = input as { id: string; patch: Partial<ProfileDetail> };
        const summary = mockProfiles.find((p) => p.id === id);
        const detail = profileDetails.get(id);
        if (summary) {
          if (patch.name) summary.name = patch.name;
          if (patch.tags) summary.tags = patch.tags;
          summary.updatedAt = Date.now();
        }
        if (detail) {
          Object.assign(detail, patch, { updatedAt: Date.now() });
        }
        return detail;
      }

      if (channel === 'profile.delete') {
        const { id } = input as { id: string };
        const idx = mockProfiles.findIndex((p) => p.id === id);
        if (idx !== -1) mockProfiles.splice(idx, 1);
        profileDetails.delete(id);
        return undefined as unknown as CommandOutput<C>;
      }

      if (channel === 'profile.launch') {
        const { id } = input as { id: string };
        const summary = mockProfiles.find((p) => p.id === id);
        if (summary) {
          summary.state = 'running';
          summary.lastLaunchedAt = Date.now();
        }
        emit('profile.state_changed', { profileId: id, state: 'running' });
        return undefined as unknown as CommandOutput<C>;
      }

      if (channel === 'profile.stop') {
        const { id } = input as { id: string };
        const summary = mockProfiles.find((p) => p.id === id);
        if (summary) {
          summary.state = 'idle';
        }
        emit('profile.state_changed', { profileId: id, state: 'idle' });
        return undefined as unknown as CommandOutput<C>;
      }

      if (channel === 'proxy.list') {
        const query = (input as { filter?: { protocol?: string; status?: string; search?: string } } | undefined)?.filter;
        let list = [...mockProxies];
        if (query?.protocol && query.protocol !== 'all') {
          list = list.filter((p) => p.protocol === query.protocol);
        }
        if (query?.status && query.status !== 'all') {
          list = list.filter((p) => p.status === query.status);
        }
        if (query?.search) {
          const s = query.search.toLowerCase();
          list = list.filter(
            (p) =>
              p.host.toLowerCase().includes(s) ||
              (p.username && p.username.toLowerCase().includes(s)) ||
              (p.geoCountry && p.geoCountry.toLowerCase().includes(s)) ||
              (p.geoCity && p.geoCity.toLowerCase().includes(s)) ||
              (p.geoIsp && p.geoIsp.toLowerCase().includes(s)),
          );
        }
        return list;
      }

      if (channel === 'proxy.create') {
        const createInput = input as { protocol: 'socks5' | 'http' | 'https'; host: string; port: number; username?: string; password?: string };
        const id = `f1a89047-${Date.now().toString(16).slice(-12)}`;
        const newProxy: ProxySummary = {
          id,
          protocol: createInput.protocol,
          host: createInput.host,
          port: createInput.port,
          username: createInput.username ?? null,
          geoCountry: 'US',
          geoCity: 'New York',
          geoTz: 'America/New_York',
          geoIsp: 'Local Host ISP',
          exitIp: createInput.host,
          status: 'unknown',
          statusReason: null,
          lastCheckedAt: null,
          lastLatencyMs: null,
          createdAt: Date.now(),
        };
        mockProxies.unshift(newProxy);
        return newProxy;
      }

      if (channel === 'proxy.importBulk') {
        const bulkInput = input as { text?: string; filePath?: string; format?: string };
        const lines = (bulkInput.text ?? '').split('\n').filter((l) => l.trim().length > 0 && !l.trim().startsWith('#'));
        let imported = 0;
        let skipped = 0;
        const errors: Array<{ line: number; reason: string }> = [];

        lines.forEach((line, idx) => {
          try {
            const cleaned = line.trim();
            let proto: 'socks5' | 'http' | 'https' = 'socks5';
            let host = '';
            let port = 1080;
            let username: string | null = null;

            if (cleaned.includes('://')) {
              const u = new URL(cleaned);
              proto = u.protocol.replace(':', '') as 'socks5' | 'http' | 'https';
              host = u.hostname;
              port = Number(u.port) || 1080;
              username = u.username || null;
            } else {
              const parts = cleaned.split(':');
              if (parts.length >= 2) {
                host = parts[0]!;
                port = parseInt(parts[1]!, 10);
                if (parts.length >= 4) {
                  username = parts[2]!;
                }
              } else {
                throw new Error('Invalid format');
              }
            }

            if (!host || isNaN(port)) throw new Error('Invalid host or port');

            if (mockProxies.some((p) => p.host === host && p.port === port && p.protocol === proto)) {
              skipped++;
            } else {
              const id = `f1a89047-${(Date.now() + idx).toString(16).slice(-12)}`;
              mockProxies.unshift({
                id,
                protocol: proto,
                host,
                port,
                username,
                geoCountry: 'US',
                geoCity: 'Chicago',
                geoTz: 'America/Chicago',
                geoIsp: 'Imported ISP',
                exitIp: host,
                status: 'unknown',
                statusReason: null,
                lastCheckedAt: null,
                lastLatencyMs: null,
                createdAt: Date.now(),
              });
              imported++;
            }
          } catch (e: unknown) {
            errors.push({ line: idx + 1, reason: (e as Error).message });
          }
        });

        const report: ImportReport = {
          parsed: lines.length - errors.length,
          imported,
          skipped,
          errors,
        };
        return report;
      }

      if (channel === 'proxy.check') {
        const { id } = input as { id: string };
        const prx = mockProxies.find((p) => p.id === id);
        const lat = Math.floor(25 + Math.random() * 150);
        if (prx) {
          prx.status = 'healthy';
          prx.lastLatencyMs = lat;
          prx.lastCheckedAt = Date.now();
        }
        emit('proxy.health_changed', { proxyId: id, status: 'healthy' });
        const res: HealthResult = {
          proxyId: id,
          ok: true,
          latencyMs: lat,
          exitIp: prx?.host ?? '198.51.100.42',
          geo: {
            country: prx?.geoCountry ?? 'US',
            city: prx?.geoCity ?? 'Ashburn',
            tz: prx?.geoTz ?? 'America/New_York',
            isp: prx?.geoIsp ?? 'Cogent Communications',
            lat: 39.0438,
            lng: -77.4874,
          },
          webrtcSafe: true,
          dnsSafe: true,
          error: null,
        };
        return res;
      }

      if (channel === 'proxy.assign') {
        const { profileId, proxyId } = input as { profileId: string; proxyId?: string; strategy: 'manual' | 'random' };
        const targetId = proxyId ?? mockProxies.find((p) => p.status === 'healthy')?.id ?? mockProxies[0]!.id;
        const lease: LeaseSummary = {
          id: `lse-${Date.now().toString(16)}`,
          profileId,
          proxyId: targetId,
          state: 'active',
          acquiredAt: Date.now(),
          expiresAt: Date.now() + 3600000,
          heartbeatAt: Date.now(),
        };
        mockLeases.set(profileId, lease);
        const prof = mockProfiles.find((p) => p.id === profileId);
        if (prof) prof.proxyId = targetId;
        emit('lease.acquired', lease);
        return lease;
      }

      if (channel === 'proxy.release') {
        const { profileId } = input as { profileId: string };
        const existing = mockLeases.get(profileId);
        if (existing) {
          mockLeases.delete(profileId);
          const prof = mockProfiles.find((p) => p.id === profileId);
          if (prof) prof.proxyId = null;
          emit('lease.released', { leaseId: existing.id, profileId });
        }
        return undefined;
      }

      if (channel === 'proxy.swap') {
        const { profileId } = input as { profileId: string };
        const existing = mockLeases.get(profileId);
        const candidates = mockProxies.filter((p) => p.id !== existing?.proxyId && (p.status === 'healthy' || p.status === 'unknown'));
        const next = candidates[0] ?? mockProxies[0]!;
        const newLease: LeaseSummary = {
          id: `lse-${Date.now().toString(16)}`,
          profileId,
          proxyId: next.id,
          state: 'active',
          acquiredAt: Date.now(),
          expiresAt: Date.now() + 3600000,
          heartbeatAt: Date.now(),
        };
        mockLeases.set(profileId, newLease);
        const prof = mockProfiles.find((p) => p.id === profileId);
        if (prof) prof.proxyId = next.id;
        emit('lease.acquired', newLease);
        return newLease;
      }

      if (channel === 'proxy.delete') {
        const { id } = input as { id: string };
        const idx = mockProxies.findIndex((p) => p.id === id);
        if (idx !== -1) {
          mockProxies.splice(idx, 1);
        }
        return undefined as unknown as CommandOutput<C>;
      }

      if (channel === 'fleet.status') {
        const runningProfiles = mockProfiles.filter((p) => p.state === 'running');
        const healthyProxies = mockProxies.filter((p) => p.status === 'healthy');
        return {
          running: runningProfiles.length,
          idle: mockProfiles.length - runningProfiles.length,
          instances: runningProfiles.length,
          activeInstances: runningProfiles.length,
          runningProfiles: runningProfiles.map((p) => p.id),
          leasesActive: 0,
          forwardersBound: 0,
          runningRuns: 0,
          proxiesTotal: mockProxies.length,
          proxiesHealthy: healthyProxies.length,
        } as unknown as CommandOutput<C>;
      }

      if (channel === 'engine.list') {
        return ['apostate', 'camoufox'] as unknown as CommandOutput<C>;
      }

      if (channel === 'engine.config.get') {
        const { engine } = input as { engine: 'apostate' | 'camoufox' };
        return {
          engine,
          launch_options: '{}',
        } as unknown as CommandOutput<C>;
      }

      if (channel === 'engine.config.set') {
        return undefined as unknown as CommandOutput<C>;
      }

      if (channel === 'llm.config.get') {
        return {
          provider: 'openrouter',
          text_model: 'google/gemini-2.5-flash',
          vision_model: 'google/gemini-2.5-flash',
          api_key_ref: 'OPENROUTER_API_KEY',
          max_attempts: 3,
          backoff_ms: 'exponential',
          vision_enabled: 1,
        } as unknown as CommandOutput<C>;
      }

      if (channel === 'llm.config.set') {
        return undefined as unknown as CommandOutput<C>;
      }

      if (channel === 'llm.test') {
        const pIn = (input ?? {}) as { prompt?: string; provider?: string; model?: string };
        return {
          ok: true,
          latencyMs: 135,
          response: `Mock LLM response for: "${pIn.prompt || 'Ping'}" - Dual-engine reasoning active.`,
          provider: pIn.provider || 'openrouter',
          model: pIn.model || 'google/gemini-2.5-flash',
        } as unknown as CommandOutput<C>;
      }

      if (channel === 'voice.settings.get') {
        return {
          sttModel: 'openai/whisper-large-v3',
          sttLanguage: null,
          ttsModel: 'mistralai/voxtral-mini-tts-2603',
          ttsVoice: 'en_paul_neutral',
          autoSpeak: true,
          wakeWordEnabled: true,
          wakeWordModel: 'hey_tersoo',
          wakeWordThreshold: 0.6,
          greetingText: 'Yes, how can I help?',
          commandMaxDurationMs: 17000,
          commandSilenceStopMs: 1200,
        } as unknown as CommandOutput<C>;
      }

      if (channel === 'voice.settings.set') {
        return input as unknown as CommandOutput<C>;
      }

      if (channel === 'voice.cost_summary') {
        return {
          sttCostUsd: 0.0412,
          ttsRequests: 28,
          sttRequests: 34,
          totalAudioMs: 184000,
        } as unknown as CommandOutput<C>;
      }

      if (channel === 'voice.models.list') {
        return {
          sttModels: [
            { id: 'openai/whisper-large-v3', name: '[STT] OpenAI: Whisper Large V3', description: 'Multilingual speech recognition', category: 'stt', supportedVoices: [] },
            { id: 'openai/whisper-large-v3-turbo', name: '[STT] OpenAI: Whisper Large V3 Turbo', description: 'Fast speech recognition', category: 'stt', supportedVoices: [] },
            { id: 'mistralai/voxtral-mini-transcribe', name: '[STT] Mistral: Voxtral Mini Transcribe', description: 'Low latency transcription', category: 'stt', supportedVoices: [] },
            { id: 'deepgram/nova-3', name: '[STT] Deepgram: Nova-3', description: 'Real-time STT', category: 'stt', supportedVoices: [] },
            { id: 'openai/gpt-audio-mini', name: '[STT] OpenAI: GPT Audio Mini', description: 'Audio input transcription', category: 'stt', supportedVoices: [] },
          ],
          ttsModels: [
            { id: 'mistralai/voxtral-mini-tts-2603', name: '[TTS] Mistral: Voxtral Mini TTS', description: 'Neural voice synthesis', category: 'tts', supportedVoices: ['en_paul_neutral', 'en_paul_happy', 'en_paul_excited', 'gb_oliver_neutral', 'gb_jane_neutral', 'fr_marie_neutral'] },
            { id: 'hexgrad/kokoro-82m', name: '[TTS] hexgrad: Kokoro 82M', description: 'Lightweight TTS', category: 'tts', supportedVoices: ['af_alloy', 'af_aoede', 'af_bella', 'af_heart', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sky'] },
            { id: 'google/lyria-3-pro-preview', name: '[TTS] Google: Lyria 3 Pro Preview', description: 'Google neural speech synthesis', category: 'tts', supportedVoices: ['default', 'warm', 'expressive'] },
            { id: 'openai/gpt-audio', name: '[TTS] OpenAI: GPT Audio', description: 'Neural speech output', category: 'tts', supportedVoices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] },
          ],
        } as unknown as CommandOutput<C>;
      }

      if (channel === 'voice.test_connection') {
        const vIn = (input ?? {}) as any;
        return {
          success: true,
          latencyMs: 185,
          sttModelsCount: 5,
          ttsModelsCount: 4,
          sttModel: vIn.sttModel || 'openai/whisper-large-v3',
          ttsModel: vIn.ttsModel || 'mistralai/voxtral-mini-tts-2603',
          message: 'Voice connection verified successfully! (185ms)',
          details: {
            openrouterConnected: true,
            sttVerified: true,
            ttsVerified: true,
            sttMessage: `STT model [${vIn.sttModel || 'openai/whisper-large-v3'}] verified.`,
            ttsMessage: `TTS model [${vIn.ttsModel || 'mistralai/voxtral-mini-tts-2603'}] verified.`,
          },
        } as unknown as CommandOutput<C>;
      }

      if (channel === 'voice.speak') {
        return {
          audio: '',
          format: 'mp3',
          durationMs: 1200,
        } as unknown as CommandOutput<C>;
      }

      if (channel === 'captcha.events.list') {
        return [] as unknown as CommandOutput<C>;
      }

      if (channel === 'captcha.budget.get') {
        const { profileId } = input as { profileId: string };
        const p = mockProfiles.find((item) => item.id === profileId);
        return {
          used: p?.captchaBudgetUsed ?? 0,
          budget: 3,
        } as unknown as CommandOutput<C>;
      }

      if (channel === 'settings.weights.get') {
        return { apostate: 70, camoufox: 30 } as unknown as CommandOutput<C>;
      }

      if (channel === 'settings.weights.set') {
        return undefined as unknown as CommandOutput<C>;
      }

      if (channel === 'profile.bulkCreate') {
        const bulkInput = input as {
          count: number;
          presetId: string;
          engineDistribution:
            | { mode: 'single'; engine: 'apostate' | 'camoufox' }
            | { mode: 'mixed'; weights: { apostate: number; camoufox: number } };
          tags?: string[];
        };
        const createdList: ProfileSummary[] = [];
        const apostateCount =
          bulkInput.engineDistribution.mode === 'single'
            ? bulkInput.engineDistribution.engine === 'apostate'
              ? bulkInput.count
              : 0
            : Math.round((bulkInput.count * bulkInput.engineDistribution.weights.apostate) / 100);

        for (let i = 0; i < bulkInput.count; i++) {
          const eng = i < apostateCount ? 'apostate' : 'camoufox';
          const newId = `e3a89047-97d8-4f24-9b55-bulk${Date.now()}-${i}`;
          const newProf: ProfileSummary = {
            id: newId,
            name: `Bulk Profile #${mockProfiles.length + 1}`,
            tags: bulkInput.tags ?? ['bulk'],
            presetId: bulkInput.presetId,
            state: 'idle',
            platform: 'windows',
            engine: eng,
            captchaBudgetUsed: 0,
            proxyId: null,
            lastLaunchedAt: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          mockProfiles.unshift(newProf);
          createdList.push(newProf);
        }
        return createdList as unknown as CommandOutput<C>;
      }

      if (channel === 'run.list') {
        return [
          {
            id: 'run-91823746-1234',
            taskId: '00000000-0000-4000-8000-000000000001',
            profileId: mockProfiles[0]!.id,
            state: 'succeeded',
            attempt: 1,
            startedAt: Date.now() - 3600000,
            finishedAt: Date.now() - 3550000,
            errorClass: null,
            errorMessage: null,
          },
        ] as unknown as CommandOutput<C>;
      }

      if (channel === 'run.cancel' || channel === 'run.resume') {
        return undefined as unknown as CommandOutput<C>;
      }

      // ─── Voice Mock IPC Handlers ──────────────────────────────────────────
      if (channel === 'voice.settings.get') {
        return {
          sttModel: 'openai/whisper-large-v3',
          sttLanguage: null,
          ttsModel: 'mistralai/voxtral-mini-tts-2603',
          ttsVoice: 'en_paul_neutral',
          autoSpeak: true,
          wakeWordEnabled: true,
          wakeWordModel: 'hey_tersoo',
          wakeWordThreshold: 0.5,
          greetingText: 'Yes, how can I help?',
          commandMaxDurationMs: 10000,
          commandSilenceStopMs: 1200,
        } as unknown as CommandOutput<C>;
      }

      if (channel === 'voice.settings.set') {
        const patch = (input ?? {}) as Record<string, unknown>;
        return {
          sttModel: (patch.sttModel as string) ?? 'openai/whisper-large-v3',
          sttLanguage: (patch.sttLanguage as string | null) ?? null,
          ttsModel: (patch.ttsModel as string) ?? 'mistralai/voxtral-mini-tts-2603',
          ttsVoice: (patch.ttsVoice as string) ?? 'en_paul_neutral',
          autoSpeak: (patch.autoSpeak as boolean) ?? true,
          wakeWordEnabled: (patch.wakeWordEnabled as boolean) ?? true,
          wakeWordModel: (patch.wakeWordModel as string) ?? 'hey_tersoo',
          wakeWordThreshold: (patch.wakeWordThreshold as number) ?? 0.5,
          greetingText: (patch.greetingText as string) ?? 'Yes, how can I help?',
          commandMaxDurationMs: (patch.commandMaxDurationMs as number) ?? 10000,
          commandSilenceStopMs: (patch.commandSilenceStopMs as number) ?? 1200,
        } as unknown as CommandOutput<C>;
      }

      if (channel === 'voice.models.list') {
        return {
          sttModels: [
            {
              id: 'openai/whisper-large-v3',
              name: '[STT] OpenAI: Whisper Large v3 (Audio Input)',
              provider: 'openrouter',
              modality: 'stt',
              description: 'Multilingual speech-to-text recognition model.',
            },
            {
              id: 'mistralai/voxtral-small-24b-2507',
              name: '[STT] Mistral: Voxtral Audio Transcription (Audio Input)',
              provider: 'openrouter',
              modality: 'stt',
              description: 'Voxtral speech recognition and multimodal audio comprehension.',
            },
            {
              id: 'google/gemini-2.5-flash',
              name: '[STT] Google: Gemini 2.5 Flash (Audio Input)',
              provider: 'openrouter',
              modality: 'stt',
              description: 'Multimodal model with direct audio transcription capabilities.',
            },
          ],
          ttsModels: [
            {
              id: 'mistralai/voxtral-mini-tts-2603',
              name: '[TTS] Mistral: Voxtral Mini TTS (Voice Output)',
              provider: 'openrouter',
              modality: 'tts',
              description: 'Ultra-low latency expressive neural voice synthesis.',
            },
            {
              id: 'openai/gpt-audio-mini',
              name: '[TTS] OpenAI: GPT Audio Mini (Voice Output)',
              provider: 'openrouter',
              modality: 'tts',
              description: 'Direct conversational speech synthesis output.',
            },
            {
              id: 'google/lyria-3-clip-preview',
              name: '[TTS] Google: Lyria 3 Audio (Voice Output)',
              provider: 'openrouter',
              modality: 'tts',
              description: 'Google neural speech generation model.',
            },
          ],
          cached: true,
          updatedAt: Date.now(),
        } as unknown as CommandOutput<C>;
      }

      if (channel === 'voice.speak') {
        // Valid 44-byte silent WAV PCM audio to enable browser test playback without error
        const mockWavBase64 = 'UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
        return {
          audio: mockWavBase64,
          format: 'wav',
          durationMs: 120,
        } as unknown as CommandOutput<C>;
      }

      if (channel === 'voice.test_connection') {
        const mockWavBase64 = 'UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
        return {
          success: true,
          latencyMs: 142,
          sttModelsCount: 3,
          ttsModelsCount: 3,
          sttModel: 'openai/whisper-large-v3',
          ttsModel: 'mistralai/voxtral-mini-tts-2603',
          audio: mockWavBase64,
          format: 'wav',
          details: {
            openrouterStatus: 'connected',
            sttModelReady: true,
            ttsModelReady: true,
            synthesisVerified: true,
          },
          message: 'Voice connection verified successfully. Both STT and TTS models ready.',
        } as unknown as CommandOutput<C>;
      }

      if (channel === 'voice.cost_summary') {
        return {
          totalCost: 0,
          totalDurationMs: 0,
          totalInteractions: 0,
          sttCost: 0,
          ttsCost: 0,
          byModel: {},
        } as unknown as CommandOutput<C>;
      }

      return undefined as unknown as CommandOutput<C>;
    },

    on: <E extends EventName>(
      event: E,
      handler: (payload: EventPayload<E>) => void,
    ): (() => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      const genericHandler = handler as (payload: unknown) => void;
      listeners.get(event)!.add(genericHandler);
      return () => {
        listeners.get(event)?.delete(genericHandler);
      };
    },
  };

  window.tersoo = api;
}

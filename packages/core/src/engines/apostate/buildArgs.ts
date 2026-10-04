import { assertArgvInvariants, sanitizeAdditionalArgs } from '../../engines/shared/argSanitizer';
import { buildAuthenticatedProxyUrl, type ForwarderCredentials } from '../../proxy/proxyUrl';

export interface ApostateSpawnInput {
  profileId?: string;
  userDataDir: string;
  forwarderPort: number;
  /** Credentials the local forwarder requires from its client. */
  forwarderAuth?: ForwarderCredentials | null | undefined;
  headless?: boolean | undefined;
  additionalArgs?: string[] | undefined;
  leaseId?: string | undefined;
  screen?: { width: number; height: number; dpr?: number } | undefined;
}

export type SpawnInput = ApostateSpawnInput;

export function buildApostateArgs(input: ApostateSpawnInput): string[] {
  const normalizedUserDataDir = input.userDataDir.replace(/\\/g, '/');
  const screenWidth = input.screen?.width ?? 1280;
  const screenHeight = input.screen?.height ?? 720;
  const screenDpr = input.screen?.dpr ?? 1;

  const args: string[] = [
    `--user-data-dir=${normalizedUserDataDir}/chromium`,
    `--disk-cache-dir=${normalizedUserDataDir}/cache`,
    `--crash-dumps-dir=${normalizedUserDataDir}/crash`,
    // Loopback only, ephemeral port, and no --remote-allow-origins: see the note
    // in supervisor/buildArgs.ts for why the wildcard origin is omitted.
    `--remote-debugging-port=0`,
    `--remote-debugging-address=127.0.0.1`,
    `--window-size=${screenWidth},${screenHeight}`,
    `--window-position=0,0`,
    `--force-device-scale-factor=${screenDpr}`,
    `--high-dpi-support=1`,
    ...(input.forwarderPort > 0
      ? [
          `--proxy-server=${buildAuthenticatedProxyUrl(input.forwarderPort, input.forwarderAuth)}`,
          `--proxy-bypass-list=<-loopback>`,
        ]
      : []),
    `--force-webrtc-ip-handling-policy=disable_non_proxied_udp`,
    `--disable-features=WebRtcHideLocalIpsWithMdns`,
    `--disable-blink-features=AutomationControlled`,
    `--disable-renderer-backgrounding`,
    `--disable-background-timer-throttling`,
    `--disable-backgrounding-occluded-windows`,
    `--no-first-run`,
    `--no-default-browser-check`,
    `--password-store=basic`,
    `--use-mock-keychain`,
    `--disable-component-update`,
    `--disable-domain-reliability`,
    `--disable-sync`,
    `--metrics-recording-only`,
    `--mute-audio`,
  ];

  if (input.headless) {
    args.push('--headless=new');
  }

  const extra = sanitizeAdditionalArgs(input.additionalArgs);
  if (extra.length > 0) {
    args.push(...extra);
  }

  assertArgvInvariants(args, {
    ownedFlags: [
      '--user-data-dir',
      '--disk-cache-dir',
      '--crash-dumps-dir',
      '--remote-debugging-port',
    ],
    // Present only when a forwarder is configured, but never more than once.
    maxOnceFlags: ['--proxy-server', '--proxy-bypass-list'],
    forbidDuplicates: [
      '--remote-allow-origins',
      '--load-extension',
      '--disable-web-security',
      '--no-sandbox',
    ],
  });

  args.push('about:blank');
  return args;
}

export const buildArgs = buildApostateArgs;

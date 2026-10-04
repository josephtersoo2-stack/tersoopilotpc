import { assertArgvInvariants, sanitizeAdditionalArgs } from '../engines/shared/argSanitizer';
import {
  buildAuthenticatedProxyUrl,
  type ForwarderCredentials,
} from '../proxy/proxyUrl';

export interface SpawnInput {
  profileId: string;
  userDataDir: string;
  forwarderPort: number;
  /**
   * Credentials the local forwarder requires. Supplied by LocalForwarder when
   * it starts; without them the forwarder would accept unauthenticated clients.
   */
  forwarderAuth?: ForwarderCredentials | null | undefined;
  headless?: boolean | undefined;
  /**
   * Extra flags. Allowlisted by `sanitizeAdditionalArgs`; anything else throws.
   */
  additionalArgs?: string[] | undefined;
  leaseId?: string | undefined;
  screen?: { width: number; height: number; dpr?: number } | undefined;
}

export function buildArgs(input: SpawnInput): string[] {
  const normalizedUserDataDir = input.userDataDir.replace(/\\/g, '/');
  const screenWidth = input.screen?.width ?? 1280;
  const screenHeight = input.screen?.height ?? 720;
  const screenDpr = input.screen?.dpr ?? 1;

  const args: string[] = [
    `--user-data-dir=${normalizedUserDataDir}/chromium`,
    `--disk-cache-dir=${normalizedUserDataDir}/cache`,
    `--crash-dumps-dir=${normalizedUserDataDir}/crash`,
    // Port 0 lets the OS pick; the address is loopback-only. The chosen port is
    // written to DevToolsActivePort in the profile directory, so the profile
    // directory is treated as a capability and kept owner-only.
    `--remote-debugging-port=0`,
    `--remote-debugging-address=127.0.0.1`,
    // NOTE: --remote-allow-origins is intentionally NOT set. Setting it to '*'
    // disables Chromium's Origin check on the DevTools WebSocket, so any origin
    // on the machine that learns the port can attach and control every page in
    // the profile. Node's WebSocket client sends no Origin header, so the
    // supervisor's own connections are unaffected.
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

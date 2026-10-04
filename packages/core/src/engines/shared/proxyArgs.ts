import {
  buildAuthenticatedProxyUrl,
  type ForwarderCredentials,
} from '../../proxy/proxyUrl';

/**
 * Builds the proxy flags for a Chromium-family browser.
 *
 * The forwarder requires a per-instance token, so the URL carries the
 * credentials. See `proxy/proxyUrl.ts` for the residual risk this implies on
 * platforms where other same-user processes can read a command line.
 */
export function buildChromiumProxyArgs(
  forwarderPort: number,
  credentials?: ForwarderCredentials | null | undefined,
): string[] {
  if (forwarderPort <= 0) return [];
  return [
    `--proxy-server=${buildAuthenticatedProxyUrl(forwarderPort, credentials)}`,
    `--proxy-bypass-list=<-loopback>`,
  ];
}

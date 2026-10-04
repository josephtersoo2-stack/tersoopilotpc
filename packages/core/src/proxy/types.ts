import type { ForwarderCredentials } from './proxyUrl';

export type { ForwarderCredentials } from './proxyUrl';
export type UpstreamProtocol = 'socks5' | 'http' | 'https';

export interface UpstreamConfig {
  protocol: UpstreamProtocol;
  host: string;
  port: number;
  username?: string | undefined;
  password?: string | undefined;
}

export interface ForwarderHandle {
  id: string;
  port: number;
  bind: string;
  /**
   * Credentials a client must present before the forwarder will open an upstream
   * connection. Without these, any local process could use the forwarder as a
   * credentialed proxy.
   */
  credentials: ForwarderCredentials;
  /** Ready-made `--proxy-server` value including credentials. */
  proxyUrl: string;
  stop: () => Promise<void>;
}

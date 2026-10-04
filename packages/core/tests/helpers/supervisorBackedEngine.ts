import { Humanizer } from '../../src/crosshair/Humanizer';
import type { BrowserEngine, BrowserSession, EngineType, LaunchInput } from '../../src/engines/types';
import type { BrowserSupervisor } from '../../src/supervisor/BrowserSupervisor';

export interface SupervisorBackedEngineOptions {
  supervisor: BrowserSupervisor;
  defaultCdpTimeoutMs?: number;
}

/**
 * A `BrowserEngine` that delegates process ownership to `BrowserSupervisor`.
 *
 * The production `ApostateEngine` hands the binary to the Apostate SDK, which
 * spawns it directly. These tests use a Node script as a stand-in browser, and
 * Windows cannot spawn a `.js` file as an executable — hence the `EFTYPE`
 * failures. `BrowserSupervisor.spawn` already handles this case explicitly: it
 * detects a script binary and launches it through `process.execPath`
 * (see BrowserSupervisor.spawn, the `isScript` branch).
 *
 * Using the supervisor also keeps the tests exercising the real behaviour they
 * were written for: a genuine child process, genuine crash detection driven by
 * the child's `exit` event, and DevToolsActivePort-based CDP discovery.
 */
export class SupervisorBackedTestEngine implements BrowserEngine {
  readonly type: EngineType = 'apostate';

  private readonly sessions = new Map<string, BrowserSession>();

  constructor(private readonly opts: SupervisorBackedEngineOptions) {}

  async launch(input: LaunchInput): Promise<BrowserSession> {
    const profileId = input.profile.id;

    const instance = await this.opts.supervisor.spawn({
      profileId,
      userDataDir: input.userDataDir,
      forwarderPort: input.forwarderPort,
      forwarderAuth: input.forwarderAuth,
      headless: input.headless,
      additionalArgs: input.additionalArgs,
      leaseId: input.leaseId ?? undefined,
      screen: input.screen ?? input.profile.fingerprintBundle.screen,
    });

    const cdp = await this.opts.supervisor.waitForCdpEndpoint(instance, {
      timeoutMs: input.cdpTimeoutMs ?? this.opts.defaultCdpTimeoutMs ?? 15000,
    });

    instance.cdpPort = cdp.port;
    instance.cdpWsUrl = cdp.wsUrl;

    const session: BrowserSession = {
      instance,
      humanizer: new Humanizer(input.seed),
      engine: this.type,
      cdpPort: cdp.port,
      cdpWsUrl: cdp.wsUrl,
      pid: instance.pid,
      async close() {
        await this.opts.supervisor.stop(profileId);
      },
    };

    this.sessions.set(profileId, session);
    return session;
  }

  getSession(profileId: string): BrowserSession | undefined {
    return this.sessions.get(profileId);
  }

  async stop(profileId: string): Promise<void> {
    this.sessions.delete(profileId);
    await this.opts.supervisor.stop(profileId);
  }
}

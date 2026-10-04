import type { Config } from '../config';
import { AnchorRegistry } from '../crosshair/AnchorRegistry';
import { CrosshairWorker } from '../crosshair/CrosshairWorker';
import { EventBus } from '../events/EventBus';
import { FingerprintEngine } from '../fingerprint/FingerprintEngine';
import { openDb, type AppDatabase } from '../persistence/db';
import { Repos } from '../persistence/repos';
import type { DB } from '../persistence/schema';
import { HealthProbe } from '../proxy/HealthProbe';
import { LocalForwarder } from '../proxy/LocalForwarder';
import { ProxyBroker } from '../proxy/ProxyBroker';
import { JobQueue } from '../queue/JobQueue';
import { ISecretDriver, MemorySecretDriver, SecretVault, SecretVaultError } from '../secrets/SecretVault';
import { FleetService } from '../services/FleetService';
import { ProfileService } from '../services/ProfileService';
import { ProxyService } from '../services/ProxyService';
import { RunService } from '../services/RunService';
import { TaskService } from '../services/TaskService';
import { BrowserSupervisor } from '../supervisor/BrowserSupervisor';
import { EngineFactory } from '../engines/EngineFactory';
import { ApostateEngine } from '../engines/apostate/ApostateEngine';
import { CamoufoxEngine } from '../engines/camoufox/CamoufoxEngine';
import { LlmService } from '../llm/LlmService';
import { XPathResolver } from '../crosshair/XPathResolver';
import { BackupService } from '../services/BackupService';
import { NicheService } from '../services/NicheService';
import { PromptService } from '../services/PromptService';
import { CostService } from '../services/CostService';
import { CopilotService } from '../copilot/CopilotService';
import { TemplateService } from '../services/TemplateService';
import { createLogger } from '../util/logger';

export type Container = {
  config: Config;
  db: AppDatabase<DB>;
  logger: ReturnType<typeof createLogger>;
  events: EventBus;
  queue: JobQueue;
  secrets: SecretVault;
  repos: Repos;
  forwarder: LocalForwarder;
  broker: ProxyBroker;
  health: HealthProbe;
  fingerprint: FingerprintEngine;
  supervisor: BrowserSupervisor;
  engineFactory: EngineFactory;
  crosshair: CrosshairWorker;
  anchors: AnchorRegistry;
  services: {
    profiles: ProfileService;
    proxies: ProxyService;
    tasks: TaskService;
    runs: RunService;
    fleet: FleetService;
    llm: LlmService;
    backup: BackupService;
    niches: NicheService;
    copilot: CopilotService;
    prompts: PromptService;
    cost: CostService;
    templates: TemplateService;
  };
  dispose(): Promise<void>;
};

export type ContainerOptions = {
  /**
   * OS-backed secret backend. The desktop app injects an Electron `safeStorage`
   * driver here. When omitted, the vault falls back to a process-local memory
   * driver and secrets will NOT survive a restart.
   */
  secretDriver?: ISecretDriver;
  /** Allow an insecure fallback to be used without throwing (tests only). */
  allowVolatileSecrets?: boolean;
};

/**
 * Chooses the secret backend, preferring the injected OS-backed driver.
 *
 * If no driver is supplied and no OS keystore is reachable, we fall back to an
 * in-memory driver rather than to any on-disk store. That is fail-secure: the
 * worst case is that the user re-enters API keys after a restart, instead of
 * secrets being recoverable from disk by anyone who can read the file.
 */
function resolveSecretVault(
  config: Config,
  logger: ReturnType<typeof createLogger>,
  options: ContainerOptions,
): SecretVault {
  if (options.secretDriver) {
    return new SecretVault({ driver: options.secretDriver });
  }

  try {
    return new SecretVault({ storageDir: config.userDataDir });
  } catch (err) {
    if (!(err instanceof SecretVaultError)) throw err;

    const log = logger.child('security');
    log.warn('secrets.volatile_fallback', {
      code: err.code,
      message: err.message,
    });

    return new SecretVault({ driver: new MemorySecretDriver() });
  }
}

export async function createContainer(
  config: Config,
  options: ContainerOptions = {},
): Promise<Container> {
  const db = openDb(config);
  const logger = createLogger({ level: 'info' });
  const events = new EventBus();
  const queue = new JobQueue(db);
  const secrets = resolveSecretVault(config, logger, options);
  const repos = new Repos(db);
  await repos.presets.seedDefaults();
  const anchors = new AnchorRegistry(repos.anchors);
  const forwarder = new LocalForwarder();
  const broker = new ProxyBroker(repos.leases, repos.proxies, config);
  const health = new HealthProbe();
  const fingerprint = new FingerprintEngine(repos.presets);
  const crosshair = new CrosshairWorker({ events, anchors });
  const supervisor = new BrowserSupervisor({ config, events, crosshair, repos, broker });
  const engineFactory = new EngineFactory(
    new ApostateEngine({ supervisor, config }),
    new CamoufoxEngine({ supervisor }),
  );

  const fleet = new FleetService({ supervisor, broker, queue, config, repos, forwarder });
  const prompts = new PromptService({ repos, logger });
  const llm = new LlmService(repos.llmConfig, secrets, fetch, prompts);

  // Move any literal API key left in llm_config.api_key_ref by an older build
  // into the OS-backed vault before anything reads it.
  try {
    const migrated = await llm.migrateLegacyInlineApiKeys();
    if (migrated.migrated) {
      logger.child('security').warn('llm.inline_api_key_migrated', {
        provider: migrated.provider,
      });
    }
  } catch (err) {
    logger.child('security').error('llm.inline_api_key_migration_failed', {
      message: (err as Error).message,
    });
  }

  const profiles = new ProfileService({
    repos,
    supervisor,
    events,
    config,
    fingerprint,
    crosshair,
    forwarder,
    healthProbe: health,
    secrets,
    engineFactory,
    fleet,
  });

  const runs = new RunService({
    repos,
    queue,
    events,
    supervisor,
    crosshair,
    profiles,
    fleet,
    engineFactory,
    xpathResolver: new XPathResolver(anchors),
    llm,
    config,
  });

  const proxies = new ProxyService({ repos, broker, health, secrets, events });
  const tasks = new TaskService({ repos, queue, events });
  const templates = new TemplateService({ repos, tasks });
  const backup = new BackupService({ config, db, events, logger });
  const niches = new NicheService({ repos });
  const copilot = new CopilotService({
    llm,
    repos,
    profiles,
    tasks,
    niches,
    runs,
    prompts,
    templates,
  });

  const cost = new CostService(repos.events);

  const services = {
    profiles,
    proxies,
    tasks,
    runs,
    fleet,
    llm,
    backup,
    niches,
    copilot,
    prompts,
    cost,
    templates,
  };

  return Promise.resolve({
    config,
    db,
    logger,
    events,
    queue,
    secrets,
    repos,
    forwarder,
    broker,
    health,
    fingerprint,
    supervisor,
    engineFactory,
    crosshair,
    anchors,
    services,
    async dispose() {
      await supervisor.stopAll();
      await forwarder.stopAll();
      db.close();
    },
  });
}

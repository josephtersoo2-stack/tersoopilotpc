import type { Kysely } from 'kysely';

import type { DB } from '../schema';

import { AnchorRepo } from './anchorRepo';
import { AuditRepo } from './auditRepo';
import { CaptchaEventRepo } from './captchaEventRepo';
import { EngineConfigRepo } from './engineConfigRepo';
import { EventRepo } from './eventRepo';
import { LeaseRepo } from './leaseRepo';
import { LlmConfigRepo } from './llmConfigRepo';
import { PresetRepo } from './presetRepo';
import { ProfileRepo } from './profileRepo';
import { ProxyRepo } from './proxyRepo';
import { RunRepo } from './runRepo';
import { SettingsRepo } from './settingsRepo';
import { StepRunRepo } from './stepRunRepo';
import { TaskRepo } from './taskRepo';
import { NicheRepo } from './nicheRepo';
import { TemplateRepo } from './templateRepo';

export * from './anchorRepo';
export * from './auditRepo';
export * from './captchaEventRepo';
export * from './engineConfigRepo';
export * from './eventRepo';
export * from './leaseRepo';
export * from './llmConfigRepo';
export * from './presetRepo';
export * from './profileRepo';
export * from './proxyRepo';
export * from './runRepo';
export * from './settingsRepo';
export * from './stepRunRepo';
export * from './taskRepo';
export * from './nicheRepo';
export * from './templateRepo';
export * from '../profileLock';

export class Repos {
  readonly profiles: ProfileRepo;
  readonly proxies: ProxyRepo;
  readonly leases: LeaseRepo;
  readonly tasks: TaskRepo;
  readonly runs: RunRepo;
  readonly stepRuns: StepRunRepo;
  readonly anchors: AnchorRepo;
  readonly events: EventRepo;
  readonly audit: AuditRepo;
  readonly presets: PresetRepo;
  readonly engineConfig: EngineConfigRepo;
  readonly llmConfig: LlmConfigRepo;
  readonly captchaEvents: CaptchaEventRepo;
  readonly settings: SettingsRepo;
  readonly niches: NicheRepo;
  readonly templates: TemplateRepo;

  constructor(db: Kysely<DB>) {
    this.profiles = new ProfileRepo(db);
    this.proxies = new ProxyRepo(db);
    this.leases = new LeaseRepo(db);
    this.tasks = new TaskRepo(db);
    this.runs = new RunRepo(db);
    this.stepRuns = new StepRunRepo(db);
    this.anchors = new AnchorRepo(db);
    this.events = new EventRepo(db);
    this.audit = new AuditRepo(db);
    this.presets = new PresetRepo(db);
    this.engineConfig = new EngineConfigRepo(db);
    this.llmConfig = new LlmConfigRepo(db);
    this.captchaEvents = new CaptchaEventRepo(db);
    this.settings = new SettingsRepo(db);
    this.niches = new NicheRepo(db);
    this.templates = new TemplateRepo(db);
  }
}

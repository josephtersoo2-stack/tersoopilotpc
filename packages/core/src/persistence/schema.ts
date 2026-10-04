import type { Generated, Selectable } from 'kysely';

export type PresetRow = {
  id: string;
  name: string;
  platform: string;
  bundle: string;
  version: number;
  created_at: number;
  updated_at: number;
};

export type ProxyRow = {
  id: string;
  protocol: string;
  host: string;
  port: number;
  username: string | null;
  password_ref: string | null;
  geo_country: string | null;
  geo_city: string | null;
  geo_tz: string | null;
  geo_isp: string | null;
  geo_lat: number | null;
  geo_lng: number | null;
  exit_ip: string | null;
  last_checked_at: number | null;
  last_latency_ms: number | null;
  status: string;
  status_reason: string | null;
  created_at: number;
  updated_at: number;
};

export type ProfileRow = {
  id: string;
  name: string;
  tags: string;
  preset_id: string;
  fingerprint_seed: string;
  fingerprint_bundle: string;
  user_data_dir: string;
  state: string;
  notes: string | null;
  created_at: number;
  updated_at: number;
  last_launched_at: number | null;
  engine: 'apostate' | 'camoufox';
  action_mode: 'scripted' | 'llm' | null;
  captcha_budget_used: number;
  persona: string;
  niche_id: string | null;
  trust_score: number;
  maturation_stage: string;
  typing_wpm: number;
  typo_rate: number;
  patience_index: number;
  engagement_rate: number;
  niche_ids: string;
  weighted_niches: string;
};

export type ProxyLeaseRow = {
  id: string;
  proxy_id: string;
  profile_id: string;
  state: string;
  acquired_at: number;
  expires_at: number;
  released_at: number | null;
  heartbeat_at: number;
};

export type TaskRow = {
  id: string;
  name: string;
  schema_version: number;
  definition: string;
  tags: string;
  created_at: number;
  updated_at: number;
};

export type TaskTemplateRow = {
  id: string;
  name: string;
  category: string;
  description: string;
  definition: string;
  is_builtin: number;
  tags: string;
  created_at: number;
  updated_at: number;
};

export type RunRow = {
  id: string;
  task_id: string;
  profile_id: string;
  state: string;
  idempotency_key: string | null;
  attempt: number;
  checkpoint: string | null;
  error_class: string | null;
  error_message: string | null;
  started_at: number | null;
  finished_at: number | null;
  created_at: number;
};

export type StepRunRow = {
  id: string;
  run_id: string;
  step_index: number;
  step_type: string;
  state: string;
  attempts: number;
  last_error: string | null;
  artifacts: string;
  started_at: number | null;
  finished_at: number | null;
};

export type AnchorRow = {
  id: string;
  task_id: string;
  profile_id: string | null;
  anchor_key: string;
  selector: string;
  selector_type: string;
  confidence: number;
  hit_count: number;
  miss_count: number;
  last_hit_at: number | null;
  ttl_at: number | null;
  created_at: number;
  updated_at: number;
};

export type EventTable = {
  id: Generated<number>;
  ts: number;
  level: string;
  scope: string;
  event: string;
  profile_id: string | null;
  run_id: string | null;
  step_run_id: string | null;
  data: string;
};
export type EventRow = Selectable<EventTable>;

export type AuditTable = {
  id: Generated<number>;
  ts: number;
  actor: string;
  action: string;
  target: string | null;
  meta: string;
};
export type AuditRow = Selectable<AuditTable>;

export type MigrationRow = {
  version: number;
  applied_at: number;
  checksum: string;
};

export type EngineRow = {
  engine: 'apostate' | 'camoufox';
  action_mode: 'scripted' | 'llm' | null;
  binary_path: string | null;
  launch_options: string;
  created_at: number;
  updated_at: number;
};

export type LlmConfigRow = {
  id: 1;
  provider: 'openrouter' | 'openai' | 'gemini' | 'deepseek';
  text_model: string;
  vision_model: string | null;
  api_key_ref: string;
  max_attempts: number;
  backoff_ms: string;
  vision_enabled: 0 | 1;
  updated_at: number;
};

export type CaptchaEventRow = {
  id: string;
  run_id: string;
  profile_id: string;
  detected_at: number;
  challenge_type: string;
  solved_by: string | null;
  attempts: number;
  outcome: 'solved' | 'failed' | 'aborted' | 'unsolvable';
  screenshot_path: string | null;
  created_at: number;
};

export type SettingRow = {
  key: string;
  value: string;
  updated_at: number;
};

export type NicheRow = {
  id: string;
  name: string;
  description: string;
  keywords: string;
  seed_urls: string;
  tags: string;
  created_at: number;
  updated_at: number;
};

export type DB = {
  presets: PresetRow;
  proxies: ProxyRow;
  profiles: ProfileRow;
  proxy_leases: ProxyLeaseRow;
  tasks: TaskRow;
  runs: RunRow;
  step_runs: StepRunRow;
  anchors: AnchorRow;
  events: EventTable;
  audit: AuditTable;
  migrations: MigrationRow;
  engine_config: EngineRow;
  llm_config: LlmConfigRow;
  captcha_events: CaptchaEventRow;
  settings: SettingRow;
  niches: NicheRow;
  task_templates: TaskTemplateRow;
};


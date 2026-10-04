# TersooPilot Desktop — Implementation Companion

> Companion to `ARCHITECTURE.md`. Where the architecture defines **what** and **why**,
> this document defines **how** in code that agents can copy-adapt directly.
> Read both files. If they disagree, ARCHITECTURE.md wins.

---

## Table of Contents

1. What This Document Adds
2. Toolchain & Configuration Files
3. Dependency Manifest (pinned)
4. Environment & Runtime Config
5. Error Hierarchy
6. Logger
7. DI Container (concrete)
8. Migration Runner (concrete)
9. Repository Pattern (concrete, Kysely)
10. IPC Router (concrete, Zod)
11. Electron Main Bootstrap
12. LocalForwarder (full implementation)
13. Proxy Broker (concrete)
14. Stealth Shim (full source outline)
15. Crosshair Worker (concrete)
16. Testkit (fake proxy, canary, fixtures)
17. CI/CD Pipeline
18. Phase-by-Phase Agent Task Breakdown
19. Anti-Patterns (do not do these)
20. Definition of Done (per PR)

---

## 1. What This Document Adds

- Runnable configuration: `package.json`, `tsconfig`, `turbo.json`, ESLint, Prettier, Vite, electron-builder.
- Concrete implementations for the **10 critical files** every agent will touch:
  - DI container, error classes, logger, migration runner, repo pattern, IPC router, main bootstrap, LocalForwarder, ProxyBroker, CrosshairWorker.
- The `stealth_shim.js` structure with every hook enumerated.
- A `testkit` so integration tests can run offline.
- A **task board**: every phase decomposed into ~40 tickets with file paths and acceptance criteria.
- CI/CD that builds, tests, lints, and packages on every push.

---

## 2. Toolchain & Configuration Files

### 2.1 Root `package.json`

```json
{
  "name": "tersoopilot-desktop",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20.10.0" },
  "scripts": {
    "dev": "turbo run dev --parallel",
    "build": "turbo run build",
    "test": "turbo run test",
    "test:unit": "turbo run test:unit",
    "test:integration": "turbo run test:integration",
    "test:e2e": "turbo run test:e2e",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "format": "prettier --write .",
    "clean": "turbo run clean && rm -rf node_modules",
    "migrate": "tsx scripts/migrate.ts",
    "rebuild:native": "electron-rebuild -f -w better-sqlite3,keytar"
  },
  "devDependencies": {
    "@types/node": "20.14.10",
    "electron": "32.2.5",
    "electron-rebuild": "3.2.9",
    "prettier": "3.3.3",
    "tsx": "4.19.1",
    "turbo": "2.1.3",
    "typescript": "5.6.2",
    "vitest": "2.1.2"
  }
}
```

### 2.2 `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### 2.3 `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "incremental": true
  }
}
```

### 2.4 `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "test": { "dependsOn": ["build"] },
    "test:unit": { "cache": false },
    "test:integration": { "cache": false },
    "test:e2e": { "cache": false },
    "lint": {},
    "typecheck": { "dependsOn": ["^build"] },
    "clean": { "cache": false }
  }
}
```

### 2.5 `.eslintrc.cjs`

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended-type-checked',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  parserOptions: { project: true },
  rules: {
    'no-console': ['error', { allow: ['warn', 'error'] }],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/consistent-type-imports': 'error',
    'import/order': ['error', { 'newlines-between': 'always' }],
  },
  ignorePatterns: ['dist', 'node_modules', '*.js'],
};
```

### 2.6 `.prettierrc`

```json
{ "semi": true, "singleQuote": true, "trailingComma": "all", "printWidth": 100 }
```

### 2.7 `apps/renderer/vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
});
```

### 2.8 `apps/desktop/electron-builder.yml`

```yaml
appId: dev.tersoopilot.desktop
productName: TersooPilot Desktop
directories:
  output: release
  buildResources: build
files:
  - "dist/**"
  - "package.json"
asarUnpack:
  - "node_modules/better-sqlite3/**"
  - "node_modules/keytar/**"
mac:
  category: public.app-category.developer-tools
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
win:
  target: nsis
linux:
  target: AppImage
publish:
  provider: github
  owner: REPLACE
  repo: REPLACE
```

---

## 3. Dependency Manifest (pinned)

### `packages/core/package.json`
```json
{
  "name": "@tersoo/core",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "dependencies": {
    "@tersoo/contracts": "workspace:*",
    "@tersoo/stealth": "workspace:*",
    "better-sqlite3": "11.3.0",
    "keytar": "7.9.0",
    "kysely": "0.27.4",
    "pino": "9.4.0",
    "playwright-core": "1.47.2",
    "uuid": "10.0.0",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "7.6.11",
    "@types/node": "20.14.10",
    "@types/uuid": "10.0.0",
    "vitest": "2.1.2"
  }
}
```

### `apps/desktop/package.json`
```json
{
  "name": "@tersoo/desktop",
  "version": "0.0.0",
  "type": "module",
  "main": "dist/main/index.js",
  "dependencies": {
    "@tersoo/contracts": "workspace:*",
    "@tersoo/core": "workspace:*",
    "electron-updater": "6.3.9"
  },
  "devDependencies": {
    "electron": "32.2.5",
    "electron-builder": "25.0.5"
  }
}
```

### `apps/renderer/package.json`
```json
{
  "name": "@tersoo/renderer",
  "version": "0.0.0",
  "type": "module",
  "dependencies": {
    "@tersoo/contracts": "workspace:*",
    "@radix-ui/react-dialog": "1.1.1",
    "@radix-ui/react-dropdown-menu": "2.1.1",
    "@radix-ui/react-tabs": "1.1.0",
    "clsx": "2.1.1",
    "lucide-react": "0.441.0",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "zustand": "5.0.0"
  },
  "devDependencies": {
    "@types/react": "18.3.5",
    "@types/react-dom": "18.3.0",
    "@vitejs/plugin-react": "4.3.1",
    "autoprefixer": "10.4.20",
    "postcss": "8.4.47",
    "tailwindcss": "3.4.11",
    "vite": "5.4.6"
  }
}
```

---

## 4. Environment & Runtime Config

### `packages/core/src/config.ts`
```ts
import path from 'node:path';
import { z } from 'zod';

export const Config = z.object({
  userDataDir: z.string(),
  chromeBinary: z.string(),
  headless: z.boolean().default(true),
  strictCoherence: z.boolean().default(true),
  leaseTtlMs: z.number().int().default(6 * 60 * 60 * 1000),
  leaseHeartbeatMs: z.number().int().default(60 * 1000),
  leaseSweepMs: z.number().int().default(5 * 60 * 1000),
  forwarderHealthTimeoutMs: z.number().int().default(8000),
  cdpDiscoveryTimeoutMs: z.number().int().default(15_000),
  stealthMinScore: z.number().min(0).max(1).default(0.9),
  defaultConcurrency: z.number().int().min(1).max(64).default(5),
});
export type Config = z.infer<typeof Config>;

export function loadConfig(userDataDir: string, chromeBinary: string): Config {
  return Config.parse({
    userDataDir: path.resolve(userDataDir),
    chromeBinary,
  });
}
```

Paths helper:
```ts
export const paths = (cfg: Config) => ({
  db: path.join(cfg.userDataDir, 'tersoopilot.db'),
  logs: path.join(cfg.userDataDir, 'logs'),
  profiles: path.join(cfg.userDataDir, 'profiles'),
  profileDir: (id: string) => path.join(cfg.userDataDir, 'profiles', id),
  profileChrome: (id: string) => path.join(cfg.userDataDir, 'profiles', id, 'chromium'),
  profileCache: (id: string) => path.join(cfg.userDataDir, 'profiles', id, 'cache'),
  profileCrash: (id: string) => path.join(cfg.userDataDir, 'profiles', id, 'crash'),
  profileLock: (id: string) => path.join(cfg.userDataDir, 'profiles', id, 'profile.lock'),
  artifacts: (id: string, runId: string) =>
    path.join(cfg.userDataDir, 'profiles', id, 'artifacts', runId),
});
```

---

## 5. Error Hierarchy

Every throw in the codebase uses one of these. No ad-hoc strings.

```ts
// packages/core/src/util/errors.ts
export type ErrorCode =
  | 'PROFILE_NOT_FOUND' | 'ALREADY_RUNNING'
  | 'NO_HEALTHY_PROXY' | 'PROXY_MISSING' | 'LEASE_CONFLICT'
  | 'FINGERPRINT_INCOHERENT' | 'STEALTH_FAILED'
  | 'FORWARDER_UNHEALTHY' | 'SPAWN_FAILED'
  | 'CDP_TIMEOUT' | 'CDP_ATTACH_FAILED'
  | 'DB_BUSY' | 'MIGRATION_FAILED'
  | 'STEP_TIMEOUT' | 'STEP_SELECTOR_MISSING' | 'NAVIGATION_FAILED'
  | 'POLICY_VIOLATION' | 'INTERNAL';

export class TersooError extends Error {
  override readonly name = 'TersooError';
  readonly code: ErrorCode;
  readonly meta: Record<string, unknown>;
  constructor(code: ErrorCode, message: string, meta: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.meta = meta;
  }
}

export class LaunchError extends TersooError {}
export class ProxyError extends TersooError {}
export class TaskError extends TersooError {}
export class DbError extends TersooError {}
export class StealthError extends TersooError {}
```

Rule: `throw new TersooError('CODE', 'msg', { ... })`. Never `throw new Error('...')`.

---

## 6. Logger

```ts
// packages/core/src/util/logger.ts
import pino from 'pino';
import type { EventRepo } from '../persistence/repos/eventRepo';

export type LoggerScope = 'supervisor'|'proxy'|'task'|'ui'|'security'|'db';

export function createLogger(opts: { level: string; eventRepo?: EventRepo }) {
  const base = pino({ level: opts.level, base: null, timestamp: pino.stdTimeFunctions.epochTime });

  return {
    child(scope: LoggerScope, ctx: Record<string, unknown> = {}) {
      const child = base.child({ scope, ...ctx });
      return {
        debug: (event: string, data?: unknown) => { child.debug({ event, data }); },
        info:  (event: string, data?: unknown) => { child.info({ event, data });
                                                   opts.eventRepo?.append('info', scope, event, data, ctx); },
        warn:  (event: string, data?: unknown) => { child.warn({ event, data });
                                                   opts.eventRepo?.append('warn', scope, event, data, ctx); },
        error: (event: string, data?: unknown) => { child.error({ event, data });
                                                   opts.eventRepo?.append('error', scope, event, data, ctx); },
      };
    },
  };
}
export type Logger = ReturnType<typeof createLogger>;
```

---

## 7. DI Container (concrete)

```ts
// packages/core/src/container/index.ts
import type { Config } from '../config';
import { openDb } from '../persistence/db';
import { createLogger } from '../util/logger';
import { EventBus } from '../events/EventBus';
import { JobQueue } from '../queue/JobQueue';
import { SecretVault } from '../secrets/SecretVault';
import { Repos } from '../persistence/repos';
import { BrowserSupervisor } from '../supervisor/BrowserSupervisor';
import { LocalForwarder } from '../proxy/LocalForwarder';
import { ProxyBroker } from '../proxy/ProxyBroker';
import { HealthProbe } from '../proxy/HealthProbe';
import { FingerprintEngine } from '../fingerprint/FingerprintEngine';
import { CrosshairWorker } from '../crosshair/CrosshairWorker';
import { AnchorRegistry } from '../crosshair/AnchorRegistry';
import { ProfileService } from '../services/ProfileService';
import { ProxyService } from '../services/ProxyService';
import { TaskService } from '../services/TaskService';
import { RunService } from '../services/RunService';
import { FleetService } from '../services/FleetService';

export type Container = {
  config: Config;
  db: ReturnType<typeof openDb>;
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
  crosshair: CrosshairWorker;
  anchors: AnchorRegistry;
  services: {
    profiles: ProfileService;
    proxies: ProxyService;
    tasks: TaskService;
    runs: RunService;
    fleet: FleetService;
  };
  dispose(): Promise<void>;
};

export async function createContainer(config: Config): Promise<Container> {
  const db = openDb(config);
  const logger = createLogger({ level: 'info' });
  const events = new EventBus();
  const queue = new JobQueue(db);
  const secrets = new SecretVault();
  const repos = new Repos(db);
  const anchors = new AnchorRegistry(repos.anchors);
  const forwarder = new LocalForwarder();
  const broker = new ProxyBroker(repos.leases, repos.proxies, config);
  const health = new HealthProbe();
  const fingerprint = new FingerprintEngine(repos.presets);
  const crosshair = new CrosshairWorker({ events, anchors });
  const supervisor = new BrowserSupervisor({ config, events, crosshair });

  const services = {
    profiles: new ProfileService({ repos, supervisor, events, config }),
    proxies: new ProxyService({ repos, broker, health, secrets, events }),
    tasks: new TaskService({ repos, queue, events }),
    runs: new RunService({ repos, queue, events, supervisor, crosshair }),
    fleet: new FleetService({ supervisor, broker, queue, config }),
  };

  return {
    config, db, logger, events, queue, secrets, repos,
    forwarder, broker, health, fingerprint,
    supervisor, crosshair, anchors, services,
    async dispose() {
      await supervisor.stopAll();
      await forwarder.stopAll();
      db.close();
    },
  };
}
```

Every service receives deps via constructor. No globals, no singletons.

---

## 8. Migration Runner (concrete)

```ts
// packages/core/src/persistence/migrate.ts
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Database } from 'better-sqlite3';

export function runMigrations(db: Database, migrationsDir: string) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL, checksum TEXT NOT NULL
  );`);

  const files = fs.readdirSync(migrationsDir)
    .filter(f => /^\d{4}_.+\.sql$/.test(f))
    .sort();

  const applied = new Map<number, { checksum: string }>();
  for (const row of db.prepare('SELECT version, checksum FROM migrations').all() as any[]) {
    applied.set(row.version, { checksum: row.checksum });
  }

  for (const file of files) {
    const version = Number(file.slice(0, 4));
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');

    if (applied.has(version)) {
      if (applied.get(version)!.checksum !== checksum) {
        throw new Error(`MIGRATION_FAILED: checksum mismatch for ${file}`);
      }
      continue;
    }

    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO migrations (version, applied_at, checksum) VALUES (?, ?, ?)')
        .run(version, Date.now(), checksum);
    });
    tx();
  }
}
```

Called once at app boot before any repo is used.

---

## 9. Repository Pattern (Kysely)

```ts
// packages/core/src/persistence/db.ts
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Config } from '../config';
import { paths } from '../config';
import type { DB } from './schema';
import { runMigrations } from './migrate';
import path from 'node:path';

export function openDb(config: Config) {
  const sqlite = new Database(paths(config).db);
  runMigrations(sqlite, path.resolve(__dirname, '../../../../migrations'));
  return new Kysely<DB>({ dialect: new SqliteDialect({ database: sqlite }) });
}
```

```ts
// packages/core/src/persistence/schema.ts
import type { ColumnType, Generated } from 'kysely';

export type ProfileRow = {
  id: string; name: string; tags: string; preset_id: string;
  fingerprint_seed: string; fingerprint_bundle: string;
  user_data_dir: string; state: string; notes: string | null;
  created_at: number; updated_at: number; last_launched_at: number | null;
};

export type DB = {
  profiles: ProfileRow;
  proxies: {
    id: string; protocol: string; host: string; port: number;
    username: string | null; password_ref: string | null;
    geo_country: string | null; geo_city: string | null; geo_tz: string | null;
    geo_isp: string | null; geo_lat: number | null; geo_lng: number | null;
    exit_ip: string | null; last_checked_at: number | null; last_latency_ms: number | null;
    status: string; status_reason: string | null; created_at: number; updated_at: number;
  };
  proxy_leases: {
    id: string; proxy_id: string; profile_id: string;
    state: string; acquired_at: number; expires_at: number;
    released_at: number | null; heartbeat_at: number;
  };
  tasks: { id: string; name: string; schema_version: number; definition: string; tags: string;
           created_at: number; updated_at: number };
  runs: { id: string; task_id: string; profile_id: string; state: string;
          idempotency_key: string | null; attempt: number; checkpoint: string | null;
          error_class: string | null; error_message: string | null;
          started_at: number | null; finished_at: number | null; created_at: number };
  step_runs: { id: string; run_id: string; step_index: number; step_type: string;
               state: string; attempts: number; last_error: string | null;
               artifacts: string; started_at: number | null; finished_at: number | null };
  anchors: { id: string; task_id: string; profile_id: string | null; anchor_key: string;
             selector: string; selector_type: string; confidence: number;
             hit_count: number; miss_count: number;
             last_hit_at: number | null; ttl_at: number | null;
             created_at: number; updated_at: number };
  events: { id: Generated<number>; ts: number; level: string; scope: string;
            event: string; profile_id: string | null; run_id: string | null;
            step_run_id: string | null; data: string };
  audit: { id: Generated<number>; ts: number; actor: string; action: string;
           target: string | null; meta: string };
  presets: { id: string; name: string; platform: string; bundle: string;
             version: number; created_at: number; updated_at: number };
};
```

```ts
// packages/core/src/persistence/repos/leaseRepo.ts
import { Kysely, sql, Transaction } from 'kysely';
import type { DB } from '../schema';
import { v4 as uuid } from 'uuid';
import type { LeaseSummary } from '@tersoo/contracts';

export class LeaseRepo {
  constructor(private db: Kysely<DB>) {}

  async getActiveForProfile(profileId: string) {
    return this.db.selectFrom('proxy_leases').selectAll()
      .where('profile_id', '=', profileId).where('state', '=', 'active')
      .executeTakeFirst();
  }

  /**
   * Atomic acquisition. Enforced by partial unique index.
   * Returns null if proxy is already leased or profile already has a lease.
   */
  async acquire(profileId: string, proxyId: string, ttlMs: number): Promise<LeaseSummary | null> {
    const id = uuid();
    const now = Date.now();
    const expiresAt = now + ttlMs;

    try {
      await this.db.insertInto('proxy_leases').values({
        id, proxy_id: proxyId, profile_id: profileId, state: 'active',
        acquired_at: now, expires_at: expiresAt, heartbeat_at: now, released_at: null,
      }).execute();
      return { id, proxyId, profileId, state: 'active',
               acquiredAt: now, expiresAt, heartbeatAt: now };
    } catch (err: any) {
      if (String(err?.message ?? '').includes('UNIQUE')) return null;
      throw err;
    }
  }

  async heartbeat(leaseId: string, ttlMs: number) {
    const now = Date.now();
    await this.db.updateTable('proxy_leases')
      .set({ heartbeat_at: now, expires_at: now + ttlMs })
      .where('id', '=', leaseId).where('state', '=', 'active').execute();
  }

  async release(leaseId: string, reason: 'released'|'expired' = 'released') {
    await this.db.updateTable('proxy_leases')
      .set({ state: reason, released_at: Date.now() })
      .where('id', '=', leaseId).where('state', '=', 'active').execute();
  }

  async sweepExpired(): Promise<number> {
    const now = Date.now();
    const res = await this.db.updateTable('proxy_leases')
      .set({ state: 'expired', released_at: now })
      .where('state', '=', 'active').where('expires_at', '<', now).executeTakeFirst();
    return Number(res.numUpdatedRows ?? 0);
  }
}
```

Same pattern for every repo. No raw SQL outside `repos/`.

---

## 10. IPC Router (Zod-validated)

```ts
// apps/desktop/src/ipc/router.ts
import { ipcMain } from 'electron';
import { Commands, Events } from '@tersoo/contracts';
import type { Container } from '@tersoo/core';
import type { BrowserWindow } from 'electron';

export function registerIpc(container: Container, getWindow: () => BrowserWindow | null) {
  const handlers: Record<keyof typeof Commands, (input: any) => Promise<any>> = {
    'profile.list':     (i) => container.services.profiles.list(i.filter),
    'profile.get':      (i) => container.services.profiles.get(i.id),
    'profile.create':   (i) => container.services.profiles.create(i),
    'profile.update':   (i) => container.services.profiles.update(i.id, i.patch),
    'profile.delete':   (i) => container.services.profiles.delete(i.id),
    'profile.launch':   (i) => container.services.profiles.launch(i.id),
    'profile.stop':     (i) => container.services.profiles.stop(i.id),

    'proxy.list':       (i) => container.services.proxies.list(i.filter),
    'proxy.create':     (i) => container.services.proxies.create(i),
    'proxy.importBulk': (i) => container.services.proxies.importBulk(i),
    'proxy.check':      (i) => container.services.proxies.check(i.id),
    'proxy.assign':     (i) => container.services.proxies.assign(i),
    'proxy.release':    (i) => container.services.proxies.release(i.profileId),
    'proxy.swap':       (i) => container.services.proxies.swap(i.profileId),

    'task.list':        ()  => container.services.tasks.list(),
    'task.create':      (i) => container.services.tasks.create(i),
    'task.dispatch':    (i) => container.services.tasks.dispatch(i),

    'run.list':         (i) => container.services.runs.list(i.filter),
    'run.cancel':       (i) => container.services.runs.cancel(i.id),
    'run.resume':       (i) => container.services.runs.resume(i.id),

    'fleet.status':     ()  => container.services.fleet.status(),
    'logs.query':       (i) => container.repos.events.query(i),
  };

  for (const [name, def] of Object.entries(Commands)) {
    ipcMain.handle(name, async (_evt, rawInput) => {
      const parsed = (def.input as any).safeParse(rawInput);
      if (!parsed.success) {
        throw new Error(`IPC_INVALID_INPUT:${name}:${parsed.error.message}`);
      }
      const result = await handlers[name as keyof typeof Commands](parsed.data);
      return (def.output as any).parse(result);
    });
  }

  // Forward EventBus → renderer
  for (const name of Object.keys(Events) as Array<keyof typeof Events>) {
    container.events.on(name, (payload) => {
      const win = getWindow();
      if (win && !win.isDestroyed()) win.webContents.send(name, payload);
    });
  }
}
```

**Rule:** every command is registered through this loop. Adding a channel means adding it to `Commands` in contracts. Nothing else.

---

## 11. Electron Main Bootstrap

```ts
// apps/desktop/src/main/index.ts
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { createContainer } from '@tersoo/core';
import { loadConfig } from '@tersoo/core/config';
import { registerIpc } from '../ipc/router';
import { recoverOrphanRuns } from './crashRecovery';

let win: BrowserWindow | null = null;

async function bootstrap() {
  const userDataDir = path.join(app.getPath('userData'), 'tersoopilot');
  const chromeBinary = process.env.TERSOO_CHROME_BINARY ?? detectChrome();
  const config = loadConfig(userDataDir, chromeBinary);

  const container = await createContainer(config);

  // Crash recovery: any run in 'running' state is paused and offered for resume.
  await recoverOrphanRuns(container);

  win = new BrowserWindow({
    width: 1440, height: 900, show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  registerIpc(container, () => win);

  if (process.env.NODE_ENV === 'development') {
    await win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  win.once('ready-to-show', () => win!.show());

  app.on('before-quit', async (e) => {
    e.preventDefault();
    await container.dispose();
    app.exit(0);
  });
}

function detectChrome(): string {
  // Platform-specific detection. Throws if not found.
  throw new Error('SPAWN_FAILED: Chrome binary not configured');
}

app.whenReady().then(bootstrap);
app.on('window-all-closed', () => app.quit());
```

---

## 12. LocalForwarder (full implementation)

This is the file that unblocks Phase 2. Do not hand-wave it.

```ts
// packages/core/src/proxy/LocalForwarder.ts
import net from 'node:net';
import { v4 as uuid } from 'uuid';

type Upstream = {
  protocol: 'socks5' | 'http' | 'https';
  host: string; port: number;
  username?: string; password?: string;
};

type ForwarderHandle = { id: string; port: number; stop: () => Promise<void> };

export class LocalForwarder {
  private handles = new Map<string, ForwarderHandle>();

  async start(input: { upstream: Upstream; bind?: string }): Promise<ForwarderHandle> {
    const id = uuid();
    const bind = input.bind ?? '127.0.0.1';

    const server = net.createServer((client) => {
      this.handleClient(client, input.upstream).catch(() => client.destroy());
    });

    await new Promise<void>((res, rej) => {
      server.once('error', rej);
      server.listen(0, bind, () => res());
    });

    const port = (server.address() as net.AddressInfo).port;
    const handle: ForwarderHandle = {
      id, port,
      stop: () => new Promise<void>((res) => server.close(() => res())),
    };
    this.handles.set(id, handle);
    return handle;
  }

  async stop(id: string) {
    const h = this.handles.get(id);
    if (!h) return;
    this.handles.delete(id);
    await h.stop();
  }

  async stopAll() {
    for (const id of [...this.handles.keys()]) await this.stop(id);
  }

  private async handleClient(client: net.Socket, upstream: Upstream) {
    // 1. SOCKS5 greeting from Chrome (no auth)
    const greeting = await readN(client, 2);
    if (greeting[0] !== 0x05) return client.destroy();
    const nmethods = greeting[1];
    await readN(client, nmethods);
    client.write(Buffer.from([0x05, 0x00])); // no-auth accepted

    // 2. Request
    const req = await readN(client, 4);
    const cmd = req[1]; // 0x01 CONNECT, 0x03 UDP ASSOCIATE (unsupported)
    const atyp = req[3];
    let host = '';
    if (atyp === 0x01) host = (await readN(client, 4)).join('.');
    else if (atyp === 0x03) {
      const len = (await readN(client, 1))[0];
      host = (await readN(client, len)).toString('utf8');
    } else if (atyp === 0x04) {
      const buf = await readN(client, 16);
      host = Array.from({ length: 8 }, (_, i) => buf.readUInt16BE(i * 2).toString(16)).join(':');
    } else return client.destroy();
    const port = (await readN(client, 2)).readUInt16BE(0);

    if (cmd !== 0x01) {
      client.write(Buffer.from([0x05, 0x07, 0x00, 0x01, 0,0,0,0, 0,0])); // cmd not supported
      return client.destroy();
    }

    // 3. Connect upstream (with auth if needed)
    const upstreamSock = await connectUpstream(upstream, host, port);

    // 4. Reply to Chrome: success
    client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0,0,0,0, 0,0]));

    // 5. Pipe
    client.pipe(upstreamSock).pipe(client);
    client.on('error', () => upstreamSock.destroy());
    upstreamSock.on('error', () => client.destroy());
  }
}

async function connectUpstream(up: Upstream, host: string, port: number): Promise<net.Socket> {
  const sock = net.connect(up.port, up.host);
  await new Promise<void>((res, rej) => {
    sock.once('connect', res); sock.once('error', rej);
  });

  if (up.protocol === 'socks5') {
    // RFC 1928 with user/pass (RFC 1929)
    sock.write(Buffer.from([0x05, up.username ? 0x02 : 0x00, ...(up.username ? [0x02] : [0x00])]));
    const choice = await readN(sock, 2);
    if (choice[1] === 0x02) {
      const u = Buffer.from(up.username ?? '', 'utf8');
      const p = Buffer.from(up.password ?? '', 'utf8');
      sock.write(Buffer.concat([Buffer.from([0x01, u.length]), u, Buffer.from([p.length]), p]));
      const ok = await readN(sock, 2);
      if (ok[1] !== 0x00) throw new Error('proxy auth failed');
    }
    const hostBuf = Buffer.from(host, 'utf8');
    sock.write(Buffer.concat([
      Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuf.length]), hostBuf,
      Buffer.from([(port >> 8) & 0xff, port & 0xff]),
    ]));
    const reply = await readN(sock, 4);
    if (reply[1] !== 0x00) throw new Error(`socks5 connect failed: ${reply[1]}`);
    // drain bound address
    const atyp = reply[3];
    if (atyp === 0x01) await readN(sock, 4 + 2);
    else if (atyp === 0x03) { const l = (await readN(sock, 1))[0]; await readN(sock, l + 2); }
    else if (atyp === 0x04) await readN(sock, 16 + 2);
  } else {
    // HTTP CONNECT
    const auth = up.username
      ? `Proxy-Authorization: Basic ${Buffer.from(`${up.username}:${up.password ?? ''}`).toString('base64')}\r\n`
      : '';
    sock.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth}\r\n`);
    const head = await readUntil(sock, '\r\n\r\n');
    if (!/^HTTP\/1\.[01] 200/.test(head)) throw new Error(`http connect failed: ${head.split('\r\n')[0]}`);
  }

  return sock;
}

function readN(sock: net.Socket, n: number): Promise<Buffer> {
  return new Promise((res, rej) => {
    const chunks: Buffer[] = []; let len = 0;
    const onData = (c: Buffer) => {
      chunks.push(c); len += c.length;
      if (len >= n) { sock.off('data', onData); res(Buffer.concat(chunks).subarray(0, n)); }
    };
    sock.on('data', onData); sock.once('error', rej);
  });
}

function readUntil(sock: net.Socket, marker: string): Promise<string> {
  return new Promise((res, rej) => {
    let buf = '';
    const onData = (c: Buffer) => {
      buf += c.toString('utf8');
      if (buf.includes(marker)) { sock.off('data', onData); res(buf); }
    };
    sock.on('data', onData); sock.once('error', rej);
  });
}
```

---

## 13. Proxy Broker (concrete)

```ts
// packages/core/src/proxy/ProxyBroker.ts
import type { LeaseRepo } from '../persistence/repos/leaseRepo';
import type { ProxyRepo } from '../persistence/repos/proxyRepo';
import type { Config } from '../config';
import { TersooError } from '../util/errors';

export class ProxyBroker {
  constructor(
    private leases: LeaseRepo,
    private proxies: ProxyRepo,
    private config: Config,
  ) {}

  async acquire(profileId: string, opts: { strategy: 'random'|'manual'; proxyId?: string }) {
    const existing = await this.leases.getActiveForProfile(profileId);
    if (existing) return existing;

    const candidate = opts.strategy === 'manual'
      ? await this.proxies.get(opts.proxyId!)
      : await this.proxies.pickHealthyUnleased();

    if (!candidate) throw new TersooError('NO_HEALTHY_PROXY', 'no healthy proxy available');

    const lease = await this.leases.acquire(profileId, candidate.id, this.config.leaseTtlMs);
    if (!lease) throw new TersooError('LEASE_CONFLICT', `proxy ${candidate.id} already leased`);
    return lease;
  }

  async release(leaseId: string) { await this.leases.release(leaseId, 'released'); }
  async heartbeat(leaseId: string) { await this.leases.heartbeat(leaseId, this.config.leaseTtlMs); }
  async sweep() { return this.leases.sweepExpired(); }

  async swap(profileId: string) {
    const existing = await this.leases.getActiveForProfile(profileId);
    if (existing) await this.release(existing.id);
    return this.acquire(profileId, { strategy: 'random' });
  }
}
```

Schedule `sweep()` and `heartbeat()` in a supervisor-owned interval.

---

## 14. Stealth Shim (full source outline)

Structure of `packages/stealth/src/stealth_shim.js`. Every hook below is mandatory.

```js
// Executed in the page context BEFORE any page script.
// Receives `__TERSOO_BUNDLE__` injected by CDPEmulator.
(function () {
  const bundle = globalThis.__TERSOO_BUNDLE__;
  if (!bundle) return;

  // -------- Deterministic PRNG (mulberry32) --------
  const seed = hashStringToInt(bundle.seed);
  const rand = mulberry32(seed);

  // -------- native toString guard --------
  const nativeToString = Function.prototype.toString;
  const spoofed = new WeakMap(); // fn -> source string
  Function.prototype.toString = function () {
    return spoofed.get(this) ?? nativeToString.call(this);
  };
  spoofed.set(Function.prototype.toString, 'function toString() { [native code] }');
  const defineNative = (obj, key, value, source) => {
    Object.defineProperty(obj, key, {
      configurable: true, enumerable: false, get: () => value,
    });
    if (typeof value === 'function') spoofed.set(value, source ?? 'function () { [native code] }');
  };

  // -------- navigator.webdriver --------
  delete Object.getPrototypeOf(navigator).webdriver;

  // -------- hardware --------
  defineNative(navigator, 'hardwareConcurrency', bundle.hardware.cores);
  defineNative(navigator, 'deviceMemory', bundle.hardware.memoryGb);
  defineNative(navigator, 'maxTouchPoints', bundle.hardware.maxTouchPoints);

  // -------- languages --------
  defineNative(navigator, 'language', bundle.locales.languages[0]);
  defineNative(navigator, 'languages', Object.freeze([...bundle.locales.languages]));

  // -------- WebGL --------
  const patchGetParameter = (proto) => {
    const orig = proto.getParameter;
    proto.getParameter = function (p) {
      if (p === 0x9245) return bundle.webgl.unmaskedVendor;   // UNMASKED_VENDOR_WEBGL
      if (p === 0x9246) return bundle.webgl.unmaskedRenderer; // UNMASKED_RENDERER_WEBGL
      return orig.call(this, p);
    };
    spoofed.set(proto.getParameter, 'function getParameter() { [native code] }');
  };
  if (globalThis.WebGLRenderingContext) patchGetParameter(WebGLRenderingContext.prototype);
  if (globalThis.WebGL2RenderingContext) patchGetParameter(WebGL2RenderingContext.prototype);

  // -------- Canvas noise --------
  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (...args) {
    applyCanvasNoise(this, rand, bundle.canvasNoise.intensity);
    return origToDataURL.apply(this, args);
  };
  const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function (...args) {
    const data = origGetImageData.apply(this, args);
    applyPixelNoise(data.data, rand, bundle.canvasNoise.intensity);
    return data;
  };

  // -------- Audio noise --------
  const origGetChannelData = AudioBuffer.prototype.getChannelData;
  AudioBuffer.prototype.getChannelData = function (...args) {
    const data = origGetChannelData.apply(this, args);
    applyFloatNoise(data, rand, bundle.audioNoise.intensity);
    return data;
  };

  // -------- chrome.runtime shape --------
  if (!globalThis.chrome) globalThis.chrome = {};
  if (!globalThis.chrome.runtime) globalThis.chrome.runtime = {};

  // -------- self-test hook --------
  globalThis.__tersooSelfTest = () => ({
    webdriver: navigator.webdriver,
    ua: navigator.userAgent,
    platform: navigator.platform,
    cores: navigator.hardwareConcurrency,
    memory: navigator.deviceMemory,
    languages: navigator.languages,
    webgl: readWebglStrings(),
  });

  // -------- helpers --------
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hashStringToInt(s) { let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0; }
  function applyCanvasNoise(canvas, rand, intensity) { /* deterministic pixel tweaks */ }
  function applyPixelNoise(data, rand, intensity) { /* deterministic pixel tweaks */ }
  function applyFloatNoise(data, rand, intensity) { /* deterministic float tweaks */ }
  function readWebglStrings() { /* return current WebGL strings */ }
})();
```

Injection:
```ts
await context.addInitScript({ content: shimSource, arg: bundle });
```
`bundle` is exposed as `globalThis.__TERSOO_BUNDLE__` via a one-liner prefix script.

---

## 15. Crosshair Worker (concrete)

```ts
// packages/core/src/crosshair/CrosshairWorker.ts
import { chromium, type Browser, type BrowserContext, type CDPSession } from 'playwright-core';
import type { FingerprintBundle } from '@tersoo/contracts';
import type { EventBus } from '../events/EventBus';
import type { AnchorRegistry } from './AnchorRegistry';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const shimSource = readFileSync(path.resolve(__dirname, '../../../../packages/stealth/dist/stealth_shim.js'), 'utf8');

export class CrosshairWorker {
  private browsers = new Map<string, { browser: Browser; context: BrowserContext; cdp: CDPSession }>();

  constructor(private deps: { events: EventBus; anchors: AnchorRegistry }) {}

  async attach(input: { profileId: string; cdpWsUrl: string; bundle: FingerprintBundle;
                        timezone: string;
                        geolocation: { lat: number; lng: number; accuracy: number } | null }) {
    const browser = await chromium.connectOverCDP(input.cdpWsUrl);
    const context = browser.contexts()[0] ?? await browser.newContext();
    const page = context.pages()[0] ?? await context.newPage();
    const cdp = await context.newCDPSession(page);

    await context.addInitScript({
      content: `globalThis.__TERSOO_BUNDLE__ = ${JSON.stringify(input.bundle)};\n${shimSource}`,
    });

    this.browsers.set(input.profileId, { browser, context, cdp });
    return this;
  }

  async applyEmulation(bundle: FingerprintBundle, proxy: { geo_tz: string | null;
    geo_lat: number | null; geo_lng: number | null }) {
    const { cdp } = this.requireCtx();
    await cdp.send('Network.setUserAgentOverride', {
      userAgent: bundle.userAgent,
      acceptLanguage: bundle.locales.acceptLanguage,
      platform: bundle.uaMetadata.platform,
      userAgentMetadata: {
        brands: bundle.uaMetadata.brands,
        fullVersion: '',
        fullVersionList: [],
        platform: bundle.uaMetadata.platform,
        platformVersion: bundle.uaMetadata.platformVersion,
        architecture: bundle.uaMetadata.architecture,
        model: bundle.uaMetadata.model,
        mobile: bundle.uaMetadata.mobile,
      },
    });
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId: proxy.geo_tz ?? bundle.timezone });
    await cdp.send('Emulation.setLocaleOverride', { locale: bundle.locales.languages[0] });
    if (proxy.geo_lat != null && proxy.geo_lng != null) {
      await cdp.send('Emulation.setGeolocationOverride',
        { latitude: proxy.geo_lat, longitude: proxy.geo_lng, accuracy: 50 });
    }
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: bundle.screen.width, height: bundle.screen.height,
      deviceScaleFactor: bundle.screen.dpr, mobile: bundle.uaMetadata.mobile,
    });
  }

  async addInitScript(_bundle: FingerprintBundle) { /* already injected above */ }

  async assertStealthReady() {
    const { browser } = this.requireCtx();
    const page = browser.contexts()[0].pages()[0];
    const result = await page.evaluate(() => (globalThis as any).__tersooSelfTest());
    if (result.webdriver !== undefined && result.webdriver !== false) {
      throw new Error('STEALTH_FAILED: navigator.webdriver still present');
    }
    return result;
  }

  async close(profileId: string) {
    const entry = this.browsers.get(profileId);
    if (!entry) return;
    this.browsers.delete(profileId);
    try { await entry.browser.close(); } catch { /* best-effort */ }
  }

  private requireCtx() {
    const entry = [...this.browsers.values()][0];
    if (!entry) throw new Error('CDP_ATTACH_FAILED: no active worker');
    return entry;
  }
}
```

---

## 16. Testkit

### `packages/testkit/src/fakeProxy.ts`
A minimal SOCKS5 server with configurable auth and latency.

```ts
import net from 'node:net';
export function startFakeProxy(opts: { port?: number; username?: string; password?: string;
                                        latencyMs?: number; }): Promise<{ port: number; stop: () => Promise<void> }> {
  const server = net.createServer((sock) => {
    // Implement SOCKS5 handshake here. On CONNECT, pipe to real target.
    // Delay by opts.latencyMs.
  });
  return new Promise((res) => server.listen(opts.port ?? 0, '127.0.0.1', () => {
    res({ port: (server.address() as net.AddressInfo).port,
          stop: () => new Promise<void>((r) => server.close(() => r())) });
  }));
}
```

### `packages/testkit/src/canaryServer.ts`
Serves static HTML pages used by crosshair tests: `#login`, `#username`, `#password`, shadow-DOM button, iframe.

### `packages/testkit/src/fixtures/`
- `presets/windows11.json`, `presets/pixel8pro.json`, `presets/macos-sonoma.json`.
- `workflows/basic-login.json`.

### Usage in integration tests
```ts
const proxy = await startFakeProxy({ latencyMs: 20 });
const canary = await startCanaryServer();
const container = await createContainer(loadConfig(tmpdir(), chromeBinary));
// override proxy host/port and run
```

---

## 17. CI/CD Pipeline

`.github/workflows/ci.yml`:

```yaml
name: ci
on: [push, pull_request]
jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm rebuild:native
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm build
      - run: pnpm test:unit
      - run: pnpm test:integration
        env:
          TERSOO_CHROME_BINARY: ${{ steps.chrome.outputs.path }}
      - run: pnpm test:e2e
        if: matrix.os == 'ubuntu-latest'
```

Release workflow builds signed artifacts on tag push.

---

## 18. Phase-by-Phase Agent Task Breakdown

Give each agent **one ticket at a time**. Each ticket has a file path, an acceptance criterion, and a test.

### Phase 0 — Foundation (12 tickets)

| # | Ticket | Files | Test |
|---|---|---|---|
| 0.1 | Monorepo scaffolding | `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json` | `pnpm build` |
| 0.2 | ESLint + Prettier + CI | `.eslintrc.cjs`, `.prettierrc`, `.github/workflows/ci.yml` | CI green |
| 0.3 | `packages/contracts` — primitives + fingerprint | `packages/contracts/src/*` | `vitest` round-trip |
| 0.4 | `packages/contracts` — profile, proxy, task, channels | same | same |
| 0.5 | `packages/core` — config, errors, logger | `packages/core/src/{config,util}` | unit |
| 0.6 | `packages/core` — db + migration runner | `packages/core/src/persistence/{db,migrate}.ts` | integration |
| 0.7 | `migrations/0001_init.sql` | file | applied on boot |
| 0.8 | `packages/core` — Kysely schema + Repos skeleton | `packages/core/src/persistence/schema.ts`, `repos/` | unit |
| 0.9 | `EventBus`, `JobQueue`, `SecretVault` | `packages/core/src/{events,queue,secrets}` | unit |
| 0.10 | Electron main + preload | `apps/desktop/src/{main,preload}` | window opens |
| 0.11 | IPC router + Zod validation | `apps/desktop/src/ipc/router.ts` | round-trip |
| 0.12 | DI container | `packages/core/src/container/index.ts` | boot test |

### Phase 1 — Profiles + Supervisor (8 tickets)

| # | Ticket | Files | Test |
|---|---|---|---|
| 1.1 | `ProfileRepo` CRUD | `repos/profileRepo.ts` | unit |
| 1.2 | `ProfileService` CRUD | `services/ProfileService.ts` | unit |
| 1.3 | `BrowserSupervisor.spawn` + `buildArgs` | `supervisor/*.ts` | integration |
| 1.4 | `DevToolsActivePort` discovery | `supervisor/cdpDiscovery.ts` | integration |
| 1.5 | File lock + profile state DB writes | `ProfileRepo` | unit |
| 1.6 | `ProfileService.launch` orchestration | `services/ProfileService.ts` | integration |
| 1.7 | ProfilesView UI | `apps/renderer/src/views/ProfilesView/` | e2e |
| 1.8 | Stop + crash detection | `BrowserSupervisor` | integration |

### Phase 2 — Proxy (9 tickets)
`LocalForwarder`, `ingest`, `HealthProbe`, `ProxyBroker`, `ProxyRepo`, `LeaseRepo`, `ProxyService`, `ProxyVaultView`, lease sweep scheduler.

### Phase 3 — Fingerprint (7 tickets)
Presets, `FingerprintEngine`, coherence rules, `stealth_shim.js`, `CDPEmulator`, self-test page, preset UI.

### Phase 4 — Crosshair (10 tickets)
`CrosshairWorker`, `XPathResolver`, `ShadowDom`, `AnchorRegistry`, `Humanizer` (mouse, keyboard, scroll), `StepRunner` for each step type, `WorkflowValidator`, `TaskStudioView`.

### Phase 5 — Fleet (8 tickets)
`FleetService`, concurrency governor, stagger, `RunService`, `runs`/`step_runs` repos, `RunsView`, `LogsView`, checkpoint/resume.

### Phase 6 — Hardening (8 tickets)
CSP audit, IPC coverage tests, electron-builder config, signing, `electron-updater`, backup/restore, import/export, soak test.

### Phase 7 — Extensibility (4 tickets)
Plugin SDK skeleton, CLI, HTTP API, remote worker nodes (design only).

---

## 19. Anti-Patterns (Do Not Do)

1. **Do not** call `child_process.spawn` outside `BrowserSupervisor`.
2. **Do not** open a `net.Socket` to a proxy outside `LocalForwarder`.
3. **Do not** write to SQLite outside a `Repo`.
4. **Do not** construct Zod schemas inline in IPC handlers — use `@tersoo/contracts`.
5. **Do not** store secrets in the DB. Only keychain references.
6. **Do not** log secrets, cookies, or full proxy credentials.
7. **Do not** use `chrome.webRequest` MV3 extensions for proxy auth.
8. **Do not** hardcode debug ports.
9. **Do not** mix raw CDP and Playwright inside the same worker without a session boundary.
10. **Do not** launch a profile without a lease.
11. **Do not** apply stealth shim after navigation.
12. **Do not** mutate `runs.state` without emitting an event.
13. **Do not** catch and swallow `TersooError` without emitting an alert.
14. **Do not** add dependencies without justification in the PR.
15. **Do not** ship a build without `pnpm rebuild:native` in CI.

---

## 20. Definition of Done (per PR)

- [ ] Ticket number in branch and PR title.
- [ ] No `any` in exported types.
- [ ] All thrown errors are `TersooError` subclasses.
- [ ] All state transitions emit events.
- [ ] Unit tests added (coverage ≥ 80% on new code).
- [ ] Integration test added if touching supervisor, proxy, or task.
- [ ] No new deps without justification.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.
- [ ] Contracts unchanged OR migration + version bump included.
- [ ] No secrets in DB, logs, or error messages.
- [ ] Updated docs if the change affects any section of ARCHITECTURE.md.
- [ ] Added to CHANGELOG under "Unreleased".

---

**End of companion. Version 1.0.0.**
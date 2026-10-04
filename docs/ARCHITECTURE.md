# TersooPilot Desktop — Master Architecture & Implementation Plan

> **Audience:** Google Antigravity coding agents (and human reviewers).
> **Purpose:** Single source of truth for building TersooPilot Desktop from scratch.
> **Version:** 1.0.0
> **Status:** Frozen for Phase 0. Changes require a migration + version bump.
> **Reading order:** Read top to bottom once before writing any code. Sections 4–12 are the contracts you must obey. Sections 13–18 are the plan.

---

## Table of Contents

1. Mission & Scope
2. Non-Goals
3. Design Principles (Invariants)
4. Technology Stack
5. System Architecture
6. Repository Layout
7. Data Model (SQL DDL + Migrations)
8. IPC Contracts (Zod)
9. Core Services
10. Browser Supervisor & Launch Sequence
11. Fingerprint Engine & Stealth Shim
12. Proxy Subsystem (LocalForwarder + ProxyBroker)
13. Crosshair Automation Engine
14. Task Engine & Workflow Schema
15. UI Architecture
16. Observability, Security, Failure Handling
17. Testing Strategy
18. Build Phases (0 → 7) with Exit Criteria
19. Agent Working Rules
20. Appendix A — Launch Flags
21. Appendix B — Error Taxonomy
22. Appendix C — Event Taxonomy
23. Appendix D — Glossary

---

## 1. Mission & Scope

TersooPilot Desktop is a **multi-profile Chromium workstation** for authorized QA, privacy research, and account management. It runs N isolated browser profiles concurrently on a desktop OS, each with:

- A dedicated `--user-data-dir` (100% on-disk isolation).
- A dedicated OS process (no shared memory / runtime state).
- A dedicated outbound network path (per-profile proxy + local forwarder).
- A coherent fingerprint bundle (UA, UA-CH, WebGL, canvas, audio, hardware, timezone, locale, geolocation).
- An automation worker driven by Chrome DevTools Protocol (CDP).

The application is a **local daemon + desktop UI**. All state lives in a single SQLite DB and the OS keychain. Nothing is cloud-hosted.

---

## 2. Non-Goals

TersooPilot Desktop does **not**:

- Provide cloud/sync/multi-tenant storage.
- Bundle ChromeDriver, Selenium, or any WebDriver binary.
- Rely on Python at runtime.
- Use Manifest V3 proxy auth extensions (broken on modern Chrome).
- Store plaintext proxy credentials or session cookies on disk.
- Attempt to defeat anti-fraud on systems the user is not authorized to test.
- Ship any telemetry to a remote server by default.

---

## 3. Design Principles (Invariants)

These are **hard rules**. Violating any is a build failure.

1. **One profile = one OS process = one identity.** No shared Chromium runtime state between profiles.
2. **SQLite is the single source of truth.** The UI is a projection; browser processes are ephemeral.
3. **Every long-running operation is resumable.** Tasks, health checks, launches checkpoint.
4. **Secrets never touch disk in plaintext.** OS keychain only. DB stores references.
5. **CDP is the only control channel.** No Selenium, no WebDriver, no injected JS bridges.
6. **Coherence > spoofing.** A fingerprint bundle must be internally consistent.
7. **Observability is a feature.** Every state transition emits a structured event.
8. **UI is a thin client.** Same daemon powers CLI, HTTP API, and desktop UI.
9. **Atomicity at the DB.** Lease uniqueness, idempotency, and migrations are enforced by SQLite.
10. **No hidden network I/O.** Every outbound byte goes through a per-profile forwarder.

---

## 4. Technology Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict, Node 20+) | Single language across all packages |
| Desktop shell | Electron 32+ | `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` |
| Renderer | React 18 + Vite + Tailwind + shadcn/ui | Zustand for local state |
| Orchestration | Node.js in Electron main | DI container, service layer |
| Automation | `playwright-core` (connectOverCDP) | CDP sessions for low-level control |
| Persistence | `better-sqlite3` + Kysely | WAL, FK on, migrations |
| Secrets | `keytar` (fallback: Electron `safeStorage`) | Never store plaintext |
| Proxy | Custom `LocalForwarder` in Node | SOCKS5 + HTTP upstream auth |
| Stealth | Vanilla ES2022 `stealth_shim.js` | Injected via `addInitScript` |
| Logging | `pino` → SQLite `events` + rotating file | Structured JSON |
| Validation | Zod | IPC + configs + workflow schema |
| Testing | Vitest + Playwright Test + local canary | Unit + integration + e2e |
| Packaging | `electron-builder` | Signed, auto-update via `electron-updater` |
| Monorepo | pnpm workspaces + Turborepo | Build caching |
| Lint/format | ESLint (flat) + Prettier | Enforced in CI |

---

## 5. System Architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│                          TersooPilot Desktop                              │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  Presentation Tier (Electron Renderer, React + Vite)                │  │
│  │  Profile Studio │ Proxy Vault │ Task Studio │ Fleet Monitor │ Logs  │  │
│  └─────────────────────────────┬───────────────────────────────────────┘  │
│                                │ ContextBridge IPC (typed, validated)     │
│  ┌─────────────────────────────▼───────────────────────────────────────┐  │
│  │  Orchestration Tier (Electron Main / Node)                          │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ │  │
│  │  │ ProfileSvc   │ │ ProxySvc     │ │ TaskSvc      │ │ FleetSvc    │ │  │
│  │  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬──────┘ │  │
│  │  ┌──────▼────────────────▼────────────────▼────────────────▼──────┐ │  │
│  │  │            Core Services (DI Container)                        │ │  │
│  │  │  BrowserSupervisor │ ProxyBroker │ SecretVault │ EventBus      │ │  │
│  │  │  JobQueue │ FingerprintEngine │ AnchorRegistry │ HealthProbe   │ │  │
│  │  └────────────────────────────────┬───────────────────────────────┘ │  │
│  │  ┌────────────────────────────────▼───────────────────────────────┐ │  │
│  │  │  Persistence (SQLite WAL + Keychain)                           │ │  │
│  │  │  profiles │ proxies │ proxy_leases │ tasks │ runs │ step_runs  │ │  │
│  │  │  anchors │ events │ audit │ migrations                         │ │  │
│  │  └────────────────────────────────────────────────────────────────┘ │  │
│  └─────────────────────────────┬───────────────────────────────────────┘  │
│                                │ spawn + CDP                              │
│  ┌─────────────────────────────▼───────────────────────────────────────┐  │
│  │  Browser Tier                                                       │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐        ┌──────────────────┐ │  │
│  │  │ Chromium │ │ Chromium │ │ Chromium │  ...   │ LocalForwarder   │ │  │
│  │  │ Profile1 │ │ Profile2 │ │ Profile3 │        │ (SOCKS/HTTP auth)│ │  │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘        └──────────────────┘ │  │
│  │       │ CDP        │ CDP        │ CDP                                │  │
│  │  ┌────▼────────────▼────────────▼─────┐                             │  │
│  │  │  Crosshair Workers (in-main or     │                             │  │
│  │  │  utility processes, per profile)   │                             │  │
│  │  └────────────────────────────────────┘                             │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────┘
```

**Data flow:**

1. Renderer calls `window.tersoo.invoke('profile.launch', { id })`.
2. Main validates input with Zod, routes to `ProfileService`.
3. `ProfileService` → `BrowserSupervisor.launch()` → coordinates with `ProxyBroker`, `SecretVault`, `FingerprintEngine`, `LocalForwarder`, `HealthProbe`, `CrosshairWorker`.
4. `EventBus` pushes state changes back to renderer via `webContents.send`.

---

## 6. Repository Layout

```
tersoopilot-desktop/
├── apps/
│   ├── desktop/                    # Electron main + preload
│   │   ├── src/
│   │   │   ├── main/
│   │   │   │   ├── index.ts                 # Entry, lifecycle
│   │   │   │   ├── container.ts             # DI wiring
│   │   │   │   ├── windows.ts               # BrowserWindow manager
│   │   │   │   ├── crashRecovery.ts
│   │   │   │   └── updater.ts
│   │   │   ├── preload/
│   │   │   │   └── index.ts                 # contextBridge
│   │   │   └── ipc/
│   │   │       ├── router.ts                # channel → handler
│   │   │       └── handlers/
│   │   │           ├── profile.ts
│   │   │           ├── proxy.ts
│   │   │           ├── task.ts
│   │   │           ├── run.ts
│   │   │           └── fleet.ts
│   │   └── package.json
│   └── renderer/                   # React UI
│       ├── src/
│       │   ├── app/
│       │   ├── components/
│       │   ├── views/
│       │   │   ├── ProfilesView/
│       │   │   ├── ProxyVaultView/
│       │   │   ├── TaskStudioView/
│       │   │   ├── RunsView/
│       │   │   ├── FleetMonitorView/
│       │   │   ├── LogsView/
│       │   │   └── SettingsView/
│       │   ├── stores/
│       │   ├── hooks/
│       │   └── lib/
│       └── package.json
├── packages/
│   ├── contracts/                  # Zod schemas + shared types
│   │   ├── src/
│   │   │   ├── primitives.ts
│   │   │   ├── fingerprint.ts
│   │   │   ├── profile.ts
│   │   │   ├── proxy.ts
│   │   │   ├── task.ts
│   │   │   ├── run.ts
│   │   │   ├── events.ts
│   │   │   ├── channels.ts
│   │   │   └── index.ts
│   │   └── package.json
│   ├── core/                       # All runtime services
│   │   ├── src/
│   │   │   ├── container/
│   │   │   ├── events/             # EventBus
│   │   │   ├── queue/              # JobQueue
│   │   │   ├── secrets/            # SecretVault
│   │   │   ├── persistence/
│   │   │   │   ├── db.ts           # better-sqlite3 client
│   │   │   │   ├── migrate.ts      # Migration runner
│   │   │   │   └── repos/
│   │   │   │       ├── profileRepo.ts
│   │   │   │       ├── proxyRepo.ts
│   │   │   │       ├── leaseRepo.ts
│   │   │   │       ├── taskRepo.ts
│   │   │   │       ├── runRepo.ts
│   │   │   │       ├── anchorRepo.ts
│   │   │   │       ├── eventRepo.ts
│   │   │   │       └── auditRepo.ts
│   │   │   ├── supervisor/
│   │   │   │   ├── BrowserSupervisor.ts
│   │   │   │   ├── InstanceRegistry.ts
│   │   │   │   ├── launchSequence.ts
│   │   │   │   ├── buildArgs.ts
│   │   │   │   └── cdpDiscovery.ts
│   │   │   ├── proxy/
│   │   │   │   ├── LocalForwarder.ts
│   │   │   │   ├── socks5.ts
│   │   │   │   ├── httpConnect.ts
│   │   │   │   ├── ProxyBroker.ts
│   │   │   │   ├── ingest.ts       # Bulk import parser
│   │   │   │   └── HealthProbe.ts
│   │   │   ├── fingerprint/
│   │   │   │   ├── FingerprintEngine.ts
│   │   │   │   ├── coherence.ts
│   │   │   │   ├── presets.ts
│   │   │   │   ├── noise.ts        # Deterministic PRNG
│   │   │   │   └── selfTest.ts
│   │   │   ├── crosshair/
│   │   │   │   ├── CrosshairWorker.ts
│   │   │   │   ├── CdpEmulator.ts
│   │   │   │   ├── XPathResolver.ts
│   │   │   │   ├── AnchorRegistry.ts
│   │   │   │   ├── Humanizer.ts
│   │   │   │   └── ShadowDom.ts
│   │   │   ├── task/
│   │   │   │   ├── WorkflowValidator.ts
│   │   │   │   ├── StepRunner.ts
│   │   │   │   ├── policies.ts
│   │   │   │   └── checkpoint.ts
│   │   │   ├── services/
│   │   │   │   ├── ProfileService.ts
│   │   │   │   ├── ProxyService.ts
│   │   │   │   ├── TaskService.ts
│   │   │   │   ├── RunService.ts
│   │   │   │   └── FleetService.ts
│   │   │   └── util/
│   │   │       ├── logger.ts
│   │   │       ├── ids.ts
│   │   │       ├── time.ts
│   │   │       └── errors.ts
│   │   └── package.json
│   ├── stealth/                    # stealth_shim.js + coherence rules
│   │   ├── src/
│   │   │   ├── stealth_shim.js
│   │   │   ├── bundle.d.ts
│   │   │   └── index.ts
│   │   └── package.json
│   ├── shared/                     # Utils, errors, logging base
│   └── testkit/                    # Fixtures, canary server, fake proxy
├── migrations/
│   ├── 0001_init.sql
│   └── ...
├── scripts/
│   ├── dev.ts
│   ├── build.ts
│   └── migrate.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
│   ├── architecture.md             # this file
│   ├── data-model.md
│   ├── ipc.md
│   └── workflows.md
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json
```

---

## 7. Data Model (SQL DDL + Migrations)

**Rules:**
- One SQLite DB at `{userData}/tersoopilot/tersoopilot.db`.
- WAL mode, `foreign_keys = ON`, `busy_timeout = 5000`.
- All timestamps are Unix ms UTC as `INTEGER`.
- All JSON columns store UTF-8 strings.
- Migrations live in `migrations/NNNN_*.sql`, applied in order, checksummed.

```sql
-- ============================================================
-- migrations/0001_init.sql
-- ============================================================
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA temp_store = MEMORY;

CREATE TABLE presets (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  platform      TEXT NOT NULL CHECK (platform IN ('windows','macos','android')),
  bundle        TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE proxies (
  id                TEXT PRIMARY KEY,
  protocol          TEXT NOT NULL CHECK (protocol IN ('socks5','http','https')),
  host              TEXT NOT NULL,
  port              INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
  username          TEXT,
  password_ref      TEXT,
  geo_country       TEXT,
  geo_city          TEXT,
  geo_tz            TEXT,
  geo_isp           TEXT,
  geo_lat           REAL,
  geo_lng           REAL,
  exit_ip           TEXT,
  last_checked_at   INTEGER,
  last_latency_ms   INTEGER,
  status            TEXT NOT NULL DEFAULT 'unknown'
                    CHECK (status IN ('unknown','healthy','slow','auth_error','dead')),
  status_reason     TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX idx_proxies_status ON proxies(status);
CREATE INDEX idx_proxies_country ON proxies(geo_country);

CREATE TABLE profiles (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  tags              TEXT NOT NULL DEFAULT '[]',
  preset_id         TEXT NOT NULL REFERENCES presets(id) ON DELETE RESTRICT,
  fingerprint_seed  TEXT NOT NULL,
  fingerprint_bundle TEXT NOT NULL,
  user_data_dir     TEXT NOT NULL,
  state             TEXT NOT NULL DEFAULT 'idle'
                    CHECK (state IN ('idle','running','paused','crashed','archived')),
  notes             TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  last_launched_at  INTEGER,
  UNIQUE (user_data_dir)
);
CREATE INDEX idx_profiles_state ON profiles(state);
CREATE INDEX idx_profiles_preset ON profiles(preset_id);

CREATE TABLE proxy_leases (
  id            TEXT PRIMARY KEY,
  proxy_id      TEXT NOT NULL REFERENCES proxies(id) ON DELETE CASCADE,
  profile_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  state         TEXT NOT NULL CHECK (state IN ('active','released','expired')),
  acquired_at   INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  released_at   INTEGER,
  heartbeat_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX uq_lease_active_proxy
  ON proxy_leases(proxy_id) WHERE state = 'active';
CREATE UNIQUE INDEX uq_lease_active_profile
  ON proxy_leases(profile_id) WHERE state = 'active';
CREATE INDEX idx_lease_expiry ON proxy_leases(state, expires_at);

CREATE TABLE tasks (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  schema_version  INTEGER NOT NULL DEFAULT 1,
  definition      TEXT NOT NULL,
  tags            TEXT NOT NULL DEFAULT '[]',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE runs (
  id              TEXT PRIMARY KEY,
  task_id         TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  profile_id      TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  state           TEXT NOT NULL CHECK (state IN
                    ('queued','starting','running','paused','succeeded','failed','cancelled')),
  idempotency_key TEXT,
  attempt         INTEGER NOT NULL DEFAULT 0,
  checkpoint      TEXT,
  error_class     TEXT,
  error_message   TEXT,
  started_at      INTEGER,
  finished_at     INTEGER,
  created_at      INTEGER NOT NULL,
  UNIQUE (idempotency_key)
);
CREATE INDEX idx_runs_state ON runs(state);
CREATE INDEX idx_runs_task ON runs(task_id);
CREATE INDEX idx_runs_profile ON runs(profile_id);

CREATE TABLE step_runs (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_index    INTEGER NOT NULL,
  step_type     TEXT NOT NULL,
  state         TEXT NOT NULL CHECK (state IN
                  ('pending','running','succeeded','failed','skipped')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  artifacts     TEXT NOT NULL DEFAULT '{}',
  started_at    INTEGER,
  finished_at   INTEGER,
  UNIQUE (run_id, step_index)
);
CREATE INDEX idx_step_runs_run ON step_runs(run_id);

CREATE TABLE anchors (
  id            TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL,
  profile_id    TEXT,
  anchor_key    TEXT NOT NULL,
  selector      TEXT NOT NULL,
  selector_type TEXT NOT NULL CHECK (selector_type IN ('xpath','css','role','text')),
  confidence    REAL NOT NULL DEFAULT 1.0,
  hit_count     INTEGER NOT NULL DEFAULT 0,
  miss_count    INTEGER NOT NULL DEFAULT 0,
  last_hit_at   INTEGER,
  ttl_at        INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE (task_id, profile_id, anchor_key)
);
CREATE INDEX idx_anchors_lookup ON anchors(task_id, profile_id, anchor_key);

CREATE TABLE events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            INTEGER NOT NULL,
  level         TEXT NOT NULL CHECK (level IN ('debug','info','warn','error','fatal')),
  scope         TEXT NOT NULL,
  event         TEXT NOT NULL,
  profile_id    TEXT,
  run_id        TEXT,
  step_run_id   TEXT,
  data          TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_events_ts ON events(ts DESC);
CREATE INDEX idx_events_scope ON events(scope, ts DESC);
CREATE INDEX idx_events_profile ON events(profile_id, ts DESC);
CREATE INDEX idx_events_run ON events(run_id, ts DESC);

CREATE TABLE audit (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        INTEGER NOT NULL,
  actor     TEXT NOT NULL,
  action    TEXT NOT NULL,
  target    TEXT,
  meta      TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_audit_ts ON audit(ts DESC);

CREATE TABLE migrations (
  version     INTEGER PRIMARY KEY,
  applied_at  INTEGER NOT NULL,
  checksum    TEXT NOT NULL
);
```

### Critical queries

**Atomic lease acquisition:**
```sql
BEGIN IMMEDIATE;
INSERT INTO proxy_leases (id, proxy_id, profile_id, state,
                          acquired_at, expires_at, heartbeat_at)
SELECT ?, p.id, ?, 'active', ?, ?, ?
FROM proxies p
WHERE p.id = ?
  AND p.status = 'healthy'
  AND NOT EXISTS (
    SELECT 1 FROM proxy_leases l
    WHERE l.proxy_id = p.id AND l.state = 'active'
  );
-- if changes() = 0 → unavailable, rollback
COMMIT;
```

**Lease heartbeat + expiry sweep:**
```sql
UPDATE proxy_leases SET heartbeat_at = ?, expires_at = ?
WHERE id = ? AND state = 'active';

UPDATE proxy_leases SET state = 'expired', released_at = ?
WHERE state = 'active' AND expires_at < ?;
```

### Keychain keys

- `tersoopilot/proxy/{proxy_id}/password`
- `tersoopilot/session/{profile_id}/{domain}` (optional)
- `tersoopilot/signing/update`

### Filesystem

```
{userData}/tersoopilot/
├── profiles/{profile_id}/
│   ├── chromium/          (--user-data-dir)
│   ├── cache/             (--disk-cache-dir)
│   ├── crash/             (--crash-dumps-dir)
│   ├── artifacts/{run_id}/
│   └── profile.lock
├── logs/
├── tersoopilot.db
└── tersoopilot.db-wal
```

---

## 8. IPC Contracts (Zod)

Every channel validated on both sides. No `any` payloads across the boundary.

### `packages/contracts/src/primitives.ts`
```ts
import { z } from 'zod';

export const Id = z.string().uuid();
export const Timestamp = z.number().int().nonnegative();
export const Tags = z.array(z.string().min(1).max(64)).max(32);

export const Platform = z.enum(['windows', 'macos', 'android']);
export const ProxyProtocol = z.enum(['socks5', 'http', 'https']);
export const ProxyStatus = z.enum(['unknown','healthy','slow','auth_error','dead']);
export const ProfileState = z.enum(['idle','running','paused','crashed','archived']);
export const RunState = z.enum(['queued','starting','running','paused','succeeded','failed','cancelled']);
export const StepState = z.enum(['pending','running','succeeded','failed','skipped']);
export const LogLevel = z.enum(['debug','info','warn','error','fatal']);
export const LogScope = z.enum(['supervisor','proxy','task','ui','security','db']);
```

### `packages/contracts/src/fingerprint.ts`
```ts
import { z } from 'zod';
import { Platform } from './primitives';

export const FingerprintBundle = z.object({
  seed: z.string().min(8),
  platform: Platform,
  userAgent: z.string().min(20),
  uaMetadata: z.object({
    brands: z.array(z.object({ brand: z.string(), version: z.string() })),
    platform: z.string(),
    platformVersion: z.string(),
    architecture: z.string(),
    model: z.string(),
    mobile: z.boolean(),
  }),
  screen: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    availWidth: z.number().int().positive(),
    availHeight: z.number().int().positive(),
    colorDepth: z.number().int().min(16).max(48),
    dpr: z.number().min(1).max(4),
  }),
  webgl: z.object({
    vendor: z.string(),
    renderer: z.string(),
    unmaskedVendor: z.string(),
    unmaskedRenderer: z.string(),
  }),
  canvasNoise: z.object({
    enabled: z.boolean(),
    algorithm: z.enum(['perlin','gaussian','uniform']),
    intensity: z.number().min(0).max(1),
  }),
  audioNoise: z.object({
    enabled: z.boolean(),
    algorithm: z.enum(['gaussian','uniform']),
    intensity: z.number().min(0).max(1),
  }),
  hardware: z.object({
    cores: z.number().int().min(1).max(64),
    memoryGb: z.number().min(0.5).max(256),
    maxTouchPoints: z.number().int().min(0).max(10),
  }),
  locales: z.object({
    languages: z.array(z.string()).min(1),
    acceptLanguage: z.string(),
  }),
  timezone: z.string(),
  geolocation: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy: z.number().positive(),
  }).nullable(),
  webrtcPolicy: z.literal('disable_non_proxied_udp'),
  webdriverHidden: z.literal(true),
});
export type FingerprintBundle = z.infer<typeof FingerprintBundle>;
```

### `packages/contracts/src/profile.ts`
```ts
import { z } from 'zod';
import { Id, Timestamp, Tags, ProfileState } from './primitives';
import { FingerprintBundle } from './fingerprint';

export const ProfileSummary = z.object({
  id: Id, name: z.string(), tags: Tags, presetId: Id,
  state: ProfileState, platform: z.string(),
  proxyId: Id.nullable(),
  lastLaunchedAt: Timestamp.nullable(),
  createdAt: Timestamp, updatedAt: Timestamp,
});

export const ProfileDetail = ProfileSummary.extend({
  fingerprintSeed: z.string(),
  fingerprintBundle: FingerprintBundle,
  userDataDir: z.string(),
  notes: z.string().nullable(),
});

export const ProfileCreateInput = z.object({
  name: z.string().min(1).max(120),
  presetId: Id,
  tags: Tags.default([]),
  notes: z.string().max(2000).optional(),
  proxyId: Id.nullable().optional(),
  fingerprintSeed: z.string().min(8).optional(),
});

export const ProfileUpdateInput = z.object({
  name: z.string().min(1).max(120).optional(),
  tags: Tags.optional(),
  notes: z.string().max(2000).nullable().optional(),
  presetId: Id.optional(),
});

export type ProfileSummary = z.infer<typeof ProfileSummary>;
export type ProfileDetail = z.infer<typeof ProfileDetail>;
export type ProfileCreateInput = z.infer<typeof ProfileCreateInput>;
export type ProfileUpdateInput = z.infer<typeof ProfileUpdateInput>;
```

### `packages/contracts/src/proxy.ts`
```ts
import { z } from 'zod';
import { Id, Timestamp, ProxyProtocol, ProxyStatus } from './primitives';

export const ProxySummary = z.object({
  id: Id, protocol: ProxyProtocol, host: z.string(), port: z.number().int(),
  username: z.string().nullable(),
  geoCountry: z.string().nullable(), geoCity: z.string().nullable(),
  geoTz: z.string().nullable(), geoIsp: z.string().nullable(),
  exitIp: z.string().nullable(),
  status: ProxyStatus, statusReason: z.string().nullable(),
  lastCheckedAt: Timestamp.nullable(), lastLatencyMs: z.number().int().nullable(),
  createdAt: Timestamp,
});

export const ProxyCreateInput = z.object({
  protocol: ProxyProtocol,
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  username: z.string().optional(),
  password: z.string().optional(),
});

export const ProxyBulkImportInput = z.object({
  text: z.string().optional(),
  filePath: z.string().optional(),
  format: z.enum(['auto','ip:port:user:pass','url','ip:port']).default('auto'),
}).refine(d => d.text || d.filePath, 'text or filePath required');

export const ImportReport = z.object({
  parsed: z.number().int(), imported: z.number().int(), skipped: z.number().int(),
  errors: z.array(z.object({ line: z.number().int(), reason: z.string() })),
});

export const HealthResult = z.object({
  proxyId: Id, ok: z.boolean(),
  latencyMs: z.number().int().nullable(),
  exitIp: z.string().nullable(),
  geo: z.object({
    country: z.string().nullable(), city: z.string().nullable(),
    tz: z.string().nullable(), isp: z.string().nullable(),
    lat: z.number().nullable(), lng: z.number().nullable(),
  }),
  webrtcSafe: z.boolean(), dnsSafe: z.boolean(),
  error: z.string().nullable(),
});

export const LeaseSummary = z.object({
  id: Id, proxyId: Id, profileId: Id,
  state: z.enum(['active','released','expired']),
  acquiredAt: Timestamp, expiresAt: Timestamp, heartbeatAt: Timestamp,
});

export type ProxySummary = z.infer<typeof ProxySummary>;
export type ProxyCreateInput = z.infer<typeof ProxyCreateInput>;
export type HealthResult = z.infer<typeof HealthResult>;
export type LeaseSummary = z.infer<typeof LeaseSummary>;
```

### `packages/contracts/src/task.ts`
```ts
import { z } from 'zod';
import { Id, Timestamp, Tags, RunState, StepState } from './primitives';

export const Step = z.discriminatedUnion('type', [
  z.object({ type: z.literal('navigate'), url: z.string().url(),
             waitUntil: z.enum(['load','domcontentloaded','networkidle']).default('domcontentloaded') }),
  z.object({ type: z.literal('waitFor'), selector: z.string(),
             timeoutMs: z.number().int().min(100).max(120000).default(15000) }),
  z.object({ type: z.literal('click'), selector: z.string(), humanized: z.boolean().default(true) }),
  z.object({ type: z.literal('type'), selector: z.string(), text: z.string(),
             humanized: z.boolean().default(true) }),
  z.object({ type: z.literal('scroll'), direction: z.enum(['up','down']),
             amount: z.number().int().min(1), kinetic: z.boolean().default(true) }),
  z.object({ type: z.literal('extract'), selector: z.string(), as: z.string(),
             attribute: z.string().optional() }),
  z.object({ type: z.literal('screenshot'), name: z.string() }),
  z.object({ type: z.literal('sleep'), minMs: z.number().int().min(0),
             maxMs: z.number().int().min(0) }),
]);

export const Workflow = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1),
  variables: z.record(z.string()).default({}),
  steps: z.array(Step).min(1),
});

export const FailurePolicy = z.enum(['skip','retry','screenshot_abort','pause_alert']);

export const TaskSummary = z.object({
  id: Id, name: z.string(), tags: Tags,
  schemaVersion: z.number().int(),
  createdAt: Timestamp, updatedAt: Timestamp,
});
export const TaskDetail = TaskSummary.extend({ definition: Workflow });
export const TaskCreateInput = z.object({
  name: z.string(), tags: Tags.default([]), definition: Workflow,
});

export const DispatchInput = z.object({
  taskId: Id,
  targets: z.object({
    profileIds: z.array(Id).optional(),
    tags: z.array(z.string()).optional(),
    all: z.boolean().optional(),
  }),
  options: z.object({
    concurrency: z.number().int().min(1).max(64).default(5),
    staggerMinMs: z.number().int().min(0).default(10000),
    staggerMaxMs: z.number().int().min(0).default(30000),
    failurePolicy: FailurePolicy.default('retry'),
    maxAttempts: z.number().int().min(1).max(10).default(3),
  }).default({}),
});

export const RunSummary = z.object({
  id: Id, taskId: Id, profileId: Id, state: RunState,
  attempt: z.number().int(),
  startedAt: Timestamp.nullable(), finishedAt: Timestamp.nullable(),
  errorClass: z.string().nullable(), errorMessage: z.string().nullable(),
});

export const StepRun = z.object({
  id: Id, runId: Id, stepIndex: z.number().int(), stepType: z.string(),
  state: StepState, attempts: z.number().int(),
  lastError: z.string().nullable(),
  artifacts: z.record(z.any()),
  startedAt: Timestamp.nullable(), finishedAt: Timestamp.nullable(),
});

export type Workflow = z.infer<typeof Workflow>;
export type TaskCreateInput = z.infer<typeof TaskCreateInput>;
export type DispatchInput = z.infer<typeof DispatchInput>;
export type RunSummary = z.infer<typeof RunSummary>;
export type StepRun = z.infer<typeof StepRun>;
```

### `packages/contracts/src/channels.ts`
```ts
import { z } from 'zod';
import * as C from './index';

export const Commands = {
  'profile.list':     { input: z.object({ filter: z.any().optional() }), output: z.array(C.ProfileSummary) },
  'profile.get':      { input: z.object({ id: C.Id }), output: C.ProfileDetail },
  'profile.create':   { input: C.ProfileCreateInput, output: C.ProfileDetail },
  'profile.update':   { input: z.object({ id: C.Id, patch: C.ProfileUpdateInput }), output: C.ProfileDetail },
  'profile.delete':   { input: z.object({ id: C.Id }), output: z.void() },
  'profile.launch':   { input: z.object({ id: C.Id }), output: z.object({ runId: C.Id.optional() }) },
  'profile.stop':     { input: z.object({ id: C.Id }), output: z.void() },

  'proxy.list':       { input: z.object({ filter: z.any().optional() }), output: z.array(C.ProxySummary) },
  'proxy.create':     { input: C.ProxyCreateInput, output: C.ProxySummary },
  'proxy.importBulk': { input: C.ProxyBulkImportInput, output: C.ImportReport },
  'proxy.check':      { input: z.object({ id: C.Id }), output: C.HealthResult },
  'proxy.assign':     { input: z.object({ profileId: C.Id, strategy: z.enum(['manual','random']), proxyId: C.Id.optional() }), output: C.LeaseSummary },
  'proxy.release':    { input: z.object({ profileId: C.Id }), output: z.void() },
  'proxy.swap':       { input: z.object({ profileId: C.Id }), output: C.LeaseSummary },

  'task.list':        { input: z.void(), output: z.array(C.TaskSummary) },
  'task.create':      { input: C.TaskCreateInput, output: C.TaskDetail },
  'task.dispatch':    { input: C.DispatchInput, output: z.object({ runIds: z.array(C.Id) }) },

  'run.list':         { input: z.object({ filter: z.any().optional() }), output: z.array(C.RunSummary) },
  'run.cancel':       { input: z.object({ id: C.Id }), output: z.void() },
  'run.resume':       { input: z.object({ id: C.Id }), output: z.void() },

  'fleet.status':     { input: z.void(), output: z.any() },
  'logs.query':       { input: z.object({ scope: z.any().optional(), profileId: C.Id.optional(),
                                          runId: C.Id.optional(), limit: z.number().int().max(1000).default(200) }),
                        output: z.array(z.any()) },
} as const;

export const Events = {
  'profile.state_changed': z.object({ profileId: C.Id, state: C.ProfileState }),
  'proxy.health_changed':  z.object({ proxyId: C.Id, status: C.ProxyStatus }),
  'lease.acquired':        C.LeaseSummary,
  'lease.released':        z.object({ leaseId: C.Id, profileId: C.Id }),
  'run.state_changed':     z.object({ runId: C.Id, state: C.RunState }),
  'step.state_changed':    C.StepRun,
  'log.appended':          z.object({ ts: C.Timestamp, level: C.LogLevel, scope: C.LogScope,
                                      event: z.string(), data: z.any() }),
  'alert.raised':          z.object({ level: z.enum(['info','warn','error']),
                                      title: z.string(), message: z.string() }),
} as const;

export type CommandName = keyof typeof Commands;
export type EventName = keyof typeof Events;
```

### `apps/desktop/src/preload/index.ts`
```ts
import { contextBridge, ipcRenderer } from 'electron';

const api = {
  invoke: (name: string, input: unknown) => ipcRenderer.invoke(name, input),
  on: (name: string, handler: (payload: unknown) => void) => {
    const listener = (_: unknown, payload: unknown) => handler(payload);
    ipcRenderer.on(name, listener);
    return () => ipcRenderer.off(name, listener);
  },
};
contextBridge.exposeInMainWorld('tersoo', api);
export type TersooApi = typeof api;
```

Main side validates with Zod on `invoke` (input) and on `send` (event payload).

---

## 9. Core Services

Every service is registered in the DI container (`packages/core/src/container/`) and constructed once at startup.

### `EventBus`
- In-process pub/sub with typed channels.
- Bridges to renderer via `webContents.send` for channels in `Events`.
- Persists to `events` table for durability.
- Non-blocking emit; ordering per-channel guaranteed.

### `JobQueue`
- SQLite-backed durable queue.
- Two tables: `runs` (task executions) + a future `jobs` table if needed.
- Supports: enqueue, dequeue, ack, nack, retry with backoff, cancel.
- Single-writer discipline: only the main process writes.

### `SecretVault`
- Wraps `keytar` with fallback to `safeStorage`.
- Methods: `set(key, value)`, `get(key)`, `delete(key)`, `listByPrefix(prefix)`.
- Never returns secrets in logs; redacts on stringify.

### `BrowserSupervisor`
- Owns all live browser instances.
- `spawn(input)` → `Instance`.
- `stop(profileId, { graceful })`.
- `waitForCdpEndpoint(instance, { timeoutMs })`.
- `get(profileId)` → live instance or null.
- `list()` → all live instances.
- Crash watchdog: listens for `exit`, updates DB, emits events, auto-restart if budget allows.

### `ProxyBroker`
- `acquireLease(profileId, { strategy, proxyId? })` — atomic DB transaction.
- `releaseLease(leaseId)`.
- `heartbeat(leaseId)`.
- `sweepExpired()` — periodic.
- `swap(profileId)` — release + acquire new.
- Enforces: one active lease per proxy, one active lease per profile (DB-level).

### `FingerprintEngine`
- `resolve(profile)` → `FingerprintBundle`.
- `validateCoherence(bundle, proxy)` → `{ ok, reasons }`.
- `selfTest(worker, bundle)` → `{ score, mismatches }`.
- Deterministic PRNG seeded by `fingerprint_seed`.
- Presets loaded from `presets` table at startup.

### `AnchorRegistry`
- Persistent (SQLite) + in-memory cache.
- `remember(taskId, profileId, key, selector, type)`.
- `recall(taskId, profileId, key)`.
- `reinforce(id, hit)` / `decay(id, miss)`.
- TTL-based eviction.

### `HealthProbe`
- `verify(forwarderPort, { timeoutMs })` → `HealthResult`.
- Checks: TCP connect, SOCKS5 handshake, DNS via proxy, HTTPS canary, geo lookup, WebRTC probe.
- Uses a local canary server (`packages/testkit`) in dev.

### `ProfileService`, `ProxyService`, `TaskService`, `RunService`, `FleetService`
Thin service layer that composes the core services and repos for IPC handlers.

---

## 10. Browser Supervisor & Launch Sequence

### State machine per instance
```
         spawn()
stopped ─────────► starting ──ready──► ready
   ▲                  │                  │
   │                  │ fail             │ launch task
   │                  ▼                  ▼
   └── cleanup ◄── crashed ◄────────── busy
                      ▲                  │
                      │                  │ pause
                      │                  ▼
                    stopping ◄──────── paused
```

### Instance record
```ts
type Instance = {
  profileId: string;
  pid: number;
  userDataDir: string;
  forwarderPort: number;
  cdpPort: number | null;
  cdpWsUrl: string | null;
  state: 'starting' | 'ready' | 'busy' | 'paused' | 'stopping' | 'crashed';
  startedAt: number;
  memoryMb: number;
  cpuPct: number;
  crashCount: number;
  restartBudget: number;
  lastHeartbeat: number;
  worker: CrosshairWorker | null;
};
```

### Launch sequence (authoritative)
```ts
export async function launchProfile(deps: Deps, profileId: string) {
  const profile = await deps.profiles.get(profileId);
  if (!profile) throw new LaunchError('PROFILE_NOT_FOUND', profileId);
  if (profile.state === 'running') throw new LaunchError('ALREADY_RUNNING', profileId);

  const lock = await deps.profiles.acquireLock(profileId);
  try {
    await deps.profiles.setState(profileId, 'running');
    await deps.audit.record({ actor: 'system', action: 'profile.launch', target: profileId });

    let lease = await deps.proxies.getActiveLease(profileId);
    if (!lease) lease = await deps.proxies.acquireLease(profileId, { strategy: 'random' });
    if (!lease) throw new LaunchError('NO_HEALTHY_PROXY', profileId);

    const proxy = await deps.proxies.get(lease.proxyId);
    if (!proxy) throw new LaunchError('PROXY_MISSING', lease.proxyId);

    const bundle = await deps.fingerprint.resolve(profile);
    const coherence = deps.fingerprint.validateCoherence(bundle, proxy);
    if (!coherence.ok) throw new LaunchError('FINGERPRINT_INCOHERENT', coherence.reasons.join('; '));

    const upstreamCreds = proxy.password_ref
      ? await deps.secrets.getProxyCredentials(proxy.id) : null;

    const fwd = await deps.forwarder.start({
      upstream: { protocol: proxy.protocol, host: proxy.host, port: proxy.port,
                  username: proxy.username ?? undefined, password: upstreamCreds ?? undefined },
      bind: '127.0.0.1',
    });

    const health = await deps.healthProbe.verify(fwd.port, { timeoutMs: 8000 });
    if (!health.ok) {
      await deps.forwarder.stop(fwd.id);
      await deps.proxies.releaseLease(lease.id);
      throw new LaunchError('FORWARDER_UNHEALTHY', health.error ?? 'unknown');
    }

    const instance = await deps.supervisor.spawn({ profileId, userDataDir: profile.userDataDir,
                                                    forwarderPort: fwd.port });
    const cdp = await deps.supervisor.waitForCdpEndpoint(instance, { timeoutMs: 15000 });
    instance.cdpPort = cdp.port;
    instance.cdpWsUrl = `ws://127.0.0.1:${cdp.port}${cdp.wsPath}`;

    const worker = await deps.crosshair.attach({
      profileId, cdpWsUrl: instance.cdpWsUrl, bundle,
      timezone: proxy.geo_tz ?? bundle.timezone,
      geolocation: proxy.geo_lat != null && proxy.geo_lng != null
        ? { lat: proxy.geo_lat, lng: proxy.geo_lng, accuracy: 50 } : null,
    });

    await worker.applyEmulation(bundle, proxy);
    await worker.addInitScript(bundle);
    await worker.assertStealthReady();

    instance.state = 'ready';
    instance.worker = worker;
    await deps.events.emit('profile.state_changed', { profileId, state: 'running' });
    return { instance };
  } catch (err) {
    await deps.profiles.setState(profileId, 'crashed');
    await deps.events.emit('alert.raised', {
      level: 'error', title: 'Launch failed',
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    await lock.release();
  }
}
```

### CDP endpoint discovery
- Launch with `--remote-debugging-port=0`.
- Poll `{userDataDir}/chromium/DevToolsActivePort` for up to `timeoutMs`.
- File contains `port\n/browser/<ws path>`.
- Validate the port accepts TCP.

See **Appendix A** for the full launch flag list.

---

## 11. Fingerprint Engine & Stealth Shim

### Coherence rules (must pass before launch)
- `platform === 'android'` ⇒ `uaMetadata.mobile === true`, `hardware.maxTouchPoints >= 5`, `screen.dpr ∈ [2.625, 3.0]`.
- `platform === 'windows'` ⇒ `uaMetadata.mobile === false`, `hardware.maxTouchPoints === 0`, `screen.dpr ∈ [1.0, 2.0]`.
- `platform === 'macos'` ⇒ `uaMetadata.mobile === false`, `hardware.maxTouchPoints === 0`, `screen.dpr ∈ [1.0, 2.0]`.
- WebGL vendor family matches platform (Adreno/Mali for Android; NVIDIA/AMD/Intel/Apple for desktop).
- `timezone` matches `proxy.geo_tz` (warn if mismatch, block if strict mode).
- `locales.languages[0]` language matches `proxy.geo_country` primary language (warn only).
- `hardware.cores` and `hardware.memoryGb` fall within platform-plausible ranges.

### Deterministic PRNG
- `mulberry32` seeded from `fingerprint_seed`.
- Same seed → identical noise sequence → repeatable canvas/audio hashes.

### `stealth_shim.js` responsibilities
Injected via `context.addInitScript(bundle)` **before any page script runs**.

1. **WebGL masking** — override `WebGLRenderingContext.prototype.getParameter` and `WebGL2RenderingContext.prototype.getParameter` for `UNMASKED_VENDOR_WEBGL` and `UNMASKED_RENDERER_WEBGL`.
2. **Canvas noise** — patch `HTMLCanvasElement.prototype.toDataURL`, `toBlob`, `getImageData` with deterministic per-seed noise.
3. **Audio noise** — patch `AudioBuffer.prototype.getChannelData` with deterministic noise.
4. **Hardware overrides** — define `navigator.hardwareConcurrency`, `navigator.deviceMemory`, `navigator.maxTouchPoints` getters.
5. **Locale overrides** — `navigator.language`, `navigator.languages`.
6. **Prototype integrity** — wrap every override so `Function.prototype.toString.call(fn) === 'function () { [native code] }'`.
7. **Webdriver erasure** — belt-and-braces with launch flag: `delete Object.getPrototypeOf(navigator).webdriver`.
8. **Chrome runtime** — ensure `window.chrome.runtime` shape matches non-automated Chrome.
9. **Permissions** — align `navigator.permissions.query` results with the bundle.
10. **Plugins / mimeTypes** — match platform defaults.

### Injection order at launch
1. Playwright `connectOverCDP`.
2. `context.addInitScript(shimSource, bundle)`.
3. `Network.setUserAgentOverride` with `userAgentMetadata`.
4. `Emulation.setTimezoneOverride`.
5. `Emulation.setLocaleOverride`.
6. `Emulation.setGeolocationOverride`.
7. `Emulation.setDeviceMetricsOverride`.
8. Open first page.

### Self-test
A local HTML page evaluates live values and posts results back via `window.__tersooSelfTest`. Score < 0.9 blocks launch unless strict mode is off.

---

## 12. Proxy Subsystem

### `LocalForwarder`
Binds `127.0.0.1:<random>`, exposes a **no-auth SOCKS5** listener to Chromium, and authenticates to the upstream (SOCKS5 user/pass or HTTP CONNECT with basic auth).

Responsibilities:
- Accept SOCKS5 handshake from Chromium (no auth).
- Open TCP to upstream proxy.
- For SOCKS5 upstream: perform RFC 1928 handshake with user/pass.
- For HTTP upstream: send `CONNECT host:port HTTP/1.1` with `Proxy-Authorization`.
- Pipe bytes bidirectionally.
- Count bytes in/out, log errors, expose metrics.
- Block direct connections (no fallback route).
- Kill on `stop()` and on parent exit.

### Bulk import parser
Accepts lines in any of:
- `ip:port:user:pass`
- `socks5://user:pass@ip:port`
- `http://user:pass@ip:port`
- `ip:port` (IP-whitelist)

Auto-detects delimiters (`:`, `;`, tab). Strips whitespace. Flags bad lines. Never logs credentials.

### `HealthProbe`
Sequence:
1. TCP connect to forwarder port.
2. SOCKS5 handshake with forwarder.
3. Connect to `https://api.ipify.org?format=json` through the tunnel.
4. Connect to `http://ip-api.com/json/<exitIp>` for geo.
5. STUN probe for WebRTC leak detection.
6. DNS resolution test via the tunnel.

Persist `last_latency_ms`, `status`, `geo_*`, `exit_ip`. Emit `proxy.health_changed`.

### ProxyBroker
- `acquireLease`: single `BEGIN IMMEDIATE` transaction, insert only if no active lease exists for that proxy.
- Lease TTL default 6h; heartbeat every 60s; sweep every 5min.
- On supervisor crash: release the lease automatically.

---

## 13. Crosshair Automation Engine

### `CrosshairWorker`
One per running profile. Owns the Playwright `BrowserContext` and a `CDPSession`.

Methods:
- `attach(input)` — `playwright-core.connectOverCDP(wsUrl)`.
- `applyEmulation(bundle, proxy)` — UA-CH, timezone, locale, geolocation, device metrics.
- `addInitScript(bundle)` — inject stealth shim.
- `assertStealthReady()` — evaluate `navigator.webdriver`, UA, WebGL strings.
- `runStep(step, ctx)` — dispatch to step handler.
- `close()` — graceful.

### Step handlers
Each step type maps to a handler in `packages/core/src/task/StepRunner.ts`.

- `navigate` — `page.goto(url, { waitUntil })`.
- `waitFor` — `page.locator(sel).first().waitFor({ timeout })`.
- `click` — humanized click via `Humanizer.click(page, sel)`.
- `type` — humanized keystroke via `Humanizer.type(page, sel, text)`.
- `scroll` — kinetic scroll via `Humanizer.scroll(page, dir, amount)`.
- `extract` — `locator.getAttribute()` or `textContent()`.
- `screenshot` — `page.screenshot({ path })`.
- `sleep` — `delay(random(minMs, maxMs))`.

### `XPathResolver`
Resolution order:
1. Playwright locator with XPath (fast, native).
2. Playwright CSS.
3. CDP `DOM.resolveNode` + `Runtime.callFunctionOn` for Shadow DOM.
4. AnchorRegistry recall (cached selector).
5. Accessibility role + name fallback.

Retry with backoff, up to configured `maxAttempts` (default 3).

### `AnchorRegistry`
- Key = SHA-1 of `{taskId, stepIndex, selectorHint, semanticSignature}`.
- On hit: `hit_count++`, `confidence = min(1.0, confidence + 0.05)`.
- On miss: `miss_count++`, `confidence = max(0.0, confidence - 0.1)`.
- Evict anchors with `confidence < 0.3` and `last_hit_at < now - 7d`.

### `Humanizer`
- **Mouse**: cubic Bézier path with micro-jitter, dynamic acceleration, overshoot correction. Emit `Input.dispatchMouseEvent` via CDP.
- **Keyboard**: per-char delay `random(40, 140)` ms, 2% typo chance with immediate correction, occasional double-space.
- **Scroll**: `Input.dispatchMouseEvent` with `deltaY`, deceleration curve, 2–3 event bursts.

All randomness is seeded by `profile.fingerprint_seed` for reproducibility per profile.

---

## 14. Task Engine & Workflow Schema

### Workflow schema v1 (JSON)
```json
{
  "schemaVersion": 1,
  "name": "Example",
  "variables": { "baseUrl": "https://example.com" },
  "steps": [
    { "type": "navigate", "url": "{{baseUrl}}", "waitUntil": "domcontentloaded" },
    { "type": "waitFor", "selector": "//button[@id='login']", "timeoutMs": 15000 },
    { "type": "click", "selector": "//button[@id='login']", "humanized": true },
    { "type": "type", "selector": "//input[@name='email']", "text": "a@b.c", "humanized": true },
    { "type": "sleep", "minMs": 1000, "maxMs": 3000 }
  ]
}
```

### Execution
1. `TaskService.dispatch(input)` validates targets, resolves `profileIds`, creates one `runs` row per profile with `idempotency_key = hash(taskId + profileId + hour)`.
2. `JobQueue` processes runs, respecting `concurrency` and `stagger`.
3. For each run:
   - `RunService.start(runId)` → marks `starting`, then `running`.
   - For each step: `StepRunner.run(step, ctx)`.
   - Persist `step_runs` on start and completion.
   - Update `runs.checkpoint` after each step (step index + extracted vars).
4. On success → `succeeded`. On failure per policy → `failed`, `paused`, or retry.

### Failure policy
- `skip`: mark step `skipped`, continue.
- `retry`: retry up to `maxAttempts` with backoff, then fail.
- `screenshot_abort`: capture screenshot, mark run `failed`.
- `pause_alert`: mark run `paused`, emit `alert.raised`, wait for user.

### Resume
On app start, any run in `running` is marked `paused` and offered for resume. Resume reads `checkpoint` and continues from `step_index + 1`.

### Idempotency
Re-dispatching with the same key returns the existing `runIds` instead of creating new rows.

---

## 15. UI Architecture

### Views
- **ProfilesView** — table of profiles, filters, bulk actions, quick launch, state badges.
- **ProxyVaultView** — table + import modal, health check button, sticky binding modal, lease state.
- **TaskStudioView** — visual workflow builder + JSON editor fallback, run button.
- **RunsView** — live run list with per-step telemetry.
- **FleetMonitorView** — grid of running instances with CPU/RAM, live screenshots (throttled).
- **LogsView** — filterable event stream.
- **SettingsView** — paths, keychain status, concurrency defaults, strict mode.

### State
- Zustand stores: `profilesStore`, `proxiesStore`, `tasksStore`, `runsStore`, `fleetStore`, `logsStore`.
- Server state hydrated via `window.tersoo.invoke(...)`.
- Live updates via `window.tersoo.on(...)`.

### Components
- `DataTable`, `Badge`, `Modal`, `Drawer`, `Toast`, `StatusDot`, `ConfirmDialog`, `JsonEditor`, `WorkflowBuilder`, `ProxyImportForm`.

### Constraints
- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'`.
- No remote fonts, no remote scripts, no telemetry.

---

## 16. Observability, Security, Failure Handling

### Observability
- `pino` logs → `events` table + rotating file in `{userData}/tersoopilot/logs/`.
- Every service emits structured events with `scope`, `profileId`, `runId`, `stepRunId`.
- Metrics computed on demand: active instances, lease count, queue depth, run success rate.
- OpenTelemetry export optional (off by default).

### Security
- Renderer locked down (see §15).
- IPC validated with Zod on both sides.
- Secrets in OS keychain only.
- `LocalForwarder` is the only outbound path; Chrome cannot bypass it (`--proxy-bypass-list=<-loopback>`).
- WebRTC set to `disable_non_proxied_udp`.
- Update signing enforced by `electron-updater`.
- Audit log for every mutating command.
- No telemetry by default.

### Failure handling matrix

| Failure | Detection | Response |
|---|---|---|
| Chrome crash | PID exit / CDP close | Restart within budget; else mark `crashed` |
| Forwarder crash | Process exit | Release lease, stop Chrome |
| Proxy dead mid-run | HealthProbe interval | Pause run, alert, offer swap |
| Lease orphan | Heartbeat timeout | Auto-release, audit event |
| DB locked | `SQLITE_BUSY` | Retry with backoff |
| Fingerprint mismatch | Self-test score | Block launch, require re-seed |
| Step timeout | Step deadline | Apply step failure policy |
| App crash | Crash reporter | Recover runs from checkpoint |

---

## 17. Testing Strategy

### Unit (`tests/unit/`)
- Zod schemas round-trip.
- Repos: CRUD, lease atomicity, idempotency.
- PRNG determinism.
- Coherence rules.
- Bulk import parser.
- Humanizer path generation (deterministic with seed).

### Integration (`tests/integration/`)
- Full launch sequence against fake proxy + canary.
- Lease acquisition under concurrent requests (assert single winner).
- CDP attach + stealth self-test.
- Workflow execution on canary pages.
- Checkpoint/resume after simulated crash.

### E2E (`tests/e2e/`)
- Playwright Test against packaged Electron app.
- Create profile → assign proxy → launch → run task → verify artifacts.
- Kill Chrome mid-run → verify recovery.

### `packages/testkit/`
- `fakeProxy.ts` — SOCKS5 server with configurable auth + latency + geo response.
- `canaryServer.ts` — HTTP pages with known DOM for crosshair tests.
- `fixtures/` — sample proxies, workflows, presets.

---

## 18. Build Phases

### Phase 0 — Foundation
Deliverables:
- pnpm + Turborepo monorepo scaffolding.
- `packages/contracts` with all Zod schemas.
- `packages/core` with DB client, migration runner, repos (stubs), EventBus, JobQueue, SecretVault.
- Electron shell with secure defaults, preload bridge, IPC router with Zod validation.
- Vitest set up; CI green.

Exit criteria:
- [ ] `pnpm -r build` passes.
- [ ] Electron window opens with `sandbox: true`.
- [ ] DB created, `0001_init.sql` applied, `user_version = 1`.
- [ ] IPC round-trip validated.
- [ ] SecretVault stores/retrieves a test key.
- [ ] JobQueue survives restart.

### Phase 1 — Profiles + Supervisor
Deliverables:
- `ProfileService` CRUD.
- `BrowserSupervisor.spawn()` with `DevToolsActivePort` discovery.
- `Profile.lock` file locking.
- ProfilesView UI (list, create, edit, delete, launch, stop).

Exit criteria:
- [ ] Create profile → launch → attach Playwright → evaluate `1+1`.
- [ ] Two profiles run concurrently without state bleed.
- [ ] Killing Chrome marks profile `crashed` in DB.

### Phase 2 — Proxy Vault + LocalForwarder
Deliverables:
- Bulk import parser.
- `LocalForwarder` (SOCKS5 + HTTP CONNECT).
- `ProxyBroker` with atomic leases + heartbeat + sweep.
- `HealthProbe`.
- ProxyVaultView UI + sticky binding modal.

Exit criteria:
- [ ] Import 100 proxies in < 1s.
- [ ] Health check returns geo + latency.
- [ ] Two profiles cannot acquire the same proxy.
- [ ] Lease released on profile stop.

### Phase 3 — Fingerprint Engine
Deliverables:
- Presets library (Windows 11, macOS Sonoma, Android 14 / Pixel 8 Pro, Galaxy S24).
- `FingerprintEngine` + coherence rules.
- `stealth_shim.js` with all hooks.
- `CDPEmulator`.
- Self-test page.

Exit criteria:
- [ ] Self-test score ≥ 0.9 on all presets.
- [ ] Canvas hash differs per seed, stable per profile.
- [ ] WebGL strings match preset.
- [ ] Timezone matches proxy geo.

### Phase 4 — Crosshair + Task Studio
Deliverables:
- `CrosshairWorker` + step handlers.
- `XPathResolver` with fallbacks.
- `AnchorRegistry`.
- `Humanizer`.
- TaskStudioView with visual builder + JSON editor.

Exit criteria:
- [ ] Workflow on canary server succeeds end-to-end.
- [ ] XPath resolves through Shadow DOM.
- [ ] Humanized actions produce non-linear mouse paths.
- [ ] Anchors persist and recall.

### Phase 5 — Fleet + Runs + Observability
Deliverables:
- `FleetService` with concurrency governor + stagger.
- RunsView with live telemetry.
- LogsView.
- Checkpoint/resume.
- Failure policies.

Exit criteria:
- [ ] Dispatch task to 10 profiles with concurrency 3 and stagger.
- [ ] Cancel mid-run leaves DB consistent.
- [ ] Resume after simulated app crash continues from checkpoint.

### Phase 6 — Hardening
Deliverables:
- CSP audit.
- IPC coverage tests.
- Packaging + signing + auto-update.
- Backup/restore.
- Import/export sessions.
- Performance profiling + memory caps.

Exit criteria:
- [ ] Signed installer on Windows + macOS.
- [ ] Auto-update from v1.0.0 → v1.0.1 works.
- [ ] 24h soak test with 5 concurrent profiles stable.

### Phase 7 — Extensibility
Deliverables:
- Plugin SDK (sandboxed).
- CLI over the same services.
- Local HTTP API.
- Optional remote worker nodes.

Exit criteria:
- [ ] CLI can create profile + dispatch task.
- [ ] Plugin can add a step type without core changes.

---

## 19. Agent Working Rules

1. **Read this document end-to-end before writing code.** No exceptions.
2. **Never modify `packages/contracts` without a migration + version bump.**
3. **Every public service method has a Zod-typed signature.**
4. **Every DB write goes through a repo.** No raw SQL outside `repos/`.
5. **Every state transition emits an event.** No silent state changes.
6. **Every error has a code from Appendix B.** No ad-hoc strings.
7. **Every secret read/write goes through `SecretVault`.** No direct keychain calls.
8. **Every browser launch uses `buildArgs()`.** No inline flags.
9. **Every test is deterministic.** Seed randomness.
10. **No new dependencies without a written justification in the PR description.**
11. **Prefer composition over inheritance.** Services receive dependencies via constructor.
12. **No `any` in exported types.** Use `unknown` + Zod parse.
13. **All timestamps are Unix ms UTC.**
14. **All IDs are UUID v4.**
15. **All file paths are absolute inside the app; relative in the DB.**

### Commit conventions
- `feat(scope): ...`
- `fix(scope): ...`
- `chore(scope): ...`
- `test(scope): ...`
- `docs(scope): ...`

### PR checklist
- [ ] Contracts unchanged or migration included.
- [ ] Unit tests added.
- [ ] Integration test added if touching supervisor/proxy/task.
- [ ] Events emitted for new state transitions.
- [ ] Error codes from Appendix B.
- [ ] No plaintext secrets in logs or DB.
- [ ] `pnpm -r test` green.

---

## Appendix A — Launch Flags

```ts
function buildArgs(input: SpawnInput): string[] {
  return [
    `--user-data-dir=${input.userDataDir}/chromium`,
    `--disk-cache-dir=${input.userDataDir}/cache`,
    `--crash-dumps-dir=${input.userDataDir}/crash`,
    `--remote-debugging-port=0`,
    `--remote-debugging-address=127.0.0.1`,
    `--remote-allow-origins=*`,
    `--proxy-server=socks5://127.0.0.1:${input.forwarderPort}`,
    `--proxy-bypass-list=<-loopback>`,
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
    `--headless=new`,     // optional; keep configurable
    `about:blank`,
  ];
}
```

---

## Appendix B — Error Taxonomy

| Code | Meaning | Recovery |
|---|---|---|
| `PROFILE_NOT_FOUND` | Profile id missing | Abort |
| `ALREADY_RUNNING` | Profile already running | Abort |
| `NO_HEALTHY_PROXY` | No healthy proxy available | Alert user |
| `PROXY_MISSING` | Proxy record missing | Release lease, abort |
| `FINGERPRINT_INCOHERENT` | Bundle fails coherence | Abort, require re-seed |
| `FORWARDER_UNHEALTHY` | LocalForwarder failed health | Release lease, abort |
| `SPAWN_FAILED` | Chrome failed to spawn | Release lease, abort |
| `CDP_TIMEOUT` | DevToolsActivePort not found | Kill Chrome, release |
| `CDP_ATTACH_FAILED` | Playwright attach failed | Kill Chrome, release |
| `STEALTH_FAILED` | Self-test below threshold | Kill Chrome, release |
| `LEASE_CONFLICT` | Atomic lease insert failed | Retry or pick another |
| `DB_BUSY` | SQLITE_BUSY | Retry with backoff |
| `STEP_TIMEOUT` | Step exceeded deadline | Apply failure policy |
| `STEP_SELECTOR_MISSING` | Selector not found | Apply failure policy |
| `NAVIGATION_FAILED` | Page failed to load | Retry or fail |
| `POLICY_VIOLATION` | Rate/limit breach | Pause run |

---

## Appendix C — Event Taxonomy

| Scope | Event | Payload |
|---|---|---|
| `supervisor` | `spawn.start` | `{ profileId }` |
| `supervisor` | `spawn.ready` | `{ profileId, pid, cdpPort }` |
| `supervisor` | `spawn.failed` | `{ profileId, code, message }` |
| `supervisor` | `instance.crashed` | `{ profileId, exitCode }` |
| `supervisor` | `instance.stopped` | `{ profileId }` |
| `proxy` | `forwarder.start` | `{ profileId, port }` |
| `proxy` | `forwarder.stop` | `{ profileId }` |
| `proxy` | `health.check` | `{ proxyId, ok, latencyMs }` |
| `proxy` | `lease.acquired` | `{ profileId, proxyId }` |
| `proxy` | `lease.released` | `{ profileId, proxyId, reason }` |
| `task` | `run.start` | `{ runId, taskId, profileId }` |
| `task` | `run.step` | `{ runId, stepIndex, type }` |
| `task` | `run.success` | `{ runId }` |
| `task` | `run.fail` | `{ runId, code }` |
| `task` | `run.pause` | `{ runId, reason }` |
| `task` | `run.resume` | `{ runId, fromStep }` |
| `security` | `secret.write` | `{ key }` |
| `security` | `secret.read` | `{ key }` |
| `security` | `policy.violation` | `{ reason }` |
| `db` | `migrate.apply` | `{ version }` |
| `ui` | `view.open` | `{ name }` |

---

## Appendix D — Glossary

- **Profile** — a persistent browser identity (data dir + fingerprint + proxy lease).
- **Instance** — a live Chromium process bound to a profile.
- **Lease** — an exclusive binding between a profile and a proxy.
- **Bundle** — the fingerprint bundle (see §11).
- **Crosshair** — the automation engine (worker + resolver + registry + humanizer).
- **Forwarder** — the local SOCKS5 proxy that authenticates to upstream.
- **Anchor** — a cached selector for a semantic DOM target.
- **Run** — one execution of a task on one profile.
- **Step** — one action within a workflow.
- **Coherence** — internal consistency of a fingerprint bundle.

---

**End of document. Version 1.0.0. Frozen for Phase 0.**
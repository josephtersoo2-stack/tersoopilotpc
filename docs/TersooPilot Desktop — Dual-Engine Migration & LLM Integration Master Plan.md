# TersooPilot Desktop — Dual-Engine Migration & LLM Integration Master Plan

**Document version:** 2.0.0
**Target executor:** Google Antigravity IDE coding agents
**Coordination:** Human reviewer (project owner)
**Status:** Authoritative — each phase must be completed and tested before the next begins.

---

## 0. How to Use This Document

This document is written to be executed **phase by phase**. Each phase has:

1. **Goal** — what the phase achieves
2. **Preconditions** — what must be true before you start
3. **Files to create** — exact paths and purpose
4. **Files to modify** — exact paths and what to change
5. **Code** — concrete implementations or detailed skeletons
6. **Acceptance criteria** — the human will test these before you continue
7. **Rollback** — how to revert if the phase fails
8. **Handoff** — what the next phase inherits

**Critical rule:** Do **not** proceed to Phase N+1 until Phase N's acceptance criteria are green. If a criterion fails, stop and report. Do not attempt to fix forward by starting the next phase.

**Second critical rule:** Every change to `packages/contracts/` requires a corresponding Zod update and a matching IPC channel entry. No exceptions.

**Third critical rule:** Every new dependency requires justification in the phase's commit message. Prefer what is already in the lockfile.

---

## 1. Current State (Verified by Screenshots)

The following components exist and work. **Do not break them.**

| Component | Status | Evidence |
|---|---|---|
| Electron desktop shell + React UI | Working | Profile Studio, Proxy Vault, Task Studio rendered |
| SQLite WAL database | Working | Status bar: "WAL Mode 5.2 MB" |
| Daemon | Working | Status bar: "DAEMON: ONLINE (WAL)" |
| Profile Studio | Working | Two profiles: Android 14 Adreno 750, Windows 11 RTX 4070 |
| Fingerprint scoring | Working | Both profiles show 0.98 Clear |
| Proxy Vault | Working (with bug) | "42 / 45 healthy" but the vault list is empty |
| Task Studio | Working | Visual builder with Wait For, Scroll steps |
| JobQueue | Working | Status bar shows "Idle" |
| Leases | Working | Status bar: "Leases Active: 6" |
| LocalForwarders | Working | Status bar: "LocalForwarders Bound: 6" |
| Stealth shim | Working | Pixelscan shows "No automated behavior detected" |
| Timezone coherence | Working | Green on Pixelscan |
| Screen geometry | Working | Clean integer resolutions |

### 1.1 Known Bugs to Fix Before Phase 1

**Bug B-1: Proxy Vault empty list contradiction**
Status bar shows `Leases Active: 6`, `42 / 45 healthy proxies`, but the Proxy Vault view shows "No Proxies Found."

**Investigation:**
- Query the DB directly: `SELECT COUNT(*) FROM proxies;` and `SELECT COUNT(*) FROM proxy_leases WHERE state='active';`
- If `proxies` has rows but the UI shows empty, it's a **frontend query bug** (filter applied wrongly, or IPC returns empty).
- If `proxies` is actually empty but `proxy_leases` has 6 rows, it's a **foreign key violation** — leases should not exist without proxies. Run `PRAGMA foreign_key_check;`.

**Fix must be applied before Phase 1 begins.** Any dual-engine work on top of an inconsistent proxy layer will fail unpredictably.

**Bug B-2: Active Instances shows "0 / 12" but there are 3 Running runs**
This is likely a supervisor/UI sync bug. The Runs view says "3 Running" but the Profile Studio says "0 / 12 active instances." Either:
- The supervisor doesn't track instances in a way the UI can read, OR
- The UI reads a different source than the supervisor writes.

**Fix:** Ensure `BrowserSupervisor.list()` is the single source for "active instances" and the UI polls it on an interval or subscribes to `profile.state_changed` events.

---

## 2. Target State

After all phases are complete:

| Feature | Before | After |
|---|---|---|
| Browser engines | Chromium only | Apostate (70%) + Camoufox (30%) |
| Engine selection | N/A | Per-profile, locked after first launch |
| Bulk create | N/A | Weighted-random distribution |
| Humanization | Basic | Bézier mouse, lognormal keystrokes, idle, kinetic scroll |
| Automation modes | Scripted only | Scripted + LLM (accessibility tree) |
| LLM providers | None | OpenRouter (GPT, Gemini, DeepSeek) |
| CAPTCHA handling | Manual | Auto-detect + vision fallback + budget |
| Pixelscan bot check | Green (via CDP patches) | Green on Apostate, green on Camoufox |
| Timezone coherence | Manual | Auto-aligned to proxy exit |
| Fingerprint scoring | Manual | Auto-scored per profile |

---

## 3. Phase 0 — Preparation & Inventory

### 3.1 Goal

Fix the two known bugs, audit the existing codebase, and produce a machine-readable inventory of every module that will be touched by the migration. No new features in this phase.

### 3.2 Preconditions

- Repository is clean (`git status` shows no uncommitted changes)
- Build passes (`pnpm -r build`)
- Tests pass (`pnpm -r test`)

### 3.3 Tasks

#### Task 0.1 — Fix Bug B-1

1. Open `packages/core/src/persistence/repos/proxyRepo.ts`
2. Verify `list()` returns all proxies (no default filter).
3. Open the IPC handler for `proxy.list` and verify it calls `proxyRepo.list()` without additional filters.
4. Open `apps/renderer/src/views/ProxyVaultView/` and verify the default filter state is `{}` (no filter).
5. Run `SELECT COUNT(*) FROM proxies;` against the DB.
6. Verify the count matches what the UI displays.

**If mismatched:** The bug is in the pipeline. Add a debug log at each layer to find the drop-off.

#### Task 0.2 — Fix Bug B-2

1. Open `packages/core/src/supervisor/BrowserSupervisor.ts`
2. Verify `list()` returns all live instances from `InstanceRegistry`.
3. Open the IPC handler for `fleet.status` and verify it calls `supervisor.list()`.
4. Open the renderer store for fleet state and verify it subscribes to both `fleet.status` polling and `profile.state_changed` events.
5. Add a `console.warn` if the two sources disagree.

#### Task 0.3 — Produce Inventory

Create `docs/inventory.md` with the following tables filled in:

```markdown
## Services
| File | Purpose | Touched by migration? |
|---|---|---|
| ... | ... | yes/no |

## Repos
| File | Table | Touched? |

## IPC Channels
| Channel | Handler file | Modified? |

## Renderer Views
| View | Touched? |

## Existing Tests
| Test | Covers | Must remain green |
```

This inventory is the contract for what Phase 1 will not break.

### 3.4 Acceptance Criteria

- [ ] Bug B-1 fixed: Proxy Vault shows the same count as the status bar
- [ ] Bug B-2 fixed: Active Instances count matches the Runs count
- [ ] `docs/inventory.md` created and complete
- [ ] `pnpm -r build && pnpm -r test` green
- [ ] Committed with message: `chore: phase 0 — fix vault/instance sync bugs, add inventory`

### 3.5 Rollback

Revert the two bug fix commits. The inventory is additive and can stay.

---

## 4. Phase 1 — Database Migration (Dual Engine Schema)

### 4.1 Goal

Add all the new schema required for dual engines, LLM config, CAPTCHA budget, and settings. **No application code changes** beyond what's necessary to make the new schema queryable.

### 4.2 Preconditions

- Phase 0 complete
- All existing tests green

### 4.3 Files to Create

- `migrations/0002_dual_engine.sql`

### 4.4 Files to Modify

- `packages/core/src/persistence/schema.ts` — add new types
- `packages/core/src/persistence/repos/index.ts` — export new repos (stubs)
- `packages/core/src/persistence/migrate.ts` — no change needed if the runner is generic

### 4.5 Migration SQL

```sql
-- migrations/0002_dual_engine.sql
-- Adds dual-engine support, LLM config, CAPTCHA tracking, and settings.

-- 1. Engine per profile
ALTER TABLE profiles ADD COLUMN engine TEXT NOT NULL DEFAULT 'apostate'
  CHECK (engine IN ('apostate', 'camoufox'));

-- 2. Action mode per profile (null = inherit)
ALTER TABLE profiles ADD COLUMN action_mode TEXT
  CHECK (action_mode IN ('scripted', 'llm') OR action_mode IS NULL);

-- 3. CAPTCHA counter (reset on launch)
ALTER TABLE profiles ADD COLUMN captcha_budget_used INTEGER NOT NULL DEFAULT 0;

-- 4. Engine config
CREATE TABLE engine_config (
  engine          TEXT PRIMARY KEY CHECK (engine IN ('apostate', 'camoufox')),
  action_mode     TEXT CHECK (action_mode IN ('scripted', 'llm') OR action_mode IS NULL),
  binary_path     TEXT,
  launch_options  TEXT NOT NULL DEFAULT '{}',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

INSERT INTO engine_config (engine, action_mode, binary_path, launch_options, created_at, updated_at)
VALUES
  ('apostate', NULL, NULL, '{}', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('camoufox', NULL, NULL, '{}', strftime('%s','now')*1000, strftime('%s','now')*1000);

-- 5. LLM config (singleton row)
CREATE TABLE llm_config (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  provider        TEXT NOT NULL DEFAULT 'openrouter'
                  CHECK (provider IN ('openrouter','openai','gemini','deepseek')),
  text_model      TEXT NOT NULL DEFAULT 'deepseek/deepseek-chat',
  vision_model    TEXT DEFAULT 'deepseek/deepseek-v4-flash-vision-exp',
  api_key_ref     TEXT NOT NULL DEFAULT 'tersoopilot/llm/openrouter',
  max_attempts    INTEGER NOT NULL DEFAULT 3,
  backoff_ms      TEXT NOT NULL DEFAULT '[1000,3000,9000]',
  vision_enabled  INTEGER NOT NULL DEFAULT 1,
  updated_at      INTEGER NOT NULL
);

INSERT INTO llm_config (id, updated_at) VALUES (1, strftime('%s','now')*1000);

-- 6. CAPTCHA events
CREATE TABLE captcha_events (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  profile_id      TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  detected_at     INTEGER NOT NULL,
  challenge_type  TEXT NOT NULL,
  solved_by       TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,
  outcome         TEXT NOT NULL CHECK (outcome IN ('solved','failed','aborted','unsolvable')),
  screenshot_path TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_captcha_run ON captcha_events(run_id);
CREATE INDEX idx_captcha_profile ON captcha_events(profile_id);

-- 7. Settings (key-value)
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);

INSERT INTO settings (key, value, updated_at) VALUES
  ('engine_weights', '{"apostate":70,"camoufox":30}', strftime('%s','now')*1000),
  ('captcha_budget', '3', strftime('%s','now')*1000),
  ('humanization_seed_source', 'profile', strftime('%s','now')*1000);

-- 8. Backfill existing profiles
UPDATE profiles SET engine = 'apostate' WHERE engine IS NULL OR engine = '';
```

### 4.6 Kysely Schema Types

Add to `packages/core/src/persistence/schema.ts`:

```ts
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

// Extend the existing ProfileRow
export type ProfileRow = {
  // ... existing fields ...
  engine: 'apostate' | 'camoufox';
  action_mode: 'scripted' | 'llm' | null;
  captcha_budget_used: number;
};

// Extend DB type
export type DB = {
  // ... existing tables ...
  engine_config: EngineRow;
  llm_config: LlmConfigRow;
  captcha_events: CaptchaEventRow;
  settings: SettingRow;
};
```

### 4.7 New Repos (Stubs)

Create these files with minimal CRUD:

- `packages/core/src/persistence/repos/engineConfigRepo.ts`
- `packages/core/src/persistence/repos/llmConfigRepo.ts`
- `packages/core/src/persistence/repos/captchaEventRepo.ts`
- `packages/core/src/persistence/repos/settingsRepo.ts`

Each should have `get()`, `set()`/`update()` as appropriate. Full implementations in Phase 2.

### 4.8 Acceptance Criteria

- [ ] `migrations/0002_dual_engine.sql` exists
- [ ] `pnpm migrate` applies it cleanly
- [ ] `PRAGMA user_version;` returns `2`
- [ ] `SELECT * FROM engine_config;` returns two rows (apostate, camoufox)
- [ ] `SELECT * FROM llm_config;` returns one row
- [ ] `SELECT engine, COUNT(*) FROM profiles GROUP BY engine;` shows all profiles on `apostate`
- [ ] `SELECT * FROM settings;` returns three rows
- [ ] No existing tests broken
- [ ] Committed with message: `feat(db): phase 1 — dual-engine schema, LLM config, CAPTCHA tracking`

### 4.9 Rollback

Delete `migrations/0002_dual_engine.sql`, revert `schema.ts`, drop the new tables manually. Do not drop `profiles` columns automatically — for dev environments, restore from backup.

### 4.10 Handoff

Phase 2 inherits: new schema, new repos (stubs), all existing code untouched.

---

## 5. Phase 2 — Engine Abstraction Layer

### 5.1 Goal

Introduce the `BrowserEngine` interface and `EngineFactory`. Refactor the **existing Chromium launch path** into an `ApostateEngine` implementation. **Behavior must be byte-identical to before.** No Camoufox yet.

### 5.2 Preconditions

- Phase 1 complete
- Existing launch flow works (from Phase 0 baseline)

### 5.3 Files to Create

```
packages/core/src/engines/
├── types.ts
├── EngineFactory.ts
├── apostate/
│   ├── ApostateEngine.ts
│   ├── buildArgs.ts
│   ├── resolveBinary.ts
│   └── cdpDiscovery.ts
└── shared/
    ├── userDataDir.ts
    ├── fingerprintResolve.ts
    └── proxyArgs.ts
```

### 5.4 Files to Modify

- `packages/core/src/container/index.ts` — instantiate `EngineFactory`, inject into `ProfileService`
- `packages/core/src/services/ProfileService.ts` — `launch()` now calls `engineFactory.getEngine(profile.engine).launch(...)`
- `packages/core/src/supervisor/launchSequence.ts` — becomes a thin coordinator that delegates to the engine

### 5.5 The Interface

```ts
// packages/core/src/engines/types.ts
import type { Browser, BrowserContext, Page } from 'playwright-core';
import type { ProfileDetail, ProxySummary } from '@tersoo/contracts';
import type { Humanizer } from '../crosshair/Humanizer';

export type EngineType = 'apostate' | 'camoufox';

export interface LaunchInput {
  profile: ProfileDetail;
  proxy: ProxySummary;
  seed: number;
  userDataDir: string;
  forwarderPort: number;
  actionMode: 'scripted' | 'llm';
  headless: boolean;
}

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  humanizer: Humanizer | null;   // wired in Phase 5
  engine: EngineType;
  cdpPort: number | null;         // null for non-CDP engines
  close(): Promise<void>;
}

export interface BrowserEngine {
  readonly type: EngineType;
  launch(input: LaunchInput): Promise<BrowserSession>;
  stop(profileId: string): Promise<void>;
}
```

### 5.6 The Factory

```ts
// packages/core/src/engines/EngineFactory.ts
import type { BrowserEngine, EngineType } from './types';
import { ApostateEngine } from './apostate/ApostateEngine';

export class EngineFactory {
  private engines = new Map<EngineType, BrowserEngine>();

  constructor() {
    this.engines.set('apostate', new ApostateEngine());
    // camoufox added in Phase 4
  }

  getEngine(type: EngineType): BrowserEngine {
    const engine = this.engines.get(type);
    if (!engine) throw new Error(`ENGINE_NOT_REGISTERED:${type}`);
    return engine;
  }
}
```

### 5.7 ApostateEngine — Refactored From Existing Chromium Path

This should be a **direct extraction** of whatever the current `launchSequence.ts` does for Chromium. Every flag, every argument, every step must be preserved.

```ts
// packages/core/src/engines/apostate/ApostateEngine.ts
import { chromium } from 'playwright-core'; // or 'patchright' if already in use
import type { BrowserEngine, EngineType, LaunchInput, BrowserSession } from '../types';
import { buildApostateArgs } from './buildArgs';
import { resolveApostateBinary } from './resolveBinary';
import { discoverCdpEndpoint } from './cdpDiscovery';

export class ApostateEngine implements BrowserEngine {
  readonly type: EngineType = 'apostate';

  async launch(input: LaunchInput): Promise<BrowserSession> {
    const args = buildApostateArgs({
      userDataDir: input.userDataDir,
      forwarderPort: input.forwarderPort,
      headless: input.headless,
    });

    const browser = await chromium.launch({
      args,
      executablePath: resolveApostateBinary(),
      headless: input.headless,
    });

    const context = browser.contexts()[0] ?? await browser.newContext();
    const page = context.pages()[0] ?? await context.newPage();

    const cdpPort = await discoverCdpEndpoint(browser, input.userDataDir);

    return {
      browser,
      context,
      page,
      humanizer: null,
      engine: 'apostate',
      cdpPort,
      async close() { await browser.close(); },
    };
  }

  async stop(profileId: string): Promise<void> {}
}
```

**Migration rule:** The existing `buildArgs.ts` file's content moves verbatim into `engines/apostate/buildArgs.ts`. Do not modify the flags. If the flags change, Pixelscan breaks.

### 5.8 ProfileService.launch — Refactored

Before:

```ts
const instance = await supervisor.spawn({ profileId, ... });
```

After:

```ts
const engine = this.engineFactory.getEngine(profile.engine);
const session = await engine.launch({
  profile,
  proxy,
  seed: hashSeed(profile.fingerprint_seed),
  userDataDir: profile.userDataDir,
  forwarderPort: fwd.port,
  actionMode: profile.action_mode ?? 'scripted',
  headless: this.config.headless,
});

this.supervisor.register(profile.id, session);
```

### 5.9 Acceptance Criteria

- [ ] All existing profiles still launch (they're all `apostate` after backfill)
- [ ] Pixelscan test on an existing profile shows the same green result as before
- [ ] No change to `migrations/` or DB schema in this phase
- [ ] The `buildArgs` output is byte-identical to the pre-refactor version (dump it and diff)
- [ ] `pnpm -r test` green
- [ ] Committed with message: `refactor(engines): phase 2 — extract ApostateEngine from supervisor`

### 5.10 Rollback

Revert the refactor commit. The old `launchSequence.ts` should be intact in git history.

### 5.11 Handoff

Phase 3 inherits: `EngineFactory` with Apostate registered, a clean interface for adding Camoufox.

---

## 6. Phase 3 — Camoufox Sidecar & Installation

### 6.1 Goal

Install the Camoufox runtime, wire up the Python sidecar (if needed), and produce a **launchable but not yet integrated** Camoufox instance that can be tested manually. **No integration with `EngineFactory` in this phase.**

### 6.2 Preconditions

- Phase 2 complete
- Python 3.11+ available on the dev machine
- `pip` or `pipx` available

### 6.3 Tasks

#### Task 3.1 — Install Camoufox

```bash
pip install "camoufox[geoip]"
camoufox fetch
```

Verify: `camoufox path` returns a valid executable path.

#### Task 3.2 — Install the JS bridge

Add to `packages/core/package.json`:

```json
{
  "dependencies": {
    "camoufox-js": "^0.4.0"
  }
}
```

Run `pnpm install`.

#### Task 3.3 — Standalone smoke test

Create `scripts/smoke-camoufox.ts`:

```ts
import { launch } from 'camoufox-js';

async function main() {
  const browser = await launch({
    headless: false,
    geoip: true,
    os: 'windows',
    locale: 'en-US',
    humanize: true,
  });

  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto('https://pixelscan.net/bot-check');
  await page.waitForTimeout(60000);
  await browser.close();
}

main().catch(console.error);
```

Run: `pnpm tsx scripts/smoke-camoufox.ts`

**Expected:** Firefox window opens, Pixelscan shows green Fingerprint AND green Bot check.

If Pixelscan shows red on either, **stop and debug** before continuing. The whole point of Camoufox is that it passes both.

#### Task 3.4 — Binary bundling for distribution

For the dev machine, `camoufox fetch` is enough. For distribution:

1. Locate the Camoufox binary: `camoufox path`
2. Copy it into `apps/desktop/resources/camoufox/`
3. Add to `electron-builder.yml`:

```yaml
extraResources:
  - from: resources/camoufox
    to: camoufox
    filter: ["**/*"]
```

4. Set env var at runtime: `CAMOUFOX_BIN_PATH=<userData>/camoufox/<platform>/camoufox`

#### Task 3.5 — Python sidecar decision

**Decision point:** If `camoufox-js` handles the sidecar internally (recommended), no manual sidecar is needed. If not:

- Write a `packages/core/src/engines/camoufox/sidecar.py`
- Expose a local HTTP server on `127.0.0.1:0`
- The TypeScript side spawns it as a child process and reads the port from stdout
- The sidecar exposes `POST /launch` which returns a Playwright WS endpoint

**Only implement the sidecar if `camoufox-js` fails to launch reliably.** Test `camoufox-js` first.

### 6.4 Acceptance Criteria

- [ ] `camoufox path` returns a valid path
- [ ] `scripts/smoke-camoufox.ts` launches Firefox
- [ ] Pixelscan shows green Fingerprint on Camoufox
- [ ] Pixelscan shows green Bot check on Camoufox
- [ ] `camoufox-js` installed in `packages/core`
- [ ] Committed with message: `feat(engines): phase 3 — Camoufox runtime + smoke test`

### 6.5 Rollback

Remove `camoufox-js` from `package.json`, uninstall the Python package, delete the smoke test script.

### 6.6 Handoff

Phase 4 inherits: a known-working Camoufox launch that passes Pixelscan.

---

## 7. Phase 4 — CamoufoxEngine Integration

### 7.1 Goal

Implement `CamoufoxEngine` as a first-class engine in `EngineFactory`. Users can now create Camoufox profiles via a temporary CLI (UI comes in Phase 9).

### 7.2 Preconditions

- Phase 3 complete
- `camoufox-js` smoke test passes on the dev machine

### 7.3 Files to Create

- `packages/core/src/engines/camoufox/CamoufoxEngine.ts`
- `packages/core/src/engines/camoufox/buildOptions.ts`
- `packages/core/src/engines/camoufox/resolveBinary.ts`

### 7.4 Files to Modify

- `packages/core/src/engines/EngineFactory.ts` — register Camoufox
- `packages/core/src/container/index.ts` — pass any new dependencies

### 7.5 CamoufoxEngine

```ts
// packages/core/src/engines/camoufox/CamoufoxEngine.ts
import { launch as launchCamoufox } from 'camoufox-js';
import type { BrowserEngine, EngineType, LaunchInput, BrowserSession } from '../types';
import { buildCamoufoxOptions } from './buildOptions';
import { resolveCamoufoxBinary } from './resolveBinary';

export class CamoufoxEngine implements BrowserEngine {
  readonly type: EngineType = 'camoufox';

  async launch(input: LaunchInput): Promise<BrowserSession> {
    const options = buildCamoufoxOptions({
      userDataDir: input.userDataDir,
      proxyPort: input.forwarderPort,
      seed: input.seed,
      platform: input.profile.fingerprintBundle.platform,
      languages: input.profile.fingerprintBundle.locales.languages,
      timezone: input.profile.fingerprintBundle.timezone,
      headless: input.headless,
    });

    const browser = await launchCamoufox(options);
    const context = browser.contexts()[0] ?? await browser.newContext();
    const page = context.pages()[0] ?? await context.newPage();

    return {
      browser,
      context,
      page,
      humanizer: null,
      engine: 'camoufox',
      cdpPort: null,
      async close() { await browser.close(); },
    };
  }

  async stop(_profileId: string): Promise<void> {}
}
```

### 7.6 buildOptions

```ts
// packages/core/src/engines/camoufox/buildOptions.ts
import { resolveCamoufoxBinary } from './resolveBinary';

export function buildCamoufoxOptions(input: {
  userDataDir: string;
  proxyPort: number;
  seed: number;
  platform: string;
  languages: string[];
  timezone: string;
  headless: boolean;
}) {
  return {
    headless: input.headless,
    user_data_dir: input.userDataDir,
    executable_path: resolveCamoufoxBinary(),
    proxy: {
      server: `socks5://127.0.0.1:${input.proxyPort}`,
    },
    geoip: true,
    os: mapPlatform(input.platform),
    locale: input.languages[0],
    humanize: true,
    seed: input.seed,
    firefox_user_prefs: {
      'intl.accept_languages': input.languages.join(','),
    },
    ff_version: 152,
  };
}

function mapPlatform(p: string): 'windows' | 'macos' | 'linux' {
  if (p === 'windows') return 'windows';
  if (p === 'macos') return 'macos';
  return 'linux';
}
```

**Note:** Camoufox does not have an Android persona. If a profile is `platform: 'android'`, we force the engine to `apostate` at profile creation time (Phase 9).

### 7.7 Profile Creation Rule

In `ProfileService.create()`:

```ts
if (input.engine === 'camoufox' && preset.platform === 'android') {
  throw new TersooError('ENGINE_PLATFORM_MISMATCH',
    'Camoufox does not support Android personas. Use Apostate for Android.');
}
```

### 7.8 Acceptance Criteria

- [ ] Creating a Camoufox profile via CLI succeeds
- [ ] Launching it opens a Firefox window
- [ ] Pixelscan bot check is green
- [ ] Pixelscan fingerprint is green
- [ ] Timezone matches the proxy exit IP
- [ ] Locale matches the proxy exit country
- [ ] `pnpm -r test` green
- [ ] Committed with message: `feat(engines): phase 4 — CamoufoxEngine integration`

### 7.9 Rollback

Unregister Camoufox from the factory. Profiles with `engine='camoufox'` will fail to launch with `ENGINE_NOT_REGISTERED`.

### 7.10 Handoff

Phase 5 inherits: two working engines, `Humanizer` interface placeholder.

---

## 8. Phase 5 — Humanizer Module

### 8.1 Goal

Implement the `Humanizer` class as a reusable module. Wire it into the `BrowserSession` so both engines get the same humanization behavior. **Do not yet replace existing input calls in workflows** — first verify the Humanizer works standalone.

### 8.2 Preconditions

- Phase 4 complete
- Both engines launch cleanly

### 8.3 Files to Create

- `packages/core/src/crosshair/Humanizer.ts`
- `packages/core/src/crosshair/prng.ts`
- `packages/core/src/crosshair/distributions.ts`
- `packages/core/src/crosshair/bezier.ts`

### 8.4 The PRNG

```ts
// packages/core/src/crosshair/prng.ts
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

### 8.5 Distributions

```ts
// packages/core/src/crosshair/distributions.ts
export function normal(rng: () => number, mean: number, sd: number): number {
  const u1 = rng() || 1e-9;
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * sd;
}

export function lognormal(rng: () => number, median: number, sigma: number): number {
  return median * Math.exp(sigma * normal(rng, 0, 1));
}

export function uniform(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function sampleRange(rng: () => number, range: [number, number]): number {
  return uniform(rng, range[0], range[1]);
}
```

### 8.6 Bézier

```ts
// packages/core/src/crosshair/bezier.ts
export interface Point { x: number; y: number; }

export function cubicBezier(
  p0: Point, p1: Point, p2: Point, p3: Point, t: number
): Point {
  const mt = 1 - t;
  return {
    x: mt**3 * p0.x + 3 * mt**2 * t * p1.x + 3 * mt * t**2 * p2.x + t**3 * p3.x,
    y: mt**3 * p0.y + 3 * mt**2 * t * p1.y + 3 * mt * t**2 * p2.y + t**3 * p3.y,
  };
}

export function generateBezierPath(
  start: Point,
  end: Point,
  rng: () => number,
  steps: number,
): Point[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.hypot(dx, dy);
  const mag = dist * (0.15 + rng() * 0.25);
  const sign = rng() > 0.5 ? 1 : -1;
  const nx = -dy / dist * sign;
  const ny = dx / dist * sign;

  const c1 = { x: start.x + dx * 0.3 + nx * mag, y: start.y + dy * 0.3 + ny * mag };
  const c2 = { x: start.x + dx * 0.7 + nx * mag, y: start.y + dy * 0.7 + ny * mag };

  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = cubicBezier(start, c1, c2, end, t);
    points.push({
      x: p.x + (rng() - 0.5) * 2,
      y: p.y + (rng() - 0.5) * 2,
    });
  }

  return points;
}
```

### 8.7 The Humanizer

```ts
// packages/core/src/crosshair/Humanizer.ts
import type { Page, Locator } from 'playwright-core';
import { mulberry32 } from './prng';
import { lognormal, sampleRange } from './distributions';
import { generateBezierPath, type Point } from './bezier';

export class Humanizer {
  private rng: () => number;
  private lastMouse: Point = { x: 0, y: 0 };

  constructor(seed: number) {
    this.rng = mulberry32(seed);
  }

  async moveMouse(page: Page, target: Point): Promise<void> {
    const steps = Math.floor(sampleRange(this.rng, [20, 60]));
    const path = generateBezierPath(this.lastMouse, target, this.rng, steps);

    for (const p of path) {
      await page.mouse.move(p.x, p.y);
      await this.delay(sampleRange(this.rng, [8, 24]));
    }

    if (this.rng() < 0.1) {
      const overshoot = sampleRange(this.rng, [3, 15]);
      const angle = Math.atan2(target.y - this.lastMouse.y, target.x - this.lastMouse.x);
      const over: Point = {
        x: target.x + Math.cos(angle) * overshoot,
        y: target.y + Math.sin(angle) * overshoot,
      };
      const back = generateBezierPath(target, over, this.rng, 5);
      for (const p of back) {
        await page.mouse.move(p.x, p.y);
        await this.delay(4);
      }
      const correct = generateBezierPath(over, target, this.rng, 3);
      for (const p of correct) {
        await page.mouse.move(p.x, p.y);
        await this.delay(6);
      }
    }

    this.lastMouse = target;
  }

  async click(page: Page, selector: string): Promise<void> {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`SELECTOR_NOT_FOUND:${selector}`);
    const target = {
      x: box.x + box.width / 2 + (this.rng() - 0.5) * 4,
      y: box.y + box.height / 2 + (this.rng() - 0.5) * 4,
    };
    await this.moveMouse(page, target);
    await this.delay(sampleRange(this.rng, [80, 200]));
    await page.mouse.down();
    await this.delay(sampleRange(this.rng, [40, 90]));
    await page.mouse.up();
    await this.delay(sampleRange(this.rng, [100, 400]));
  }

  async clickLocator(page: Page, locator: Locator): Promise<void> {
    const box = await locator.first().boundingBox();
    if (!box) throw new Error('LOCATOR_NOT_VISIBLE');
    const target = {
      x: box.x + box.width / 2 + (this.rng() - 0.5) * 4,
      y: box.y + box.height / 2 + (this.rng() - 0.5) * 4,
    };
    await this.moveMouse(page, target);
    await this.delay(sampleRange(this.rng, [80, 200]));
    await page.mouse.down();
    await this.delay(sampleRange(this.rng, [40, 90]));
    await page.mouse.up();
  }

  async clickAt(page: Page, x: number, y: number): Promise<void> {
    await this.moveMouse(page, { x, y });
    await this.delay(sampleRange(this.rng, [80, 200]));
    await page.mouse.down();
    await this.delay(sampleRange(this.rng, [40, 90]));
    await page.mouse.up();
  }

  async drag(page: Page, from: Point, to: Point): Promise<void> {
    await this.moveMouse(page, from);
    await this.delay(sampleRange(this.rng, [60, 150]));
    await page.mouse.down();
    await this.delay(sampleRange(this.rng, [50, 120]));
    const path = generateBezierPath(from, to, this.rng, 25);
    for (const p of path) {
      await page.mouse.move(p.x, p.y);
      await this.delay(sampleRange(this.rng, [6, 18]));
    }
    await this.delay(sampleRange(this.rng, [40, 100]));
    await page.mouse.up();
  }

  async type(page: Page, selector: string, text: string): Promise<void> {
    await this.click(page, selector);
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      await page.keyboard.type(char);
      const delay = lognormal(this.rng, 80, 0.4);
      await this.delay(Math.max(20, Math.min(delay, 400)));

      if (this.rng() < 0.02 && i < text.length - 1) {
        const wrongChar = String.fromCharCode(char.charCodeAt(0) + 1);
        await page.keyboard.type(wrongChar);
        await this.delay(sampleRange(this.rng, [200, 600]));
        await page.keyboard.press('Backspace');
        await this.delay(sampleRange(this.rng, [100, 300]));
      }
    }
  }

  async scroll(page: Page, direction: 'up' | 'down', amount: number): Promise<void> {
    const events = Math.floor(sampleRange(this.rng, [3, 8]));
    for (let i = 0; i < events; i++) {
      const progress = i / events;
      const eased = 1 - Math.pow(1 - progress, 3);
      const step = (amount / events) * (1 + eased * 0.5);
      const delta = direction === 'down' ? step : -step;
      await page.mouse.wheel(0, delta);
      await this.delay(sampleRange(this.rng, [30, 90]));
    }
  }

  async idle(page: Page, minMs: number, maxMs: number): Promise<void> {
    const total = sampleRange(this.rng, [minMs, maxMs]);
    const chunks = Math.floor(total / 3000);

    for (let i = 0; i < chunks; i++) {
      await this.delay(sampleRange(this.rng, [2000, 4000]));
      if (this.rng() < 0.3) {
        await page.mouse.move(
          this.lastMouse.x + (this.rng() - 0.5) * 20,
          this.lastMouse.y + (this.rng() - 0.5) * 20,
        );
      }
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
```

### 8.8 Wire Into BrowserSession

In both engines' `launch()`, replace `humanizer: null` with:

```ts
import { Humanizer } from '../../crosshair/Humanizer';

const humanizer = new Humanizer(input.seed);
return { ..., humanizer, ... };
```

### 8.9 Standalone Verification

Create `scripts/humanizer-test.ts`:

```ts
import { chromium } from 'playwright-core';
import { Humanizer } from '../packages/core/src/crosshair/Humanizer';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('https://example.com');
  const h = new Humanizer(12345);
  await h.moveMouse(page, { x: 500, y: 300 });
  await h.moveMouse(page, { x: 100, y: 500 });
  await h.scroll(page, 'down', 800);
  await h.idle(page, 3000, 5000);
  await browser.close();
}

main();
```

**Expected:** Cursor moves in curved paths, not straight lines. Scrolling decelerates.

### 8.10 Acceptance Criteria

- [ ] `Humanizer` class exists with all methods
- [ ] `scripts/humanizer-test.ts` shows curved motion
- [ ] Both engines' `BrowserSession.humanizer` is populated
- [ ] Determinism verified: same seed → same path
- [ ] Committed with message: `feat(crosshair): phase 5 — Humanizer with Bézier, lognormal, kinetic scroll`

### 8.11 Handoff

Phase 6 inherits: fully wired Humanizer available on every `BrowserSession`.

---

## 9. Phase 6 — LLM Service Integration

### 9.1 Goal

Implement the `LlmService` with OpenRouter as the default provider. Text-only at this phase; vision fallback comes in Phase 8.

### 9.2 Preconditions

- Phase 5 complete
- OpenRouter API key available

### 9.3 Files to Create

- `packages/core/src/llm/LlmService.ts`
- `packages/core/src/llm/providers/openrouter.ts`
- `packages/core/src/llm/prompts.ts`
- `packages/core/src/llm/types.ts`
- `packages/core/src/llm/errors.ts`

### 9.4 Types

```ts
// packages/core/src/llm/types.ts
import type { AccessibilityNode } from '../crosshair/accessibility';

export type LlmDecision =
  | { action: 'click'; ref: number; reason?: string }
  | { action: 'type'; ref: number; text: string; reason?: string }
  | { action: 'scroll'; direction: 'up' | 'down'; amount: number; reason?: string }
  | { action: 'navigate'; url: string; reason?: string }
  | { action: 'wait'; ms: number; reason?: string }
  | { action: 'done'; reason?: string }
  | { action: 'unsolvable'; reason: string };

export type VisionDecision =
  | { action: 'click'; x: number; y: number; reason?: string }
  | { action: 'drag'; x: number; y: number; endX: number; endY: number; reason?: string }
  | { action: 'unsolvable'; reason: string };
```

### 9.5 OpenRouter Client

```ts
// packages/core/src/llm/providers/openrouter.ts
import { TersooError } from '../../util/errors';

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'json_object' | 'text';
}

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >;
}

export async function callOpenRouter(
  config: OpenRouterConfig,
  messages: OpenRouterMessage[],
): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://tersoopilot.dev',
      'X-Title': 'TersooPilot Desktop',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: config.maxTokens ?? 2000,
      temperature: config.temperature ?? 0.2,
      response_format: config.responseFormat === 'json_object' ? { type: 'json_object' } : undefined,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new TersooError('LLM_API_ERROR', `OpenRouter ${res.status}: ${body}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}
```

### 9.6 LlmService

```ts
// packages/core/src/llm/LlmService.ts
import { callOpenRouter } from './providers/openrouter';
import { TREE_SYSTEM_PROMPT, VISION_SYSTEM_PROMPT } from './prompts';
import { TersooError } from '../util/errors';
import type { SecretVault } from '../secrets/SecretVault';
import type { LlmConfigRepo } from '../persistence/repos/llmConfigRepo';
import type { LlmDecision, VisionDecision } from './types';
import type { AccessibilityNode } from '../crosshair/accessibility';

export class LlmService {
  constructor(
    private configRepo: LlmConfigRepo,
    private secrets: SecretVault,
  ) {}

  async decideFromTree(tree: AccessibilityNode, goal: string): Promise<LlmDecision> {
    const config = await this.configRepo.get();
    const apiKey = await this.secrets.get(config.api_key_ref);
    const attempts = config.max_attempts;
    const backoff = JSON.parse(config.backoff_ms) as number[];

    for (let i = 0; i < attempts; i++) {
      try {
        const content = await callOpenRouter(
          { apiKey, model: config.text_model, responseFormat: 'json_object' },
          [
            { role: 'system', content: TREE_SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify({ goal, tree }) },
          ],
        );
        return JSON.parse(content) as LlmDecision;
      } catch (err) {
        if (i === attempts - 1) throw err;
        await new Promise(r => setTimeout(r, backoff[i] ?? 3000));
      }
    }

    throw new TersooError('LLM_EXHAUSTED', 'All LLM attempts failed');
  }

  async decideFromScreenshot(image: Buffer, prompt: string): Promise<VisionDecision> {
    const config = await this.configRepo.get();
    if (!config.vision_enabled) throw new TersooError('VISION_DISABLED', '');
    if (!config.vision_model) throw new TersooError('VISION_MODEL_MISSING', '');

    const apiKey = await this.secrets.get(config.api_key_ref);
    const content = await callOpenRouter(
      { apiKey, model: config.vision_model, responseFormat: 'json_object' },
      [
        { role: 'system', content: VISION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${image.toString('base64')}` } },
          ],
        },
      ],
    );

    return JSON.parse(content) as VisionDecision;
  }
}
```

### 9.7 Prompts

```ts
// packages/core/src/llm/prompts.ts

export const TREE_SYSTEM_PROMPT = `You are a browser automation agent. You receive:
- A "goal" describing what to accomplish
- An accessibility tree "tree" of the current page

Each node has a "ref" integer. Your job is to return one JSON action:
- {"action":"click","ref":<int>}
- {"action":"type","ref":<int>,"text":"..."}
- {"action":"scroll","direction":"up"|"down","amount":<px>}
- {"action":"navigate","url":"..."}
- {"action":"wait","ms":<int>}
- {"action":"done"}
- {"action":"unsolvable","reason":"..."}

Rules:
- Prefer the smallest interaction that advances the goal.
- If the goal is already achieved, return {"action":"done"}.
- If the goal is impossible from this tree, return {"action":"unsolvable","reason":"..."}.
- Return ONLY the JSON object, no prose.`;

export const VISION_SYSTEM_PROMPT = `You are analyzing a screenshot of a CAPTCHA or visual challenge.

Return one JSON action:
- {"action":"click","x":<int>,"y":<int>}
- {"action":"drag","x":<int>,"y":<int>,"endX":<int>,"endY":<int>}
- {"action":"unsolvable","reason":"..."}

Rules:
- Coordinates are in the screenshot's pixel space (top-left origin).
- If the challenge requires solving an image grid, return the click coordinates for the first tile that needs clicking.
- If the challenge is unsolvable by vision alone, return unsolvable.
- Return ONLY the JSON object.`;

export const CAPTCHA_PROMPT = `A CAPTCHA is displayed. Analyze the screenshot and return the action needed to solve it. If it is a slider, return drag coordinates. If it is an image grid, return the first tile to click.`;
```

### 9.8 IPC Test Channel

Add temporarily to test the LLM service:

```ts
// packages/contracts/src/channels.ts
'llm.test': { input: z.object({ prompt: z.string() }), output: z.any() },
```

### 9.9 Acceptance Criteria

- [ ] `LlmService` class exists
- [ ] OpenRouter client successfully returns a JSON decision
- [ ] Retry logic works (simulate a 500 error)
- [ ] `llm.test` IPC channel returns valid JSON
- [ ] API key is read from keychain, not disk
- [ ] Committed with message: `feat(llm): phase 6 — OpenRouter client with retry and prompt management`

---

## 10. Phase 7 — Accessibility Tree & LLM Step Type

### 10.1 Goal

Extract the accessibility tree from a Playwright page, convert it to stable integer refs, and add an `llm` step type to the workflow schema. This makes LLM mode usable inside workflows.

### 10.2 Files to Create

- `packages/core/src/crosshair/accessibility.ts`
- `packages/core/src/task/steps/llmStep.ts`

### 10.3 Files to Modify

- `packages/contracts/src/task.ts` — add `llm` step type
- `packages/core/src/task/StepRunner.ts` — dispatch `llm` steps
- `packages/core/src/task/policies.ts` — handle LLM failures

### 10.4 Accessibility Tree Extractor

```ts
// packages/core/src/crosshair/accessibility.ts
import type { Page } from 'playwright-core';

export interface AccessibilityNode {
  ref: number;
  role: string;
  name: string;
  value?: string;
  disabled?: boolean;
  focused?: boolean;
  checked?: boolean | 'mixed';
  expanded?: boolean;
  children?: AccessibilityNode[];
}

let nextRef = 1;

export async function extractAccessibilityTree(page: Page): Promise<AccessibilityNode> {
  const snapshot = await page.accessibility.snapshot({ interestingOnly: true });
  if (!snapshot) throw new Error('ACCESSIBILITY_TREE_EMPTY');
  nextRef = 1;
  return convertNode(snapshot);
}

function convertNode(node: any): AccessibilityNode {
  const ref = nextRef++;
  const result: AccessibilityNode = {
    ref,
    role: node.role ?? 'unknown',
    name: node.name ?? '',
    value: node.value,
    disabled: node.disabled,
    focused: node.focused,
    checked: node.checked,
    expanded: node.expanded,
  };

  if (node.children && node.children.length > 0) {
    result.children = node.children.map(convertNode);
  }

  return result;
}

export function findNodeByRef(root: AccessibilityNode, ref: number): AccessibilityNode | null {
  if (root.ref === ref) return root;
  if (root.children) {
    for (const child of root.children) {
      const found = findNodeByRef(child, ref);
      if (found) return found;
    }
  }
  return null;
}
```

### 10.5 LLM Step

```ts
// packages/core/src/task/steps/llmStep.ts
import type { Page } from 'playwright-core';
import type { LlmService } from '../../llm/LlmService';
import type { Humanizer } from '../../crosshair/Humanizer';
import { extractAccessibilityTree, findNodeByRef, type AccessibilityNode } from '../../crosshair/accessibility';
import type { LlmDecision } from '../../llm/types';

export interface LlmStepInput {
  goal: string;
  maxIterations?: number;
}

export async function runLlmStep(
  page: Page,
  humanizer: Humanizer,
  llm: LlmService,
  input: LlmStepInput,
): Promise<{ iterations: number; finalDecision: LlmDecision }> {
  const max = input.maxIterations ?? 10;

  for (let i = 0; i < max; i++) {
    const tree = await extractAccessibilityTree(page);
    const decision = await llm.decideFromTree(tree, input.goal);

    if (decision.action === 'done') return { iterations: i + 1, finalDecision: decision };
    if (decision.action === 'unsolvable') {
      throw new Error(`LLM_UNSOLVABLE:${decision.reason}`);
    }

    await executeDecision(page, humanizer, tree, decision);
    await humanizer.idle(page, 1000, 3000);
  }

  throw new Error('LLM_MAX_ITERATIONS');
}

async function executeDecision(
  page: Page,
  humanizer: Humanizer,
  tree: AccessibilityNode,
  decision: LlmDecision,
): Promise<void> {
  switch (decision.action) {
    case 'click': {
      const node = findNodeByRef(tree, decision.ref);
      if (!node) throw new Error(`LLM_REF_NOT_FOUND:${decision.ref}`);
      const locator = page.getByRole(node.role as any, { name: node.name });
      await humanizer.clickLocator(page, locator);
      break;
    }
    case 'type': {
      const node = findNodeByRef(tree, decision.ref);
      if (!node) throw new Error(`LLM_REF_NOT_FOUND:${decision.ref}`);
      const locator = page.getByRole(node.role as any, { name: node.name });
      await humanizer.clickLocator(page, locator);
      await page.keyboard.type(decision.text);
      break;
    }
    case 'scroll':
      await humanizer.scroll(page, decision.direction, decision.amount);
      break;
    case 'navigate':
      await page.goto(decision.url, { waitUntil: 'domcontentloaded' });
      break;
    case 'wait':
      await page.waitForTimeout(decision.ms);
      break;
  }
}
```

### 10.6 Workflow Schema Update

```ts
// packages/contracts/src/task.ts
export const Step = z.discriminatedUnion('type', [
  // ... existing steps ...
  z.object({
    type: z.literal('llm'),
    goal: z.string().min(1),
    maxIterations: z.number().int().min(1).max(50).default(10),
  }),
]);
```

### 10.7 StepRunner Dispatch

```ts
case 'llm': {
  const result = await runLlmStep(
    session.page,
    session.humanizer!,
    llmService,
    { goal: step.goal, maxIterations: step.maxIterations },
  );
  return { success: true, artifacts: { iterations: result.iterations } };
}
```

### 10.8 Acceptance Criteria

- [ ] Accessibility tree extraction works on a real page
- [ ] Refs are stable within a single extraction
- [ ] `runLlmStep` completes a simple goal
- [ ] Workflow schema accepts `llm` steps
- [ ] Committed with message: `feat(task): phase 7 — accessibility tree extraction and LLM step type`

---

## 11. Phase 8 — CAPTCHA Detection, Vision Fallback, and Budget

### 11.1 Goal

Detect CAPTCHAs before and after every step. On detection, use the vision LLM to solve. Track attempts per profile per session. Abort after budget exhaustion.

### 11.2 Files to Create

- `packages/core/src/task/CaptchaHandler.ts`
- `packages/core/src/task/captchaDetector.ts`

### 11.3 Files to Modify

- `packages/core/src/task/StepRunner.ts` — call `captchaHandler.checkAndHandle()` before and after each step
- `packages/core/src/supervisor/launchSequence.ts` — reset `captcha_budget_used` on launch
- `packages/core/src/services/ProfileService.ts` — expose CAPTCHA count in profile summary

### 11.4 Detection

```ts
// packages/core/src/task/captchaDetector.ts
import type { Page } from 'playwright-core';

export interface CaptchaInfo {
  type: 'recaptcha' | 'hcaptcha' | 'turnstile' | 'generic';
  selector: string;
}

const SELECTORS: Array<[CaptchaInfo['type'], string]> = [
  ['recaptcha', 'iframe[src*="recaptcha"]'],
  ['recaptcha', 'div.g-recaptcha'],
  ['hcaptcha', 'iframe[src*="hcaptcha"]'],
  ['turnstile', 'iframe[src*="turnstile"]'],
  ['turnstile', 'div.cf-turnstile'],
  ['generic', 'div[class*="captcha" i]'],
  ['generic', 'div[id*="captcha" i]'],
];

export async function detectCaptcha(page: Page): Promise<CaptchaInfo | null> {
  for (const [type, selector] of SELECTORS) {
    const el = await page.$(selector);
    if (el) return { type, selector };
  }
  return null;
}
```

### 11.5 Handler

```ts
// packages/core/src/task/CaptchaHandler.ts
import type { Page } from 'playwright-core';
import type { LlmService } from '../llm/LlmService';
import type { Humanizer } from '../crosshair/Humanizer';
import type { CaptchaEventRepo } from '../persistence/repos/captchaEventRepo';
import type { SettingsRepo } from '../persistence/repos/settingsRepo';
import type { ProfileRepo } from '../persistence/repos/profileRepo';
import { detectCaptcha } from './captchaDetector';
import { CAPTCHA_PROMPT } from '../llm/prompts';
import { TersooError } from '../util/errors';
import { v4 as uuid } from 'uuid';
import fs from 'node:fs';
import path from 'node:path';

export class CaptchaHandler {
  constructor(
    private llm: LlmService,
    private humanizer: Humanizer,
    private captchaRepo: CaptchaEventRepo,
    private profileRepo: ProfileRepo,
    private settingsRepo: SettingsRepo,
    private artifactsDir: string,
  ) {}

  async checkAndHandle(page: Page, runId: string, profileId: string): Promise<number> {
    const detected = await detectCaptcha(page);
    if (!detected) return 0;

    const budget = Number(await this.settingsRepo.get('captcha_budget')) || 3;
    const profile = await this.profileRepo.get(profileId);
    const used = profile?.captcha_budget_used ?? 0;

    if (used >= budget) {
      await this.captchaRepo.insert({
        id: uuid(), runId, profileId,
        detectedAt: Date.now(),
        challengeType: detected.type,
        solvedBy: null,
        attempts: 0,
        outcome: 'aborted',
        screenshotPath: null,
        createdAt: Date.now(),
      });
      throw new TersooError('CAPTCHA_BUDGET_EXCEEDED',
        `Profile hit ${budget} CAPTCHAs — aborting run`);
    }

    await this.profileRepo.incrementCaptchaCount(profileId);

    const screenshot = await page.screenshot({ type: 'png' });
    const shotPath = path.join(this.artifactsDir, `${runId}-captcha-${Date.now()}.png`);
    fs.writeFileSync(shotPath, screenshot);

    let outcome: 'solved' | 'failed' | 'unsolvable' = 'failed';
    let solvedBy: string | null = null;
    const attempts = 1;

    try {
      const decision = await this.llm.decideFromScreenshot(screenshot, CAPTCHA_PROMPT);
      if (decision.action === 'unsolvable') {
        outcome = 'unsolvable';
      } else if (decision.action === 'click') {
        await this.humanizer.clickAt(page, decision.x, decision.y);
        await page.waitForTimeout(2000);
        const stillThere = await detectCaptcha(page);
        outcome = stillThere ? 'failed' : 'solved';
        solvedBy = 'vision';
      } else if (decision.action === 'drag') {
        await this.humanizer.drag(
          page,
          { x: decision.x, y: decision.y },
          { x: decision.endX, y: decision.endY },
        );
        await page.waitForTimeout(2000);
        const stillThere = await detectCaptcha(page);
        outcome = stillThere ? 'failed' : 'solved';
        solvedBy = 'vision';
      }
    } catch {
      outcome = 'failed';
    }

    await this.captchaRepo.insert({
      id: uuid(), runId, profileId,
      detectedAt: Date.now(),
      challengeType: detected.type,
      solvedBy,
      attempts,
      outcome,
      screenshotPath: shotPath,
      createdAt: Date.now(),
    });

    if (outcome !== 'solved') {
      throw new TersooError('CAPTCHA_FAILED', `Outcome: ${outcome}`);
    }

    return 1;
  }
}
```

### 11.6 Wire Into StepRunner

```ts
async function executeStep(page: Page, step: Step, ctx: TaskContext) {
  await ctx.captchaHandler.checkAndHandle(page, ctx.runId, ctx.profileId);

  let result;
  try {
    result = await dispatchStep(page, step, ctx);
  } catch (err) {
    await ctx.captchaHandler.checkAndHandle(page, ctx.runId, ctx.profileId);
    throw err;
  }

  await ctx.captchaHandler.checkAndHandle(page, ctx.runId, ctx.profileId);
  return result;
}
```

### 11.7 Reset Budget on Launch

```ts
await this.profileRepo.resetCaptchaCount(profileId);
```

### 11.8 Acceptance Criteria

- [ ] CAPTCHA is detected on a test page
- [ ] Screenshot is taken and saved
- [ ] Vision LLM returns coordinates
- [ ] Humanizer executes the click with Bézier motion
- [ ] `captcha_events` row is written
- [ ] After 3 CAPTCHAs, the run aborts with `CAPTCHA_BUDGET_EXCEEDED`
- [ ] Budget resets on next launch
- [ ] Committed with message: `feat(task): phase 8 — CAPTCHA detection, vision fallback, budget enforcement`

---

## 12. Phase 9 — UI Updates

### 12.1 Goal

Expose all new features through the UI: engine selection, bulk engine distribution, LLM settings, CAPTCHA settings, action mode toggle, engine badges, CAPTCHA counter.

### 12.2 Files to Modify

- `apps/renderer/src/views/ProfilesView/` — add Engine column, New Profile modal radio
- `apps/renderer/src/views/ProxyVaultView/` — no change
- `apps/renderer/src/views/TaskStudioView/` — add action mode toggle and LLM step type
- `apps/renderer/src/views/SettingsView/` — add LLM section, CAPTCHA section, engine weights
- `apps/renderer/src/views/RunsView/` — add CAPTCHA counter
- `apps/renderer/src/views/FleetMonitorView/` — add engine badges
- `apps/renderer/src/stores/profilesStore.ts` — add `engine` field handling
- `apps/renderer/src/stores/settingsStore.ts` — new

### 12.3 UI Changes Detail

#### 12.3.1 Profile Studio Table

Add column between Platform and Sticky Proxy:

```
| ENGINE |
| [APOSTATE] blue badge |
| [CAMOUFOX] orange badge |
```

#### 12.3.2 New Profile Modal

```tsx
<RadioGroup value={engine} onChange={setEngine}>
  <Radio value="apostate">
    <strong>Apostate</strong> (Chromium)
    <p>Recommended for YouTube, Google, Chrome-trust targets.</p>
  </Radio>
  <Radio value="camoufox">
    <strong>Camoufox</strong> (Firefox)
    <p>Recommended for non-English regions and Cloudflare-protected sites.</p>
  </Radio>
</RadioGroup>
```

Validation: if `preset.platform === 'android'`, disable the Camoufox option.

#### 12.3.3 Bulk Create Modal

```tsx
<RadioGroup value={distMode} onChange={setDistMode}>
  <Radio value="single">Single engine</Radio>
  <Radio value="mixed">Mixed (weighted random)</Radio>
</RadioGroup>

{distMode === 'mixed' && (
  <>
    <Slider
      label="Apostate"
      value={weights.apostate}
      onChange={v => setWeights({ ...weights, apostate: v, camoufox: 100 - v })}
    />
    <Slider
      label="Camoufox"
      value={weights.camoufox}
      onChange={v => setWeights({ ...weights, camoufox: v, apostate: 100 - v })}
    />
    <Preview>
      Creates {Math.round(count * weights.apostate / 100)} Apostate,{' '}
      {Math.round(count * weights.camoufox / 100)} Camoufox
    </Preview>
  </>
)}
```

#### 12.3.4 Settings View

Three new sections:

**Engine Weights** (defaults for bulk create)
**LLM Configuration** (provider, models, API key, max attempts, backoff)
**CAPTCHA Handling** (vision fallback toggle, budget, action on exceed)

#### 12.3.5 Task Studio Action Mode

```tsx
<RadioGroup value={actionMode} onChange={setActionMode}>
  <Radio value="inherit">Inherit from profile</Radio>
  <Radio value="scripted">Scripted</Radio>
  <Radio value="llm">LLM</Radio>
</RadioGroup>
```

When LLM is active, add an "LLM Goal" step type to the palette.

#### 12.3.6 Runs View CAPTCHA Counter

```tsx
<span className={captchaCount > 2 ? 'text-red-500' : 'text-yellow-500'}>
  CAPTCHA {captchaCount}/3
</span>
```

#### 12.3.7 Fleet Monitor Engine Badges

Each instance tile shows the engine badge next to the profile name.

### 12.4 IPC Channels to Add

```ts
'engine.list':           { input: z.void(), output: z.array(z.enum(['apostate','camoufox'])) },
'engine.config.get':     { input: z.object({ engine: z.enum(['apostate','camoufox']) }), output: z.any() },
'engine.config.set':     { input: z.object({ engine: z.enum(['apostate','camoufox']), patch: z.any() }), output: z.void() },

'llm.config.get':        { input: z.void(), output: z.any() },
'llm.config.set':        { input: z.any(), output: z.void() },
'llm.test':              { input: z.object({ prompt: z.string() }), output: z.any() },

'captcha.events.list':   { input: z.object({ runId: C.Id.optional(), profileId: C.Id.optional() }), output: z.array(z.any()) },
'captcha.budget.get':    { input: z.object({ profileId: C.Id }), output: z.object({ used: z.number(), budget: z.number() }) },

'settings.weights.get':  { input: z.void(), output: z.object({ apostate: z.number(), camoufox: z.number() }) },
'settings.weights.set':  { input: z.object({ apostate: z.number(), camoufox: z.number() }), output: z.void() },

'profile.bulkCreate':    { input: z.object({
                             count: z.number().int().min(1).max(1000),
                             presetId: C.Id,
                             engineDistribution: z.union([
                               z.object({ mode: z.literal('single'), engine: z.enum(['apostate','camoufox']) }),
                               z.object({ mode: z.literal('mixed'), weights: z.object({ apostate: z.number(), camoufox: z.number() }) }),
                             ]),
                             tags: z.array(z.string()).optional(),
                           }), output: z.array(C.ProfileSummary) },
```

### 12.5 Acceptance Criteria

- [ ] Can create a Camoufox profile via the New Profile modal
- [ ] Bulk create with mixed weights produces the correct distribution
- [ ] Settings view saves LLM config to DB
- [ ] Settings view saves CAPTCHA budget
- [ ] Task Studio shows the LLM step type in the palette
- [ ] Runs view shows the CAPTCHA counter
- [ ] Fleet Monitor shows engine badges
- [ ] All existing UI still works
- [ ] Committed with message: `feat(ui): phase 9 — dual-engine selection, LLM settings, CAPTCHA UI`

---

## 13. Phase 10 — End-to-End Validation & Hardening

### 13.1 Goal

Run a full fleet test with mixed engines, verify YouTube behavior, harden edge cases, and freeze the build.

### 13.2 Test Matrix

| Test | Expected |
|---|---|
| Launch 5 Apostate profiles concurrently | All 5 open, no interference |
| Launch 5 Camoufox profiles concurrently | All 5 open, geoip aligned |
| Bulk create 20 mixed profiles | Distribution ~70/30 |
| Dispatch scripted task to 10 profiles | Stagger works, all complete |
| Dispatch LLM task to 5 profiles | Accessibility tree resolves, LLM decisions valid |
| Trigger CAPTCHA on 1 profile | Detected, solved, counted |
| Trigger 4 CAPTCHAs | Run aborts with `CAPTCHA_BUDGET_EXCEEDED` |
| Kill Chrome mid-run | Run pauses, resumes from checkpoint on restart |
| Kill Electron mid-run | Runs recovered from checkpoint |
| Pixelscan on Apostate | Fingerprint green, bot check red (expected) |
| Pixelscan on Camoufox | Fingerprint green, bot check green |

### 13.3 YouTube-Specific Test

| Test | Expected |
|---|---|
| Watch a video for 60s on Apostate profile | View counted within 24h |
| Watch a video for 60s on Camoufox profile | View counted within 24h |
| Subscribe to a channel | Subscription persists |
| Like a video | Like persists |
| Comment | Comment persists |

### 13.4 Hardening Tasks

- [ ] Verify no plaintext secrets in logs
- [ ] Verify CSP is strict
- [ ] Verify IPC payloads are Zod-validated
- [ ] Verify captcha_events cleanup policy (older than 30 days)
- [ ] Verify engine_config launch_options validation
- [ ] Add telemetry for LLM cost per run

### 13.5 Acceptance Criteria

- [ ] All test matrix items pass
- [ ] YouTube tests show expected behavior
- [ ] No regressions in existing functionality
- [ ] Performance: 10 concurrent profiles < 60% CPU, < 12 GB RAM
- [ ] Committed with message: `chore: phase 10 — end-to-end validation and hardening`

---

## 14. Cross-Phase Rules for Antigravity

1. **Never modify files in `migrations/`** after they have been applied. Create a new migration.
2. **Never modify the launch flags in `engines/apostate/buildArgs.ts`** without testing Pixelscan first.
3. **Never bypass the Humanizer** for user-triggered interactions. If a workflow clicks, it goes through the Humanizer.
4. **Never call `page.mouse.click()` or `page.click()` directly** in workflow code. Always use the Humanizer.
5. **Never store API keys in the DB.** Always the keychain.
6. **Never send a request to the LLM without reading the API key from the keychain.**
7. **Always emit an event on state transition** — `profile.state_changed`, `run.state_changed`, `captcha.detected`.
8. **Always use `TersooError` for thrown errors.** No `throw new Error('...')` in production paths.
9. **Always run `pnpm typecheck` before committing.**
10. **Always run `pnpm -r test` before handing off a phase.**

---

## 15. Phase Dependency Graph

```
Phase 0 (Prep)
   ↓
Phase 1 (Schema)
   ↓
Phase 2 (Engines)
   ↓
Phase 3 (Camoufox binary)
   ↓
Phase 4 (CamoufoxEngine)
   ↓
Phase 5 (Humanizer)
   ↓
Phase 6 (LLM)
   ↓
Phase 7 (LLM steps)
   ↓
Phase 8 (CAPTCHA)
   ↓
Phase 9 (UI)
   ↓
Phase 10 (Validation)
```

Phases must be executed in order. Do not skip.

---

## 16. Master Acceptance Checklist

At the end of Phase 10, the following must all be true:

**Engine Layer**
- [ ] Apostate and Camoufox both launch cleanly
- [ ] Engine selection is per-profile and locked after first launch
- [ ] Bulk create supports weighted random distribution
- [ ] Profile Studio shows engine badges

**Humanization**
- [ ] All workflow interactions route through the Humanizer
- [ ] Cursor moves along Bézier curves with overshoot
- [ ] Keystrokes use lognormal distribution
- [ ] Scrolls use cubic ease-out deceleration
- [ ] Idle periods include micro-movements

**LLM**
- [ ] OpenRouter is the default provider
- [ ] Text model from config drives decisions
- [ ] Accessibility tree is the input (not screenshots)
- [ ] Retry with backoff on failure
- [ ] API key is keychain-only

**CAPTCHA**
- [ ] Pre- and post-step detection
- [ ] Vision fallback via OpenRouter
- [ ] Budget enforced (default 3)
- [ ] Abort on budget exhaustion
- [ ] Events logged with screenshots

**Security**
- [ ] No plaintext secrets anywhere
- [ ] CSP strict
- [ ] IPC validated
- [ ] Audit log complete

**Pixelscan**
- [ ] Apostate: fingerprint green
- [ ] Camoufox: fingerprint green AND bot check green

**YouTube**
- [ ] Views counted
- [ ] No CAPTCHA storms
- [ ] Accounts not flagged

---

## 17. What to Send Back to the Human

After each phase completes:

1. Screenshot of the relevant UI (if UI-touched)
2. Output of `pnpm -r test`
3. Git commit hash
4. Any deviations from this plan
5. Any blockers encountered

The human will review and either approve progression to the next phase or request a rollback.

---

**End of master plan. Version 2.0.0. Frozen.**
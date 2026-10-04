# TersooPilot Desktop — Master Plan Addendum A

**Document version:** 1.0.0
**Target executor:** Google Antigravity IDE coding agents
**Coordination:** Human reviewer (project owner)
**Status:** Authoritative — begins **only after** the master plan (`TERSOOPILOT_MASTER_PLAN.md`, v2.0.0) has completed Phase 10 with all acceptance criteria green.
**Relationship to master plan:** This document extends, not replaces, the master plan. All cross-phase rules from the master plan still apply.

---

## 0. Why This Addendum Exists

After an external architectural review of the master plan, five gaps were identified that would create operational risk if left unaddressed. These are **not corrections** to the master plan — the master plan is sound. They are **hardening measures** that close specific failure modes:

1. **Memory/GPU resource limits** — 10 concurrent browsers will exhaust RAM and crash GPUs without explicit flags.
2. **Fingerprint scoring is unspecified** — the UI shows `0.98 Clear` but the master plan does not specify how this is computed, refreshed, or verified.
3. **Engine maintenance risk is unaddressed** — Camoufox went through a year-long maintenance gap; Apostate is unproven long-term. There is no fallback strategy.
4. **GeoIP verification is untested** — Camoufox's `geoip: true` flag depends on the LocalForwarder correctly handling the resolver's traffic. This is untested.
5. **A11y staleness is untested** — SPA DOM mutations between tree extraction and click execution could break the LLM step type. No integration test covers this.

**Do not start this addendum until the master plan's Phase 10 is complete.** Attempting to layer these on top of an incomplete engine or LLM layer will produce confusing failures.

---

## 1. How to Use This Document

Each phase in this addendum follows the same structure as the master plan:

1. **Goal** — what the phase achieves
2. **Preconditions** — what must be true before starting
3. **Files to create** — exact paths
4. **Files to modify** — exact paths
5. **Code** — concrete implementations or detailed skeletons
6. **Acceptance criteria** — human-verified before proceeding
7. **Rollback** — how to revert
8. **Handoff** — what the next phase inherits

**Same critical rule as master plan:** Do not proceed to the next phase until the current phase is green. Do not fix forward by starting the next phase.

---

## 2. Addendum Phase Overview

| Phase | Title | Risk Addressed | Depends On |
|---|---|---|---|
| **11** | Resource Limits & GPU Hardening | Memory exhaustion, GPU crashes | Master Phase 10 |
| **12** | Fingerprint Scoring Specification | Stale/undefined scoring | Master Phase 10 |
| **13** | Engine Maintenance Monitoring & Fallback | Upstream unmaintained forks | Master Phase 10 |
| **14** | GeoIP Verification & Network Consistency | Camoufox timezone mismatch | Phase 11 |
| **15** | A11y Staleness & SPA Resilience | LLM ref mismatch on dynamic pages | Phase 11 |
| **16** | Final Integration & Sign-Off | Cross-phase coherence | Phases 11–15 |

Phases 11, 12, 13 can run **in parallel** if the team has capacity. Phases 14 and 15 must run **after** 11. Phase 16 must run last.

---

## 3. Phase 11 — Resource Limits & GPU Hardening

### 3.1 Goal

Add explicit memory, GPU, and rendering limits to both engines so that 10 concurrent browser instances run within the specified performance envelope (Phase 10 acceptance: 10 profiles < 60% CPU, < 12 GB RAM).

### 3.2 Preconditions

- Master Phase 10 complete and green
- Profiling data from Phase 10's soak test available (to know where the current bottleneck is)

### 3.3 Files to Modify

- `packages/core/src/engines/apostate/buildArgs.ts` — add memory/GPU flags
- `packages/core/src/engines/camoufox/buildOptions.ts` — add Firefox `user_prefs` for memory/GPU
- `packages/core/src/config.ts` — add resource limit config
- `packages/core/src/supervisor/BrowserSupervisor.ts` — enforce per-instance RAM ceilings via OS
- `packages/core/src/services/FleetService.ts` — add memory pressure check before spawn

### 3.4 New Config

```ts
// packages/core/src/config.ts — extend existing Config

export const ResourceLimits = z.object({
  perInstanceRamMb: z.number().int().min(256).max(8192).default(1536),
  totalFleetRamMb: z.number().int().min(1024).max(65536).default(10240),
  maxWebglContexts: z.number().int().min(1).max(16).default(2),
  disableGpu: z.boolean().default(false),            // true = software rendering
  disableDevShm: z.boolean().default(true),          // Linux/Docker fix
  memoryPressureThresholdPct: z.number().min(0.5).max(0.95).default(0.85),
});

export const Config = z.object({
  // ... existing fields ...
  resourceLimits: ResourceLimits.default({}),
});
```

### 3.5 Apostate buildArgs Additions

```ts
// packages/core/src/engines/apostate/buildArgs.ts

export function buildApostateArgs(input: {
  userDataDir: string;
  forwarderPort: number;
  headless: boolean;
  resourceLimits: ResourceLimits;
}): string[] {
  const base = [
    // ... all existing flags from master plan ...
  ];

  const resourceFlags: string[] = [
    `--max-old-space-size=${input.resourceLimits.perInstanceRamMb}`,
    `--js-flags=--max-old-space-size=${input.resourceLimits.perInstanceRamMb}`,
    `--renderer-process-limit=2`,
    `--disable-features=UseChromeOSDirectVideoDecoder`,
    `--disable-accelerated-2d-canvas`,
    `--disable-software-rasterizer`,
  ];

  if (input.resourceLimits.disableDevShm) {
    resourceFlags.push('--disable-dev-shm-usage');
  }

  if (input.resourceLimits.disableGpu) {
    resourceFlags.push('--disable-gpu', '--disable-gpu-compositing');
  }

  // Cap WebGL contexts per renderer to prevent GPU crashes
  if (input.resourceLimits.maxWebglContexts > 0) {
    resourceFlags.push(
      `--gpu-max-active-webgl-contexts=${input.resourceLimits.maxWebglContexts}`,
    );
  }

  return [...base, ...resourceFlags];
}
```

**Do not remove or reorder any existing flags.** Add the resource flags at the end of the array. Pixelscan tests must still pass after this change.

### 3.6 Camoufox user_prefs Additions

```ts
// packages/core/src/engines/camoufox/buildOptions.ts — extend existing

export function buildCamoufoxOptions(input: {
  // ... existing inputs ...
  resourceLimits: ResourceLimits;
}) {
  return {
    // ... existing options ...
    firefox_user_prefs: {
      // existing
      'intl.accept_languages': input.languages.join(','),

      // memory & rendering limits
      'dom.max_script_run_time': 30,
      'dom.ipc.processCount': 4,
      'browser.tabs.remote.autostart': true,
      'browser.tabs.remote.force-enable': true,
      'gfx.webrender.all': false,
      'gfx.webrender.enabled': false,
      'layers.acceleration.disabled': input.resourceLimits.disableGpu,

      // WebGL limits
      'webgl.max-contexts': input.resourceLimits.maxWebglContexts,
      'webgl.max-contexts-per-process': input.resourceLimits.maxWebglContexts,
      'webgl.disabled': input.resourceLimits.disableGpu,

      // Memory pressure
      'browser.sessionstore.max_tabs_undo': 0,
      'browser.sessionstore.max_windows_undo': 0,
      'browser.cache.memory.capacity': 65536,        // 64 MB
      'browser.cache.disk.capacity': 262144,         // 256 MB
    },
  };
}
```

### 3.7 OS-Level Memory Enforcement

Chromium and Firefox both respect OS-level memory limits if they can be applied. On Linux, use `cgroups v2`; on Windows, use `Job Objects`; on macOS, use `setrlimit`.

```ts
// packages/core/src/supervisor/BrowserSupervisor.ts — add after spawn

private async enforceMemoryLimit(pid: number, limitMb: number): Promise<void> {
  const platform = process.platform;

  if (platform === 'linux') {
    // Requires cgroups v2. Assumes the app runs with cgroup delegation.
    const cgroupPath = `/sys/fs/cgroup/tersoopilot/${pid}`;
    try {
      await fs.promises.mkdir(cgroupPath, { recursive: true });
      await fs.promises.writeFile(
        `${cgroupPath}/memory.max`,
        String(limitMb * 1024 * 1024),
      );
      await fs.promises.writeFile(
        `${cgroupPath}/cgroup.procs`,
        String(pid),
      );
    } catch (err) {
      this.logger.warn('cgroup_limit_failed', { pid, err });
    }
  } else if (platform === 'win32') {
    // Job Objects require native bindings. Use `windows-job-objects` npm package
    // if available; otherwise skip and rely on config-level coordination.
    this.logger.info('memory_limit_windows_unsupported', { pid });
  } else if (platform === 'darwin') {
    // Use a wrapper script that calls setrlimit before exec'ing the browser.
    this.logger.info('memory_limit_macos_wrapper', { pid });
  }
}
```

**Realistic expectation:** cgroup enforcement works on Linux dev machines. On Windows and macOS, enforcement is best-effort. The primary defense is the `FleetService` pre-spawn check.

### 3.8 FleetService Pre-Spawn Memory Check

```ts
// packages/core/src/services/FleetService.ts

async canSpawnAnother(): Promise<{ ok: boolean; reason?: string }> {
  const instances = this.supervisor.list();
  const totalRamMb = os.totalmem() / (1024 * 1024);
  const freeRamMb = os.freemem() / (1024 * 1024);
  const usedRamMb = totalRamMb - freeRamMb;
  const { totalFleetRamMb, perInstanceRamMb, memoryPressureThresholdPct } =
    this.config.resourceLimits;

  // Check 1: total system pressure
  if (usedRamMb / totalRamMb > memoryPressureThresholdPct) {
    return { ok: false, reason: `System RAM pressure at ${Math.round(usedRamMb / totalRamMb * 100)}%` };
  }

  // Check 2: fleet budget
  const fleetBudget = instances.length * perInstanceRamMb;
  if (fleetBudget + perInstanceRamMb > totalFleetRamMb) {
    return { ok: false, reason: `Fleet RAM budget would exceed ${totalFleetRamMb} MB` };
  }

  return { ok: true };
}
```

Call this in `ProfileService.launch()` **before** spawning:

```ts
const check = await this.fleetService.canSpawnAnother();
if (!check.ok) {
  throw new TersooError('RESOURCE_LIMIT', check.reason);
}
```

### 3.9 Acceptance Criteria

- [ ] `Config.resourceLimits` exists and is loaded from DB or defaults
- [ ] Apostate launch args include all resource flags
- [ ] Camoufox options include all resource prefs
- [ ] `FleetService.canSpawnAnother()` rejects spawns when system RAM > 85%
- [ ] 10 concurrent Apostate profiles run without GPU crashes
- [ ] 10 concurrent Camoufox profiles run without GPU crashes
- [ ] Peak RAM for 10 profiles < 12 GB (matches master Phase 10 acceptance)
- [ ] Pixelscan test still passes on both engines (no fingerprint regressions)
- [ ] Committed with message: `feat(resources): phase 11 — memory limits, GPU caps, fleet budget enforcement`

### 3.10 Rollback

Revert the flags if Pixelscan fails. The flags are additive; removing them restores prior behavior. The `FleetService` check can remain even if flags are reverted.

### 3.11 Handoff

Phase 14 inherits: resource-limited engines that can run 10 concurrent profiles without crashing.

---

## 4. Phase 12 — Fingerprint Scoring Specification

### 4.1 Goal

Formally specify what the `0.98 Clear` fingerprint score means, how it is computed, what reference it is compared against, and how it is refreshed. Without this, the score is a UI decoration with no operational meaning.

### 4.2 Preconditions

- Master Phase 10 complete
- Existing fingerprint scoring is functional (verified by screenshots)

### 4.3 Discovery Task

Before writing new code, **document what exists**:

1. Open the fingerprint scoring module. Find where the score is computed.
2. Identify the reference. Is it:
   - A static JSON file of known-good fingerprints?
   - A live telemetry endpoint?
   - A heuristic (self-consistency check)?
3. Identify the refresh mechanism. When does the reference change?
4. Add findings to `docs/fingerprint-scoring.md`.

**If the scoring is a heuristic:** The "score" is likely a **coherence score** — the percentage of expected surfaces that report plausible values. This is fine, but it must be documented.

**If the scoring compares against static data:** The reference file must have a refresh policy.

**If the scoring calls an external service:** That service must be documented and monitored.

### 4.4 Specification Format

Create `docs/fingerprint-scoring.md` with this structure:

```markdown
# Fingerprint Scoring Specification

## Definition
The fingerprint score is a number between 0.0 and 1.0 that represents...

## Inputs
| Surface | Source | Weight | Expected value source |
|---|---|---|---|
| Canvas hash | page.evaluate() | 0.15 | Reference DB |
| WebGL renderer | getParameter() | 0.15 | Reference DB |
| ... | ... | ... | ... |

## Computation
score = sum(weight_i * match_i) / sum(weight_i)

## Reference
The reference is [static JSON | live telemetry | heuristic].
Located at: [path].
Refreshed: [manual | scheduled | on-launch].

## Thresholds
- score >= 0.95: "Clear" (green)
- 0.80 <= score < 0.95: "Warning" (yellow)
- score < 0.80: "Blocked" (red) — launch denied

## Refresh Policy
[Describe how the reference stays current.]

## Failure Modes
[Enumerate what causes a score to drop, and what the operator should do.]
```

### 4.5 Reference Refresh Implementation (If Static)

If the scoring uses a static reference, add a refresh job:

```ts
// packages/core/src/fingerprint/refreshReference.ts

import path from 'node:path';
import fs from 'node:fs';
import { TersooError } from '../util/errors';

/**
 * Downloads the latest fingerprint reference from the configured source.
 * Called by a scheduled job (see schedule below).
 */
export async function refreshFingerprintReference(input: {
  sourceUrl: string;
  destinationPath: string;
  minEntries: number;
}): Promise<void> {
  const res = await fetch(input.sourceUrl);
  if (!res.ok) throw new TersooError('FINGERPRINT_REFRESH_FAILED', `HTTP ${res.status}`);

  const data = await res.json();
  if (!Array.isArray(data) || data.length < input.minEntries) {
    throw new TersooError('FINGERPRINT_REFERENCE_INVALID',
      `Expected >= ${input.minEntries} entries, got ${data?.length ?? 0}`);
  }

  // Write atomically
  const tmp = input.destinationPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, input.destinationPath);
}
```

### 4.6 Scheduled Job

```ts
// packages/core/src/container/index.ts — add to boot sequence

const FINGERPRINT_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;  // daily

setInterval(async () => {
  try {
    await refreshFingerprintReference({
      sourceUrl: config.fingerprintReferenceUrl,
      destinationPath: path.join(config.userDataDir, 'fingerprint-reference.json'),
      minEntries: 100,
    });
    logger.child('db').info('fingerprint_reference_refreshed');
  } catch (err) {
    logger.child('db').error('fingerprint_reference_refresh_failed', { err });
  }
}, FINGERPRINT_REFRESH_INTERVAL_MS);
```

### 4.7 Score History Tracking

Add a table so scores are auditable over time:

```sql
-- migrations/0003_fingerprint_score_history.sql
CREATE TABLE fingerprint_score_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scored_at   INTEGER NOT NULL,
  score       REAL NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('clear','warning','blocked')),
  mismatches  TEXT NOT NULL DEFAULT '[]',
  reference_version TEXT
);
CREATE INDEX idx_fps_profile ON fingerprint_score_history(profile_id, scored_at DESC);
```

Every launch writes a row. This gives the operator a historical view of when a profile started drifting.

### 4.8 Acceptance Criteria

- [ ] `docs/fingerprint-scoring.md` exists and fully specifies the algorithm
- [ ] The reference source and refresh policy are documented
- [ ] A refresh job exists (if the reference is external)
- [ ] `fingerprint_score_history` table exists and is populated on launch
- [ ] UI can display score history for a profile (may be deferred to Phase 16)
- [ ] Committed with message: `docs(fingerprint): phase 12 — formal scoring specification and history tracking`

### 4.9 Rollback

Drop `fingerprint_score_history` table. Keep the documentation — it has standalone value.

### 4.10 Handoff

Phase 16 inherits: a fully specified and auditable fingerprint scoring system.

---

## 5. Phase 13 — Engine Maintenance Monitoring & Fallback

### 5.1 Goal

Mitigate the operational risk of either engine going unmaintained. Camoufox has already had a year-long gap; Apostate is new and unproven. This phase adds monitoring and a documented fallback.

### 5.2 Preconditions

- Master Phase 10 complete
- Both engines are in production use

### 5.3 Tasks

#### Task 13.1 — Pin Engine Versions

Both engines must be **explicitly versioned** in code. No `^` or `~` ranges.

```json
// packages/core/package.json
{
  "dependencies": {
    "camoufox-js": "0.4.0",          // exact
    "patchright": "1.47.2"           // exact
  }
}
```

Apostate is a binary, not a package. Pin its version via config:

```ts
// packages/core/src/config.ts
export const EngineVersions = z.object({
  apostateBinaryVersion: z.string().default('152.0.1'),
  camoufoxBinaryVersion: z.string().default('152.0.4-beta.31'),
});
```

Store the active versions in `settings` table and check them on boot.

#### Task 13.2 — Maintenance Monitor

Create a scheduled job that checks upstream repositories for activity:

```ts
// packages/core/src/maintenance/monitorUpstream.ts

interface UpstreamStatus {
  repo: string;
  lastCommitAt: number;
  lastReleaseAt: number;
  openIssues: number;
  stale: boolean;
}

export async function monitorUpstream(input: {
  repos: string[];                 // ['daijro/camoufox', 'Kaliiiiiiiiii-Vinyzu/patchright', 'furyteamtop/fury-antidetect-browser']
  staleThresholdDays: number;      // 90
  githubToken?: string;
}): Promise<UpstreamStatus[]> {
  const results: UpstreamStatus[] = [];

  for (const repo of input.repos) {
    const headers: Record<string, string> = { 'Accept': 'application/vnd.github+json' };
    if (input.githubToken) headers['Authorization'] = `Bearer ${input.githubToken}`;

    const [commitsRes, releasesRes, issuesRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${repo}/commits?per_page=1`, { headers }),
      fetch(`https://api.github.com/repos/${repo}/releases?per_page=1`, { headers }),
      fetch(`https://api.github.com/repos/${repo}/issues?state=open`, { headers }),
    ]);

    const commits = await commitsRes.json();
    const releases = await releasesRes.json();
    const issues = await issuesRes.json();

    const lastCommitAt = new Date(commits[0]?.commit?.author?.date ?? 0).getTime();
    const lastReleaseAt = new Date(releases[0]?.published_at ?? 0).getTime();
    const staleDays = (Date.now() - Math.max(lastCommitAt, lastReleaseAt)) / (1000 * 60 * 60 * 24);

    results.push({
      repo,
      lastCommitAt,
      lastReleaseAt,
      openIssues: Array.isArray(issues) ? issues.length : 0,
      stale: staleDays > input.staleThresholdDays,
    });
  }

  return results;
}
```

Schedule it weekly. Emit `alert.raised` if any engine is stale.

#### Task 13.3 — Fallback Engine Documentation

Create `docs/engine-fallback.md`:

```markdown
# Engine Fallback Strategy

## Primary Engines
- Apostate (Chromium) — 70% of profiles
- Camoufox (Firefox) — 30% of profiles

## Fallback Options

### If Apostate goes unmaintained
1. Pin the last known-good version (currently: 152.0.1)
2. Migrate to Fury as drop-in replacement (same CDP interface)
3. If Fury unavailable: migrate to Clearcote open build
4. Last resort: standard Chromium + patchright

### If Camoufox goes unmaintained
1. Pin the last known-good version (currently: 152.0.4-beta.31)
2. Migrate to Invisible_Playwright (same Firefox C++ patch approach, same Juggler protocol)
3. Last resort: standard Firefox + JS shim (accept fingerprint degradation)

## Migration Cost
Each fallback requires:
- Re-testing Pixelscan on both fingerprint and bot check
- Re-testing YouTube view counting
- Re-verifying humanization behavior
- Updating the profile.engine enum and DB migration
- Updating the UI engine selector
```

#### Task 13.4 — Version Compatibility Check

On boot, verify the actual binary version matches the pinned version:

```ts
// packages/core/src/container/index.ts — add to boot

async function verifyEngineVersions(config: Config, logger: Logger): Promise<void> {
  // Apostate
  try {
    const actual = await getApostateVersion();      // reads from binary metadata
    if (actual !== config.engineVersions.apostateBinaryVersion) {
      logger.child('supervisor').warn('engine_version_drift', {
        engine: 'apostate',
        expected: config.engineVersions.apostateBinaryVersion,
        actual,
      });
    }
  } catch (err) {
    logger.child('supervisor').error('engine_version_check_failed', { engine: 'apostate', err });
  }

  // Camoufox
  try {
    const actual = await getCamoufoxVersion();
    if (actual !== config.engineVersions.camoufoxBinaryVersion) {
      logger.child('supervisor').warn('engine_version_drift', {
        engine: 'camoufox',
        expected: config.engineVersions.camoufoxBinaryVersion,
        actual,
      });
    }
  } catch (err) {
    logger.child('supervisor').error('engine_version_check_failed', { engine: 'camoufox', err });
  }
}
```

### 5.4 Acceptance Criteria

- [ ] Both engine versions are pinned exactly in `package.json`
- [ ] Binary versions are pinned in config
- [ ] `monitorUpstream` runs weekly and emits alerts
- [ ] `docs/engine-fallback.md` exists with a documented migration path
- [ ] Version drift is detected and logged on boot
- [ ] Committed with message: `feat(maintenance): phase 13 — upstream monitoring, version pinning, fallback strategy`

### 5.5 Rollback

Remove the scheduled job. Keep the pinning and documentation.

### 5.6 Handoff

Phase 16 inherits: operational visibility into engine health.

---

## 6. Phase 14 — GeoIP Verification & Network Consistency

### 6.1 Goal

Verify that Camoufox's `geoip: true` flag actually aligns timezone, locale, and coordinates with the proxy's exit IP. Verify the same for Apostate's CDP overrides. Block profile launch if any inconsistency is detected.

### 6.2 Preconditions

- Phase 11 complete (resource limits may affect network behavior)
- Both engines launch cleanly

### 6.3 Files to Create

- `packages/core/src/engines/shared/verifyGeoAlignment.ts`
- `packages/core/src/engines/shared/geoCanary.ts`

### 6.4 Verification Module

```ts
// packages/core/src/engines/shared/verifyGeoAlignment.ts

import type { Page } from 'playwright-core';
import type { ProxySummary } from '@tersoo/contracts';
import { TersooError } from '../../util/errors';

export interface GeoAlignmentResult {
  ok: boolean;
  mismatches: string[];
  actual: {
    timezone: string;
    language: string;
    languages: string[];
    latitude: number | null;
    longitude: number | null;
  };
  expected: {
    timezone: string;
    language: string;
    latitude: number | null;
    longitude: number | null;
  };
}

export async function verifyGeoAlignment(
  page: Page,
  proxy: ProxySummary,
): Promise<GeoAlignmentResult> {
  const actual = await page.evaluate(() => ({
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    languages: [...navigator.languages],
    latitude: null as number | null,
    longitude: null as number | null,
  }));

  // Attempt geolocation (may prompt; use a short timeout)
  try {
    const pos = await page.evaluate(() => new Promise<GeolocationPosition | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      const timer = setTimeout(() => resolve(null), 3000);
      navigator.geolocation.getCurrentPosition(
        (p) => { clearTimeout(timer); resolve(p); },
        () => { clearTimeout(timer); resolve(null); },
        { timeout: 2500 },
      );
    }));
    if (pos) {
      actual.latitude = pos.coords.latitude;
      actual.longitude = pos.coords.longitude;
    }
  } catch {
    // Geolocation unavailable — not a failure if proxy geo doesn't require it
  }

  const expected = {
    timezone: proxy.geoTz ?? '',
    language: proxy.geoCountry ? mapCountryToLanguage(proxy.geoCountry) : '',
    latitude: proxy.geoLat,
    longitude: proxy.geoLng,
  };

  const mismatches: string[] = [];

  if (expected.timezone && actual.timezone !== expected.timezone) {
    mismatches.push(`timezone: expected ${expected.timezone}, got ${actual.timezone}`);
  }

  if (expected.language && !actual.languages.some(l => l.startsWith(expected.language))) {
    mismatches.push(`language: expected ${expected.language}, got ${actual.languages.join(',')}`);
  }

  if (expected.latitude != null && actual.latitude != null) {
    const dLat = Math.abs(actual.latitude - expected.latitude);
    const dLng = Math.abs(actual.longitude! - expected.longitude!);
    if (dLat > 5 || dLng > 5) {   // more than ~500 km off
      mismatches.push(`coordinates: expected (${expected.latitude},${expected.longitude}), got (${actual.latitude},${actual.longitude})`);
    }
  }

  return {
    ok: mismatches.length === 0,
    mismatches,
    actual,
    expected,
  };
}

function mapCountryToLanguage(country: string): string {
  const map: Record<string, string> = {
    US: 'en', GB: 'en', AU: 'en', CA: 'en',
    DE: 'de', FR: 'fr', ES: 'es', IT: 'it',
    BR: 'pt', PT: 'pt', JP: 'ja', KR: 'ko',
    CN: 'zh', RU: 'ru', NL: 'nl', SE: 'sv',
    IN: 'en', NG: 'en', ZA: 'en',
  };
  return map[country.toUpperCase()] ?? 'en';
}
```

### 6.5 Wire Into Launch Sequence

After the engine launches and applies emulation but **before** marking the profile as ready:

```ts
// packages/core/src/supervisor/launchSequence.ts

const alignment = await verifyGeoAlignment(session.page, proxy);

if (!alignment.ok) {
  await engine.stop(profileId);
  await events.emit('alert.raised', {
    level: 'error',
    title: 'Geo alignment failed',
    message: alignment.mismatches.join('; '),
  });
  throw new TersooError('GEO_ALIGNMENT_FAILED', alignment.mismatches.join('; '));
}

// Emit success event with details
await events.emit('profile.geo_verified', {
  profileId,
  timezone: alignment.actual.timezone,
  language: alignment.actual.language,
});
```

### 6.6 Canary Geo Page

Create a canary page in the testkit that echoes the browser's timezone, language, and geolocation:

```ts
// packages/testkit/src/canaryServer.ts — add route

app.get('/canary/geo', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html><body>
      <script>
        (async () => {
          const result = {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            language: navigator.language,
            languages: [...navigator.languages],
            offset: new Date().getTimezoneOffset(),
          };
          if (navigator.geolocation) {
            const pos = await new Promise(resolve => {
              navigator.geolocation.getCurrentPosition(
                p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
                () => resolve(null),
                { timeout: 2000 },
              );
            });
            result.geo = pos;
          }
          document.body.textContent = JSON.stringify(result);
          window.__canaryGeo = result;
        })();
      </script>
    </body></html>
  `);
});
```

Integration test:

```ts
// tests/integration/geo-alignment.spec.ts

it('Camoufox aligns timezone to proxy exit', async () => {
  const proxy = await startFakeProxy({ geo: { country: 'DE', timezone: 'Europe/Berlin' } });
  const profile = await createProfile({ engine: 'camoufox', proxyId: proxy.id });
  const session = await launchProfile(profile.id);
  await session.page.goto('http://127.0.0.1:canary/canary/geo');
  const actual = await session.page.evaluate(() => window.__canaryGeo);
  expect(actual.timezone).toBe('Europe/Berlin');
  expect(actual.languages[0]).toMatch(/^de/);
});
```

### 6.7 Acceptance Criteria

- [ ] `verifyGeoAlignment` runs on every launch
- [ ] Timezone mismatch blocks the launch
- [ ] Language mismatch blocks the launch
- [ ] Geolocation mismatch (if proxy geo has coordinates) blocks the launch
- [ ] Integration test passes on both Apostate and Camoufox
- [ ] Committed with message: `feat(geo): phase 14 — geo alignment verification and canary tests`

### 6.8 Rollback

Remove the verification call from the launch sequence. Keep the module for future use.

### 6.9 Handoff

Phase 15 inherits: verified geo-aligned sessions.

---

## 7. Phase 15 — A11y Staleness & SPA Resilience

### 7.1 Goal

Verify that the LLM step type survives SPA DOM mutations between tree extraction and click execution. Add a fallback path so that stale refs do not break runs.

### 7.2 Preconditions

- Phase 11 complete
- LLM step type works on static pages

### 7.3 Files to Create

- `packages/core/src/task/steps/llmStepRetry.ts`
- `packages/testkit/src/canaryServer.ts` — add SPA mutation route

### 7.4 Retry Wrapper

```ts
// packages/core/src/task/steps/llmStepRetry.ts

import type { Page } from 'playwright-core';
import type { LlmService } from '../../llm/LlmService';
import type { Humanizer } from '../../crosshair/Humanizer';
import { runLlmStep } from './llmStep';
import { TersooError } from '../../util/errors';

export async function runLlmStepWithRetry(input: {
  page: Page;
  humanizer: Humanizer;
  llm: LlmService;
  goal: string;
  maxIterations: number;
  maxRetries: number;             // default 2
}): Promise<{ iterations: number; retries: number }> {
  const maxRetries = input.maxRetries;
  let lastError: Error | null = null;

  for (let retry = 0; retry <= maxRetries; retry++) {
    try {
      const result = await runLlmStep(
        input.page,
        input.humanizer,
        input.llm,
        { goal: input.goal, maxIterations: input.maxIterations },
      );
      return { iterations: result.iterations, retries: retry };
    } catch (err) {
      lastError = err as Error;

      // Only retry on ref-staleness errors
      const isStaleRef =
        lastError.message.includes('LLM_REF_NOT_FOUND') ||
        lastError.message.includes('LOCATOR_NOT_VISIBLE');

      if (!isStaleRef) throw lastError;

      // Wait for the DOM to settle before re-extracting
      await input.page.waitForLoadState('domcontentloaded').catch(() => {});
      await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
    }
  }

  throw new TersooError('LLM_STALE_REF_EXHAUSTED',
    `Failed after ${maxRetries} retries: ${lastError?.message}`);
}
```

### 7.5 Update StepRunner

```ts
case 'llm': {
  const result = await runLlmStepWithRetry({
    page: session.page,
    humanizer: session.humanizer!,
    llm: llmService,
    goal: step.goal,
    maxIterations: step.maxIterations,
    maxRetries: 2,
  });
  return { success: true, artifacts: { iterations: result.iterations, retries: result.retries } };
}
```

### 7.6 SPA Canary Page

Add a route to the canary server that mutates the DOM mid-step:

```ts
// packages/testkit/src/canaryServer.ts

app.get('/canary/spa', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html><body>
      <div id="content">
        <button id="btn-1" onclick="window.__clicked = 1">Initial Button</button>
      </div>
      <script>
        // After 3 seconds, replace the button with a new one that has the same role+name
        setTimeout(() => {
          document.getElementById('content').innerHTML = \`
            <button id="btn-2" onclick="window.__clicked = 2">Initial Button</button>
          \`;
        }, 3000);
      </script>
    </body></html>
  `);
});
```

Integration test:

```ts
// tests/integration/a11y-staleness.spec.ts

it('LLM step survives SPA mutation', async () => {
  const session = await launchProfile(testProfileId);
  await session.page.goto('http://127.0.0.1:canary/canary/spa');

  // Trigger LLM step that will click "Initial Button"
  // The step takes > 3s so the mutation fires mid-execution
  const result = await runLlmStepWithRetry({
    page: session.page,
    humanizer: session.humanizer!,
    llm: llmService,
    goal: 'Click the button labeled Initial Button',
    maxIterations: 5,
    maxRetries: 2,
  });

  // Verify the click succeeded on one of the two buttons
  const clicked = await session.page.evaluate(() => (window as any).__clicked);
  expect([1, 2]).toContain(clicked);
  expect(result.retries).toBeGreaterThanOrEqual(0);
});
```

### 7.7 Additional Resilience — Wait Before Extraction

Add a small stabilization wait before every tree extraction:

```ts
// packages/core/src/task/steps/llmStep.ts — at the top of the loop

for (let i = 0; i < max; i++) {
  // Wait for network idle to reduce staleness
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 200 + Math.random() * 300));

  const tree = await extractAccessibilityTree(page);
  // ... rest
}
```

### 7.8 Acceptance Criteria

- [ ] `runLlmStepWithRetry` exists and retries on stale refs
- [ ] StepRunner uses the retry wrapper
- [ ] SPA canary page mutates mid-step
- [ ] Integration test passes: mutation does not break the run
- [ ] Non-stale errors still propagate (no infinite retry loops)
- [ ] Committed with message: `feat(task): phase 15 — A11y staleness retry and SPA resilience`

### 7.9 Rollback

Revert StepRunner to call `runLlmStep` directly. Remove the retry wrapper.

### 7.10 Handoff

Phase 16 inherits: LLM steps that survive typical SPA behavior.

---

## 8. Phase 16 — Final Integration & Sign-Off

### 8.1 Goal

Run the full addendum test matrix, verify no regressions in the master plan's functionality, and sign off the complete system.

### 8.2 Test Matrix

| Test | Expected |
|---|---|
| 10 concurrent Apostate profiles | All launch, RAM < 12 GB, no GPU crashes |
| 10 concurrent Camoufox profiles | All launch, RAM < 12 GB, no GPU crashes |
| Geo alignment blocks launch on mismatch | Launch throws `GEO_ALIGNMENT_FAILED` |
| Geo alignment passes on proxy match | Launch succeeds, `profile.geo_verified` event emitted |
| SPA canary test | LLM step retries and succeeds |
| Fingerprint score history | Rows written on each launch, queryable per profile |
| Upstream monitor | Emits alerts when a repo is > 90 days stale |
| Version drift detection | Logs warning on boot if binary version differs from config |
| Pixelscan on Apostate | Fingerprint green |
| Pixelscan on Camoufox | Fingerprint green AND bot check green |
| YouTube view counting | Views counted on both engines |
| Full fleet soak | 24h run, no crashes, no memory leaks |

### 8.3 Sign-Off Checklist

- [ ] All master plan acceptance criteria still green
- [ ] All addendum acceptance criteria green
- [ ] No new security issues introduced
- [ ] Documentation updated: `docs/fingerprint-scoring.md`, `docs/engine-fallback.md`, `docs/inventory.md`
- [ ] Changelog updated
- [ ] Committed with message: `chore: phase 16 — addendum sign-off, all hardening measures verified`

### 8.4 Rollback

Individual phases can be rolled back independently. Do not roll back Phase 16 as a whole unless multiple addendum phases fail.

---

## 9. Cross-Phase Rules for the Addendum

The master plan's cross-phase rules (§14) still apply. Additional rules specific to this addendum:

1. **Never remove existing launch flags** when adding resource limits. Append only.
2. **Never change fingerprint scoring thresholds** without updating `docs/fingerprint-scoring.md`.
3. **Never pin to a major version range.** Exact versions only.
4. **Never bypass `verifyGeoAlignment`** in the launch sequence. It is a hard gate.
5. **Never retry more than 3 times on stale refs.** Beyond that, the page is broken, not stale.
6. **Always log phase transitions** to `events` table for auditability.

---

## 10. Phase Dependency Graph

```
Master Phase 10 (complete)
        │
   ┌────┼────┐
   │    │    │
   ▼    ▼    ▼
  P11  P12  P13   (parallel)
   │
   ├────┐
   ▼    ▼
  P14  P15
   │    │
   └────┴────┐
             ▼
            P16
```

---

## 11. Master Acceptance Checklist (Addendum)

At the end of Phase 16, all of these must be true:

**Resources**
- [ ] 10 concurrent profiles fit within 12 GB RAM
- [ ] GPU crashes eliminated under normal load
- [ ] FleetService blocks spawns when RAM pressure is high

**Fingerprint Scoring**
- [ ] Scoring algorithm fully documented
- [ ] Reference source and refresh policy documented
- [ ] Score history table populated and queryable

**Engine Maintenance**
- [ ] Both engines pinned to exact versions
- [ ] Upstream monitoring alerts on staleness
- [ ] Fallback strategy documented

**Geo Alignment**
- [ ] Timezone/language/coordinates verified on every launch
- [ ] Mismatch blocks launch
- [ ] Canary integration tests pass

**A11y Resilience**
- [ ] SPA mutation does not break LLM steps
- [ ] Retry logic is bounded
- [ ] Non-stale errors propagate correctly

**Regression**
- [ ] Pixelscan fingerprint green on both engines
- [ ] Pixelscan bot check green on Camoufox
- [ ] YouTube view counting works on both engines

---

## 12. What to Send Back to the Human

After each addendum phase:

1. Commit hash
2. Output of `pnpm -r test`
3. Screenshots of any new UI (Phase 12 history view, Phase 13 alerts)
4. Profiling output (Phase 11 RAM usage under load)
5. Any deviations from this addendum

The human will review and either approve progression or request rollback.

---

**End of addendum. Version 1.0.0. Frozen.**
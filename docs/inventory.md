# TersooPilot Desktop — Architecture & Migration Inventory

> Generated as part of Phase 0 of the Dual-Engine Migration & LLM Integration Master Plan.
> This inventory documents all major modules, persistence repositories, IPC channels, UI views, and existing test suites, tracking whether each will be touched by subsequent migration phases.

---

## Services

| File | Purpose | Touched by migration? | Notes |
|---|---|---|---|
| `packages/core/src/services/FleetService.ts` | Fleet instance coordination, active/idle count, RAM pressure pre-spawn check | Yes | Dual-engine distribution (70/30), RAM pre-spawn gate |
| `packages/core/src/services/ProfileService.ts` | Profile CRUD, fingerprint generation, browser launch/stop, proxy binding | Yes | Dual-engine routing (`engine_type`), launch routing to Apostate or Camoufox |
| `packages/core/src/services/ProxyService.ts` | Proxy CRUD, bulk import, health checking, credential encryption | No | Existing proxy pipeline remains stable |
| `packages/core/src/services/RunService.ts` | Workflow execution, step execution, checkpoint/resume, execution logs | Yes | LLM step runner, CAPTCHA solver steps, accessibility tree extraction |
| `packages/core/src/services/TaskService.ts` | Task definition CRUD, task dispatch, workflow JSON definitions | Yes | New LLM task steps and action schemas |
| `packages/core/src/supervisor/BrowserSupervisor.ts` | Process lifecycle, CDP discovery, crash recovery, health sweeps | Yes | Dual-engine supervision (Gecko/Camoufox + Chromium/Apostate) |
| `packages/core/src/proxy/LocalForwarder.ts` | Local HTTP/SOCKS5 proxy forwarder and socket multiplexing | No | Maintained with `getBoundCount()` |
| `packages/core/src/proxy/ProxyBroker.ts` | Proxy lease lifecycle, health-based selection, failover | No | Stable |
| `packages/core/src/queue/JobQueue.ts` | Task run queue with concurrency and rate limiting | No | Stable |
| `packages/core/src/fingerprint/FingerprintGenerator.ts` | Synthetic browser fingerprint synthesis (screen, webgl, canvas/audio) | Yes | Gecko-compatible fingerprint generation for Camoufox |

---

## Repos

| File | Table | Touched? | Notes |
|---|---|---|---|
| `packages/core/src/persistence/repos/profileRepo.ts` | `profiles` | Yes | Add `engine_type`, `engine_locked`, `llm_config_id`, `captcha_budget_id` |
| `packages/core/src/persistence/repos/presetRepo.ts` | `presets` | Yes | Engine-aware presets (Apostate vs Camoufox) |
| `packages/core/src/persistence/repos/proxyRepo.ts` | `proxies` | No | Stable |
| `packages/core/src/persistence/repos/leaseRepo.ts` | `proxy_leases` | No | Stable |
| `packages/core/src/persistence/repos/taskRepo.ts` | `tasks` | Yes | LLM prompt/workflow schemas |
| `packages/core/src/persistence/repos/runRepo.ts` | `runs` | Yes | LLM token usage, cost tracking, captcha resolution status |
| `packages/core/src/persistence/repos/stepRunRepo.ts` | `step_runs` | Yes | Captcha & LLM action payloads |
| `packages/core/src/persistence/repos/anchorRepo.ts` | `anchors` | No | Stable |
| `packages/core/src/persistence/repos/auditRepo.ts` | `audit_log` | No | Stable |
| `packages/core/src/persistence/repos/eventRepo.ts` | `events` | No | Stable |

---

## IPC Channels

| Channel | Handler file | Modified? | Notes |
|---|---|---|---|
| `profile.list` | `apps/desktop/src/ipc/router.ts` | Yes | Supports filtering by engine type |
| `profile.get` | `apps/desktop/src/ipc/router.ts` | Yes | Returns engine type and engine-specific configs |
| `profile.create` | `apps/desktop/src/ipc/router.ts` | Yes | Accepts `engine_type`, supports 70/30 bulk creation |
| `profile.update` | `apps/desktop/src/ipc/router.ts` | Yes | Enforces engine lock once launched |
| `profile.delete` | `apps/desktop/src/ipc/router.ts` | No | Stable |
| `profile.launch` | `apps/desktop/src/ipc/router.ts` | Yes | Dispatches to Apostate or Camoufox launcher |
| `profile.stop` | `apps/desktop/src/ipc/router.ts` | No | Stable |
| `proxy.list` | `apps/desktop/src/ipc/router.ts` | No | Fixed in Phase 0 (clean filtering) |
| `proxy.create` | `apps/desktop/src/ipc/router.ts` | No | Stable |
| `proxy.importBulk` | `apps/desktop/src/ipc/router.ts` | No | Stable |
| `proxy.check` | `apps/desktop/src/ipc/router.ts` | No | Stable |
| `proxy.assign` | `apps/desktop/src/ipc/router.ts` | No | Stable |
| `proxy.release` | `apps/desktop/src/ipc/router.ts` | No | Stable |
| `proxy.swap` | `apps/desktop/src/ipc/router.ts` | No | Stable |
| `proxy.delete` | `apps/desktop/src/ipc/router.ts` | No | Stable |
| `task.list` | `apps/desktop/src/ipc/router.ts` | No | Stable |
| `task.get` | `apps/desktop/src/ipc/router.ts` | No | Stable |
| `task.create` | `apps/desktop/src/ipc/router.ts` | Yes | Validates LLM step definitions |
| `task.delete` | `apps/desktop/src/ipc/router.ts` | No | Stable |
| `task.dispatch` | `apps/desktop/src/ipc/router.ts` | No | Stable |
| `run.list` | `apps/desktop/src/ipc/router.ts` | No | Stable |
| `run.cancel` | `apps/desktop/src/ipc/router.ts` | No | Stable |
| `run.resume` | `apps/desktop/src/ipc/router.ts` | No | Stable |
| `fleet.status` | `apps/desktop/src/ipc/router.ts` | Yes | Updated in Phase 0 to report real instances & stats |
| `logs.query` | `apps/desktop/src/ipc/router.ts` | No | Stable |
| `settings.get` | New channel (Phase 1/5) | Yes | New channel for LLM keys & engine paths |
| `settings.update` | New channel (Phase 1/5) | Yes | New channel for LLM keys & engine paths |

---

## Renderer Views

| View | Touched? | Notes |
|---|---|---|
| `ProfilesView` | Yes | Engine badge (Apostate vs Camoufox), bulk-create distribution dialog, engine selector |
| `ProxyVaultView` | No | Bug B-1 fixed in Phase 0; vault view functional |
| `TaskStudioView` | Yes | LLM Prompt step, CAPTCHA Solve step, visual builder enhancements |
| `RunsView` | Yes | Displays LLM tokens, step screenshot inspection, captcha status |
| `FleetMonitorView` | Yes | Shows engine distribution (Apostate vs Camoufox breakdown) |
| `LogsView` | No | Querying and viewing logs remains unchanged |
| `SettingsView` | Yes | OpenRouter API key, model selection, engine binary path configs |

---

## Existing Tests

| Test | Covers | Must remain green |
|---|---|---|
| `packages/contracts/tests/channels.test.ts` | IPC command schema completeness and validation | Yes |
| `packages/stealth/tests/stealth.test.ts` | Runtime anti-detect stealth shims and CDP overrides | Yes |
| `packages/core/tests/anchorRegistry.test.ts` | Crosshair anchor resolution | Yes |
| `packages/core/tests/cdpDiscovery.test.ts` | DevTools active port discovery | Yes |
| `packages/core/tests/cdpEmulator.test.ts` | CDP emulation protocol commands | Yes |
| `packages/core/tests/config.test.ts` | Environment and file configuration loader | Yes |
| `packages/core/tests/container.test.ts` | Service container dependency injection | Yes |
| `packages/core/tests/crashDetection.test.ts` | Process crash handling and restart budgets | Yes |
| `packages/core/tests/crosshairWorker.test.ts` | Crosshair CDP worker communication | Yes |
| `packages/core/tests/errors.test.ts` | Typed domain error hierarchy | Yes |
| `packages/core/tests/events.test.ts` | Event bus dispatch and payload typing | Yes |
| `packages/core/tests/fingerprintGenerator.test.ts` | Fingerprint synthesis integrity | Yes |
| `packages/core/tests/healthProbe.test.ts` | Proxy connectivity probe | Yes |
| `packages/core/tests/humanizerKeyboardScroll.test.ts` | Humanized typing and kinetic scrolling | Yes |
| `packages/core/tests/humanizerMouse.test.ts` | Bézier curve mouse trajectory generation | Yes |
| `packages/core/tests/initMigration.test.ts` | Initial schema migration | Yes |
| `packages/core/tests/leaseSweepScheduler.test.ts` | Orphaned lease cleanup | Yes |
| `packages/core/tests/localForwarder.test.ts` | Socket multiplexing proxy forwarder | Yes |
| `packages/core/tests/logger.test.ts` | Structured JSON logging | Yes |
| `packages/core/tests/migrate.test.ts` | Kysely migration runner | Yes |
| `packages/core/tests/phase2Integration.test.ts` | Profile + Proxy + Supervisor integration | Yes |
| `packages/core/tests/phase3Integration.test.ts` | Task definition and dispatch pipeline | Yes |
| `packages/core/tests/phase4Integration.test.ts` | End-to-end task run execution | Yes |
| `packages/core/tests/profileLaunch.test.ts` | Browser process spawn & launch parameters | Yes |
| `packages/core/tests/profileLaunchIntegration.test.ts` | Full profile launch with CDP emulator | Yes |
| `packages/core/tests/profileLock.test.ts` | Profile concurrency locks | Yes |
| `packages/core/tests/profileRepo.test.ts` | Profile persistence queries | Yes |
| `packages/core/tests/profileService.test.ts` | Profile domain operations | Yes |
| `packages/core/tests/proxyBroker.test.ts` | Proxy leasing and balancing | Yes |
| `packages/core/tests/proxyIngest.test.ts` | Bulk proxy import parsing | Yes |
| `packages/core/tests/proxyRepo.test.ts` | Proxy persistence queries | Yes |
| `packages/core/tests/proxyService.test.ts` | Proxy domain service operations | Yes |
| `packages/core/tests/queue.test.ts` | Job queue concurrency and pacing | Yes |
| `packages/core/tests/repos.test.ts` | Multi-repo unit suite | Yes |
| `packages/core/tests/secrets.test.ts` | AES-256 encryption for proxy credentials | Yes |
| `packages/core/tests/shadowDom.test.ts` | Shadow DOM penetration helpers | Yes |
| `packages/core/tests/stepRunner.test.ts` | Task step execution logic | Yes |
| `packages/core/tests/supervisor.test.ts` | Browser supervisor instance lifecycle | Yes |
| `packages/core/tests/taskService.test.ts` | Task service dispatch logic | Yes |
| `packages/core/tests/workflowValidator.test.ts` | Task workflow JSON validation | Yes |
| `packages/core/tests/xpathResolver.test.ts` | XPath evaluation inside DOM | Yes |
| `apps/desktop/tests/preload.test.ts` | ContextBridge preload API exposure | Yes |
| `apps/desktop/tests/router.test.ts` | IPC router dispatch and error handling | Yes |
| `apps/desktop/tests/window.test.ts` | Electron main window creation & lifecycle | Yes |
| `apps/renderer/tests/e2e/ProfilesView.test.tsx` | Profiles view rendering & interaction | Yes |
| `apps/renderer/tests/proxyVaultView.test.tsx` | Proxy vault rendering & filtering | Yes |
| `apps/renderer/tests/taskStudioView.test.tsx` | Task studio workflow builder | Yes |

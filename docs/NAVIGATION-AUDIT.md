# TersooPilot — Navigation Architecture Audit (Phase 0)

> Reference: `docs/TERSOOPILOT_PLAYWRIGHT_NAVIGATION_FINAL_MERGED.md` (Phase 0 Audit Specification)

This audit documents the transition from legacy ad-hoc Playwright calls to the centralized, deterministic, and AI-assisted `NavigationEngine` in `@tersoo/core`.

---

## 1. Direct `page.goto` Calls Audit

| File Location | Previous Pattern | New Pattern / Status |
|---|---|---|
| `packages/core/src/task/StepRunner.ts` | Direct `await ctx.page.goto(url, { waitUntil })` inside `handleNavigate()` | **Replaced:** Delegates entirely to `NavigationEngine.navigate(url, options)`. |
| `packages/core/src/browser/navigation/NavigationEngine.ts` | N/A (new component) | **Centralized Single Entry Point:** `this.page.goto(url, { waitUntil, timeout })` with response status inspection, redirect-chain capture, and deadline propagation. |
| `packages/core/src/browser/ai/AINavigator.ts` | Unvalidated `page.goto(action.url)` | **Guarded:** Validated through `ActionValidator.validate({ type: 'navigate', url })` enforcing `allowedHosts` before execution. |
| `packages/core/src/browser/BrowserContextManager.ts` | N/A | **Guarded:** New tab / popup URLs validated via `NavigationPolicy.validateNavigationUrl` before allowing focus. |

---

## 2. Navigation Timeouts & Total Deadline Budgeting

- **Legacy Problem:** Timeouts were reapplied per attempt or per locator (e.g., 3 retries $\times$ 30,000ms = 90+ seconds total unbounded hang).
- **New Pattern:** Total deadline budgeting:
  $$\text{deadline} = \text{Date.now()} + \text{config.timeoutMs}$$
  Every operation (`page.goto`, `PageReadiness.waitUntilReady`, and backoff delays) receives `remainingTime(deadline)`. If the deadline is reached, the engine cleanly halts and returns `{ success: false, failureCode: 'TIMEOUT' }`.

---

## 3. `waitForTimeout` Audit

- **Audit Findings:** No arbitrary sleeps (`waitForTimeout`) are used for page readiness or network idle waiting.
- **Auto-Dismissal:** Cookie CMPs and interstitial banners are dismissed using Playwright element detection via `ConsentEngine.checkAndHandle()` with bounded micro-timeouts (600ms), never blind sleeps.
- **Readiness Verification:** Handled by event-driven condition waiting (`locator.waitFor({ state: 'visible', timeout })`).

---

## 4. Retry Loops & Backoff Policy

- **Previous Pattern:** Brittle try/catch blocks scattered across step handlers with indefinite or hardcoded retry loops.
- **New Pattern:** Centralized `RetryPolicy`:
  - Retries strictly restricted to transient failure codes: `TIMEOUT`, `NETWORK_ERROR`, `PAGE_CRASHED`, `RATE_LIMITED`, `UNKNOWN`.
  - Non-transient errors (`AUTH_REQUIRED`, `ACCESS_DENIED`, `NOT_FOUND`, `CAPTCHA`, `INVALID_URL`, `REDIRECT_LIMIT_EXCEEDED`) immediately terminate and return structured failures without wasting retry budgets.
  - Backoff calculation: Exponential backoff with random jitter $\pm 250\text{ms}$.
  - HTTP `429 Too Many Requests`: Parses `Retry-After` header and respects server-requested backoff intervals.

---

## 5. Redirect Handling & Chain Security

- **Previous Pattern:** Compared requested URL to final URL using simple string matching. Intermediate hops across malicious or phishing origins went undetected.
- **New Pattern:** Reconstructs the complete HTTP redirect chain from Playwright:
  ```typescript
  let current = response.request();
  while (current.redirectedFrom()) {
    chain.unshift(current.redirectedFrom().url());
    current = current.redirectedFrom();
  }
  ```
  - Enforces `allowRedirects === false` (raises `REDIRECT_UNEXPECTED` if redirected).
  - Enforces `maxRedirectChanges` (raises `REDIRECT_LIMIT_EXCEEDED` if exceeded).
  - Enforces `allowedHosts` against **every single URL** in the chain.

---

## 6. Main-Resource HTTP Response Status Handling

- **Previous Pattern:** `page.goto()` return value was discarded. Branded 404 or 500 error pages loaded with 200-like appearances were misidentified as successes.
- **New Pattern:** Main-resource `Response.status()` is inspected immediately after navigation:
  - `401` $\to$ `AUTH_REQUIRED`
  - `403` $\to$ `ACCESS_DENIED`
  - `404` $\to$ `NOT_FOUND`
  - `429` $\to$ `RATE_LIMITED`
  - `500-599` $\to$ `SERVER_ERROR`

---

## 7. StepRunner Navigation Schema & Contracts

- **`NavigateStep` in `@tersoo/contracts`:**
  - Added optional fields: `expectedUrl`, `expectedPathname`, `allowedHosts`, `requiredSelectors`, `requiredText`, `requiredRoles`, `requiredTestIds`, `timeoutMs`, `maxRetries`, `aiRecovery`, `goal`.
- **`handleNavigate` in `StepRunner.ts`:**
  - Consumes the discriminated union `NavigationResult`.
  - Converts failure results to typed `TaskError` instances with attached artifact paths.

---

## 8. AI Browser Action Schema & Security

- **Closed Action Vocabulary (`AIAction`):**
  - `navigate`, `open_tab`, `click`, `fill`, `wait_for_url`, `wait_for_element`, `back`, `forward`, `finish`, `request_human`.
- **Short-Circuiting:** Terminal actions (`finish`, `request_human`) are handled **before** browser execution.
- **History Navigation Policy:** `back` and `forward` are disabled by default (`allowHistoryNavigation = false`). When enabled, the resulting URL is immediately verified against domain permissions.
- **Prompt Injection Defense:** Explicit system prompt instructions designate all observed webpage text, ARIA trees, and DOM content as untrusted data that cannot override user goals or safety policy.
- **AI-Oriented ARIA Snapshots:** Employs `page.ariaSnapshot({ mode: "ai", depth: 8 })` with fallback to internal tree extraction.

---

## 9. Verification of Anti-Pattern Removal

| Anti-Pattern Check | Status | Verification Detail |
|---|---|---|
| `isVisible({ timeout: ... })` | **REMOVED** | Replaced with `waitFor({ state: 'visible', timeout })` across all detectors and readiness checks. |
| `expectedUrl: new URL(...).pathname` | **SEPARATED** | `expectedUrl` (full URL / glob / RegExp) and `expectedPathname` (route pathname) are distinct fields. |
| `waitForNetworkIdle` as readiness | **REMOVED** | Discouraged Playwright pattern replaced with condition-based semantic locators and web assertions. |
| Unvalidated `back` / `forward` AI actions | **FIXED** | Explicitly governed by `allowHistoryNavigation` and post-action URL validation. |
| HTTP-status-blind `page.goto` success | **FIXED** | Response status $\ge 400$ classified into typed failure codes. |
| Unenforced `allowRedirects` / `maxRedirectChanges` | **ENFORCED** | Enforced across full redirect chains in `RedirectValidator.validateRedirectChain`. |
| Unredacted sensitive tokens in artifacts | **FIXED** | Regular expressions redact passwords, API keys, and bearer tokens before writing snapshot files. |

---

## 10. Playwright Version Pinning

- **Package Dependency:** `@tersoo/core` uses `playwright-core` (currently v1.47+ runtime, dynamically detecting v1.59+ `ariaSnapshot({ mode: "ai" })` capabilities).

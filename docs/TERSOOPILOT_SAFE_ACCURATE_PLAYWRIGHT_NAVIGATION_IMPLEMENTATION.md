# TersooPilot — Safe & Accurate Playwright Navigation Implementation Plan

## Document Purpose

This implementation plan defines two approaches for TersooPilot browser navigation:

**Option 1 — Deterministic Playwright Navigation Engine**
- Playwright remains the browser automation layer.
- TersooPilot owns navigation policy, validation, retries, recovery, and observability.
- This is the recommended foundation.

**Option 2 — AI-Assisted Navigation**
- An AI agent observes the current browser state through Playwright.
- It chooses the next action using structured output.
- A deterministic validator/policy layer validates every AI action before Playwright executes it.
- AI is used for ambiguity and recovery rather than blindly controlling the browser.

**Recommended production architecture: hybrid.**

```text
TersooPilot Agent
      |
      v
Navigation Orchestrator
      |
      +-----------------------+
      |                       |
      v                       v
Deterministic Engine       AI Navigator
      |                       |
      +-----------+-----------+
                  |
                  v
          Action / Policy Guard
                  |
                  v
              Playwright
                  |
                  v
               Browser
```

Playwright already provides navigation APIs, resilient locators, auto-waiting, assertions, URL waiting, screenshots, accessibility snapshots, tracing, and browser-context isolation. Playwright recommends locators such as `getByRole`, `getByLabel`, and `getByTestId` over brittle CSS/XPath chains. It also currently discourages `networkidle` as a generic readiness signal and recommends assertions/conditions instead.

Official references:
- https://playwright.dev/docs/locators
- https://playwright.dev/docs/api/class-frame
- https://playwright.dev/docs/aria-snapshots
- https://playwright.dev/mcp/snapshots
- https://playwright.dev/agent-cli/quick-start

---

# 1. Engineering Objective

TersooPilot navigation must not simply mean:

```typescript
await page.goto(url);
```

A navigation should be considered successful only when:

```text
Navigation accepted
+
Final URL verified
+
Redirect policy passed
+
Authentication state acceptable
+
No known error page detected
+
Expected page state verified
+
Required task condition verified
```

The engine must produce a structured success/failure result so the AI and `StepRunner` know exactly what happened.

---

# 2. Architectural Decision

## Recommended

Use:

```text
Playwright
    +
TersooPilot NavigationEngine
    +
AI Navigator for ambiguous cases/recovery
```

Do not make a small third-party navigation utility the foundational dependency of the system.

Playwright itself already provides the primitives needed to build this safely. Keeping the reliability layer inside TersooPilot gives you:

- full control over retry behavior
- domain and security policy
- deterministic testing
- observability
- stable internal APIs
- easier debugging
- less third-party coupling
- a clean place to add AI later

---

# 3. Goals

The system must support:

- normal HTTP/HTTPS navigation
- redirects
- SPA/client-side route transitions
- authentication redirects
- 403/404/429/5xx handling
- temporary network failures
- bounded retries
- exponential backoff
- page readiness checks
- task-specific readiness checks
- multi-tab/new-page navigation
- popup handling
- browser/page crash recovery where possible
- screenshots and ARIA snapshots on failures
- structured navigation logs
- structured navigation metrics
- AI-assisted recovery
- human escalation
- strict AI action validation
- domain restrictions
- destructive-action protection

---

# 4. Non-Goals

Do not:

- replace Playwright
- create a second browser automation framework
- rely on arbitrary sleeps
- use `networkidle` as the universal definition of readiness
- let the LLM execute arbitrary JavaScript
- let the LLM execute shell commands
- allow the LLM to bypass CAPTCHA/security
- blindly retry every error
- allow navigation outside the permitted domain policy
- mix navigation logic into every `StepRunner` method
- change unrelated browser functionality while implementing navigation

---

# 5. Target Package Structure

```text
packages/
└── core/
    └── src/
        └── browser/
            ├── navigation/
            │   ├── NavigationEngine.ts
            │   ├── NavigationPolicy.ts
            │   ├── NavigationResult.ts
            │   ├── NavigationError.ts
            │   ├── NavigationClassifier.ts
            │   ├── PageReadiness.ts
            │   ├── RedirectValidator.ts
            │   ├── AuthDetector.ts
            │   ├── ErrorPageDetector.ts
            │   ├── RetryPolicy.ts
            │   ├── NavigationRecovery.ts
            │   └── index.ts
            │
            ├── ai/
            │   ├── AINavigator.ts
            │   ├── AIActionSchema.ts
            │   ├── BrowserObservation.ts
            │   ├── ActionValidator.ts
            │   ├── AIRecovery.ts
            │   └── index.ts
            │
            ├── BrowserSession.ts
            ├── BrowserContextManager.ts
            └── index.ts
```

The important architectural rule is:

```text
StepRunner
    |
    +--> NavigationEngine
    |
    +--> InteractionEngine
    |
    +--> ExtractionEngine
```

`StepRunner` should orchestrate steps, not implement all browser reliability logic itself.

---

# 6. Navigation State Machine

Implement explicit navigation states:

```text
REQUESTED
    |
    v
VALIDATING_URL
    |
    v
NAVIGATING
    |
    v
NAVIGATION_COMMITTED
    |
    v
VALIDATING_REDIRECT
    |
    v
CHECKING_AUTH
    |
    v
CHECKING_ERROR_PAGE
    |
    v
WAITING_FOR_PAGE_STATE
    |
    v
VALIDATING_REQUIRED_ELEMENTS
    |
    v
READY
```

Failure states:

```text
INVALID_URL
TIMEOUT
NETWORK_ERROR
REDIRECT_UNEXPECTED
AUTH_REQUIRED
ACCESS_DENIED
NOT_FOUND
SERVER_ERROR
CAPTCHA
PAGE_CRASHED
PAGE_UNREADY
REQUIRED_ELEMENT_MISSING
RETRY_EXHAUSTED
AI_DECISION_REQUIRED
HUMAN_REQUIRED
```

This is important for AI workflows because:

```text
"Navigation failed"
```

is much less useful than:

```json
{
  "failureCode": "AUTH_REQUIRED",
  "currentUrl": "https://example.com/login",
  "requestedUrl": "https://example.com/dashboard"
}
```

---

# 7. Core Types

## Navigation failure codes

```typescript
export type NavigationFailureCode =
    | "INVALID_URL"
    | "TIMEOUT"
    | "NETWORK_ERROR"
    | "REDIRECT_UNEXPECTED"
    | "AUTH_REQUIRED"
    | "ACCESS_DENIED"
    | "NOT_FOUND"
    | "SERVER_ERROR"
    | "CAPTCHA"
    | "PAGE_CRASHED"
    | "PAGE_UNREADY"
    | "REQUIRED_ELEMENT_MISSING"
    | "RETRY_EXHAUSTED"
    | "HUMAN_REQUIRED"
    | "UNKNOWN";
```

## Options

```typescript
export interface NavigationOptions {
    timeoutMs?: number;

    waitUntil?: "commit" | "domcontentloaded" | "load";

    expectedUrl?: string | RegExp;

    allowedHosts?: string[];

    requiredSelectors?: string[];

    requiredText?: string[];

    maxRetries?: number;

    retryDelayMs?: number;

    allowRedirects?: boolean;

    maxRedirectChanges?: number;

    detectAuthentication?: boolean;

    detectErrors?: boolean;

    captureArtifactsOnFailure?: boolean;

    useAIRecovery?: boolean;
}
```

## Result

```typescript
export interface NavigationResult {
    success: boolean;

    requestedUrl: string;

    url: string;

    attempts: number;

    durationMs: number;

    redirected?: boolean;

    redirectCount?: number;

    title?: string;

    failureCode?: NavigationFailureCode;

    message?: string;

    recoverable?: boolean;

    artifactPaths?: string[];
}
```

---

# 8. URL Validation

Never let browser navigation bypass the central URL policy.

```typescript
export function validateNavigationUrl(
    rawUrl: string,
    allowedHosts?: string[]
): URL {
    let url: URL;

    try {
        url = new URL(rawUrl);
    } catch {
        throw new Error(`Invalid URL: ${rawUrl}`);
    }

    if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error(
            `Unsupported navigation protocol: ${url.protocol}`
        );
    }

    if (
        allowedHosts &&
        allowedHosts.length > 0 &&
        !allowedHosts.includes(url.hostname)
    ) {
        throw new Error(
            `Navigation blocked for host: ${url.hostname}`
        );
    }

    return url;
}
```

This should reject, by default:

```text
file:
javascript:
data:
chrome:
about:
```

unless a separately audited capability explicitly requires one.

---

# 9. Option 1 — Deterministic Navigation Engine

This should be the production foundation.

## Basic flow

```text
validate URL
      ↓
navigate
      ↓
verify redirect
      ↓
check auth
      ↓
check errors
      ↓
wait for expected state
      ↓
verify task condition
      ↓
READY
```

## Reference implementation

```typescript
import type { Page } from "@playwright/test";

export class NavigationEngine {
    constructor(
        private readonly page: Page
    ) {}

    async navigate(
        rawUrl: string,
        options: NavigationOptions = {}
    ): Promise<NavigationResult> {
        const config = {
            timeoutMs: 30_000,
            maxRetries: 2,
            retryDelayMs: 500,
            allowRedirects: true,
            maxRedirectChanges: 5,
            detectAuthentication: true,
            detectErrors: true,
            captureArtifactsOnFailure: true,
            useAIRecovery: true,
            ...options,
        };

        const startedAt = Date.now();

        const requested =
            validateNavigationUrl(
                rawUrl,
                config.allowedHosts
            );

        let lastError: unknown;

        for (
            let attempt = 1;
            attempt <= config.maxRetries + 1;
            attempt++
        ) {
            try {
                await this.navigateOnce(
                    requested.toString(),
                    config
                );

                return {
                    success: true,
                    requestedUrl:
                        requested.toString(),
                    url: this.page.url(),
                    attempts: attempt,
                    durationMs:
                        Date.now() - startedAt,
                    redirected:
                        requested.toString() !==
                        this.page.url(),
                    title:
                        await this.page.title(),
                };
            } catch (error) {
                lastError = error;

                const failure =
                    classifyNavigationError(error);

                if (
                    !RetryPolicy.shouldRetry(
                        failure,
                        attempt,
                        config
                    )
                ) {
                    break;
                }

                await RetryPolicy.delay(
                    attempt,
                    config.retryDelayMs
                );
            }
        }

        if (config.captureArtifactsOnFailure) {
            await captureNavigationArtifacts(
                this.page
            );
        }

        throw createNavigationError(
            lastError,
            rawUrl,
            this.page.url(),
            Date.now() - startedAt
        );
    }

    private async navigateOnce(
        url: string,
        options: NavigationOptions
    ): Promise<void> {
        await this.page.goto(url, {
            waitUntil:
                options.waitUntil ??
                "domcontentloaded",
            timeout:
                options.timeoutMs ?? 30_000,
        });

        if (options.expectedUrl) {
            await this.page.waitForURL(
                options.expectedUrl,
                {
                    timeout:
                        options.timeoutMs ?? 30_000,
                }
            );
        }

        if (options.detectAuthentication) {
            await AuthDetector.assertNotBlocked(
                this.page
            );
        }

        if (options.detectErrors) {
            await ErrorPageDetector.assertHealthy(
                this.page
            );
        }

        await PageReadiness.waitUntilReady(
            this.page,
            options
        );
    }
}
```

Treat this as a reference design. Integrate it with the actual TersooPilot error/logging interfaces rather than blindly copying the code.

---

# 10. Navigation Readiness

Do not define readiness as:

```typescript
await page.waitForTimeout(5000);
```

and do not use:

```typescript
waitUntil: "networkidle"
```

as the default page-ready test.

Playwright currently documents `networkidle` as discouraged for testing/readiness and recommends web assertions instead.

Preferred:

```typescript
await page.goto(url, {
    waitUntil: "domcontentloaded",
});

await page.waitForURL("**/dashboard");

await expect(
    page.getByRole("heading", {
        name: "Dashboard",
    })
).toBeVisible();
```

This means:

```text
document loaded
+
expected route
+
required application state
```

rather than:

```text
no observed network requests for a period
```

Official reference:
https://playwright.dev/docs/api/class-frame

---

# 11. Page Readiness

Create a dedicated readiness class.

```typescript
export class PageReadiness {
    static async waitUntilReady(
        page: Page,
        options: NavigationOptions
    ): Promise<void> {
        const timeout =
            options.timeoutMs ?? 30_000;

        for (
            const selector of
            options.requiredSelectors ?? []
        ) {
            await page
                .locator(selector)
                .first()
                .waitFor({
                    state: "visible",
                    timeout,
                });
        }

        for (
            const text of
            options.requiredText ?? []
        ) {
            await page
                .getByText(text)
                .first()
                .waitFor({
                    state: "visible",
                    timeout,
                });
        }
    }
}
```

Prefer semantic locators:

```typescript
page.getByRole(...)
page.getByLabel(...)
page.getByText(...)
page.getByTestId(...)
```

over brittle selectors.

Official reference:
https://playwright.dev/docs/locators

---

# 12. Authentication Detection

Authentication should be a distinct state, not treated as a generic navigation failure.

```typescript
export class AuthDetector {
    static async isAuthenticationPage(
        page: Page
    ): Promise<boolean> {
        const url =
            page.url().toLowerCase();

        if (
            url.includes("/login") ||
            url.includes("/signin") ||
            url.includes("/sign-in") ||
            url.includes("/auth")
        ) {
            return true;
        }

        const passwordField =
            page
                .getByLabel(/password/i)
                .first();

        return passwordField
            .isVisible({
                timeout: 1000,
            })
            .catch(() => false);
    }

    static async assertNotBlocked(
        page: Page
    ): Promise<void> {
        if (
            await this.isAuthenticationPage(
                page
            )
        ) {
            throw new NavigationError(
                "AUTH_REQUIRED",
                "Authentication is required"
            );
        }
    }
}
```

Do not make the navigation engine automatically submit credentials.

Authentication is a separate controlled capability.

---

# 13. Error Page Detection

Detect both HTTP-level and page-level failures.

Important classes:

```text
403
404
429
500
502
503
504
```

and common visible page states such as:

```text
Access denied
Page not found
Too many requests
Internal server error
Service unavailable
```

Example:

```typescript
export class ErrorPageDetector {
    static async assertHealthy(
        page: Page
    ): Promise<void> {
        const title =
            (await page.title())
                .toLowerCase();

        const body =
            (await page
                .locator("body")
                .innerText({
                    timeout: 2000,
                })
                .catch(() => ""))
                .toLowerCase();

        if (
            title.includes("404") ||
            body.includes("page not found")
        ) {
            throw new NavigationError(
                "NOT_FOUND",
                "Target page was not found"
            );
        }

        if (
            title.includes("access denied") ||
            body.includes("403 forbidden")
        ) {
            throw new NavigationError(
                "ACCESS_DENIED",
                "Access denied"
            );
        }

        if (
            body.includes("too many requests")
        ) {
            throw new NavigationError(
                "UNKNOWN",
                "Rate limit may be active"
            );
        }
    }
}
```

Expand this with site-specific signatures as TersooPilot gains website knowledge.

---

# 14. Retry Policy

Retries must be classified.

Usually safe to retry:

```text
transient network failure
temporary timeout
temporary page crash
```

Usually do not automatically retry:

```text
invalid URL
404
403
authentication required
CAPTCHA
permission failure
security challenge
human cancellation
```

Example:

```typescript
export class RetryPolicy {
    static shouldRetry(
        failure: NavigationFailureCode,
        attempt: number,
        options: NavigationOptions
    ): boolean {
        if (
            attempt >
            (options.maxRetries ?? 2)
        ) {
            return false;
        }

        return [
            "TIMEOUT",
            "NETWORK_ERROR",
            "PAGE_CRASHED",
        ].includes(failure);
    }

    static async delay(
        attempt: number,
        baseDelay: number
    ): Promise<void> {
        const delay =
            baseDelay *
            Math.pow(2, attempt - 1);

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    delay
                )
        );
    }
}
```

Add jitter in production to reduce synchronized retry behavior:

```typescript
const jitter =
    Math.floor(Math.random() * 250);

const delay =
    baseDelay *
    Math.pow(2, attempt - 1) +
    jitter;
```

Keep retry counts bounded.

---

# 15. Redirect Security

Record the requested URL and validate the final URL.

Example:

```typescript
const requested =
    new URL(rawUrl);

const final =
    new URL(page.url());

if (
    options.allowedHosts &&
    !options.allowedHosts.includes(
        final.hostname
    )
) {
    throw new NavigationError(
        "REDIRECT_UNEXPECTED",
        `Redirected to blocked host: ${final.hostname}`
    );
}
```

This matters particularly for AI automation because a malicious or compromised page can attempt to redirect the automation into an unexpected domain.

---

# 16. SPA Navigation

A SPA can change the route without a full document navigation.

Use:

```typescript
await page.getByRole("link", {
    name: "Settings",
}).click();

await page.waitForURL("**/settings");

await expect(
    page.getByRole("heading", {
        name: "Settings",
    })
).toBeVisible();
```

The pattern is:

```text
Action
  ↓
wait for state/URL change
  ↓
verify expected state
```

Not:

```text
Action
  ↓
sleep(3000)
```

---

# 17. Multi-Tab / Popup Navigation

Track browser pages centrally.

```typescript
const newPagePromise =
    page.context()
        .waitForEvent("page");

await page.getByRole("link", {
    name: "Open report",
}).click();

const newPage =
    await newPagePromise;

await newPage.waitForLoadState(
    "domcontentloaded"
);
```

Create a `TabManager`/`BrowserSession` rather than scattering this logic throughout `StepRunner`.

---

# 18. StepRunner Integration

### Before

```typescript
async function executeNavigateStep(
    page: Page,
    step: NavigateStep
) {
    await page.goto(step.url, {
        waitUntil: "domcontentloaded",
    });
}
```

### After

```typescript
async function executeNavigateStep(
    page: Page,
    step: NavigateStep
) {
    return navigationEngine.navigate(
        step.url,
        {
            timeoutMs:
                step.timeoutMs ?? 30_000,

            expectedUrl:
                step.expectedUrl,

            allowedHosts:
                step.allowedHosts,

            requiredSelectors:
                step.requiredSelectors,

            requiredText:
                step.requiredText,

            maxRetries:
                step.maxRetries ?? 2,

            aiRecovery:
                step.aiRecovery ?? true,
        }
    );
}
```

The `StepRunner` now coordinates instead of owning the reliability implementation.

---

# 19. Suggested NavigateStep Contract

```typescript
export interface NavigateStep {
    type: "navigate";

    url: string;

    expectedUrl?:
        | string
        | RegExp;

    allowedHosts?: string[];

    requiredSelectors?: string[];

    requiredText?: string[];

    timeoutMs?: number;

    maxRetries?: number;

    aiRecovery?: boolean;

    goal?: string;
}
```

Example:

```json
{
  "type": "navigate",
  "url": "https://example.com/dashboard",
  "expectedUrl": "/dashboard",
  "allowedHosts": [
    "example.com"
  ],
  "requiredText": [
    "Dashboard"
  ],
  "timeoutMs": 30000,
  "maxRetries": 2,
  "aiRecovery": true,
  "goal": "Open the user's dashboard"
}
```

---

# 20. Navigation Logging

Emit structured events:

```text
navigation.requested
navigation.started
navigation.committed
navigation.redirected
navigation.auth_required
navigation.error_detected
navigation.retrying
navigation.recovered
navigation.ready
navigation.failed
```

Example:

```json
{
  "type": "navigation.retrying",
  "sessionId": "session-123",
  "taskId": "task-456",
  "stepId": "step-17",
  "attempt": 2,
  "reason": "TIMEOUT",
  "url": "https://example.com"
}
```

---

# 21. Failure Artifacts

On serious failures capture:

```text
URL
title
screenshot
ARIA/accessibility snapshot
console errors
navigation timing
relevant network information
Playwright trace where enabled
```

Example:

```typescript
async function captureNavigationArtifacts(
    page: Page
) {
    const timestamp =
        new Date()
            .toISOString()
            .replace(/[:.]/g, "-");

    await page.screenshot({
        path:
            `artifacts/navigation-${timestamp}.png`,
        fullPage: true,
    });

    const aria =
        await page.ariaSnapshot();

    // Persist aria in the TersooPilot
    // artifact store.
}
```

Playwright exposes programmatic ARIA snapshots and current agent tooling uses structured accessibility state for interaction. Screenshots are better treated as visual context/debugging evidence.

Official references:
- https://playwright.dev/docs/aria-snapshots
- https://playwright.dev/mcp/snapshots
- https://playwright.dev/mcp/tools/screenshots

---

# 22. OPTION 2 — AI-Assisted Navigation

This option allows AI to navigate websites that are unknown, dynamic, or inconsistent.

The core rule is:

```text
AI decides what should happen.
Deterministic code decides whether it is safe.
Playwright executes the approved action.
```

Do not let the AI directly call arbitrary Playwright methods.

---

# 23. AI Browser Observation

Create:

```typescript
export interface BrowserObservation {
    url: string;

    title: string;

    accessibilitySnapshot?: string;

    visibleText?: string;

    screenshotPath?: string;

    navigationState: string;

    recentErrors?: string[];

    activeDialogs?: string[];

    openPages?: Array<{
        id: string;
        url: string;
        title: string;
    }>;
}
```

Default observation should prioritize:

```text
URL
title
accessibility tree
relevant visible text
current navigation state
```

Add a screenshot when visual context is necessary.

This keeps AI input smaller and generally more precise for interaction than using screenshots for every action.

---

# 24. AI Action Schema

Use a closed action vocabulary.

```typescript
export type AIAction =
    | {
        type: "navigate";
        url: string;
      }
    | {
        type: "click";
        target: {
            ref?: string;
            role?: string;
            name?: string;
            testId?: string;
        };
      }
    | {
        type: "fill";
        target: {
            ref?: string;
            label?: string;
            name?: string;
            testId?: string;
        };
        value: string;
      }
    | {
        type: "wait_for_url";
        pattern: string;
      }
    | {
        type: "wait_for_element";
        target: {
            role?: string;
            name?: string;
            testId?: string;
        };
      }
    | {
        type: "back";
      }
    | {
        type: "forward";
      }
    | {
        type: "open_tab";
        url: string;
      }
    | {
        type: "finish";
        reason: string;
      }
    | {
        type: "request_human";
        reason: string;
      };
```

The AI must never return:

```text
arbitrary TypeScript
arbitrary JavaScript
shell commands
Playwright source code
raw browser protocol commands
```

---

# 25. AI System Prompt

Use a constrained prompt similar to:

```text
You are TersooPilot's browser navigation planner.

Goal:
Complete the user's browser task.

Rules:
1. Use only the browser observation supplied to you.
2. Never invent an element that is not present.
3. Prefer observed semantic targets.
4. Prefer accessibility information for interaction.
5. Never bypass authentication, CAPTCHA, or security controls.
6. Never navigate outside the supplied domain policy.
7. Never execute arbitrary JavaScript.
8. Never claim success without verifying the resulting browser state.
9. Return exactly one allowed structured action.
10. Ask for human assistance when safe completion is impossible.
```

The exact prompt should live in a versioned TersooPilot prompt/config module.

---

# 26. AI Navigator Loop

Use:

```text
OBSERVE
   ↓
MODEL DECIDES
   ↓
SCHEMA VALIDATION
   ↓
ACTION POLICY VALIDATION
   ↓
PLAYWRIGHT EXECUTION
   ↓
STATE VERIFICATION
   ↓
OBSERVE AGAIN
```

Do not make the model generate a long chain of future actions and execute them blindly.

Playwright's current agent documentation recommends re-snapshotting after actions because the browser state and element references can change.

Official reference:
https://playwright.dev/agent-cli/quick-start

---

# 27. AI Navigator Example

```typescript
export class AINavigator {
    constructor(
        private readonly page: Page,
        private readonly model: AIModel,
        private readonly validator: ActionValidator
    ) {}

    async run(
        goal: string,
        maxSteps = 20
    ) {
        for (
            let step = 0;
            step < maxSteps;
            step++
        ) {
            const observation =
                await observeBrowser(
                    this.page
                );

            const action =
                await this.model.chooseAction({
                    goal,
                    observation,
                });

            await this.validator.validate(
                action
            );

            const result =
                await executeAIAction(
                    this.page,
                    action
                );

            if (
                action.type === "finish"
            ) {
                return result;
            }

            if (
                action.type ===
                "request_human"
            ) {
                return {
                    status: "HUMAN_REQUIRED",
                    reason:
                        action.reason,
                };
            }

            await verifyPostActionState(
                this.page,
                action,
                result
            );
        }

        throw new Error(
            "AI navigation step limit exceeded"
        );
    }
}
```

---

# 28. AI Must Not Guess

Bad:

```text
AI:
"The Settings button is probably #submit."
```

Good:

```text
AI:
Observed:
link "Settings"

Action:
click link "Settings"
```

Better:

```text
Use the exact observed accessibility/ref target.
```

The AI should be grounded in the current browser state.

---

# 29. AI Action Validator

All model output must pass deterministic validation.

```typescript
class ActionValidator {
    constructor(
        private readonly page: Page,
        private readonly policy: NavigationPolicy
    ) {}

    async validate(
        action: AIAction
    ): Promise<void> {
        switch (action.type) {
            case "navigate":
                this.policy.assertUrlAllowed(
                    action.url
                );
                return;

            case "open_tab":
                this.policy.assertUrlAllowed(
                    action.url
                );
                return;

            case "click":
                await this.validateClick(
                    action.target
                );
                return;

            case "fill":
                await this.validateFill(
                    action.target
                );
                return;

            case "wait_for_url":
                return;

            default:
                return;
        }
    }
}
```

The important rule:

```text
LLM output is untrusted input.
```

---

# 30. AI + Locator Grounding

When the AI sees:

```text
button "Submit"
```

the executor should turn that into a Playwright locator such as:

```typescript
page.getByRole("button", {
    name: "Submit",
})
```

rather than accepting an arbitrary selector generated by the model.

Recommended priority:

```text
Observed ref
    ↓
Role + accessible name
    ↓
Label
    ↓
Test ID
    ↓
Other stable locator
    ↓
CSS/XPath only as last resort
```

Long CSS/XPath chains should be avoided because DOM structure changes can break them.

Official reference:
https://playwright.dev/docs/locators

---

# 31. Screenshot / Vision Fallback

Use screenshots only when the structured browser representation cannot answer the question.

Good use cases:

- canvas
- charts
- visual-only controls
- layout-dependent interactions
- drag/drop geometry
- custom visual widgets
- visual confirmation
- controls without usable accessibility metadata

Default:

```text
Accessibility snapshot → interaction
```

Fallback:

```text
Accessibility snapshot + screenshot → AI reasoning
```

Do not make image-based coordinate clicking the default interaction mechanism.

---

# 32. Hybrid Orchestrator

Production TersooPilot should use deterministic navigation first.

```typescript
async function navigateWithHybridStrategy(
    goal: string,
    url: string
) {
    try {
        return await navigationEngine.navigate(
            url,
            {
                expectedUrl:
                    new URL(url).pathname,
                useAIRecovery: true,
            }
        );
    } catch (error) {
        const failure =
            classifyNavigationError(error);

        if (
            failure ===
                "REQUIRED_ELEMENT_MISSING" ||
            failure ===
                "REDIRECT_UNEXPECTED"
        ) {
            return aiNavigator.run(goal);
        }

        throw error;
    }
}
```

The precise classification rules should be implemented centrally rather than hard-coded in arbitrary callers.

---

# 33. When Deterministic Navigation Should Win

Use the deterministic engine when:

```text
Known URL
+
Known expected state
+
Known allowed host
+
Known required element
```

Example:

```typescript
await navigationEngine.navigate(
    "https://example.com/dashboard",
    {
        expectedUrl: /\/dashboard/,
        allowedHosts: [
            "example.com",
        ],
        requiredText: [
            "Dashboard",
        ],
    }
);
```

This is cheaper, faster, easier to debug, and more reproducible.

---

# 34. When AI Should Be Used

Escalate to AI when:

```text
known destination but UI changed
required element missing
page structure is ambiguous
SPA state is unclear
website has unfamiliar UI
multiple possible controls match
deterministic recovery failed
```

AI should return the next action, not take unrestricted control.

---

# 35. Security Guardrails for AI

Hard-coded deterministic restrictions should override AI.

Examples:

### Domain

```text
allowed hosts
blocked hosts
allowed protocols
```

### Sensitive actions

Require explicit approval/policy for:

```text
payments
purchases
account deletion
password changes
security settings
sending messages
irreversible submissions
file deletion
financial transactions
```

### Security

Never allow the navigation agent to:

```text
bypass CAPTCHA
bypass MFA/2FA
disable browser security
extract secrets
read arbitrary local files
execute shell commands
execute arbitrary JavaScript
```

---

# 36. Human Escalation

Support:

```json
{
  "type": "request_human",
  "reason": "Authentication is required and no approved authentication capability is available."
}
```

Use human escalation for:

```text
CAPTCHA
2FA
unexpected security challenge
payment confirmation
irreversible action
ambiguous destructive action
credentials unavailable
policy block
```

This is safer than forcing the AI to guess.

---

# 37. AI Cost and Latency Control

Do not send the entire page to the model on every step.

Default context:

```text
current goal
current URL
title
relevant accessibility subtree
last action
last failure
```

Add screenshots only when needed.

Add full-page snapshots only when the task actually requires broad page context.

Use a step limit and model/token budget.

Example:

```typescript
const MAX_AI_NAV_STEPS = 20;
const MAX_AI_RECOVERY_ATTEMPTS = 2;
```

Make these configurable by task/policy.

---

# 38. AI Memory

Do not keep unbounded browser history in every model prompt.

Keep:

```typescript
interface NavigationMemory {
    goal: string;
    currentUrl: string;
    lastActions: AIAction[];
    lastFailures: string[];
    relevantFacts: string[];
}
```

Keep only the context needed for current navigation.

---

# 39. Browser Session Abstraction

Create a stable internal browser session API:

```typescript
export interface BrowserSession {
    readonly id: string;

    readonly page: Page;

    readonly context: BrowserContext;

    navigate(
        url: string,
        options?: NavigationOptions
    ): Promise<NavigationResult>;

    observe(): Promise<BrowserObservation>;

    close(): Promise<void>;
}
```

This becomes the boundary used by `StepRunner`, AI tools, and future features.

---

# 40. Metrics

Track:

```text
navigation_attempts_total
navigation_success_total
navigation_failure_total
navigation_retry_total
navigation_timeout_total
navigation_auth_required_total
navigation_redirect_blocked_total
navigation_ai_recovery_total
navigation_ai_recovery_success_total
navigation_human_required_total
navigation_duration_ms
navigation_attempts_per_success
```

AI metrics:

```text
ai_navigation_decisions
ai_actions_rejected
ai_invalid_target_total
ai_recovery_success_rate
ai_recovery_failure_rate
ai_human_escalations
ai_cost
ai_latency
```

Do not claim a navigation accuracy percentage without measured benchmark evidence.

---

# 41. Testing Strategy

## Unit tests

Test:

```text
URL parsing
protocol restrictions
host restrictions
redirect rules
retry classification
backoff calculation
auth detection
error detection
AI action schema
AI action validation
dangerous-action policy
result serialization
```

## Integration tests

Test:

```text
normal navigation
valid redirect
blocked redirect
404
403
429
500
login redirect
slow page
temporary timeout
SPA navigation
new tab
popup
browser crash/recovery
missing expected element
AI recovery
human escalation
```

---

# 42. Navigation Test Matrix

| Scenario | Expected result |
|---|---|
| Valid page | Navigate + verify ready |
| Valid redirect | Verify final destination |
| Redirect to blocked host | Block |
| 404 | Fail without pointless retries |
| 403 | Fail without blind retries |
| Login redirect | `AUTH_REQUIRED` |
| Temporary timeout | Bounded retry |
| Temporary network error | Bounded retry |
| SPA route | Wait for route/state |
| Missing required element | AI recovery or structured failure |
| CAPTCHA | Human/blocked |
| New tab | Track new page |
| Browser crash | Recover if possible |
| AI hallucinated target | Validator rejects |
| AI unsafe URL | Policy rejects |
| Destructive action | Permission/approval required |

---

# 43. Implementation Phases

## Phase 0 — Audit

Before writing code, inspect the existing TersooPilot repository.

Search for:

```bash
rg "page\.goto|waitForTimeout|waitForURL|waitForLoadState|newPage|waitForEvent\\(['\"]page" packages/
```

Also inspect:

```text
StepRunner
browser/session code
navigation code
retry logic
AI browser tooling
error handling
logging
```

Create:

```text
docs/NAVIGATION-AUDIT.md
```

Do not modify unrelated code during the audit.

---

## Phase 1 — Extract Navigation

Create:

```text
packages/core/src/browser/navigation/
```

Implement:

```text
NavigationEngine
NavigationPolicy
NavigationResult
NavigationError
NavigationClassifier
RetryPolicy
PageReadiness
RedirectValidator
AuthDetector
ErrorPageDetector
```

---

## Phase 2 — Replace Direct Navigation

Replace important direct calls:

```typescript
page.goto(...)
```

with:

```typescript
navigationEngine.navigate(...)
```

Do not rewrite every browser interaction in this phase.

---

## Phase 3 — Add Validation

Implement:

```text
URL validation
host policy
redirect validation
auth detection
error detection
required state validation
```

---

## Phase 4 — Add Recovery

Implement:

```text
bounded retries
exponential backoff
failure classification
page/browser recovery
artifact capture
```

---

## Phase 5 — Observability

Implement:

```text
structured navigation events
metrics
screenshots
ARIA snapshots
trace correlation
```

---

## Phase 6 — AI Navigator

Only after deterministic navigation is stable.

Implement:

```text
BrowserObservation
AINavigator
AIActionSchema
ActionValidator
AIRecovery
NavigationOrchestrator
```

Initially use AI only on failure/ambiguity.

---

## Phase 7 — AI Hardening

Add:

```text
domain restrictions
dangerous-action policy
prompt/version tracking
step limits
cost limits
token limits
human escalation
```

---

## Phase 8 — Benchmark

Create a fixed set of real TersooPilot navigation tasks.

Measure:

```text
deterministic success rate
AI recovery success rate
overall successful task rate
latency
retry rate
AI cost
human escalation rate
invalid AI action rate
blocked unsafe action rate
```

Use the benchmark before changing the architecture again.

---

# 44. Recommended AI Rollout

Do not enable unrestricted AI navigation immediately.

Roll out in stages:

```text
Stage 1
AI observes only.

Stage 2
AI proposes actions.
System validates.
Human can inspect.

Stage 3
AI controls allowed navigation actions.

Stage 4
AI handles recovery for unknown/dynamic pages.

Stage 5
AI supports broader browser workflows behind policy controls.
```

This gives you a safe progression from deterministic automation to AI automation.

---

# 45. Debugging Rules

When something fails:

```text
1. Identify the exact navigation stage.
2. Capture URL/current URL.
3. Capture final error classification.
4. Inspect screenshot/ARIA/trace.
5. Determine whether the failure is:
   - selector/state problem
   - redirect problem
   - network problem
   - authentication
   - website error
   - browser crash
   - AI decision problem
6. Fix the root cause.
```

Do not "fix" navigation failures with:

```text
sleep(10s)
sleep(20s)
retry forever
random selector changes
random AI prompts
```

---

# 46. Important AI Design Rule

The AI should never be the safety mechanism.

AI is for:

```text
reasoning
interpretation
adaptation
navigation planning
recovery
```

Deterministic code is for:

```text
execution
validation
security
permissions
URL policy
redirect policy
success verification
retry policy
limits
```

---

# 47. Recommended Final Architecture

```text
                         USER GOAL
                            |
                            v
                       AI TASK PLANNER
                            |
                            v
                         StepRunner
                            |
                            v
                  NavigationOrchestrator
                            |
             +--------------+--------------+
             |                             |
             v                             v
   Deterministic Engine               AI Navigator
             |                             |
             |                         Observe
             |                             |
             |                           LLM
             |                             |
             |                       Structured action
             |                             |
             |                       Action validator
             |                             |
             +--------------+--------------+
                            |
                            v
                     Navigation Policy
                            |
                            v
                       Playwright
                            |
                            v
                         Browser
                            |
                            v
                      Verify state
                            |
                +-----------+-----------+
                |                       |
              PASS                    FAIL
                |                       |
                v                       v
             Continue                Recover
                                        |
                             +----------+----------+
                             |                     |
                           Retry                  AI
                             |                     |
                             +----------+----------+
                                        |
                                  Human Required
```

---

# 48. Acceptance Criteria

The implementation is complete only when:

- [ ] Existing direct navigation calls have been audited.
- [ ] Navigation is centralized in `NavigationEngine`.
- [ ] URL validation exists.
- [ ] Allowed-host policy exists.
- [ ] Redirect validation exists.
- [ ] Authentication detection exists.
- [ ] Error-page detection exists.
- [ ] Expected state validation exists.
- [ ] Retry classification exists.
- [ ] Retry count is bounded.
- [ ] Backoff exists.
- [ ] Arbitrary sleeps are removed from readiness logic.
- [ ] `networkidle` is not used as the universal readiness mechanism.
- [ ] Navigation returns structured results/errors.
- [ ] Failure artifacts are captured.
- [ ] SPA navigation is handled.
- [ ] Multi-tab navigation is handled.
- [ ] Structured navigation events are emitted.
- [ ] Metrics are collected.
- [ ] Unit tests pass.
- [ ] Integration tests pass.
- [ ] AI action schema exists for Option 2.
- [ ] AI output is deterministically validated.
- [ ] AI cannot execute arbitrary browser code.
- [ ] AI cannot bypass domain/security policy.
- [ ] AI re-observes after every action.
- [ ] AI has step/cost limits.
- [ ] Human escalation exists.
- [ ] AI recovery is initially restricted to recovery/ambiguous cases.
- [ ] A benchmark exists for real navigation tasks.

---

# 49. Final Recommendation

### Option 1 — Core foundation

```text
Playwright
+
TersooPilot NavigationEngine
```

Use this for the majority of normal, repeatable navigation.

### Option 2 — AI navigation

```text
Playwright
+
BrowserObservation
+
LLM
+
Structured AI actions
+
ActionValidator
```

Use this for unknown or ambiguous pages.

### Best overall solution

```text
Deterministic Playwright
        +
TersooPilot-owned policy
        +
AI recovery/adaptation
```

This gives TersooPilot:

```text
reliability
+
adaptability
+
security
+
observability
+
lower unnecessary AI cost
```

without turning every browser action into an uncontrolled LLM decision.

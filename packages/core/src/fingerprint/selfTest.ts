import type { FingerprintBundle } from '@tersoo/contracts';

import { TersooError } from '../util/errors';

import type { CDPClient, SelfTestInspectionResult } from './CdpEmulator';

export interface SelfTestResult {
  ok: boolean;
  score: number;
  mismatches: string[];
  telemetry: SelfTestInspectionResult;
}

export class SelfTestError extends TersooError {
  constructor(message: string, details?: unknown) {
    super('STEALTH_FAILED', `SELF_TEST_FAILED: ${message}`, { details });
  }
}

/**
 * Validates self-test telemetry data against an authoritative FingerprintBundle.
 * Identifies any mismatches in core evasions, hardware, WebGL, or stealth score.
 */
export function evaluateSelfTest(
  rawTelemetry: unknown,
  bundle: FingerprintBundle,
): SelfTestResult {
  if (!rawTelemetry || typeof rawTelemetry !== 'object') {
    throw new SelfTestError('Received empty or invalid self-test telemetry');
  }

  const telemetry = rawTelemetry as SelfTestInspectionResult;
  const mismatches: string[] = [];

  // 1. Webdriver erasure
  if (telemetry.webdriver === true || telemetry.hasWebdriverProp) {
    mismatches.push('navigator.webdriver was not completely erased or masked');
  }

  // 2. Hardware concurrency & device memory
  if (telemetry.cores !== bundle.hardware.cores) {
    mismatches.push(
      `Hardware concurrency mismatch: expected ${bundle.hardware.cores}, got ${telemetry.cores}`,
    );
  }
  if (telemetry.memory !== bundle.hardware.memoryGb) {
    mismatches.push(
      `Device memory mismatch: expected ${bundle.hardware.memoryGb}, got ${telemetry.memory}`,
    );
  }

  // 3. Platform & User Agent consistency
  if (bundle.platform === 'windows' && telemetry.platform !== 'Win32') {
    mismatches.push(`Platform mismatch for Windows: expected Win32, got ${telemetry.platform}`);
  } else if (bundle.platform === 'macos' && telemetry.platform !== 'MacIntel') {
    mismatches.push(`Platform mismatch for macOS: expected MacIntel, got ${telemetry.platform}`);
  } else if (bundle.platform === 'android' && telemetry.platform !== 'Linux armv8l') {
    mismatches.push(`Platform mismatch for Android: expected Linux armv8l, got ${telemetry.platform}`);
  }

  // 4. Chrome structure
  if (!telemetry.chromePresent) {
    mismatches.push('window.chrome runtime mock structure is missing');
  }

  // 5. Prototype toString native code spoofing
  if (!telemetry.toStringGuarded) {
    mismatches.push('Native toString spoofing guard check failed');
  }

  // 6. WebGL vendor and renderer
  if (bundle.webgl) {
    if (telemetry.webgl?.unmaskedRenderer !== bundle.webgl.unmaskedRenderer) {
      mismatches.push(
        `WebGL unmasked renderer mismatch: expected "${bundle.webgl.unmaskedRenderer}", got "${telemetry.webgl?.unmaskedRenderer}"`,
      );
    }
    if (telemetry.webgl?.unmaskedVendor !== bundle.webgl.unmaskedVendor) {
      mismatches.push(
        `WebGL unmasked vendor mismatch: expected "${bundle.webgl.unmaskedVendor}", got "${telemetry.webgl?.unmaskedVendor}"`,
      );
    }
  }

  // 7. Overall stealth score
  const score = typeof telemetry.score === 'number' ? telemetry.score : 0;
  if (score < 0.9) {
    mismatches.push(`Self-test score ${score} is below threshold 0.90`);
  }

  const ok = mismatches.length === 0;

  return {
    ok,
    score,
    mismatches,
    telemetry,
  };
}

/**
 * Executes self-test in a running Chromium page via CDP Runtime.evaluate
 * and verifies that all evasions pass and match the profile's bundle.
 */
export async function runSelfTestViaCdp(
  cdp: CDPClient,
  bundle: FingerprintBundle,
): Promise<SelfTestResult> {
  try {
    const res = (await cdp.send('Runtime.evaluate', {
      expression: 'window.__tersooSelfTest ? window.__tersooSelfTest() : null',
      returnByValue: true,
    })) as { result?: { value?: unknown } } | undefined;

    const rawTelemetry = res?.result?.value;
    if (!rawTelemetry) {
      throw new SelfTestError('window.__tersooSelfTest() did not return a value via CDP');
    }

    return evaluateSelfTest(rawTelemetry, bundle);
  } catch (err) {
    if (err instanceof TersooError) {
      throw err;
    }
    throw new SelfTestError('Failed to execute self-test over CDP', err);
  }
}

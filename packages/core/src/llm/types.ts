import type { AccessibilityNode } from '../crosshair/accessibility';
import type { PageTree } from '../crosshair/pageTree';

/** What a single decide-and-act iteration did, fed back to the model next time. */
export interface LlmActionRecord {
  iteration: number;
  action: string;
  /** Human-readable description of the target, e.g. `link "Read more"`. */
  target?: string;
  result: 'ok' | 'failed' | 'rejected';
  detail?: string;
  /** Page URL after the action, so the model can see whether it moved. */
  urlAfter?: string;
}

/**
 * The browsing profile the run belongs to.
 *
 * Without this the model behaves like an automation script regardless of who
 * the account is: a brand-new low-trust profile and a mature one produce
 * identical behaviour, which is exactly the pattern that gets flagged.
 */
export interface LlmPersonaContext {
  name?: string;
  niche?: string;
  trustScore?: number;
  maturationStage?: string;
  engagementRate?: number;
  patienceIndex?: number;
  typingWpm?: number;
}

/** Loop state handed to the model alongside the page description. */
export interface LlmStepContext {
  iteration?: number;
  maxIterations?: number;
  history?: LlmActionRecord[];
  /** Why the previous action did not happen, if it did not. */
  lastError?: string | null;
  /**
   * A result this run should open, so repeated identical runs do not always
   * pick the first item on the page. Null when the page offers no clear
   * candidates, or when the goal already names a specific one.
   */
  preferredResultRef?: number | null;
  persona?: LlmPersonaContext | null;
}

export type LlmDecision =
  | { action: 'click'; ref: number; reason?: string }
  | { action: 'type'; ref: number; text: string; pressEnter?: boolean; reason?: string }
  | { action: 'press'; key: string; reason?: string }
  | { action: 'scroll'; direction: 'up' | 'down'; amount: number; reason?: string }
  | { action: 'navigate'; url: string; reason?: string }
  | { action: 'wait'; ms: number; reason?: string }
  | { action: 'done'; reason?: string }
  | { action: 'unsolvable'; reason: string };

/**
 * What the model is shown. Either the ref-anchored DOM description or, when
 * the page could not be walked, a raw accessibility snapshot.
 */
export type LlmTree = PageTree | AccessibilityNode;

export type VisionDecision =
  | { action: 'click'; x: number; y: number; reason?: string }
  | { action: 'drag'; x: number; y: number; endX: number; endY: number; reason?: string }
  | { action: 'unsolvable'; reason: string };

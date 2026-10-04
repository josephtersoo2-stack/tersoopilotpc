export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MouseTrajectoryPoint extends Point {
  timeMs: number;
}

export interface MousePathOptions {
  seed?: string | number;
  speed?: number; // multiplier, default 1.0
  steps?: number;
  microJitter?: boolean;
  jitterIntensity?: number; // default 1.0 px
  overshoot?: boolean;
  overshootProbability?: number; // default 0.20
}

export interface MouseClickOptions extends MousePathOptions {
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
  preClickDelayMs?: number; // dwell before mousedown
  clickDurationMs?: number; // dwell between mousedown and mouseup
  postClickDelayMs?: number;
  patienceIndex?: number | undefined; // behavioral patience index (1.0 - 10.0, baseline 5.5)
}

export interface KeyboardOptions {
  seed?: string | number;
  minDelayMs?: number;
  maxDelayMs?: number;
  simulateTypos?: boolean;
  typoChance?: number;
  simulateDoubleSpace?: boolean;
  speed?: number;
  typingWpm?: number | undefined; // target words-per-minute dynamically controlling keystroke intervals
  typoRate?: number | undefined; // typo percentage or fraction (e.g. 3.5% = 0.035)
}

export interface ScrollOptions {
  seed?: string | number;
  direction?: 'down' | 'up' | 'right' | 'left';
  amount?: number;
  burstCount?: number;
  cursorPosition?: Point;
  speed?: number;
  patienceIndex?: number | undefined; // behavioral patience index scaling pause between bursts
}


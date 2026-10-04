export interface Point {
  x: number;
  y: number;
}

export function cubicBezier(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t: number,
): Point {
  const mt = 1 - t;
  return {
    x: mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x,
    y: mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y,
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
  if (dist === 0 || steps <= 0) {
    return [start];
  }

  const mag = dist * (0.15 + rng() * 0.25);
  const sign = rng() > 0.5 ? 1 : -1;
  const nx = (-dy / dist) * sign;
  const ny = (dx / dist) * sign;

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

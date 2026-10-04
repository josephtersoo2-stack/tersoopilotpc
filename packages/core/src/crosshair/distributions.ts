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

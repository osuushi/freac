/** Ascending power coefficients; used for bounded cubic geometry queries. */
export const evaluate = (p: readonly number[], t: number): number =>
  p.reduceRight((sum, coefficient) => sum * t + coefficient, 0);
export const derivative = (p: readonly number[]): number[] => p.slice(1).map((v, i) => v * (i + 1));
export function multiply(a: readonly number[], b: readonly number[]): number[] {
  const result = Array(a.length + b.length - 1).fill(0) as number[];
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) result[i + j] += a[i] * b[j];
  return result;
}
export function sum(a: readonly number[], b: readonly number[]): number[] {
  return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0));
}
/** Derivative roots partition [0,1] into monotone intervals, including tangent roots. */
export function roots(input: readonly number[]): number[] {
  const p = [...input],
    scale = Math.max(...p.map(Math.abs), 1e-30);
  while (p.length > 1 && Math.abs(p[p.length - 1]) < scale * 1e-14) p.pop();
  if (p.length === 1) return [];
  if (p.length === 2) {
    const t = -p[0] / p[1];
    return t >= -1e-12 && t <= 1 + 1e-12 ? [Math.max(0, Math.min(1, t))] : [];
  }
  const stops = [0, ...roots(derivative(p)).filter((t) => t > 0 && t < 1), 1];
  const result = stops.filter((t) => Math.abs(evaluate(p, t)) < scale * 1e-12);
  for (let i = 1; i < stops.length; i++) {
    let a = stops[i - 1],
      b = stops[i],
      va = evaluate(p, a);
    if (va * evaluate(p, b) >= 0) continue;
    for (let j = 0; j < 48; j++) {
      const m = (a + b) / 2,
        vm = evaluate(p, m);
      if (va * vm <= 0) b = m;
      else {
        a = m;
        va = vm;
      }
    }
    result.push((a + b) / 2);
  }
  return result.sort((a, b) => a - b).filter((t, i, all) => !i || t - all[i - 1] > 1e-9);
}

// src/shared/utils/number.ts
// Shared numeric helpers (Q3). toNumber/round2 were byte-identical across
// several use-cases; centralizing removes the duplication and drift risk.

export function toNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val);
  if (val && typeof val === 'object' && 'toNumber' in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return 0;
}

export function round2(val: number): number {
  return Math.round(val * 100) / 100;
}
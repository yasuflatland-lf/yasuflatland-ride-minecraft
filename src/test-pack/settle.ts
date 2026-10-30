export function settledAt(
  samples: readonly number[],
  threshold: number,
  run: number,
): number | undefined {
  let consecutive = 0;
  for (const [i, sample] of samples.entries()) {
    consecutive = sample < threshold ? consecutive + 1 : 0;
    if (consecutive === run) return i;
  }
  return undefined;
}

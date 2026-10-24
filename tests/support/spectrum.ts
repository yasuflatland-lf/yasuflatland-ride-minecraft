import { readFileSync } from "node:fs";

// Power spectrum of a mono 16-bit PCM WAV with a 44-byte header, zero-padded to
// a power of two for a radix-2 FFT. The returned function sums the power of the
// bins between lo and hi Hz.
export function bandPower(path: string): (lo: number, hi: number) => number {
  const wav = readFileSync(path);
  const rate = wav.readUInt32LE(24);
  const samples = new Int16Array(
    wav.buffer.slice(wav.byteOffset + 44, wav.byteOffset + wav.length),
  );
  let n = 1;
  while (n < samples.length) n *= 2;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(samples);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const swap = re[i] ?? 0;
      re[i] = re[j] ?? 0;
      re[j] = swap;
    }
  }
  for (let len = 2; len <= n; len *= 2) {
    const step = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(step * k);
        const wi = Math.sin(step * k);
        const a = i + k;
        const b = a + len / 2;
        const [ar, ai, br, bi] = [
          re[a] ?? 0,
          im[a] ?? 0,
          re[b] ?? 0,
          im[b] ?? 0,
        ];
        const xr = br * wr - bi * wi;
        const xi = br * wi + bi * wr;
        re[b] = ar - xr;
        im[b] = ai - xi;
        re[a] = ar + xr;
        im[a] = ai + xi;
      }
    }
  }
  return (lo, hi) => {
    let sum = 0;
    for (let k = Math.ceil((lo * n) / rate); k <= (hi * n) / rate; k++)
      sum += (re[k] ?? 0) ** 2 + (im[k] ?? 0) ** 2;
    return sum;
  };
}

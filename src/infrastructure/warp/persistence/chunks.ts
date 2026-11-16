export function chunkString(s: string, size: number): string[] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new RangeError("Chunk size must be a positive integer");
  }
  const chunks: string[] = [];
  for (let start = 0; start < s.length; start += size) {
    chunks.push(s.slice(start, start + size));
  }
  return chunks;
}

export function joinChunks(chunks: readonly string[]): string {
  return chunks.join("");
}

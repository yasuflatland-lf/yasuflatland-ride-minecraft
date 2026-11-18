import { readFileSync } from "node:fs";

export function readOggInfo(path: string): {
  channels: number;
  sampleRate: number;
  sampleCount: number;
  seconds: number;
} {
  const bytes = readFileSync(path);
  let offset = 0;
  let channels = 0;
  let sampleRate = 0;
  let granule = -1n;
  while (offset < bytes.length) {
    if (
      offset + 27 > bytes.length ||
      bytes.toString("latin1", offset, offset + 4) !== "OggS" ||
      bytes[offset + 4] !== 0
    ) {
      throw new Error(`Invalid Ogg page: ${path}`);
    }
    const segments = bytes[offset + 26] ?? 0;
    const body = offset + 27 + segments;
    if (body > bytes.length) throw new Error(`Truncated Ogg page: ${path}`);
    let size = 0;
    let firstPacket = 0;
    let packetComplete = false;
    for (let i = offset + 27; i < body; i++) {
      const lace = bytes[i] ?? 0;
      size += lace;
      if (!packetComplete) {
        firstPacket += lace;
        packetComplete = lace < 255;
      }
    }
    if (body + size > bytes.length)
      throw new Error(`Truncated Ogg body: ${path}`);
    if (offset === 0) {
      if (
        !packetComplete ||
        firstPacket < 30 ||
        bytes.toString("latin1", body, body + 7) !== "\x01vorbis" ||
        bytes.readUInt32LE(body + 7) !== 0
      ) {
        throw new Error(`Not an Ogg Vorbis identification packet: ${path}`);
      }
      channels = bytes[body + 11] ?? 0;
      sampleRate = bytes.readUInt32LE(body + 12);
      if (!channels || !sampleRate)
        throw new Error(`Invalid Vorbis format: ${path}`);
    }
    // Follow page boundaries so an OggS sequence inside compressed audio cannot
    // masquerade as the last page's granule position.
    granule = bytes.readBigInt64LE(offset + 6);
    offset = body + size;
  }
  if (granule < 0n || !sampleRate)
    throw new Error(`Missing Ogg duration: ${path}`);
  return {
    channels,
    sampleRate,
    sampleCount: Number(granule),
    seconds: Number(granule) / sampleRate,
  };
}

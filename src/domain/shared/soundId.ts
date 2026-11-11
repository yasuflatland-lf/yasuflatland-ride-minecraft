import type { Brand } from "./ids";

/** The name of a sound definition, such as "yasu_ride.flush". */
export type SoundId = Brand<string, "SoundId">;

const SOUND_ID_PATTERN = /^[a-z0-9_.]+$/;

export function soundId(s: string): SoundId {
  if (!SOUND_ID_PATTERN.test(s))
    throw new RangeError(`Invalid sound id: ${JSON.stringify(s)}`);
  return s as SoundId;
}

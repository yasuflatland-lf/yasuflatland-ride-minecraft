import type { FurnitureId } from "../../../domain/resort/ids";
import type { SoundId } from "../../../domain/shared/soundId";

export interface ShowSound {
  playAt(sound: SoundId, id: FurnitureId): void;
}

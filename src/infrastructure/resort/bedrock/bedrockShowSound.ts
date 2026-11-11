import { world } from "@minecraft/server";
import type { ShowSound } from "../../../application/resort/ports/showSound";
import type { FurnitureId } from "../../../domain/resort/ids";
import type { SoundId } from "../../../domain/shared/soundId";

export class BedrockShowSound implements ShowSound {
  playAt(sound: SoundId, id: FurnitureId): void {
    try {
      const entity = world.getEntity(id);
      if (entity?.isValid) entity.dimension.playSound(sound, entity.location);
    } catch {
      // The entity can unload between lookup and sound playback.
    }
  }
}

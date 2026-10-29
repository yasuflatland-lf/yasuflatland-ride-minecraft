import type { Host } from "../../../domain/camp/hosted";

/** One kind of item that can stand on a table or a Fire Pit (ADR 0185). */
export interface HostedKindPort {
  /** Ids of the loaded entities of this kind. */
  loaded(): readonly string[];
  host(id: string): Host;
  isHostAreaLoaded(id: string): boolean;
  hostExists(hostId: string): boolean;
  /** Removes the entity and anything it laid, such as a light block, dropping nothing. */
  remove(id: string): void;
}

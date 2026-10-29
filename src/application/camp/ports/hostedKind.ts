import type { Host } from "../../../domain/camp/hosted";

/** One kind of item that can stand on a table or a Fire Pit (ADR 0185). */
export interface HostedKindPort {
  /** Ids of the loaded entities of this kind. */
  loaded(): readonly string[];
  host(id: string): Host;
  /**
   * True only when both the item's chunk and every chunk its host could be in
   * are loaded, since a host in an unloaded chunk reads as missing (ADR 0185).
   */
  isHostAreaLoaded(id: string): boolean;
  hostExists(hostId: string): boolean;
  /** Removes the entity and anything it laid, such as a light block, dropping nothing. */
  remove(id: string): void;
}

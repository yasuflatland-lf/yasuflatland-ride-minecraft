import type { TentEntry } from "../../../domain/camp/tentRegistry";

export interface LegacyTentWorld {
  listTents(): readonly TentEntry[];
  /** An unloaded anchor defers folding without changing the entry, blocks, or item. */
  foldInto(entry: TentEntry): "folded" | "deferred";
}

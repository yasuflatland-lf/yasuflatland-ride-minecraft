import type { StructureHandle } from "../../domain/build/structure/handle";
import type { BuildStructureStore } from "./ports/structures";

export function discardAll(
  structures: Pick<BuildStructureStore, "discard">,
  handles: readonly StructureHandle[],
): void {
  for (const handle of handles) structures.discard(handle);
}

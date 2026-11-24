import { isOpenBlock } from "../../shared/keptBlocks";

export function isFillable(
  typeId: string | undefined,
  mayEdit: () => boolean,
): boolean {
  return typeId !== undefined && isOpenBlock(typeId) && mayEdit();
}

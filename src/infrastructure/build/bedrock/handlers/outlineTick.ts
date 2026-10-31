import { system } from "@minecraft/server";
import type { ShowPreview } from "../../../../application/build/showPreview";

export function registerOutlineTick(preview: ShowPreview): void {
  system.runInterval(() => preview.execute(system.currentTick), 1);
}

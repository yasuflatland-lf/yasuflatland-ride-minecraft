import { system } from "@minecraft/server";
import type { EditJobs } from "../../../../application/build/editJobs";

export function registerEditTick(jobs: EditJobs): void {
  system.runInterval(() => jobs.step(), 1);
}

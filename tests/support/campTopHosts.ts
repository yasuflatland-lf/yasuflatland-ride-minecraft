import { registerCampTopHosts } from "../../src/infrastructure/camp/bedrock/topHosts";
import { TopHostRegistry } from "../../src/infrastructure/shared/tableTop/registry";

export function campTopHosts(): TopHostRegistry {
  const registry = new TopHostRegistry();
  registerCampTopHosts(registry);
  return registry;
}

export function itemsOnTable(id: string) {
  return campTopHosts().itemsOnTop("camp_table", id);
}

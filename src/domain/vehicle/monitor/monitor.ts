import { SyncedValue } from "../../shared/syncedValue";
import type { EngineCommand } from "../drive";
import { MONITOR_PROPERTY_NAME } from "../entityContract";
import type { EquipmentRule } from "../equipment/equipment";

/** The property value that draws nothing over the console's plain screen. */
export const BLANK_SCREEN = 0;

/**
 * The property value for `held` in the state `stateOf` reports; BLANK_SCREEN when nothing is held,
 * the item has no declared switch, or its state is missing or unknown.
 */
export function monitorScreen(
  rule: EquipmentRule,
  held: string | undefined,
  stateOf: (item: string) => string | undefined,
): number {
  if (held === undefined) return BLANK_SCREEN;
  let offset = 1;
  for (const equipmentSwitch of rule.switches) {
    if (equipmentSwitch.item === held) {
      const state = stateOf(held);
      const index =
        state === undefined ? -1 : equipmentSwitch.states.indexOf(state);
      return index < 0 ? BLANK_SCREEN : offset + index;
    }
    offset += equipmentSwitch.states.length;
  }
  return BLANK_SCREEN;
}

export class CabMonitor {
  private readonly screen = new SyncedValue<number>();

  constructor(
    private readonly rule: EquipmentRule | undefined,
    private readonly stateOf: (item: string) => string | undefined,
  ) {}

  resync(): void {
    this.screen.resync();
  }

  commands(held: string | undefined): readonly EngineCommand[] {
    const rule = this.rule;
    if (!rule) return [];
    const value = this.screen.next(monitorScreen(rule, held, this.stateOf));
    return value === undefined
      ? []
      : [{ type: "setProperty", name: MONITOR_PROPERTY_NAME, value }];
  }
}

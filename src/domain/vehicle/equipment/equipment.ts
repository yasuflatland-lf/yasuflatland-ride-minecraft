import { Debounce } from "../../shared/debounce";
import type { Drive } from "../drive";
import { SPEC } from "../spec";

/** A held switch with its states in cycle and screen order (ADR 0139). */
interface EquipmentSwitch {
  readonly item: string;
  readonly states: readonly [string, ...string[]];
  /** Prefix of the action-bar message name, before the state suffix (ADR 0224). */
  readonly feedback?: string;
}

interface EquipmentBinding {
  readonly get: () => string;
  readonly set: (state: string) => void;
}

/** The equipment switches available on a vehicle kind (ADR 0171). */
export interface EquipmentRule {
  readonly switches: readonly EquipmentSwitch[];
}

export function nextEquipmentState(
  equipmentSwitch: EquipmentSwitch,
  current: string | undefined,
): string {
  const index =
    current === undefined ? -1 : equipmentSwitch.states.indexOf(current);
  // The tuple type guarantees at least one state, so the index is always in range.
  return equipmentSwitch.states[
    (index + 1) % equipmentSwitch.states.length
  ] as string;
}

export function equipmentSwitchOf(
  rule: EquipmentRule | undefined,
  item: string,
): EquipmentSwitch | undefined {
  return rule?.switches.find(
    (equipmentSwitch) => equipmentSwitch.item === item,
  );
}

export function equipmentBindings(
  rule: EquipmentRule,
  bindings: Readonly<Partial<Record<string, EquipmentBinding>>>,
) {
  const bindingFor = (item: string) =>
    Object.hasOwn(bindings, item) ? bindings[item] : undefined;

  return {
    equipmentState(item: string): string | undefined {
      const equipmentSwitch = equipmentSwitchOf(rule, item);
      if (!equipmentSwitch) return undefined;
      const state = bindingFor(item)?.get();
      return state !== undefined && equipmentSwitch.states.includes(state)
        ? state
        : undefined;
    },
    setEquipmentState(item: string, state: string): boolean {
      if (!equipmentSwitchOf(rule, item)?.states.includes(state)) return false;
      const binding = bindingFor(item);
      if (!binding) return false;
      binding.set(state);
      return true;
    },
  };
}

export class EquipmentSwitchboard {
  // Equipment switches share a cooldown separate from the headlight switch (ADR 0171).
  private readonly cooldown = new Debounce(SPEC.equipmentSwitchCooldown);

  constructor(
    private readonly rule: EquipmentRule | undefined,
    private readonly drive: Pick<Drive, "equipmentState" | "setEquipmentState">,
  ) {}

  /** Only the driver may advance an equipment switch; all equipment switches share an idle cooldown (ADR 0024, 0171). */
  switchEquipment(isDriver: boolean, item: string, tick: number): boolean {
    const equipmentSwitch = equipmentSwitchOf(this.rule, item);
    if (!isDriver || !equipmentSwitch || !this.drive.setEquipmentState)
      return false;
    if (!this.cooldown.press(tick)) return false;
    return this.drive.setEquipmentState(
      item,
      nextEquipmentState(equipmentSwitch, this.equipmentState(item)),
    );
  }

  equipmentState(item: string): string | undefined {
    return this.drive.equipmentState?.(item);
  }

  /** Bypasses role and cooldown checks for the server-only test hook (ADR 0171). */
  forceEquipment(item: string, state: string): boolean {
    return this.drive.setEquipmentState?.(item, state) ?? false;
  }
}

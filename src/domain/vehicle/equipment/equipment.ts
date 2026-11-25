import { Debounce } from "../../shared/debounce";
import type { Drive } from "../drive";
import { SPEC } from "../spec";

declare const equipmentItemIdBrand: unique symbol;
type EquipmentItemId = string & { readonly [equipmentItemIdBrand]: true };

export interface SwitchMessages {
  messageFor(state: string): string | undefined;
}

/** A held switch with its states in cycle and screen order (ADR 0139). */
export interface EquipmentSwitch<S extends string = string>
  extends SwitchMessages {
  readonly item: EquipmentItemId;
  readonly states: readonly [S, ...S[]];
  /** Prefix of the action-bar message name, before the state suffix (ADR 0224). */
  readonly feedback?: string;
}

function messageFor(this: EquipmentSwitch, state: string): string | undefined {
  return this.feedback !== undefined && this.states.includes(state)
    ? `${this.feedback}_${state}`
    : undefined;
}

export function defineEquipmentSwitch<
  const T extends readonly [string, ...string[]],
>(item: string, states: T, feedback?: string) {
  return Object.freeze({
    messageFor,
    item: item as EquipmentItemId,
    states: Object.freeze(states),
    ...(feedback === undefined ? {} : { feedback }),
  });
}

interface EquipmentBinding<S extends string> {
  readonly switch: EquipmentSwitch<S>;
  readonly get: () => NoInfer<S>;
  readonly set: (state: NoInfer<S>) => void;
}

/** The equipment switches available on a vehicle kind (ADR 0171). */
export interface EquipmentRule {
  readonly switches: readonly EquipmentSwitch[];
}

export function isEquipmentState<S extends string>(
  equipmentSwitch: EquipmentSwitch<S>,
  state: string | undefined,
): state is S {
  const states: readonly string[] = equipmentSwitch.states;
  return state !== undefined && states.includes(state);
}

export function nextEquipmentState<S extends string>(
  equipmentSwitch: EquipmentSwitch<S>,
  current: string | undefined,
): S {
  const { states } = equipmentSwitch;
  const names: readonly string[] = states;
  const index = current === undefined ? -1 : names.indexOf(current);
  return states[(index + 1) % states.length] ?? states[0];
}

export function equipmentBindings<const States extends readonly string[]>(
  rule: EquipmentRule,
  bindings: { readonly [K in keyof States]: EquipmentBinding<States[K]> },
) {
  const bindingFor = (equipmentSwitch: EquipmentSwitch) =>
    rule.switches.includes(equipmentSwitch)
      ? bindings.find((binding) => binding.switch === equipmentSwitch)
      : undefined;

  return {
    equipmentState<S extends string>(
      equipmentSwitch: EquipmentSwitch<S>,
    ): S | undefined {
      const state = bindingFor(equipmentSwitch)?.get();
      return isEquipmentState(equipmentSwitch, state) ? state : undefined;
    },
    cycleEquipment(equipmentSwitch: EquipmentSwitch): boolean {
      const binding = bindingFor(equipmentSwitch);
      if (!binding) return false;
      binding.set(nextEquipmentState(binding.switch, binding.get()));
      return true;
    },
    forceEquipment(equipmentSwitch: EquipmentSwitch, state: string): boolean {
      const binding = bindingFor(equipmentSwitch);
      if (!binding || !isEquipmentState(binding.switch, state)) return false;
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
    private readonly drive: Pick<
      Drive,
      "equipmentState" | "cycleEquipment" | "forceEquipment"
    >,
  ) {}

  /** Only the driver may advance an equipment switch; all equipment switches share an idle cooldown (ADR 0024, 0171). */
  switchEquipment(
    isDriver: boolean,
    equipmentSwitch: EquipmentSwitch,
    tick: number,
  ): boolean {
    if (
      !isDriver ||
      !this.rule?.switches.includes(equipmentSwitch) ||
      !this.drive.cycleEquipment
    )
      return false;
    return (
      this.cooldown.press(tick) && this.drive.cycleEquipment(equipmentSwitch)
    );
  }

  equipmentState<S extends string>(
    equipmentSwitch: EquipmentSwitch<S>,
  ): S | undefined {
    return this.drive.equipmentState?.(equipmentSwitch);
  }

  /** Bypasses role and cooldown checks for the server-only test hook (ADR 0171). */
  forceEquipment(equipmentSwitch: EquipmentSwitch, state: string): boolean {
    return this.drive.forceEquipment?.(equipmentSwitch, state) ?? false;
  }
}

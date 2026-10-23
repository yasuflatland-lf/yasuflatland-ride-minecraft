import { PAINT_EVENT_PREFIX } from "../shared/paint";
import type { EngineCommand, RestoredValues } from "./drive";

export type PropertySpec =
  | { type: "enum"; values: readonly string[] }
  | { type: "float"; range: readonly [number, number] }
  | { type: "int"; range: readonly [number, number] }
  | { type: "bool" };

export interface EntityContract {
  properties: Readonly<Record<string, PropertySpec>>;
  events: readonly string[];
  animations: readonly string[];
  /** Properties read back when the aggregate is rebuilt; a subset of properties. */
  restored: readonly string[];
}

/** The TypeScript type a property spec accepts. */
export type PropertyValue<S extends PropertySpec> = S extends
  | { type: "float" }
  | { type: "int" }
  ? number
  : S extends { type: "bool" }
    ? boolean
    : S extends { type: "enum"; values: readonly (infer V)[] }
      ? V
      : never;

type ContractFragment = Pick<EntityContract, "properties" | "events">;

/** Command builders that accept only the names and value types a contract declares (ADR 0055). */
export function commandsFor<C extends ContractFragment>(): {
  property<K extends keyof C["properties"] & string>(
    name: K,
    value: PropertyValue<C["properties"][K]>,
  ): EngineCommand;
  event(name: C["events"][number]): EngineCommand;
} {
  return {
    property: (name, value) => ({ type: "setProperty", name, value }),
    event: (name) => ({ type: "triggerEvent", name }),
  };
}

/** Restored values typed by a contract's restored list. */
export type RestoredOf<C extends EntityContract> = RestoredValues<
  C["restored"][number]
>;

/** The property the core writes to light the lamps. */
export const HEADLIGHTS_PROPERTY_NAME = "headlights";
/** Names the core writes; no kind may declare them. */
export const CORE_PROPERTY_NAMES: readonly string[] = [
  HEADLIGHTS_PROPERTY_NAME,
];
export const CORE_EVENT_PREFIXES: readonly string[] = [PAINT_EVENT_PREFIX];

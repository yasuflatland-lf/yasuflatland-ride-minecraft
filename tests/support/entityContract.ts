import { expect } from "vitest";
import type { EngineCommand } from "../../src/domain/vehicle/drive";
import type {
  EntityContract,
  PropertySpec,
} from "../../src/domain/vehicle/entityContract";

function expectInRange(
  value: unknown,
  [min, max]: readonly [number, number],
): void {
  expect(value).toBeGreaterThanOrEqual(min);
  expect(value).toBeLessThanOrEqual(max);
}

/** Fails unless the contract declares `command` and its value fits the declared type and range. Contracts declare no sounds, so only a sound's name is checked. */
export function expectDeclaredCommand(
  command: EngineCommand,
  contract: EntityContract,
): void {
  switch (command.type) {
    case "setProperty": {
      const spec: PropertySpec | undefined = contract.properties[command.name];
      expect(spec).toBeDefined();
      if (!spec) throw new Error(`Undeclared property ${command.name}`);
      switch (spec.type) {
        case "enum":
          expect(spec.values).toContain(command.value);
          break;
        case "bool":
          expect(typeof command.value).toBe("boolean");
          break;
        case "int":
          expect(Number.isInteger(command.value)).toBe(true);
          expectInRange(command.value, spec.range);
          break;
        case "float":
          expect(typeof command.value).toBe("number");
          expectInRange(command.value, spec.range);
          break;
      }
      break;
    }
    case "triggerEvent":
      expect(contract.events).toContain(command.name);
      break;
    case "playAnimation":
      expect(contract.animations).toContain(command.name);
      break;
    case "playSound":
      expect(typeof command.name).toBe("string");
      break;
  }
}

/** Fails unless a BP property definition's default fits its spec's range, and, for int, the bounds and default are integers. */
export function expectPackProperty(
  definition: { default?: unknown },
  spec: PropertySpec,
): void {
  if (spec.type !== "float" && spec.type !== "int") return;
  expect(spec.range[0]).toBeLessThanOrEqual(spec.range[1]);
  expect(typeof definition.default).toBe("number");
  expectInRange(definition.default, spec.range);
  if (spec.type === "int") {
    expect(Number.isInteger(spec.range[0])).toBe(true);
    expect(Number.isInteger(spec.range[1])).toBe(true);
    expect(Number.isInteger(definition.default)).toBe(true);
  }
}

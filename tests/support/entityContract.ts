import { expect } from "vitest";
import type { EngineCommand } from "../../src/domain/vehicle/drive";
import type {
  EntityContract,
  PropertySpec,
} from "../../src/domain/vehicle/entityContract";

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
          expect(command.value).toBeGreaterThanOrEqual(spec.range[0]);
          expect(command.value).toBeLessThanOrEqual(spec.range[1]);
          break;
        case "float":
          expect(typeof command.value).toBe("number");
          expect(command.value).toBeGreaterThanOrEqual(spec.range[0]);
          expect(command.value).toBeLessThanOrEqual(spec.range[1]);
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

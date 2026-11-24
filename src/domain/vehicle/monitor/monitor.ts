import { Debounce } from "../../shared/debounce";
import { SyncedValue } from "../../shared/syncedValue";
import type { Drive, EngineCommand } from "../drive";
import { MONITOR_PROPERTY_NAME } from "../entityContract";
import { SPEC } from "../spec";

/** A cab monitor tool with its states in screen order (ADR 0139). */
interface MonitorTool {
  readonly item: string;
  readonly states: readonly [string, ...string[]];
  /** Prefix of the action-bar message name, before the state suffix (ADR 0224). */
  readonly feedback?: string;
}

interface ToolBinding {
  readonly get: () => string;
  readonly set: (state: string) => void;
}

/** What a kind's cab monitor shows (ADR 0139). */
export interface MonitorRule {
  readonly tools: readonly MonitorTool[];
}

/** The property value that draws nothing over the console's plain screen. */
export const BLANK_SCREEN = 0;

/**
 * The property value for `held` in the state `stateOf` reports; BLANK_SCREEN when nothing is held,
 * the item is not one of the rule's tools, or the state is undefined or not in the tool's states.
 */
export function monitorScreen(
  rule: MonitorRule,
  held: string | undefined,
  stateOf: (item: string) => string | undefined,
): number {
  if (held === undefined) return BLANK_SCREEN;
  let offset = 1;
  for (const tool of rule.tools) {
    if (tool.item === held) {
      const state = stateOf(held);
      const index = state === undefined ? -1 : tool.states.indexOf(state);
      return index < 0 ? BLANK_SCREEN : offset + index;
    }
    offset += tool.states.length;
  }
  return BLANK_SCREEN;
}

export function nextToolState(
  tool: MonitorTool,
  current: string | undefined,
): string {
  const index = current === undefined ? -1 : tool.states.indexOf(current);
  // The tuple type guarantees at least one state, so the index is always in range.
  return tool.states[(index + 1) % tool.states.length] as string;
}

export function monitorTool(
  rule: MonitorRule | undefined,
  item: string,
): MonitorTool | undefined {
  return rule?.tools.find((tool) => tool.item === item);
}

export function toolBindings(
  rule: MonitorRule,
  bindings: Readonly<Partial<Record<string, ToolBinding>>>,
) {
  const bindingFor = (item: string) =>
    Object.hasOwn(bindings, item) ? bindings[item] : undefined;

  return {
    toolState(item: string): string | undefined {
      const tool = monitorTool(rule, item);
      if (!tool) return undefined;
      const state = bindingFor(item)?.get();
      return state !== undefined && tool.states.includes(state)
        ? state
        : undefined;
    },
    setToolState(item: string, state: string): boolean {
      if (!monitorTool(rule, item)?.states.includes(state)) return false;
      const binding = bindingFor(item);
      if (!binding) return false;
      binding.set(state);
      return true;
    },
  };
}

export class CabMonitor {
  private readonly screen = new SyncedValue<number>();
  // Tools share a cooldown separate from the headlight switch (ADR 0171).
  private readonly toolCooldown = new Debounce(SPEC.toolSwitchCooldown);

  constructor(
    private readonly rule: MonitorRule | undefined,
    private readonly drive: Pick<Drive, "toolState" | "setToolState">,
  ) {}

  resync(): void {
    this.screen.resync();
  }

  commands(held: string | undefined): readonly EngineCommand[] {
    const rule = this.rule;
    if (!rule) return [];
    const value = this.screen.next(
      monitorScreen(rule, held, (item) => this.toolState(item)),
    );
    return value === undefined
      ? []
      : [{ type: "setProperty", name: MONITOR_PROPERTY_NAME, value }];
  }

  /** Only the driver may advance a monitor tool; all tools share an idle cooldown (ADR 0024, 0171). */
  switchTool(isDriver: boolean, item: string, tick: number): boolean {
    const tool = monitorTool(this.rule, item);
    if (!isDriver || !tool || !this.drive.setToolState) return false;
    if (!this.toolCooldown.press(tick)) return false;
    return this.drive.setToolState(
      item,
      nextToolState(tool, this.toolState(item)),
    );
  }

  toolState(item: string): string | undefined {
    return this.drive.toolState?.(item);
  }

  /** Bypasses role and cooldown checks for the server-only test hook (ADR 0171). */
  forceTool(item: string, state: string): boolean {
    return this.drive.setToolState?.(item, state) ?? false;
  }
}

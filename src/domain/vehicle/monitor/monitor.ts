/** A tool the cab monitor shows: its bare item id and its state names, in screen order (ADR 0139). */
interface MonitorTool {
  readonly item: string;
  readonly states: readonly [string, ...string[]];
}

/** What a kind's cab monitor shows (ADR 0139). */
export interface MonitorRule {
  /** The qualified ID of the creative group that holds the tools; a test keeps every tool inside it. */
  readonly group: string;
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

/** InputMode.Touch is "Touch" in @minecraft/server; keep this helper engine-free. */
export function sideFaceHeight(
  reportedY: number,
  inputMode: string | undefined,
): number {
  return inputMode === "Touch" ? 1 - reportedY : reportedY;
}

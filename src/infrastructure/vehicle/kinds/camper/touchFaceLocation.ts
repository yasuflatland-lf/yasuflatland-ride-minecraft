/** iPad touch 1.26.63 mirrors world-axis x/y; InputMode.Touch is "Touch" (ADR 0111). */
export function touchCorrectedFaceLocation(
  location: { x: number; y: number; z: number },
  inputMode: string | undefined,
): { x: number; y: number; z: number } {
  return inputMode === "Touch"
    ? { x: 1 - location.x, y: 1 - location.y, z: location.z }
    : { ...location };
}

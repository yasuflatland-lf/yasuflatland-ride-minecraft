import { isDeepStrictEqual } from "node:util";

type Cube = { rotation?: readonly number[] };

export const multipleAxes = (cube: Cube): boolean =>
  (cube.rotation ?? []).filter((angle) => Math.abs(angle) > 1e-6).length > 1;

export function assertOneAxis<T extends Cube>(
  cubes: readonly T[],
  assemblies: Record<string, readonly T[]>,
): void {
  const members = Object.values(assemblies).flat();
  const offenders = cubes.filter(
    (cube) =>
      multipleAxes(cube) &&
      !members.some((member) => isDeepStrictEqual(cube, member)),
  );
  if (offenders.length > 0) {
    throw new Error(
      `${offenders.length} cubes have compound rotations outside a declared assembly`,
    );
  }
}

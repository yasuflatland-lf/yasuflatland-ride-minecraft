export function checkResourcePackVersion(options: {
  tag: string | undefined;
  changed: boolean;
  generatorInputsChanged?: boolean;
  previousVersion: readonly number[];
  currentVersion: readonly number[];
}): string | null;

export function git(...args: string[]): string;

export function resourcePackChanges(paths: readonly string[]): {
  changed: boolean;
  generatorInputsChanged: boolean;
};

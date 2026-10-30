export interface Outcome {
  readonly pass: boolean;
  readonly detail: string;
  readonly lines?: readonly string[];
}

export interface StepResult extends Outcome {
  readonly name: string;
}

export interface Step {
  readonly name: string;
  readonly run: () => Promise<Outcome>;
}

export type StepSink = (r: StepResult) => void;

export function stepLines(r: StepResult): string[] {
  return [
    `step ${r.name} ${r.pass ? "PASS" : "FAIL"} ${r.detail}`,
    ...(r.lines ?? []).map((line) => `${r.name} ${line}`),
  ];
}

export function outcomeOfSteps(
  expected: readonly string[],
  results: readonly StepResult[],
  options?: { readonly skippedAfter?: string; readonly streamed?: boolean },
): Outcome {
  const passed = expected.filter((name) => {
    const matches = results.filter((r) => r.name === name);
    return matches.length === 1 && matches[0]?.pass;
  }).length;
  const firstFail = results.find((r) => !r.pass);
  const missing = expected.filter(
    (name) => !results.some((r) => r.name === name),
  );
  return {
    pass:
      passed === expected.length &&
      results.every((r) => expected.includes(r.name)),
    detail: `steps=${passed}/${expected.length}${firstFail ? `; first_fail=${firstFail.name}: ${firstFail.detail}` : ""}`,
    lines: [
      ...(options?.streamed ? [] : results.flatMap(stepLines)),
      ...[...new Set(results.map((r) => r.name))].flatMap((name) => [
        ...(expected.includes(name) ? [] : [`step ${name} UNEXPECTED`]),
        ...(results.filter((r) => r.name === name).length > 1
          ? [`step ${name} DUPLICATE`]
          : []),
      ]),
      ...missing.map((name) =>
        options?.skippedAfter !== undefined
          ? `step ${name} SKIP after ${options.skippedAfter}`
          : `step ${name} MISSING`,
      ),
    ],
  };
}

export async function runCourse(
  steps: readonly Step[],
  options?: { readonly stopOnFail?: boolean; readonly onStep?: StepSink },
): Promise<Outcome> {
  const results: StepResult[] = [];
  const sinkFailures: { result: StepResult; error: unknown }[] = [];
  let skippedAfter: string | undefined;
  for (const step of steps) {
    let outcome: Outcome;
    try {
      outcome = await step.run();
    } catch (e) {
      outcome = { pass: false, detail: `error: ${e}` };
    }
    const result = { ...outcome, name: step.name };
    results.push(result);
    try {
      options?.onStep?.(result);
    } catch (error) {
      sinkFailures.push({ result, error });
    }
    if (!result.pass && (options?.stopOnFail ?? true)) {
      skippedAfter = step.name;
      break;
    }
  }
  const outcome = outcomeOfSteps(
    steps.map((step) => step.name),
    results,
    {
      skippedAfter,
      streamed: options?.onStep !== undefined,
    },
  );
  return {
    ...outcome,
    lines: [
      ...sinkFailures.flatMap(({ result, error }) => [
        ...stepLines(result),
        `sink failed for ${result.name}: ${error}`,
      ]),
      ...(outcome.lines ?? []),
    ],
  };
}

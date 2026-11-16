export async function withCleanup<T>(
  run: () => Promise<T>,
  cleanup: () => void | Promise<void>,
): Promise<T> {
  let result: { value: T } | { error: unknown };
  try {
    result = { value: await run() };
  } catch (error) {
    result = { error };
  }
  try {
    await cleanup();
  } catch (error) {
    if ("value" in result) throw error;
  }
  if ("error" in result) throw result.error;
  return result.value;
}

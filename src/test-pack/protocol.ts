// Shared by the in-game runner and scripts/game-test.mjs, so it must stay free
// of @minecraft/server imports and of TypeScript-only syntax that Node's type
// stripping cannot erase. Use .ts specifiers for relative value imports and
// import type for every type-only import so Node can load this module directly.

export const CANCEL_EVENT = "yasu_ride:test_cancel";
export const TEST_EVENT = "yasu_ride:test";
export const LOG_TAG = "[YASU-RIDE-TEST]";
export const MANUAL_RUN_ID = "manual";
export const MAX_LANES = 8;
export const LOCAL_DEFAULT_LANES = 4;
// Script event messages are capped at 2048 characters:
// https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/system#sendscriptevent
export const MESSAGE_LIMIT = 2048;

const RUN_ID = /^[A-Za-z0-9_-]{1,32}$/;
const SHARD = /^([1-9]\d?)\/([1-9]\d?)$/;

/** 1-based, as in `2/3`: the second of three CI jobs. */
export interface Shard {
  index: number;
  total: number;
}

export const WHOLE_RUN: Shard = { index: 1, total: 1 };

export interface RunRequest {
  readonly runId: string;
  readonly shard: Shard;
  readonly lanes: number;
  readonly at: number;
  readonly features?: readonly string[];
}

export function shardFrom(text: string): Shard | undefined {
  const m = SHARD.exec(text);
  if (!m) return undefined;
  const index = Number(m[1]);
  const total = Number(m[2]);
  return index <= total ? { index, total } : undefined;
}

export function lanesFrom(text: string): number | undefined {
  if (!/^[1-9]\d*$/.test(text)) return undefined;
  const value = Number(text);
  return value <= MAX_LANES ? value : undefined;
}

export function defaultLanesOf(
  env: Readonly<Record<string, string | undefined>>,
): number {
  return (
    lanesFrom(env.GAME_TEST_LANES ?? "") ??
    (env.CI || env.GAME_TEST_SHARD ? 1 : LOCAL_DEFAULT_LANES)
  );
}

export function laneIndexFrom(text: string): number | undefined {
  if (!/^(0|[1-9]\d*)$/.test(text)) return undefined;
  const value = Number(text);
  return value < MAX_LANES ? value : undefined;
}

export function featuresFrom(text: string): readonly string[] | undefined {
  const features = text.split(",");
  if (
    features.every((tag) => /^[a-z]+(:[a-z]+)?$/.test(tag)) &&
    new Set(features).size === features.length
  ) {
    return features;
  }
  return undefined;
}

export type ParsedRequest =
  | { readonly ok: true; readonly request: RunRequest }
  | { readonly ok: false; readonly runId: string; readonly error: string };

export function parseRunRequest(message: string): ParsedRequest {
  const [runId = "", ...tokens] = message.trim().split(/\s+/);
  if (!RUN_ID.test(runId)) {
    return {
      ok: true,
      request: { runId: MANUAL_RUN_ID, shard: WHOLE_RUN, lanes: 1, at: 0 },
    };
  }
  let shard = WHOLE_RUN;
  let lanes = 1;
  let at = 0;
  let features: readonly string[] | undefined;
  const seen = new Set<string>();
  const invalid = (token: string): ParsedRequest => ({
    ok: false,
    runId,
    error: `invalid or duplicate token: ${token}`,
  });
  for (const [position, token] of tokens.entries()) {
    const equals = token.indexOf("=");
    const positional = equals === -1;
    if (positional && position !== 0) return invalid(token);
    const key = positional ? "shard" : token.slice(0, equals);
    const value = positional ? token : token.slice(equals + 1);
    if (seen.has(key)) return invalid(token);
    seen.add(key);
    switch (key) {
      case "shard": {
        const parsed = shardFrom(value);
        if (parsed === undefined) return invalid(token);
        shard = parsed;
        break;
      }
      case "lanes": {
        const parsed = lanesFrom(value);
        if (parsed === undefined) return invalid(token);
        lanes = parsed;
        break;
      }
      case "at": {
        const parsed = laneIndexFrom(value);
        if (parsed === undefined) return invalid(token);
        at = parsed;
        break;
      }
      case "features": {
        const parsed = featuresFrom(value);
        if (parsed === undefined) return invalid(token);
        features = parsed;
        break;
      }
      default:
        return invalid(token);
    }
    if (lanes > 1 && at > 0) return invalid(token);
  }
  return {
    ok: true,
    request: {
      runId,
      shard,
      lanes,
      at,
      ...(features === undefined ? {} : { features }),
    },
  };
}

export function formatRunRequest(request: RunRequest): string {
  const { runId, shard, lanes, at, features } = request;
  const tokens = [runId];
  if (shard.index !== WHOLE_RUN.index || shard.total !== WHOLE_RUN.total)
    tokens.push(`shard=${shard.index}/${shard.total}`);
  if (lanes !== 1) tokens.push(`lanes=${lanes}`);
  if (at !== 0) tokens.push(`at=${at}`);
  if (features !== undefined) tokens.push(`features=${features.join(",")}`);
  const message = tokens.join(" ");
  if (message.length > MESSAGE_LIMIT)
    throw new Error(`Run request exceeds MESSAGE_LIMIT (${MESSAGE_LIMIT})`);
  return message;
}

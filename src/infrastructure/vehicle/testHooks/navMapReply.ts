import type { MapDelivery } from "../../shared/filledMaps";

type Reply = { playerId: string } & (
  | { error: string }
  | (MapDelivery & {
      observedBefore: number | undefined;
      observedAfter: number | undefined;
    })
);

function format(reply: Reply): string {
  if ("error" in reply) return `${reply.playerId},error:${reply.error}`;
  const {
    playerId,
    result,
    path,
    before,
    after,
    observedBefore,
    observedAfter,
  } = reply;
  return [
    playerId,
    result,
    path,
    before ?? "-",
    after ?? "-",
    observedBefore ?? "-",
    observedAfter ?? "-",
  ].join(",");
}

function parse(message: string): Reply | undefined {
  const [playerId, result, path, ...counts] = message.split(",");
  if (!playerId || !result) return undefined;
  if (result.startsWith("error:"))
    return {
      playerId,
      error: message.slice(playerId.length + ",error:".length),
    };
  if (
    (result !== "given" && result !== "nothing" && result !== "unknown") ||
    (path !== "give" && path !== "spawn") ||
    counts.length !== 4 ||
    !counts.every(
      (s) => s === "-" || (/^\d+$/.test(s) && Number.isSafeInteger(Number(s))),
    )
  )
    return undefined;
  const [before, after, observedBefore, observedAfter] = counts.map((s) =>
    s === "-" ? undefined : Number(s),
  );
  return {
    playerId,
    result,
    path,
    before,
    after,
    observedBefore,
    observedAfter,
  };
}

export const navMapReply = { format, parse };

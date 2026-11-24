import type { HostedOnTopActions } from "../../../application/camp/hostedKind";
import type { TopHostRegistry } from "../../shared/tableTop/registry";
import { testTableTopRequest } from "../bedrock/tableTopAim";

export function placeTestItemOnTop(
  message: string,
  registry: TopHostRegistry,
  actions: Pick<HostedOnTopActions, "placeOnTop">,
): void {
  const [hostType, ...parts] = message.trim().split(/\s+/);
  const request = testTableTopRequest(parts.join(" "));
  if (!hostType || !request) return;
  const host = registry.host(hostType, request.table);
  if (host)
    actions.placeOnTop(host.type.surface, {
      hostType,
      host: request.table,
      aim: request.aim,
      slot: 0,
    });
}

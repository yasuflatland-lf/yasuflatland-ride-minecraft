import { sizeOf } from "../../src/domain/build/box";
import {
  type BaseHeightFlow,
  type BuildFlow,
  confirmLiveHeight,
} from "../../src/domain/build/flow/flow";

export function confirmEndpointHeight(flow: BuildFlow): BuildFlow {
  if (flow.kind !== "baseHeight") return flow;
  const original: BaseHeightFlow = {
    ...flow,
    previous: sizeOf(flow.selection.box).y,
  };
  return confirmLiveHeight(original);
}

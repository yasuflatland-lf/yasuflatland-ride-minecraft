import { BedrockGasLanternWorld as GasLanternWorld } from "../../src/infrastructure/camp/bedrock/bedrockGasLanternWorld";
import { campTopHosts } from "./campTopHosts";

/** Supplies the install-time registry to the unchanged tabletop regression tests. */
export class BedrockGasLanternWorld extends GasLanternWorld {
  constructor(
    deps: Omit<ConstructorParameters<typeof GasLanternWorld>[0], "topHosts">,
    light: ConstructorParameters<typeof GasLanternWorld>[1],
  ) {
    super({ ...deps, topHosts: campTopHosts() }, light);
  }
}

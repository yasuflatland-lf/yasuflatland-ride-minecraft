import { cubeVolume } from "./cube";
import type { HeightedVolume } from "./geometry";

export const copyVolume: HeightedVolume = { ...cubeVolume };

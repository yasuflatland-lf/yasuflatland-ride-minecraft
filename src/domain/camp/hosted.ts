import { decodeHost } from "../shared/hosted";
import { TABLE_SPOTS } from "./spec";

const campHosts = {
  spotHostTypes: new Set(["fire_pit"]),
  legacySpot: (type: string, spot: number) =>
    type === "camp_table" ? TABLE_SPOTS[spot] : undefined,
};

export function decodeCampHost(text: string) {
  return decodeHost(text, campHosts);
}

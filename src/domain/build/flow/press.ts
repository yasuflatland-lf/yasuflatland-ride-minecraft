import { acceptsAnyItemUse, type BuildFlow, opensUtilityMenu } from "./flow";

export type PressRole = "wand" | "pasteRotate" | "pastePlace" | "undo";
export type PressRoute = "itemUse" | "blockInteract";
export type PressTarget = "air" | "block" | "none";
export type PressIntent =
  | { kind: "selectPoint" } // Send the tapped block to point selection.
  | { kind: "fixEndpoint" } // Try to fix the virtual endpoint from the aim ray.
  | { kind: "openUtilityMenu" } // Offer the available utility actions.
  | { kind: "confirmLiveHeight" }
  | { kind: "fixStairGoal" }
  | { kind: "aimHeight" } // Confirm the aimed height and advance the height step.
  | { kind: "pasteAim" } // Handle the wand's paste gesture or direct Paste Place.
  | { kind: "undo" } // Request undo of the last edit.
  | { kind: "rotateSelection" }
  | { kind: "rotateClipboard" } // Turn the clipboard for the next paste.
  | { kind: "ignore" }; // Take no build action, even if the event is canceled.

export function routePress({
  flow,
  role,
  route,
  target,
  sneaking,
}: {
  flow: BuildFlow;
  role: PressRole;
  route: PressRoute;
  target: PressTarget;
  sneaking: boolean;
}): PressIntent {
  switch (role) {
    case "undo":
      return { kind: "undo" };
    case "pasteRotate":
      return {
        kind: flow.kind === "selected" ? "rotateSelection" : "rotateClipboard",
      };
    case "pastePlace":
      return { kind: "pasteAim" };
  }

  if (flow.kind === "pasteAim")
    return { kind: route === "itemUse" ? "pasteAim" : "ignore" };

  if (flow.kind === "stairContents") return { kind: "ignore" };
  if (flow.kind === "stairAim") return { kind: "fixStairGoal" };

  if (route === "itemUse" && target !== "air" && !acceptsAnyItemUse(flow))
    return { kind: "ignore" };
  if (flow.kind === "baseHeight") return { kind: "confirmLiveHeight" };
  if (flow.kind === "heightStep") return { kind: "aimHeight" };
  if (route === "blockInteract")
    return {
      kind: flow.kind === "selected" ? "openUtilityMenu" : "selectPoint",
    };
  return {
    kind: opensUtilityMenu(flow, sneaking) ? "openUtilityMenu" : "fixEndpoint",
  };
}

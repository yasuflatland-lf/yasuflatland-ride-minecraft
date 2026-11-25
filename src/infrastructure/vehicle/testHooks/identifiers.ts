import { id } from "../../shared/identifiers";

/** Server-only test tool messages use "<vehicleId>,<bare item id>,<state>" (ADR 0171). */
export const TEST_EQUIPMENT_EVENT = /* @__PURE__ */ id("test_tool");
/** Test held-item messages have the form "<vehicleId>,<full namespaced item id>" or "<vehicleId>,clear" (ADR 0139, 0181). */
export const TEST_HELD_ITEM_EVENT = /* @__PURE__ */ id("test_held_item");

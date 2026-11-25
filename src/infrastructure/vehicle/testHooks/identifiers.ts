import { id } from "../../shared/identifiers";

/** Server-only test tool messages use "<vehicleId>,<bare item id>,<state>" (ADR 0171). */
export const TEST_EQUIPMENT_EVENT = /* @__PURE__ */ id("test_tool");
/** Test held-item messages have the form "<vehicleId>,<full namespaced item id>" or "<vehicleId>,clear" (ADR 0139, 0181). */
export const TEST_HELD_ITEM_EVENT = /* @__PURE__ */ id("test_held_item");

export const TEST_BOOST_EVENT = /* @__PURE__ */ id("test_boost");
export const TEST_BOOST_RESULT_EVENT = /* @__PURE__ */ id("test_boost_result");

export const TEST_NAV_EVENT = /* @__PURE__ */ id("test_nav");
export const TEST_NAV_RESULT = /* @__PURE__ */ id("test_nav_result");

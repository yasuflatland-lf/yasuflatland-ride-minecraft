import type { Logger } from "../../application/shared/ports/logger";
import { NAMESPACE } from "./identifiers";

export const consoleLogger: Logger = {
  warn: (message) => console.warn(`[${NAMESPACE}] ${message}`),
};

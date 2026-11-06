// Logging port shared by every feature; implemented in the infrastructure layer (ADR 0012).

export interface Logger {
  warn(message: string): void;
}

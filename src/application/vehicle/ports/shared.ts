// Services every vehicle use case may need; implemented in the infrastructure layer (ADR 0012).

export interface Logger {
  warn(message: string): void;
}

/** The current game tick (one tick is 1/20 s). */
export interface Clock {
  now(): number;
}

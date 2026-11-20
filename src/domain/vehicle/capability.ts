declare const capabilityType: unique symbol;

/** A typed name a kind uses to offer an optional capability, compared by identity. */
export interface CapabilityKey<T> {
  readonly name: string;
  readonly [capabilityType]?: T;
}

export function capabilityKey<T>(name: string): CapabilityKey<T> {
  return Object.freeze({ name });
}

export function offer<T, U>(
  asked: CapabilityKey<T>,
  offered: CapabilityKey<U>,
  value: U,
): T | undefined {
  // The shared key establishes the value type despite the independent type parameters.
  return Object.is(asked, offered) ? (value as unknown as T) : undefined;
}

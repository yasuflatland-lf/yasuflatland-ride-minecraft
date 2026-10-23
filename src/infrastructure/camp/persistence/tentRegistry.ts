// Keeps the world's pitched tents in a world dynamic property, so the limit and
// the camp space survive /reload and server restarts (ADR 0131).
import { world } from "@minecraft/server";
import type { TentId } from "../../../domain/camp/tent";
import {
  parseTents,
  serializeTents,
  type TentEntry,
  withoutTent,
  withTent,
} from "../../../domain/camp/tentRegistry";
import { TENTS_PROPERTY } from "../identifiers";

export class DynamicPropertyTentRegistry {
  private list: TentEntry[] | undefined;

  all(): readonly TentEntry[] {
    // Read on first use: world properties cannot be read in early execution,
    // when the script loads.
    this.list ??= parseTents(world.getDynamicProperty(TENTS_PROPERTY));
    return this.list;
  }

  add(entry: TentEntry): void {
    this.save(withTent(this.all(), entry));
  }

  remove(id: TentId): void {
    if (!this.all().some((e) => e.id === id)) return;
    this.save(withoutTent(this.all(), id));
  }

  private save(list: TentEntry[]): void {
    this.list = list;
    world.setDynamicProperty(TENTS_PROPERTY, serializeTents(list));
  }
}

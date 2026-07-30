import { describe, expect, it } from "vitest";
import { initialState } from "./domain/initialState";
import { normalizeState } from "./storage";

describe("normalizeState", () => {
  it("preserves an intentionally empty queue", () => {
    const state = {
      ...structuredClone(initialState),
      players: [{ id: "A", name: "A", level: "human" as const, active: true }],
      queue: []
    };
    expect(normalizeState(state).queue).toEqual([]);
  });
});

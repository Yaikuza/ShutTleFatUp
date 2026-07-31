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

  it("starts at round one on a new Bangkok day without deleting history", () => {
    const history = [{
      id: "old-match",
      round: 4,
      courtId: 1,
      teamA: ["A", "B"] as [string, string],
      teamB: ["C", "D"] as [string, string],
      winner: "A" as const,
      playedAt: "2026-01-01T12:00:00.000Z"
    }];
    const state = {
      ...structuredClone(initialState),
      playDate: "2000-01-01",
      players: ["A", "B", "C", "D"].map(id => ({
        id, name: id, level: "human" as const, active: true
      })),
      queue: [],
      round: 9,
      schedule: [{ id: "A|B", members: ["A", "B"] as [string, string] }],
      pairGames: { "A|B": 1 },
      courts: [{
        ...initialState.courts[0],
        status: "playing" as const,
        teamA: ["A", "B"] as [string, string],
        teamB: ["C", "D"] as [string, string]
      }],
      history
    };

    const next = normalizeState(state);

    expect(next.round).toBe(1);
    expect(next.schedule).toEqual([]);
    expect(next.pairGames).toEqual({});
    expect(next.courts[0].status).toBe("waiting");
    expect(next.queue).toEqual(["A", "B", "C", "D"]);
    expect(next.history).toEqual(history);
  });
});

import { describe, expect, it } from "vitest";
import { initialState } from "../domain/initialState";
import type { AppState } from "../domain/types";
import { availableScheduleRounds, roundPairViews } from "./roundScheduleView";

describe("round schedule history view", () => {
  const state: AppState = {
    ...structuredClone(initialState),
    round: 2,
    schedule: [{ id: "A|C", members: ["A", "C"] }],
    pairGames: { "A|C": 1 },
    history: [{
      id: "game-1",
      round: 1,
      courtId: 1,
      teamA: ["A", "B"],
      teamB: ["C", "D"],
      winner: "A",
      playedAt: "2026-08-20T10:00:00.000Z"
    }, {
      id: "game-2",
      round: 1,
      courtId: 1,
      teamA: ["A", "B"],
      teamB: ["E", "F"],
      winner: "B",
      playedAt: "2026-08-20T10:10:00.000Z"
    }]
  };

  it("lists historical rounds together with the current round", () => {
    expect(availableScheduleRounds(state)).toEqual([1, 2]);
  });

  it("reconstructs unique historical pairs and their actual game counts", () => {
    expect(roundPairViews(state, 1)).toEqual([
      { id: "A|B", members: ["A", "B"], games: 2 },
      { id: "C|D", members: ["C", "D"], games: 1 },
      { id: "E|F", members: ["E", "F"], games: 1 }
    ]);
  });

  it("uses the live schedule for the current round", () => {
    expect(roundPairViews(state, 2)).toEqual([
      { id: "A|C", members: ["A", "C"], games: 1 }
    ]);
  });
});

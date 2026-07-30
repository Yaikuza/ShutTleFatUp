import { describe, expect, it } from "vitest";
import { appReducer } from "./appReducer";
import { initialState } from "../domain/initialState";
import type { AppState } from "../domain/types";

const state: AppState = {
  ...structuredClone(initialState),
  players: [
    { id: "A", name: "A", level: "human", active: true },
    { id: "B", name: "B", level: "human", active: false },
    { id: "C", name: "C", level: "human", active: true }
  ],
  queue: ["A", "C"],
  round: 8
};

describe("appReducer session controls", () => {
  it("resets the session without deleting players or settings", () => {
    const reset = appReducer(state, { type: "session/reset" });
    expect(reset.players).toEqual(state.players);
    expect(reset.settings).toEqual(state.settings);
    expect(reset.queue).toEqual(["A", "C"]);
    expect(reset.round).toBe(1);
  });

  it("reorders the queue by player identity", () => {
    const moved = appReducer(state, { type: "queue/reorder", fromId: "A", toId: "C" });
    expect(moved.queue).toEqual(["C", "A"]);
  });

  it("does not pause a player who is currently on court", () => {
    const playing: AppState = {
      ...state,
      courts: [{ ...state.courts[0], status: "playing", teamA: ["A", "C"], teamB: ["B", "A"] }]
    };
    expect(appReducer(playing, { type: "player/toggle", id: "A" })).toBe(playing);
  });

  it("returns players when reducing the number of courts", () => {
    const playing: AppState = {
      ...state,
      settings: { ...state.settings, courtCount: 2 },
      queue: [],
      courts: [
        state.courts[0],
        { ...state.courts[1], status: "playing", teamA: ["A", "C"], teamB: ["B", "A"] }
      ]
    };
    const reduced = appReducer(playing, { type: "settings/update", patch: { courtCount: 1 } });
    expect(reduced.queue).toEqual(expect.arrayContaining(["A", "B", "C"]));
  });
});

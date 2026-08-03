import { describe, expect, it } from "vitest";
import { appReducer } from "./appReducer";
import { LIBERO } from "../domain/engine";
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

  it("moves the remaining partner into an existing Libero pair when pausing", () => {
    const scheduled: AppState = {
      ...state,
      players: [
        ...state.players,
        { id: "D", name: "D", level: "human", active: true }
      ],
      queue: ["A", "C", "D"],
      schedule: [
        { id: "A|C", members: ["A", "C"] },
        { id: "D|LIBERO", members: ["D", LIBERO] }
      ],
      pairGames: { "A|C": 1, "D|LIBERO": 1 }
    };

    const paused = appReducer(scheduled, { type: "player/toggle", id: "A" });

    expect(paused.schedule).toEqual([{ id: "C|D", members: ["D", "C"] }]);
    expect(paused.queue).toEqual(["C", "D"]);
    expect(paused.pairGames).toEqual({});
    expect(paused.players.find(player => player.id === "A")?.active).toBe(false);
  });

  it("replaces a paused player with Libero when no Libero pair exists", () => {
    const scheduled: AppState = {
      ...state,
      schedule: [{ id: "A|C", members: ["A", "C"] }],
      pairGames: { "A|C": 1 }
    };

    const paused = appReducer(scheduled, { type: "player/toggle", id: "A" });

    expect(paused.schedule).toEqual([{ id: "C|LIBERO", members: ["C", LIBERO] }]);
    expect(paused.pairGames).toEqual({});
  });

  it("fills an existing Libero slot when reactivating a player", () => {
    const scheduled: AppState = {
      ...state,
      schedule: [{ id: "A|LIBERO", members: ["A", LIBERO] }],
      pairGames: { "A|LIBERO": 1 }
    };

    const activated = appReducer(scheduled, { type: "player/toggle", id: "B" });

    expect(activated.schedule).toEqual([{ id: "A|B", members: ["A", "B"] }]);
    expect(activated.queue).toEqual(["A", "C", "B"]);
    expect(activated.pairGames).toEqual({});
  });

  it("checks a player into the queue without adding duplicates", () => {
    const checkedIn = appReducer(state, { type: "player/checkin", id: "B" });
    expect(checkedIn.players.find(player => player.id === "B")?.active).toBe(true);
    expect(checkedIn.queue).toEqual(["A", "C", "B"]);
    expect(appReducer(checkedIn, { type: "player/checkin", id: "B" }).queue).toEqual(["A", "C", "B"]);
  });

  it("selects the play event used as the current match session", () => {
    const selected = appReducer(state, { type: "play-day/select", eventId: "event-1" });
    expect(selected.activePlayEventId).toBe("event-1");
    expect(selected.queue).toEqual([]);
    expect(selected.players.every(player => !player.active)).toBe(true);
    expect(selected.roomQueue).toEqual(state.queue);
    expect(appReducer(selected, { type: "play-day/select", eventId: "event-1" })).toBe(selected);
  });

  it("ends an event session without deleting players or history", () => {
    const session = appReducer(state, { type: "play-day/select", eventId: "event-1" });
    const ended = appReducer(session, { type: "play-day/end" });
    expect(ended.activePlayEventId).toBeNull();
    expect(ended.queue).toEqual([]);
    expect(ended.players).toEqual(state.players.map(player => ({ ...player, active: false })));
    expect(ended.history).toEqual(state.history);
    expect(ended.roomQueue).toEqual(state.queue);
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

import { describe, expect, it } from "vitest";
import { createPairs, fillCourt, finishMatch, LIBERO, projectedRoundComplete, setCustomMatch, teamsCanPlay } from "./engine";
import { initialState } from "./initialState";
import type { AppState, Pair, Player, Team } from "./types";

function stateWithPlayers(levels: Array<Player["level"]>): AppState {
  const players = levels.map((level, index) => ({
    id: String.fromCharCode(65 + index),
    name: String.fromCharCode(65 + index),
    level,
    active: true
  }));
  return {
    ...structuredClone(initialState),
    players,
    queue: players.map(player => player.id)
  };
}

describe("createPairs", () => {
  it("creates exactly one Libero pair for an odd normal pool", () => {
    const state = stateWithPlayers(["human", "human", "human", "human", "human"]);
    const pairs = createPairs(state, state.queue);
    expect(pairs).toHaveLength(3);
    expect(pairs.filter(pair => pair.members.includes(LIBERO))).toHaveLength(1);
  });

  it("never creates a Hell + Heaven team in Hellven mode", () => {
    const state = {
      ...stateWithPlayers(["hell", "hell", "human", "human", "heaven", "heaven", "human"]),
      settings: { ...initialState.settings, hellvenMode: true }
    };
    const pairs = createPairs(state, state.queue);
    for (const pair of pairs) {
      const levels = pair.members
        .filter(member => member !== LIBERO)
        .map(id => state.players.find(player => player.id === id)?.level);
      expect(levels.includes("hell") && levels.includes("heaven")).toBe(false);
    }
  });
});

describe("court rotation", () => {
  it("keeps a winner below the limit and rotates in the Libero pair", () => {
    const base = stateWithPlayers(["human", "human", "human", "human", "human"]);
    const pairs: Pair[] = [
      { id: "A|B", members: ["A", "B"] },
      { id: "C|D", members: ["C", "D"] },
      { id: "E|LIBERO", members: ["E", LIBERO] }
    ];
    let state: AppState = {
      ...base,
      settings: { ...base.settings, lowPlayerMode: "off" },
      schedule: pairs
    };
    state = fillCourt(state, 1);
    const firstCourt = state.courts[0];
    expect(firstCourt.status).toBe("playing");
    state = fillCourt(finishMatch(state, 1, "A"), 1);
    const nextCourt = state.courts[0];
    expect(nextCourt.status).toBe("playing");
    expect([nextCourt.teamA, nextCourt.teamB].some(team => team?.includes(LIBERO))).toBe(true);
  });

  it("keeps the borrowed Libero player in match history", () => {
    const base = stateWithPlayers(["human", "human", "human", "human", "human"]);
    const state: AppState = {
      ...base,
      courts: [{
        ...base.courts[0],
        status: "playing",
        teamA: ["A", LIBERO],
        teamB: ["B", "C"],
        liberoA: "D"
      }]
    };
    const finished = finishMatch(state, 1, "A");
    expect(finished.history[0].liberoA).toBe("D");
  });

  it("counts an active final game when projecting round completion", () => {
    const base = stateWithPlayers(["human", "human", "human", "human"]);
    const teamA: Team = ["A", "B"];
    const teamB: Team = ["C", "D"];
    const state: AppState = {
      ...base,
      schedule: [
        { id: "A|B", members: teamA },
        { id: "C|D", members: teamB }
      ],
      pairGames: { "A|B": 1, "C|D": 1 },
      courts: [{
        ...base.courts[0],
        status: "playing",
        teamA,
        teamB
      }]
    };
    expect(projectedRoundComplete(state)).toBe(true);
  });
});

describe("Hellven court compatibility", () => {
  it("allows Human against either flag but blocks Hell against Heaven", () => {
    const state = {
      ...stateWithPlayers(["hell", "human", "heaven", "human"]),
      settings: { ...initialState.settings, hellvenMode: true }
    };
    expect(teamsCanPlay(state, ["A", "B"], ["C", "D"])).toBe(false);
    expect(teamsCanPlay(state, ["B", "D"], ["A", LIBERO])).toBe(true);
    expect(teamsCanPlay(state, ["B", "D"], ["C", LIBERO])).toBe(true);
  });
});

describe("court safety", () => {
  it("does not pull a player from another playing court into a custom match", () => {
    const base = stateWithPlayers(["human", "human", "human", "human", "human"]);
    const state: AppState = {
      ...base,
      courts: [
        { ...base.courts[0], status: "playing", teamA: ["A", "B"], teamB: ["C", "D"] },
        { ...base.courts[1] }
      ]
    };
    expect(setCustomMatch(state, 2, ["A", "B", "C", "E"])).toBe(state);
  });

  it("fills directly from the queue when low-player mode is enabled", () => {
    const state = {
      ...stateWithPlayers(["human", "human", "human", "human"]),
      settings: { ...initialState.settings, lowPlayerMode: "on" as const }
    };
    const filled = fillCourt(state, 1);
    expect(filled.courts[0].status).toBe("playing");
    expect(filled.schedule).toHaveLength(0);
  });

  it("rotates away from the most recently borrowed Libero when possible", () => {
    const base = stateWithPlayers([
      "human", "human", "human", "human", "human", "human", "human", "human"
    ]);
    const state: AppState = {
      ...base,
      queue: ["A", "B", "C", "D", "E", "F", "G", "H"],
      history: [{
        id: "previous",
        round: 1,
        courtId: 1,
        teamA: ["A", LIBERO],
        teamB: ["B", "C"],
        liberoA: "D",
        winner: "A",
        playedAt: "2026-07-31T00:00:00.000Z"
      }],
      schedule: [
        { id: "A|LIBERO", members: ["A", LIBERO] },
        { id: "B|C", members: ["B", "C"] }
      ],
      settings: { ...base.settings, lowPlayerMode: "off" }
    };
    const filled = fillCourt(state, 1);
    expect(filled.courts[0].liberoA).not.toBe("D");
  });
});

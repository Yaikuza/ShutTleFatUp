import { describe, expect, it, vi } from "vitest";
import { appReducer } from "../app/appReducer";
import { assignLibero, createPairs, fillCourt, finishMatch, LIBERO, projectedRoundComplete, realMembers, setCourtLibero, setCustomMatch, teamsCanPlay } from "./engine";
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

  it("keeps a right-side winner on the right", () => {
    const base = stateWithPlayers(["human", "human", "human", "human", "human", "human"]);
    const state: AppState = {
      ...base,
      settings: { ...base.settings, lowPlayerMode: "off" },
      queue: ["E", "F"],
      schedule: [
        { id: "A|B", members: ["A", "B"] },
        { id: "C|D", members: ["C", "D"] },
        { id: "E|F", members: ["E", "F"] }
      ],
      courts: [{
        ...base.courts[0],
        status: "playing",
        teamA: ["A", "B"],
        teamB: ["C", "D"]
      }]
    };
    const next = fillCourt(finishMatch(state, 1, "B"), 1);
    expect(next.courts[0].teamA).toEqual(["E", "F"]);
    expect(next.courts[0].teamB).toEqual(["C", "D"]);
  });

  it("keeps the borrowed Libero player in match history", () => {
    const base = stateWithPlayers(["human", "human", "human", "human", "human"]);
    const state: AppState = {
      ...base,
      activePlayEventId: "event-1",
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
    expect(finished.history[0].playEventId).toBe("event-1");
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

  it("does not let a newly filled old-round match trigger the next round", () => {
    const base = stateWithPlayers([
      "human", "human", "human", "human", "human", "human",
      "human", "human", "human", "human", "human", "human"
    ]);
    const state: AppState = {
      ...base,
      settings: { ...base.settings, gamesPerPair: 2, lowPlayerMode: "off" },
      queue: ["I", "J", "K", "L"],
      schedule: [
        { id: "A|B", members: ["A", "B"] },
        { id: "C|D", members: ["C", "D"] },
        { id: "E|F", members: ["E", "F"] },
        { id: "G|H", members: ["G", "H"] },
        { id: "I|J", members: ["I", "J"] },
        { id: "K|L", members: ["K", "L"] }
      ],
      pairGames: {
        "A|B": 1, "C|D": 1, "E|F": 1,
        "G|H": 1, "I|J": 1, "K|L": 1
      },
      courts: [
        {
          ...base.courts[0],
          status: "playing",
          teamA: ["A", "B"],
          teamB: ["C", "D"],
          startedRound: 1
        },
        {
          ...base.courts[1],
          status: "playing",
          teamA: ["E", "F"],
          teamB: ["G", "H"],
          startedRound: 1
        }
      ]
    };

    const next = appReducer(state, { type: "match/finish", courtId: 1, winner: "A" });

    expect(next.round).toBe(1);
    expect(next.courts[0]).toMatchObject({
      status: "playing",
      teamA: ["I", "J"],
      teamB: ["K", "L"],
      startedRound: 1
    });
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
  it("replaces selected players in the current schedule without duplicates", () => {
    const base = stateWithPlayers(["human", "human", "human", "human", "human", "human", "human", "human"]);
    const state: AppState = {
      ...base,
      queue: ["A", "B", "C", "D", "E", "F", "G", "H"],
      schedule: [
        { id: "A|E", members: ["A", "E"] },
        { id: "B|F", members: ["B", "F"] },
        { id: "C|G", members: ["C", "G"] },
        { id: "D|H", members: ["D", "H"] }
      ],
      pairGames: { "A|E": 1, "B|F": 1, "C|G": 1, "D|H": 1 }
    };

    const next = setCustomMatch(state, 1, ["A", "B", "C", "D"]);
    const realIds = next.schedule.flatMap(pair => realMembers(pair.members));

    expect(next.schedule.slice(0, 2).map(pair => pair.id)).toEqual(["A|B", "C|D"]);
    expect(new Set(realIds).size).toBe(realIds.length);
    expect(new Set(realIds)).toEqual(new Set(["A", "B", "C", "D", "E", "F", "G", "H"]));
    expect(next.queue).toEqual(["E", "F", "G", "H"]);
    expect(next.pairGames).toEqual({});
  });

  it("preserves an unaffected playing court and its pair scores in a custom match", () => {
    const base = stateWithPlayers(["human", "human", "human", "human", "human", "human", "human", "human"]);
    const state: AppState = {
      ...base,
      queue: ["E", "F", "G", "H"],
      schedule: [
        { id: "A|B", members: ["A", "B"] },
        { id: "C|D", members: ["C", "D"] },
        { id: "E|F", members: ["E", "F"] },
        { id: "G|H", members: ["G", "H"] }
      ],
      pairGames: { "A|B": 1, "C|D": 1, "E|F": 1 },
      courts: [
        { ...base.courts[0], status: "playing", teamA: ["A", "B"], teamB: ["C", "D"], startedRound: 1 },
        { ...base.courts[1] }
      ]
    };

    const next = setCustomMatch(state, 2, ["E", "G", "F", "H"]);

    expect(next.courts[0]).toEqual(state.courts[0]);
    expect(next.schedule.map(pair => pair.id)).toEqual(["E|G", "F|H", "A|B", "C|D"]);
    expect(next.pairGames).toEqual({ "A|B": 1, "C|D": 1 });
  });

  it("uses scheduled leftovers after a custom match even when the queue is below the low-player threshold", () => {
    const base = stateWithPlayers(["human", "human", "human", "human", "human", "human", "human", "human"]);
    const state: AppState = {
      ...base,
      settings: { ...base.settings, gamesPerPair: 1, lowPlayerMode: "auto", lowPlayerThreshold: 10 },
      queue: ["E", "F", "G", "H"],
      schedule: [
        { id: "A|B", members: ["A", "B"] },
        { id: "C|D", members: ["C", "D"] },
        { id: "E|F", members: ["E", "F"] },
        { id: "G|H", members: ["G", "H"] }
      ],
      courts: [{
        ...base.courts[0],
        status: "playing",
        teamA: ["A", "B"],
        teamB: ["C", "D"],
        startedRound: 1
      }]
    };

    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const next = fillCourt(finishMatch(state, 1, "A"), 1);
    random.mockRestore();

    expect(next.courts[0].status).toBe("playing");
    expect([next.courts[0].teamA, next.courts[0].teamB]).toEqual(expect.arrayContaining([["E", "F"], ["G", "H"]]));
  });

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

  it("allows an active off-queue player to be selected manually as Libero", () => {
    const base = stateWithPlayers(["human", "human", "human"]);
    const state: AppState = {
      ...base,
      queue: ["B"],
      courts: [{
        ...base.courts[0],
        status: "playing",
        teamA: ["A", LIBERO],
        teamB: ["B", "C"]
      }]
    };
    expect(setCourtLibero(state, 1, "A", "C").courts[0].liberoA).toBeNull();
    const available: AppState = {
      ...state,
      courts: [{ ...state.courts[0], status: "playing", teamA: ["A", LIBERO], teamB: null }]
    };
    expect(setCourtLibero(available, 1, "A", "C").courts[0].liberoA).toBe("C");
  });

  it("does not use a Libero borrowed by another court in a custom match", () => {
    const base = stateWithPlayers([
      "human", "human", "human", "human", "human", "human", "human", "human", "human"
    ]);
    const state: AppState = {
      ...base,
      courts: [
        {
          ...base.courts[0],
          status: "playing",
          teamA: ["A", LIBERO],
          teamB: ["B", "C"],
          liberoA: "I"
        },
        { ...base.courts[1] }
      ]
    };
    expect(setCustomMatch(state, 2, ["D", "E", "F", "I"])).toBe(state);
  });

  it("does not borrow the same Libero for two courts", () => {
    const base = stateWithPlayers([
      "human", "human", "human", "human", "human", "human", "human", "human", "human"
    ]);
    const state: AppState = {
      ...base,
      courts: [
        {
          ...base.courts[0],
          status: "playing",
          teamA: ["A", LIBERO],
          teamB: ["B", "C"],
          liberoA: "I"
        },
        {
          ...base.courts[1],
          status: "playing",
          teamA: ["D", LIBERO],
          teamB: ["E", "F"]
        }
      ]
    };
    expect(setCourtLibero(state, 2, "A", "I")).toBe(state);
  });

  it("keeps the previous Libero when no alternative is available", () => {
    const base = stateWithPlayers(["human", "human", "human", "human"]);
    const court = {
      ...base.courts[0],
      status: "playing" as const,
      teamA: ["A", LIBERO] as Team,
      teamB: ["B", "C"] as Team,
      liberoA: "D"
    };
    const state: AppState = {
      ...base,
      queue: ["A", "B", "D"],
      courts: [court]
    };
    expect(assignLibero(state, court, court.teamA, "A")).toBe("D");
  });

  it("does not assign one player as Libero on both sides of a court", () => {
    const base = stateWithPlayers(["human", "human", "human", "human", "human"]);
    const court = {
      ...base.courts[0],
      status: "playing" as const,
      teamA: ["A", LIBERO] as Team,
      teamB: ["B", LIBERO] as Team,
      liberoA: "D"
    };
    const state: AppState = {
      ...base,
      queue: ["A", "B", "D", "E"],
      courts: [court]
    };
    expect(assignLibero(state, court, court.teamB, "B")).toBe("E");
  });
});

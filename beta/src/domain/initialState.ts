import type { AppState, Court } from "./types";

export function createCourt(id: number): Court {
  return {
    id,
    status: "waiting",
    teamA: null,
    teamB: null,
    liberoA: null,
    liberoB: null,
    startedRound: 1
  };
}

export const initialState: AppState = {
  schemaVersion: 2,
  players: [],
  queue: [],
  courts: [createCourt(1), createCourt(2)],
  round: 1,
  schedule: [],
  pairGames: {},
  history: [],
  settings: {
    gamesPerPair: 2,
    hellvenMode: false,
    courtCount: 2
  }
};

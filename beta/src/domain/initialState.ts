import type { AppState, Court } from "./types";
import { bangkokDateKey } from "./date";

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
  playDate: bangkokDateKey(),
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
    courtCount: 2,
    lowPlayerMode: "auto",
    lowPlayerThreshold: 6,
    theme: "dark",
    courtColor: "#2d8a4e",
    courtColumns: 0
  }
};

import type { AppState } from "./types";

export const initialState: AppState = {
  schemaVersion: 2,
  players: [],
  queue: [],
  round: 1,
  pairs: [],
  matches: []
};

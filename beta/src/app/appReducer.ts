import type { AppState } from "../domain/types";

export type AppAction =
  | { type: "session/loaded"; payload: AppState }
  | { type: "round/started" }
  | { type: "session/reset" };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "session/loaded":
      return action.payload;
    case "round/started":
      return { ...state, round: state.round + 1, pairs: [] };
    case "session/reset":
      return {
        schemaVersion: 2,
        players: [],
        queue: [],
        round: 1,
        pairs: [],
        matches: []
      };
    default:
      return state;
  }
}

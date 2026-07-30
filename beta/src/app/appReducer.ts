import { addPlayer, fillCourt, finishMatch, projectedRoundComplete, setCustomMatch, startRound } from "../domain/engine";
import { createCourt, initialState } from "../domain/initialState";
import type { AppState, PlayerLevel, Settings } from "../domain/types";

export type AppAction =
  | { type: "state/replace"; state: AppState }
  | { type: "player/add"; name: string }
  | { type: "player/toggle"; id: string }
  | { type: "player/level"; id: string; level: PlayerLevel }
  | { type: "queue/shuffle" }
  | { type: "round/start" }
  | { type: "court/fill"; courtId: number }
  | { type: "court/custom"; courtId: number; members: [string, string, string, string] }
  | { type: "match/finish"; courtId: number; winner: "A" | "B" }
  | { type: "settings/update"; patch: Partial<Settings> }
  | { type: "session/reset" };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "state/replace":
      return action.state;
    case "player/add":
      return addPlayer(state, action.name);
    case "player/toggle": {
      const active = !state.players.find(player => player.id === action.id)?.active;
      return {
        ...state,
        players: state.players.map(player => player.id === action.id ? { ...player, active } : player),
        queue: active
          ? [...state.queue, action.id]
          : state.queue.filter(id => id !== action.id)
      };
    }
    case "player/level":
      return {
        ...state,
        players: state.players.map(player => player.id === action.id ? { ...player, level: action.level } : player)
      };
    case "queue/shuffle":
      return { ...state, queue: [...state.queue].sort(() => Math.random() - 0.5) };
    case "round/start":
      return startRound(state);
    case "court/fill":
      return fillCourt(state, action.courtId);
    case "court/custom":
      return setCustomMatch(state, action.courtId, action.members);
    case "match/finish": {
      let next = fillCourt(finishMatch(state, action.courtId, action.winner), action.courtId);
      if (projectedRoundComplete(next)) next = startRound(next);
      return next;
    }
    case "settings/update": {
      const settings = { ...state.settings, ...action.patch };
      const courts = Array.from({ length: settings.courtCount }, (_, index) =>
        state.courts[index] ?? createCourt(index + 1)
      );
      return { ...state, settings, courts };
    }
    case "session/reset":
      return structuredClone(initialState);
    default:
      return state;
  }
}

import { addPlayer, fillCourt, finishMatch, projectedRoundComplete, replaceCourt, setCourtLibero, setCustomMatch, startRound } from "../domain/engine";
import { createCourt, initialState } from "../domain/initialState";
import type { AppState, PlayerLevel, Settings } from "../domain/types";

export type AppAction =
  | { type: "state/replace"; state: AppState }
  | { type: "player/add"; name: string }
  | { type: "player/toggle"; id: string }
  | { type: "player/level"; id: string; level: PlayerLevel }
  | { type: "queue/shuffle" }
  | { type: "queue/move"; id: string; direction: -1 | 1 }
  | { type: "queue/clear" }
  | { type: "player/remove"; id: string }
  | { type: "round/start" }
  | { type: "court/fill"; courtId: number }
  | { type: "court/custom"; courtId: number; members: [string, string, string, string] }
  | { type: "court/replace"; courtId: number }
  | { type: "court/libero"; courtId: number; side: "A" | "B"; playerId: string }
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
    case "queue/move": {
      const from = state.queue.indexOf(action.id);
      const to = from + action.direction;
      if (from < 0 || to < 0 || to >= state.queue.length) return state;
      const queue = [...state.queue];
      [queue[from], queue[to]] = [queue[to], queue[from]];
      return { ...state, queue };
    }
    case "queue/clear":
      return { ...state, queue: [] };
    case "player/remove":
      if (state.courts.some(court =>
        [...(court.teamA ?? []), ...(court.teamB ?? []), court.liberoA, court.liberoB].includes(action.id)
      )) return state;
      return {
        ...state,
        players: state.players.filter(player => player.id !== action.id),
        queue: state.queue.filter(id => id !== action.id),
        schedule: state.schedule.filter(pair => !pair.members.includes(action.id))
      };
    case "round/start":
      return startRound(state);
    case "court/fill":
      return fillCourt(state, action.courtId);
    case "court/custom":
      return setCustomMatch(state, action.courtId, action.members);
    case "court/replace":
      return replaceCourt(state, action.courtId);
    case "court/libero":
      return setCourtLibero(state, action.courtId, action.side, action.playerId);
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

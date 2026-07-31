import { addPlayer, fillCourt, finishMatch, LIBERO, pairKey, projectedRoundComplete, replaceCourt, setCourtLibero, setCustomMatch, startRound } from "../domain/engine";
import { createCourt, initialState } from "../domain/initialState";
import type { AppState, Pair, PlayerId, PlayerLevel, Settings, Team } from "../domain/types";

export type AppAction =
  | { type: "state/replace"; state: AppState }
  | { type: "player/add"; name: string }
  | { type: "player/toggle"; id: string }
  | { type: "player/level"; id: string; level: PlayerLevel }
  | { type: "queue/shuffle" }
  | { type: "queue/move"; id: string; direction: -1 | 1 }
  | { type: "queue/reorder"; fromId: string; toId: string }
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

function togglePlayerInRound(state: AppState, id: PlayerId, active: boolean): AppState {
  const pairIndex = state.schedule.findIndex(pair => pair.members.includes(id));
  let schedule = [...state.schedule];
  const changedPairIds = new Set<string>();

  if (active && pairIndex < 0 && schedule.length) {
    const liberoIndex = schedule.findIndex(pair => pair.members.includes(LIBERO));
    if (liberoIndex >= 0) {
      const liberoPair = schedule[liberoIndex];
      const members = liberoPair.members.map(member => member === LIBERO ? id : member) as Team;
      changedPairIds.add(liberoPair.id);
      schedule[liberoIndex] = { id: pairKey(members), members };
    } else {
      const members: Team = [id, LIBERO];
      schedule.push({ id: pairKey(members), members });
    }
  }

  if (!active && pairIndex >= 0) {
    const removedPair = schedule[pairIndex];
    const partner = removedPair.members.find(member => member !== id);
    changedPairIds.add(removedPair.id);
    schedule.splice(pairIndex, 1);

    if (partner && partner !== LIBERO) {
      const liberoIndex = schedule.findIndex(pair => pair.members.includes(LIBERO));
      if (liberoIndex >= 0) {
        const liberoPair = schedule[liberoIndex];
        const members = liberoPair.members.map(member => member === LIBERO ? partner : member) as Team;
        changedPairIds.add(liberoPair.id);
        schedule[liberoIndex] = { id: pairKey(members), members };
      } else {
        const members: Team = [partner, LIBERO];
        const replacement: Pair = { id: pairKey(members), members };
        schedule.splice(Math.min(pairIndex, schedule.length), 0, replacement);
      }
    }
  }

  const validPairIds = new Set(schedule.map(pair => pair.id));
  const pairGames = Object.fromEntries(
    Object.entries(state.pairGames).filter(([key]) => validPairIds.has(key) && !changedPairIds.has(key))
  );
  return {
    ...state,
    players: state.players.map(player => player.id === id ? { ...player, active } : player),
    queue: active
      ? state.queue.includes(id) ? state.queue : [...state.queue, id]
      : state.queue.filter(playerId => playerId !== id),
    schedule,
    pairGames
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "state/replace":
      return action.state;
    case "player/add":
      return addPlayer(state, action.name);
    case "player/toggle": {
      if (state.courts.some(court =>
        [...(court.teamA ?? []), ...(court.teamB ?? []), court.liberoA, court.liberoB].includes(action.id)
      )) return state;
      const active = !state.players.find(player => player.id === action.id)?.active;
      return togglePlayerInRound(state, action.id, active);
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
    case "queue/reorder": {
      const from = state.queue.indexOf(action.fromId);
      const to = state.queue.indexOf(action.toId);
      if (from < 0 || to < 0 || from === to) return state;
      const queue = [...state.queue];
      const [moved] = queue.splice(from, 1);
      queue.splice(to, 0, moved);
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
      const finished = finishMatch(state, action.courtId, action.winner);
      const nextRound = projectedRoundComplete(finished) ? startRound(finished) : finished;
      return fillCourt(nextRound, action.courtId);
    }
    case "settings/update": {
      const settings = { ...state.settings, ...action.patch };
      const removedCourts = state.courts.slice(settings.courtCount);
      const returned = removedCourts.flatMap(court => [
        ...(court.teamA ?? []), ...(court.teamB ?? [])
      ]).filter((id): id is string => id !== "LIBERO" && Boolean(id));
      const courts = Array.from({ length: settings.courtCount }, (_, index) =>
        state.courts[index] ?? createCourt(index + 1)
      );
      return {
        ...state,
        settings,
        courts,
        queue: [...state.queue, ...returned.filter(id => !state.queue.includes(id))]
      };
    }
    case "session/reset":
      return {
        ...structuredClone(initialState),
        players: state.players,
        queue: state.players.filter(player => player.active).map(player => player.id),
        courts: Array.from({ length: state.settings.courtCount }, (_, index) => createCourt(index + 1)),
        settings: state.settings
      };
    default:
      return state;
  }
}

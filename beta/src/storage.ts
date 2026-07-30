import { initialState } from "./domain/initialState";
import type { AppState, PlayerLevel } from "./domain/types";

const BETA_KEY = "bdm_rotation_beta_v2";
const LEGACY_KEY = "bdm_rotation";

export function normalizeState(state: AppState): AppState {
  const validActive = new Set(state.players.filter(player => player.active).map(player => player.id));
  const onCourt = new Set(
    state.courts.flatMap(court => [...(court.teamA ?? []), ...(court.teamB ?? [])])
      .filter(id => id !== "LIBERO")
  );
  const queue = [...new Set(state.queue.filter(id => validActive.has(id) && !onCourt.has(id)))];
  return {
    ...state,
    queue,
    settings: { ...initialState.settings, ...state.settings }
  };
}

export function loadState(): AppState {
  const beta = localStorage.getItem(BETA_KEY);
  if (beta) {
    try {
      return normalizeState({ ...structuredClone(initialState), ...JSON.parse(beta) } as AppState);
    } catch {
      localStorage.removeItem(BETA_KEY);
    }
  }
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (!legacy) return structuredClone(initialState);
  try {
    const source = JSON.parse(legacy);
    const names: string[] = Array.isArray(source.mainPlayers) ? source.mainPlayers : [];
    const players = names.map(name => ({
      id: name,
      name,
      level: (source.playerLevel?.[name] ?? "human") as PlayerLevel,
      active: source.pool?.[name] !== false
    }));
    return normalizeState({
      ...structuredClone(initialState),
      players,
      queue: Array.isArray(source.queue) ? source.queue.filter((name: string) => name !== "Libero") : [],
      round: source.currentRound || 1,
      settings: {
        ...initialState.settings,
        gamesPerPair: source.settings?.gamesPerMatch || 2,
        hellvenMode: Boolean(source.settings?.hellvenMode),
        courtCount: Math.max(1, source.courts?.length || 2),
        lowPlayerMode: source.settings?.lowPlayerMode ?? "auto",
        lowPlayerThreshold: source.settings?.lowPlayerThreshold ?? 6,
        theme: source.settings?.theme ?? "dark",
        courtColor: source.settings?.courtColor ?? "#2d8a4e",
        courtColumns: source.settings?.courtColumns ?? 0
      }
    });
  } catch {
    return structuredClone(initialState);
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(BETA_KEY, JSON.stringify(state));
}

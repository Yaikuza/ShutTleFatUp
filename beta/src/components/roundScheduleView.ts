import { pairKey } from "../domain/engine";
import type { AppState, MatchHistory, Team } from "../domain/types";

export type RoundPairView = {
  id: string;
  members: Team;
  games: number;
};

function sessionMatches(state: AppState): MatchHistory[] {
  return state.activePlayEventId
    ? state.history.filter(match => match.playEventId === state.activePlayEventId)
    : state.history.filter(match => !match.playEventId);
}

export function availableScheduleRounds(state: AppState): number[] {
  return [...new Set([
    ...sessionMatches(state).map(match => match.round),
    state.round
  ])].filter(round => round > 0).sort((a, b) => a - b);
}

export function roundPairViews(state: AppState, round: number): RoundPairView[] {
  if (round === state.round) {
    return state.schedule.map(pair => ({
      id: pair.id,
      members: pair.members,
      games: state.pairGames[pair.id] ?? 0
    }));
  }

  const pairs = new Map<string, RoundPairView>();
  sessionMatches(state).filter(match => match.round === round).forEach(match => {
    [match.teamA, match.teamB].forEach(members => {
      const id = pairKey(members);
      const existing = pairs.get(id);
      if (existing) existing.games += 1;
      else pairs.set(id, { id, members, games: 1 });
    });
  });
  return [...pairs.values()];
}

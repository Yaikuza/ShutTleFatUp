import { LIBERO, pairKey } from "./engine";
import type { MatchHistory, PlayerId, Team } from "./types";

export type PlayerStat = {
  playerId: PlayerId;
  games: number;
  wins: number;
  losses: number;
  liberoWins: number;
  liberoLosses: number;
};

export type PairStat = {
  key: string;
  members: [PlayerId, PlayerId];
  wins: number;
  losses: number;
};

export type HeadToHeadStat = {
  key: string;
  players: [PlayerId, PlayerId];
  firstWins: number;
  secondWins: number;
};

function resolvedTeam(match: MatchHistory, side: "A" | "B"): [PlayerId, PlayerId] | null {
  const team = (side === "A" ? match.teamA : match.teamB) as Team;
  const libero = side === "A" ? match.liberoA : match.liberoB;
  const members = team.map(member => member === LIBERO ? libero : member);
  return members.every(Boolean) ? members as [PlayerId, PlayerId] : null;
}

export function buildPlayerStats(matches: MatchHistory[]): PlayerStat[] {
  const stats = new Map<PlayerId, PlayerStat>();
  const ensure = (id: PlayerId) => {
    if (!stats.has(id)) stats.set(id, {
      playerId: id, games: 0, wins: 0, losses: 0, liberoWins: 0, liberoLosses: 0
    });
    return stats.get(id)!;
  };
  for (const match of matches) {
    for (const side of ["A", "B"] as const) {
      const resolved = resolvedTeam(match, side);
      if (!resolved) continue;
      const won = match.winner === side;
      const original = side === "A" ? match.teamA : match.teamB;
      resolved.forEach((id, index) => {
        const item = ensure(id);
        const isLibero = original[index] === LIBERO;
        if (!isLibero) item.games++;
        if (won) item.wins++;
        else item.losses++;
        if (isLibero && won) item.liberoWins++;
        if (isLibero && !won) item.liberoLosses++;
      });
    }
  }
  return [...stats.values()].sort((a, b) => b.wins - a.wins || b.games - a.games);
}

export function buildPairStats(matches: MatchHistory[]): PairStat[] {
  const stats = new Map<string, PairStat>();
  for (const match of matches) {
    for (const side of ["A", "B"] as const) {
      const team = resolvedTeam(match, side);
      if (!team) continue;
      const key = pairKey(team);
      const item = stats.get(key) ?? { key, members: team, wins: 0, losses: 0 };
      if (match.winner === side) item.wins++;
      else item.losses++;
      stats.set(key, item);
    }
  }
  return [...stats.values()].sort((a, b) => b.wins - a.wins || b.losses - a.losses);
}

export function buildHeadToHeadStats(matches: MatchHistory[]): HeadToHeadStat[] {
  const stats = new Map<string, HeadToHeadStat>();
  for (const match of matches) {
    const teamA = resolvedTeam(match, "A");
    const teamB = resolvedTeam(match, "B");
    if (!teamA || !teamB) continue;
    for (const first of teamA) {
      for (const second of teamB) {
        const players: [PlayerId, PlayerId] = first < second ? [first, second] : [second, first];
        const key = players.join("|");
        const item = stats.get(key) ?? { key, players, firstWins: 0, secondWins: 0 };
        const winnerIds = match.winner === "A" ? teamA : teamB;
        if (winnerIds.includes(players[0])) item.firstWins++;
        else item.secondWins++;
        stats.set(key, item);
      }
    }
  }
  return [...stats.values()].sort((a, b) =>
    b.firstWins + b.secondWins - (a.firstWins + a.secondWins)
  );
}

import type { AppState, Court, Pair, Player, PlayerId, PlayerLevel, Team } from "./types";

export const LIBERO = "LIBERO" as const;

export function pairKey(team: Team): string {
  return [...team].sort().join("|");
}

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function playerLevel(state: AppState, id: string): PlayerLevel {
  return state.players.find(player => player.id === id)?.level ?? "human";
}

export function teamFlag(state: AppState, team: Team): PlayerLevel | "mixed" {
  const levels = team
    .filter(member => member !== LIBERO)
    .map(member => playerLevel(state, member));
  if (levels.includes("hell") && levels.includes("heaven")) return "mixed";
  if (levels.includes("hell")) return "hell";
  if (levels.includes("heaven")) return "heaven";
  return "human";
}

export function teamsCanPlay(state: AppState, first: Team, second: Team): boolean {
  if (!state.settings.hellvenMode) return true;
  const a = teamFlag(state, first);
  const b = teamFlag(state, second);
  if (a === "mixed" || b === "mixed") return false;
  return !((a === "hell" && b === "heaven") || (a === "heaven" && b === "hell"));
}

export function createPairs(state: AppState, ids: PlayerId[]): Pair[] {
  const makePair = (members: Team): Pair => ({
    id: pairKey(members),
    members
  });
  if (!state.settings.hellvenMode) {
    const pool = shuffled(ids);
    const pairs: Pair[] = [];
    while (pool.length >= 2) pairs.push(makePair([pool.shift()!, pool.shift()!]));
    if (pool.length) pairs.push(makePair([pool[0], LIBERO]));
    return pairs;
  }

  const hell = shuffled(ids.filter(id => playerLevel(state, id) === "hell"));
  const human = shuffled(ids.filter(id => playerLevel(state, id) === "human"));
  const heaven = shuffled(ids.filter(id => playerLevel(state, id) === "heaven"));
  const pairs: Pair[] = [];

  const hellPool = shuffled([...hell, ...human]);
  while (hellPool.some(id => playerLevel(state, id) === "hell")) {
    const hellIndex = hellPool.findIndex(id => playerLevel(state, id) === "hell");
    const hellId = hellPool.splice(hellIndex, 1)[0];
    if (!hellPool.length) {
      pairs.push(makePair([hellId, LIBERO]));
      break;
    }
    pairs.push(makePair([hellId, hellPool.splice(Math.floor(Math.random() * hellPool.length), 1)[0]]));
  }

  const heavenPool = shuffled([...heaven, ...hellPool]);
  while (heavenPool.some(id => playerLevel(state, id) === "heaven")) {
    const heavenIndex = heavenPool.findIndex(id => playerLevel(state, id) === "heaven");
    const heavenId = heavenPool.splice(heavenIndex, 1)[0];
    if (!heavenPool.length) {
      pairs.push(makePair([heavenId, LIBERO]));
      break;
    }
    pairs.push(makePair([heavenId, heavenPool.splice(Math.floor(Math.random() * heavenPool.length), 1)[0]]));
  }
  while (heavenPool.length >= 2) pairs.push(makePair([heavenPool.shift()!, heavenPool.shift()!]));
  if (heavenPool.length) pairs.push(makePair([heavenPool[0], LIBERO]));
  return pairs;
}

export function startRound(state: AppState): AppState {
  const activeIds = state.players.filter(player => player.active).map(player => player.id);
  return {
    ...state,
    round: state.schedule.length ? state.round + 1 : state.round,
    schedule: createPairs(state, activeIds),
    pairGames: {}
  };
}

export function projectedRoundComplete(state: AppState): boolean {
  if (!state.schedule.length) return false;
  const active = new Set<string>();
  for (const court of state.courts) {
    if (court.status !== "playing" || court.startedRound !== state.round) continue;
    if (court.teamA) active.add(pairKey(court.teamA));
    if (court.teamB) active.add(pairKey(court.teamB));
  }
  return state.schedule.every(pair =>
    (state.pairGames[pair.id] ?? 0) + (active.has(pair.id) ? 1 : 0) >= state.settings.gamesPerPair
  );
}

export function realMembers(team: Team): PlayerId[] {
  return team.filter((member): member is PlayerId => member !== LIBERO);
}

function borrowedIds(state: AppState): Set<PlayerId> {
  return new Set(
    state.courts.flatMap(court => [court.liberoA, court.liberoB]).filter((id): id is PlayerId => Boolean(id))
  );
}

export function assignLibero(state: AppState, court: Court, team: Team, side: "A" | "B"): PlayerId | null {
  if (!team.includes(LIBERO)) return null;
  const busy = new Set(
    state.courts.flatMap(item => item.status === "playing" && item.id !== court.id
      ? [...(item.teamA ?? []), ...(item.teamB ?? [])]
      : [])
  );
  const borrowedElsewhere = state.courts.flatMap(item =>
    item.id === court.id ? [] : [item.liberoA, item.liberoB]
  ).filter((id): id is PlayerId => Boolean(id));
  const otherSideLibero = side === "A" ? court.liberoB : court.liberoA;
  const blocked = new Set([
    ...realMembers(team),
    ...borrowedElsewhere,
    ...busy,
    ...(otherSideLibero ? [otherSideLibero] : [])
  ]);
  const candidates = state.queue.slice(2).filter(id => !blocked.has(id));
  if (!candidates.length) return null;
  const previous = side === "A" ? court.liberoA : court.liberoB;
  const latestBorrowed = state.history.length
    ? [state.history[state.history.length - 1].liberoA, state.history[state.history.length - 1].liberoB]
      .filter((id): id is PlayerId => Boolean(id))
    : [];
  const alternatives = candidates.filter(id => id !== previous && !latestBorrowed.includes(id));
  return shuffled(alternatives.length ? alternatives : candidates)[0];
}

export function fillCourt(state: AppState, courtId: number): AppState {
  const lowMode = state.settings.lowPlayerMode === "on"
    || (state.settings.lowPlayerMode === "auto" && state.queue.length <= state.settings.lowPlayerThreshold);
  let next = lowMode ? state : state.schedule.length ? state : startRound(state);
  const court = next.courts.find(item => item.id === courtId);
  if (!court || court.status === "playing") return next;

  const queueSet = new Set(next.queue);
  const sourcePairs = lowMode ? createPairs(next, next.queue.filter(id => !borrowedIds(next).has(id))) : next.schedule;
  const available = sourcePairs.filter(pair => {
    if ((next.pairGames[pair.id] ?? 0) >= next.settings.gamesPerPair) return false;
    return realMembers(pair.members).every(id => queueSet.has(id));
  }).sort((first, second) => {
    const firstIndex = Math.min(...realMembers(first.members).map(id => next.queue.indexOf(id)));
    const secondIndex = Math.min(...realMembers(second.members).map(id => next.queue.indexOf(id)));
    return firstIndex - secondIndex;
  });

  if (court.teamA && !court.teamB) {
    const opponent = available.find(pair =>
      pair.id !== pairKey(court.teamA!) && teamsCanPlay(next, court.teamA!, pair.members)
    );
    if (!opponent) return next;
    const updatedCourt: Court = {
      ...court,
      status: "playing",
      teamB: opponent.members,
      liberoA: court.teamA.includes(LIBERO) ? assignLibero(next, court, court.teamA, "A") : null,
      liberoB: null,
      startedRound: next.round
    };
    updatedCourt.liberoB = assignLibero(next, updatedCourt, opponent.members, "B");
    const opponentIds = new Set(realMembers(opponent.members));
    return {
      ...next,
      queue: next.queue.filter(id => !opponentIds.has(id)),
      courts: next.courts.map(item => item.id === courtId ? updatedCourt : item)
    };
  }

  let selected: [Pair, Pair] | null = null;
  for (let first = 0; first < available.length - 1 && !selected; first++) {
    for (let second = first + 1; second < available.length; second++) {
      const a = available[first];
      const b = available[second];
      const members = [...realMembers(a.members), ...realMembers(b.members)];
      if (new Set(members).size !== members.length) continue;
      if (!teamsCanPlay(next, a.members, b.members)) continue;
      selected = [a, b];
      break;
    }
  }
  if (!selected) return next;

  const [pairA, pairB] = selected;
  const updatedCourt: Court = {
    ...court,
    status: "playing",
    teamA: pairA.members,
    teamB: pairB.members,
    liberoA: null,
    liberoB: null,
    startedRound: next.round
  };
  updatedCourt.liberoA = assignLibero(next, updatedCourt, pairA.members, "A");
  updatedCourt.liberoB = assignLibero(next, updatedCourt, pairB.members, "B");
  const playingIds = new Set([...realMembers(pairA.members), ...realMembers(pairB.members)]);
  return {
    ...next,
    queue: next.queue.filter(id => !playingIds.has(id)),
    courts: next.courts.map(item => item.id === courtId ? updatedCourt : item)
  };
}

export function setCustomMatch(state: AppState, courtId: number, members: [PlayerId, PlayerId, PlayerId, PlayerId]): AppState {
  if (new Set(members).size !== 4) return state;
  const court = state.courts.find(item => item.id === courtId);
  if (!court || !members.every(id => state.players.some(player => player.id === id && player.active))) return state;
  const busyElsewhere = new Set(state.courts.flatMap(item =>
    item.id !== courtId && item.status === "playing"
      ? [
          ...realMembers(item.teamA ?? [LIBERO, LIBERO]),
          ...realMembers(item.teamB ?? [LIBERO, LIBERO]),
          item.liberoA,
          item.liberoB
        ]
      : []
  ));
  if (members.some(id => busyElsewhere.has(id))) return state;
  const teamA: Team = [members[0], members[1]];
  const teamB: Team = [members[2], members[3]];
  if (!teamsCanPlay(state, teamA, teamB)) return state;
  const oldIds = [...(court.teamA ? realMembers(court.teamA) : []), ...(court.teamB ? realMembers(court.teamB) : [])];
  const selected = new Set(members);
  const queue = [...state.queue, ...oldIds.filter(id => !state.queue.includes(id))]
    .filter(id => !selected.has(id));
  const nextCourt: Court = {
    ...court,
    status: "playing",
    teamA,
    teamB,
    liberoA: null,
    liberoB: null,
    startedRound: state.round
  };
  return {
    ...state,
    queue,
    courts: state.courts.map(item => item.id === courtId ? nextCourt : item)
  };
}

export function replaceCourt(state: AppState, courtId: number): AppState {
  const court = state.courts.find(item => item.id === courtId);
  if (!court) return state;
  const returned = [...realMembers(court.teamA ?? [LIBERO, LIBERO]), ...realMembers(court.teamB ?? [LIBERO, LIBERO])]
    .filter(id => !state.queue.includes(id));
  const cleared: Court = {
    ...court, status: "waiting", teamA: null, teamB: null,
    liberoA: null, liberoB: null, startedRound: state.round
  };
  const next = {
    ...state,
    queue: [...state.queue, ...returned],
    courts: state.courts.map(item => item.id === courtId ? cleared : item)
  };
  return fillCourt(next, courtId);
}

export function setCourtLibero(
  state: AppState,
  courtId: number,
  side: "A" | "B",
  playerId: PlayerId
): AppState {
  const court = state.courts.find(item => item.id === courtId);
  const team = side === "A" ? court?.teamA : court?.teamB;
  if (
    !court
    || !team?.includes(LIBERO)
    || !state.players.some(player => player.id === playerId && player.active)
  ) return state;
  const busy = new Set(state.courts.flatMap(item => item.status === "playing"
    ? [
        ...realMembers(item.teamA ?? [LIBERO, LIBERO]),
        ...realMembers(item.teamB ?? [LIBERO, LIBERO]),
        item.liberoA,
        item.liberoB
      ]
    : []));
  if (busy.has(playerId)) return state;
  return {
    ...state,
    courts: state.courts.map(item => item.id === courtId
      ? { ...item, [side === "A" ? "liberoA" : "liberoB"]: playerId }
      : item)
  };
}

export function finishMatch(state: AppState, courtId: number, winner: "A" | "B"): AppState {
  const court = state.courts.find(item => item.id === courtId);
  if (!court?.teamA || !court.teamB || court.status !== "playing") return state;
  const historyEntry = {
    id: crypto.randomUUID(),
    round: court.startedRound,
    courtId,
    teamA: court.teamA,
    teamB: court.teamB,
    liberoA: court.liberoA,
    liberoB: court.liberoB,
    winner,
    playedAt: new Date().toISOString()
  } as const;
  if (court.startedRound < state.round) {
    const returned = [...realMembers(court.teamA), ...realMembers(court.teamB)]
      .filter(id => !state.queue.includes(id));
    return {
      ...state,
      queue: [...state.queue, ...returned],
      courts: state.courts.map(item => item.id === courtId
        ? { ...item, status: "waiting", teamA: null, teamB: null, liberoA: null, liberoB: null }
        : item),
      history: [...state.history, historyEntry]
    };
  }
  const keyA = pairKey(court.teamA);
  const keyB = pairKey(court.teamB);
  const pairGames = {
    ...state.pairGames,
    [keyA]: (state.pairGames[keyA] ?? 0) + 1,
    [keyB]: (state.pairGames[keyB] ?? 0) + 1
  };
  const winnerTeam = winner === "A" ? court.teamA : court.teamB;
  const loserTeam = winner === "A" ? court.teamB : court.teamA;
  const winnerDone = pairGames[pairKey(winnerTeam)] >= state.settings.gamesPerPair;
  const returned = new Set<PlayerId>(realMembers(loserTeam));
  if (winnerDone) realMembers(winnerTeam).forEach(id => returned.add(id));
  const nextCourt: Court = {
    ...court,
    status: "waiting",
    teamA: winnerDone ? null : winnerTeam,
    teamB: null,
    liberoA: null,
    liberoB: null
  };
  return {
    ...state,
    pairGames,
    queue: [...state.queue, ...[...returned].filter(id => !state.queue.includes(id))],
    courts: state.courts.map(item => item.id === courtId ? nextCourt : item),
    history: [...state.history, historyEntry]
  };
}

export function addPlayer(state: AppState, name: string): AppState {
  const clean = name.trim();
  if (!clean || state.players.some(player => player.name.toLocaleLowerCase() === clean.toLocaleLowerCase())) return state;
  const player: Player = { id: crypto.randomUUID(), name: clean, level: "human", active: true };
  return { ...state, players: [...state.players, player], queue: [...state.queue, player.id] };
}

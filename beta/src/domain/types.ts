export type PlayerLevel = "hell" | "human" | "heaven";

export type Player = {
  id: string;
  name: string;
  level: PlayerLevel;
};

export type Pair = {
  id: string;
  playerIds: [string, string | "LIBERO"];
};

export type LiberoAssignment = {
  pairId: string;
  borrowedPlayerId: string;
  gamesPlayed: number;
};

export type CourtMatch = {
  courtId: number;
  pairAId: string;
  pairBId: string;
  startedRound: number;
  liberoAssignments: LiberoAssignment[];
};

export type AppState = {
  schemaVersion: 2;
  players: Player[];
  queue: string[];
  round: number;
  pairs: Pair[];
  matches: CourtMatch[];
};

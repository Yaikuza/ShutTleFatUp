export type PlayerLevel = "hell" | "human" | "heaven";
export type PlayerId = string;
export type TeamMember = PlayerId | "LIBERO";
export type Team = [TeamMember, TeamMember];

export type Player = {
  id: PlayerId;
  name: string;
  level: PlayerLevel;
  active: boolean;
};

export type Pair = {
  id: string;
  members: Team;
};

export type Court = {
  id: number;
  status: "waiting" | "playing";
  teamA: Team | null;
  teamB: Team | null;
  liberoA: PlayerId | null;
  liberoB: PlayerId | null;
  startedRound: number;
};

export type MatchHistory = {
  id: string;
  playEventId?: string | null;
  round: number;
  courtId: number;
  teamA: Team;
  teamB: Team;
  liberoA?: PlayerId | null;
  liberoB?: PlayerId | null;
  winner: "A" | "B";
  playedAt: string;
};

export type Settings = {
  gamesPerPair: number;
  hellvenMode: boolean;
  courtCount: number;
  lowPlayerMode: "auto" | "on" | "off";
  lowPlayerThreshold: number;
  theme: "light" | "dark" | "pastel" | "sepia" | "luxury" | "metallic";
  courtColor: string;
  courtColumns: 0 | 1 | 2 | 3;
};

export type AppState = {
  schemaVersion: 3;
  playDate: string;
  activePlayEventId: string | null;
  players: Player[];
  queue: PlayerId[];
  roomQueue?: PlayerId[];
  courts: Court[];
  round: number;
  schedule: Pair[];
  pairGames: Record<string, number>;
  history: MatchHistory[];
  settings: Settings;
};

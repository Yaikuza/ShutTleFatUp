import { describe, expect, it } from "vitest";
import { LIBERO } from "./engine";
import { buildHeadToHeadStats, buildPairStats, buildPlayerStats } from "./stats";
import type { MatchHistory } from "./types";

const match: MatchHistory = {
  id: "match-1",
  round: 1,
  courtId: 1,
  teamA: ["A", LIBERO],
  teamB: ["B", "C"],
  liberoA: "D",
  winner: "A",
  playedAt: "2026-07-31T00:00:00.000Z"
};

describe("Libero statistics", () => {
  it("counts the result but not a played game for the borrowed player", () => {
    const stats = buildPlayerStats([match]);
    expect(stats.find(item => item.playerId === "D")).toMatchObject({
      games: 0, wins: 1, losses: 0, liberoWins: 1
    });
    expect(stats.find(item => item.playerId === "A")).toMatchObject({ games: 1, wins: 1 });
  });

  it("includes the borrowed player in pair and head-to-head statistics", () => {
    expect(buildPairStats([match]).find(item => item.key === "A|D")?.wins).toBe(1);
    expect(buildHeadToHeadStats([match]).find(item => item.key === "B|D")?.secondWins).toBe(1);
  });
});

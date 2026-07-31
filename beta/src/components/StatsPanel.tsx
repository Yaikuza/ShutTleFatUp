import { useState } from "react";
import { LIBERO, pairKey } from "../domain/engine";
import { buildHeadToHeadStats, buildPairStats, buildPlayerStats } from "../domain/stats";
import type { MatchHistory, Team } from "../domain/types";

type StatsTab = "players" | "pairs" | "h2h" | "history";

export function StatsPanel({
  history,
  playerName,
  permanent
}: {
  history: MatchHistory[];
  playerName: (id: string) => string;
  permanent: boolean;
}) {
  const [tab, setTab] = useState<StatsTab>("players");
  const playerStats = buildPlayerStats(history);
  const pairStats = buildPairStats(history);
  const headToHeadStats = buildHeadToHeadStats(history);
  const pairWins = new Map(pairStats.map(item => [item.key, item.wins]));
  const byDate = history.reduce<Record<string, MatchHistory[]>>((groups, match) => {
    const date = new Intl.DateTimeFormat("th-TH", {
      dateStyle: "long",
      timeZone: "Asia/Bangkok"
    }).format(new Date(match.playedAt));
    (groups[date] ??= []).push(match);
    return groups;
  }, {});
  const resolvedTeam = (team: Team, libero?: string | null): Team =>
    team.map(member => member === LIBERO ? libero ?? LIBERO : member) as Team;

  return (
    <section id="stats" className="panel history-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Match history</p><h2>ผลล่าสุด</h2></div>
        <span>{history.length} เกม{permanent ? " · บันทึกถาวร" : ""}</span>
      </div>
      <div className="stats-tabs">
        <button className={tab === "players" ? "active" : ""} onClick={() => setTab("players")}>ผู้เล่น</button>
        <button className={tab === "pairs" ? "active" : ""} onClick={() => setTab("pairs")}>คู่</button>
        <button className={tab === "h2h" ? "active" : ""} onClick={() => setTab("h2h")}>H2H</button>
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>ประวัติ</button>
      </div>
      {tab === "players" && <div className="stats-list">{playerStats.map(item => (
        <div className="stat-row" key={item.playerId}>
          <strong>{playerName(item.playerId)}</strong>
          <span>W {item.wins} · L {item.losses} · เล่นจริง {item.games}</span>
          <small>Libero {item.liberoWins}W/{item.liberoLosses}L</small>
        </div>
      ))}</div>}
      {tab === "pairs" && <div className="stats-list">{pairStats.map(item => (
        <div className="stat-row" key={item.key}>
          <strong>{item.members.map(playerName).join(" + ")}</strong><span>{item.wins}W · {item.losses}L</span>
        </div>
      ))}</div>}
      {tab === "h2h" && <div className="stats-list">{headToHeadStats.map(item => (
        <div className="stat-row" key={item.key}>
          <strong>{playerName(item.players[0])} vs {playerName(item.players[1])}</strong>
          <span>{item.firstWins} : {item.secondWins}</span>
        </div>
      ))}</div>}
      {tab === "history" && !history.length && <p className="muted">ยังไม่มีผลการแข่งขัน</p>}
      {tab === "history" && Object.entries(byDate).reverse().map(([date, matches]) => (
        <div className="history-day" key={date}>
          <div className="history-date"><strong>{date}</strong><span>{matches.length} เกม</span></div>
          {[...matches].reverse().map(match => {
            const winnerTeam = match.winner === "A" ? match.teamA : match.teamB;
            const libero = match.winner === "A" ? match.liberoA : match.liberoB;
            const resolved = resolvedTeam(winnerTeam, libero);
            return (
              <div className="history-row" key={match.id}>
                <span>คอร์ท {match.courtId} · รอบ {match.round}</span>
                <strong>{resolved.map(playerName).join(" + ")} ชนะ</strong>
                <small>ชนะรวม {pairWins.get(pairKey(resolved)) ?? 0}</small>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}

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
  const pairStatsByKey = new Map(pairStats.map(item => [item.key, item]));
  const pairPlayers = [...new Set(pairStats.flatMap(item => item.members))]
    .sort((first, second) => playerName(first).localeCompare(playerName(second), "th"));
  const headToHeadByKey = new Map(headToHeadStats.map(item => [item.key, item]));
  const headToHeadPlayers = [...new Set(headToHeadStats.flatMap(item => item.players))]
    .sort((first, second) => playerName(first).localeCompare(playerName(second), "th"));
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
      {tab === "pairs" && !pairPlayers.length && <p className="muted stats-empty">ยังไม่มีสถิติคู่</p>}
      {tab === "pairs" && pairPlayers.length > 0 && (
        <>
          <p className="h2h-hint">ผลการแข่งขันเมื่อผู้เล่นในแถวและคอลัมน์อยู่ทีมเดียวกัน</p>
          <div className="h2h-scroll">
            <table className="h2h-matrix pair-matrix">
              <thead>
                <tr>
                  <th scope="col" className="h2h-corner">ผู้เล่น</th>
                  {pairPlayers.map(playerId => (
                    <th scope="col" key={playerId} title={playerName(playerId)}>
                      <span>{playerName(playerId)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pairPlayers.map(rowId => (
                  <tr key={rowId}>
                    <th scope="row" title={playerName(rowId)}><span>{playerName(rowId)}</span></th>
                    {pairPlayers.map(columnId => {
                      if (rowId === columnId) return <td className="self" key={columnId}>—</td>;
                      const item = pairStatsByKey.get(pairKey([rowId, columnId]));
                      if (!item) return <td className="unplayed" key={columnId}>·</td>;
                      const result = item.wins > item.losses ? "winning" : item.wins < item.losses ? "losing" : "tied";
                      return <td className={result} key={columnId}>{item.wins}W:{item.losses}L</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === "h2h" && !headToHeadPlayers.length && <p className="muted stats-empty">ยังไม่มีสถิติที่พบกัน</p>}
      {tab === "h2h" && headToHeadPlayers.length > 0 && (
        <>
          <p className="h2h-hint">ตัวเลขฝั่งซ้ายคือจำนวนครั้งที่ผู้เล่นในแถวชนะ</p>
          <div className="h2h-scroll">
            <table className="h2h-matrix">
              <thead>
                <tr>
                  <th scope="col" className="h2h-corner">ผู้เล่น</th>
                  {headToHeadPlayers.map(playerId => (
                    <th scope="col" key={playerId} title={playerName(playerId)}>
                      <span>{playerName(playerId)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {headToHeadPlayers.map(rowId => (
                  <tr key={rowId}>
                    <th scope="row" title={playerName(rowId)}><span>{playerName(rowId)}</span></th>
                    {headToHeadPlayers.map(columnId => {
                      if (rowId === columnId) return <td className="self" key={columnId}>—</td>;
                      const players = rowId < columnId
                        ? [rowId, columnId] as const
                        : [columnId, rowId] as const;
                      const item = headToHeadByKey.get(players.join("|"));
                      if (!item) return <td className="unplayed" key={columnId}>·</td>;
                      const rowWins = item.players[0] === rowId ? item.firstWins : item.secondWins;
                      const rowLosses = item.players[0] === rowId ? item.secondWins : item.firstWins;
                      const result = rowWins > rowLosses ? "winning" : rowWins < rowLosses ? "losing" : "tied";
                      return <td className={result} key={columnId}>{rowWins}:{rowLosses}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
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

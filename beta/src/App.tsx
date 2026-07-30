import { useEffect, useReducer, useRef, useState } from "react";
import { appReducer, type AppAction } from "./app/appReducer";
import { LIBERO, pairKey, teamFlag } from "./domain/engine";
import { buildHeadToHeadStats, buildPairStats, buildPlayerStats } from "./domain/stats";
import type { AppState, PlayerLevel, Team } from "./domain/types";
import { loadState, saveState } from "./storage";
import { useRoomSync } from "./supabase/useRoomSync";
import "./styles.css";

const levelMeta: Record<PlayerLevel, { icon: string; label: string }> = {
  hell: { icon: "🔥", label: "Hell" },
  human: { icon: "🧑", label: "Human" },
  heaven: { icon: "😇", label: "Heaven" }
};

const levelOrder: PlayerLevel[] = ["hell", "human", "heaven"];

function LevelSlider({
  value,
  onChange
}: {
  value: PlayerLevel;
  onChange: (level: PlayerLevel) => void;
}) {
  const index = levelOrder.indexOf(value);
  return (
    <label className={`level-slider level-${value}`}>
      <span className="level-labels" aria-hidden="true">
        <i>🔥</i><i>🧑</i><i>😇</i>
      </span>
      <input
        type="range"
        min="0"
        max="2"
        step="1"
        value={index}
        aria-label={`ระดับ ${levelMeta[value].label}`}
        onChange={event => onChange(levelOrder[Number(event.target.value)])}
      />
      <b>{levelMeta[value].label}</b>
    </label>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, loadState);
  const [name, setName] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [customCourtId, setCustomCourtId] = useState<number | null>(null);
  const [customPlayers, setCustomPlayers] = useState<string[]>(["", "", "", ""]);
  const [liberoPicker, setLiberoPicker] = useState<{ courtId: number; side: "A" | "B" } | null>(null);
  const [statsTab, setStatsTab] = useState<"players" | "pairs" | "h2h" | "history">("players");
  const undoStack = useRef<AppState[]>([]);
  const draggedQueueId = useRef<string | null>(null);
  const roomSync = useRoomSync(state, dispatch);

  useEffect(() => saveState(state), [state]);
  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme;
    document.documentElement.style.setProperty("--court-color", state.settings.courtColor);
  }, [state.settings.theme, state.settings.courtColor]);

  const send = (action: AppAction) => {
    undoStack.current.push(structuredClone(state));
    if (undoStack.current.length > 30) undoStack.current.shift();
    if (roomSync.room) roomSync.submitAction(action);
    else dispatch(action);
  };

  const undo = () => {
    const previous = undoStack.current.pop();
    if (previous) {
      const action = { type: "state/replace", state: previous } as const;
      if (roomSync.room) roomSync.submitAction(action);
      else dispatch(action);
    }
  };

  const playerName = (id: string) =>
    id === LIBERO ? "Libero" : state.players.find(player => player.id === id)?.name ?? id;

  const teamLabel = (team: Team, libero: string | null) =>
    team.map(member => member === LIBERO
      ? `${libero ? playerName(libero) : "เลือกผู้เล่น"} (Libero)`
      : playerName(member)
    );

  const submitPlayer = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    send({ type: "player/add", name });
    setName("");
  };

  const openCustom = (courtId: number) => {
    const court = state.courts.find(item => item.id === courtId);
    const existing = [...(court?.teamA ?? []), ...(court?.teamB ?? [])].filter(id => id !== LIBERO);
    setCustomPlayers([existing[0] ?? "", existing[1] ?? "", existing[2] ?? "", existing[3] ?? ""]);
    setCustomCourtId(courtId);
  };

  const confirmCustom = () => {
    if (customCourtId === null || customPlayers.some(id => !id) || new Set(customPlayers).size !== 4) return;
    send({
      type: "court/custom",
      courtId: customCourtId,
      members: customPlayers as [string, string, string, string]
    });
    setCustomCourtId(null);
  };

  const chooseScheduledPair = (members: Team, side: "A" | "B") => {
    if (members.includes(LIBERO)) return;
    setCustomPlayers(values => {
      if (side === "A") {
        const other = values.slice(2).map(id => members.includes(id) ? "" : id);
        return [members[0], members[1], other[0], other[1]];
      }
      const other = values.slice(0, 2).map(id => members.includes(id) ? "" : id);
      return [other[0], other[1], members[0], members[1]];
    });
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `shuttle-fat-up-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const importData = async (file?: File) => {
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text()) as AppState;
      if (!Array.isArray(imported.players) || !Array.isArray(imported.courts)) return;
      send({ type: "state/replace", state: imported });
    } catch {
      window.alert("ไฟล์ข้อมูลไม่ถูกต้อง");
    }
  };

  const activeCount = state.players.filter(player => player.active).length;
  const visibleHistory = roomSync.room ? roomSync.remoteHistory : state.history;
  const wins = new Map<string, number>();
  for (const match of visibleHistory) {
    const key = pairKey(match.winner === "A" ? match.teamA : match.teamB);
    wins.set(key, (wins.get(key) ?? 0) + 1);
  }
  const historyByDate = visibleHistory.reduce<Record<string, typeof visibleHistory>>((groups, match) => {
    const date = new Intl.DateTimeFormat("th-TH", {
      dateStyle: "long",
      timeZone: "Asia/Bangkok"
    }).format(new Date(match.playedAt));
    (groups[date] ??= []).push(match);
    return groups;
  }, {});
  const playerStats = buildPlayerStats(visibleHistory);
  const pairStats = buildPairStats(visibleHistory);
  const headToHeadStats = buildHeadToHeadStats(visibleHistory);
  const customBusyIds = new Set(state.courts.flatMap(court =>
    customCourtId !== null && court.id !== customCourtId && court.status === "playing"
      ? [...(court.teamA ?? []), ...(court.teamB ?? [])]
      : []
  ));

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">ShutTle Fat Up</p>
          <h1>Court <span>Beta</span></h1>
        </div>
        <div className="top-actions">
          <span className={`sync-badge sync-${roomSync.status}`}>
            {roomSync.room ? `${roomSync.room.code} · ` : ""}
            {roomSync.status}
          </span>
          <button className="ghost" onClick={undo} disabled={!undoStack.current.length}>↩ ย้อนกลับ</button>
          <button className="ghost" onClick={() => setSettingsOpen(value => !value)}>⚙ ตั้งค่า</button>
          <a className="ghost link" href="../">แอปเดิม</a>
        </div>
      </header>

      {settingsOpen && (
        <section className="settings-panel">
          <label>
            <span>จำนวนเกมต่อคู่</span>
            <select
              value={state.settings.gamesPerPair}
              onChange={event => send({ type: "settings/update", patch: { gamesPerPair: Number(event.target.value) } })}
            >
              {[1, 2, 3, 4].map(value => <option key={value} value={value}>{value} เกม</option>)}
            </select>
          </label>
          <label>
            <span>จำนวนคอร์ท</span>
            <select
              value={state.settings.courtCount}
              onChange={event => send({ type: "settings/update", patch: { courtCount: Number(event.target.value) } })}
            >
              {[1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>{value} คอร์ท</option>)}
            </select>
          </label>
          <label className="toggle-row">
            <span>Hellven Mode</span>
            <input
              type="checkbox"
              checked={state.settings.hellvenMode}
              onChange={event => send({ type: "settings/update", patch: { hellvenMode: event.target.checked } })}
            />
          </label>
          <label>
            <span>โหมดคนน้อย</span>
            <select value={state.settings.lowPlayerMode} onChange={event => send({
              type: "settings/update",
              patch: { lowPlayerMode: event.target.value as AppState["settings"]["lowPlayerMode"] }
            })}>
              <option value="auto">อัตโนมัติ</option>
              <option value="on">เปิดตลอด</option>
              <option value="off">ปิด</option>
            </select>
          </label>
          <label>
            <span>เกณฑ์คนน้อย</span>
            <select value={state.settings.lowPlayerThreshold} onChange={event => send({
              type: "settings/update", patch: { lowPlayerThreshold: Number(event.target.value) }
            })}>
              {[4, 6, 8, 10].map(value => <option key={value} value={value}>{value} คน</option>)}
            </select>
          </label>
          <label>
            <span>ธีม</span>
            <select value={state.settings.theme} onChange={event => send({
              type: "settings/update", patch: { theme: event.target.value as AppState["settings"]["theme"] }
            })}>
              <option value="light">สว่าง</option><option value="dark">มืด</option>
              <option value="pastel">Pastel</option><option value="sepia">Sepia</option>
            </select>
          </label>
          <label>
            <span>สีสนาม</span>
            <input type="color" value={state.settings.courtColor} onChange={event => send({
              type: "settings/update", patch: { courtColor: event.target.value }
            })} />
          </label>
          <label>
            <span>คอลัมน์สนาม</span>
            <select value={state.settings.courtColumns} onChange={event => send({
              type: "settings/update", patch: { courtColumns: Number(event.target.value) as 0 | 1 | 2 | 3 }
            })}>
              <option value="0">อัตโนมัติ</option><option value="1">1</option>
              <option value="2">2</option><option value="3">3</option>
            </select>
          </label>
          <div className="data-actions">
            <button className="ghost" onClick={exportData}>Export</button>
            <label className="ghost file-button">Import<input type="file" accept=".json" onChange={event => void importData(event.target.files?.[0])} /></label>
            <button className="ghost danger" onClick={() => window.confirm("รีเซตรอบและสนามทั้งหมด?") && send({ type: "session/reset" })}>รีเซต Session</button>
          </div>
          <div className="room-settings">
            <div>
              <strong>ห้อง Realtime</strong>
              <small>
                {roomSync.configured
                  ? roomSync.room ? `เชื่อมต่อห้อง ${roomSync.room.code}` : "สร้างหรือเข้าห้องเพื่อ sync หลายเครื่อง"
                  : "ยังไม่ได้ตั้งค่า Supabase"}
              </small>
            </div>
            {roomSync.configured && !roomSync.room && (
              <div className="room-actions">
                <input
                  value={roomCode}
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="รหัสตัวเลข 6 หลัก"
                  onChange={event => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                />
                <button
                  className="ghost"
                  disabled={roomCode.length !== 6}
                  onClick={() => void roomSync.createRoom(roomCode)}
                >
                  สร้างห้องนี้
                </button>
                <button
                  className="ghost"
                  disabled={roomCode.length !== 6}
                  onClick={() => void roomSync.joinRoom(roomCode)}
                >
                  เข้าห้อง
                </button>
              </div>
            )}
            {roomSync.room && (
              <button className="ghost" onClick={roomSync.leaveRoom}>ออกจากห้อง</button>
            )}
            {roomSync.message && <p>{roomSync.message}</p>}
          </div>
        </section>
      )}

      <section className="summary">
        <div><span>รอบ</span><strong>{state.round}</strong></div>
        <div><span>ผู้เล่น active</span><strong>{activeCount}</strong></div>
        <div><span>ในคิว</span><strong>{state.queue.length}</strong></div>
        <button className="round-button" onClick={() => send({ type: "round/start" })}>
          สร้างรอบใหม่
        </button>
      </section>

      <section className="courts-grid" style={{
        gridTemplateColumns: state.settings.courtColumns
          ? `repeat(${state.settings.courtColumns}, minmax(0, 1fr))`
          : undefined
      }}>
        {state.courts.map(court => {
          const playing = court.status === "playing" && court.teamA && court.teamB;
          return (
            <article className={`court-card ${playing ? "playing" : ""}`} key={court.id}>
              <header>
                <span>คอร์ท {court.id}</span>
                <small>{playing ? `รอบ ${court.startedRound}` : "ว่าง"}</small>
              </header>
              {playing ? (
                <div className="match">
                  <button className="team team-a" onClick={() => send({ type: "match/finish", courtId: court.id, winner: "A" })}>
                    {teamLabel(court.teamA!, court.liberoA).map(member => <b key={member}>{member}</b>)}
                    <small>{teamFlag(state, court.teamA!)}</small>
                    {court.teamA!.includes(LIBERO) && <span className="libero-select" onClick={event => {
                      event.stopPropagation(); setLiberoPicker({ courtId: court.id, side: "A" });
                    }}>เปลี่ยน Libero</span>}
                  </button>
                  <span className="versus">VS</span>
                  <button className="team team-b" onClick={() => send({ type: "match/finish", courtId: court.id, winner: "B" })}>
                    {teamLabel(court.teamB!, court.liberoB).map(member => <b key={member}>{member}</b>)}
                    <small>{teamFlag(state, court.teamB!)}</small>
                    {court.teamB!.includes(LIBERO) && <span className="libero-select" onClick={event => {
                      event.stopPropagation(); setLiberoPicker({ courtId: court.id, side: "B" });
                    }}>เปลี่ยน Libero</span>}
                  </button>
                </div>
              ) : (
                <div className="empty-court">
                  <p>พร้อมรับคู่ถัดไป</p>
                  <div className="court-actions">
                    <button onClick={() => send({ type: "court/fill", courtId: court.id })}>จัดลงคอร์ท</button>
                    <button className="ghost" onClick={() => openCustom(court.id)}>เลือกคู่เอง</button>
                  </div>
                </div>
              )}
              {playing && <div className="court-corners">
                <button onClick={() => send({ type: "court/replace", courtId: court.id })}>เปลี่ยนทั้งคอร์ท</button>
                <button onClick={() => openCustom(court.id)}>เลือกคู่เอง</button>
              </div>}
            </article>
          );
        })}
      </section>

      <div className="workspace-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Waiting list</p>
              <h2>คิวผู้เล่น</h2>
            </div>
            <div className="inline-actions">
              <button className="ghost compact" onClick={() => send({ type: "queue/shuffle" })}>สุ่มคิว</button>
              <button className="ghost compact" onClick={() => send({ type: "queue/clear" })}>ล้างคิว</button>
            </div>
          </div>
          <div className="chips">
            {state.queue.map((id, index) => {
              const player = state.players.find(item => item.id === id);
              if (!player) return null;
              return (
                <span
                  className="queue-chip"
                  key={id}
                  draggable
                  onDragStart={() => { draggedQueueId.current = id; }}
                  onDragOver={event => event.preventDefault()}
                  onDrop={() => {
                    if (draggedQueueId.current) send({
                      type: "queue/reorder", fromId: draggedQueueId.current, toId: id
                    });
                    draggedQueueId.current = null;
                  }}
                  onDragEnd={() => { draggedQueueId.current = null; }}
                >
                  <button disabled={index === 0} onClick={() => send({ type: "queue/move", id, direction: -1 })}>↑</button>
                  <i>{index + 1}</i>
                  {state.settings.hellvenMode && levelMeta[player.level].icon}
                  {player.name}
                  <button disabled={index === state.queue.length - 1} onClick={() => send({ type: "queue/move", id, direction: 1 })}>↓</button>
                </span>
              );
            })}
            {!state.queue.length && <p className="muted">ไม่มีผู้เล่นรอในคิว</p>}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Round schedule</p>
              <h2>คู่รอบ {state.round}</h2>
            </div>
          </div>
          <div className="pair-list">
            {state.schedule.map(pair => {
              const games = state.pairGames[pair.id] ?? 0;
              return (
                <div className="pair-row" key={pair.id}>
                  <span>{pair.members.map(playerName).join(" + ")}</span>
                  <b>{games}/{state.settings.gamesPerPair}</b>
                </div>
              );
            })}
            {!state.schedule.length && <p className="muted">กดสร้างรอบใหม่เพื่อจัดคู่</p>}
          </div>
        </section>
      </div>

      <section className="panel players-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Player pool</p>
            <h2>ผู้เล่น</h2>
          </div>
          <form onSubmit={submitPlayer}>
            <input value={name} onChange={event => setName(event.target.value)} placeholder="ชื่อผู้เล่นใหม่" />
            <button>เพิ่ม</button>
          </form>
        </div>
        <div className="player-grid">
          {state.players.map(player => (
            <div className={`player-row ${player.active ? "" : "inactive"}`} key={player.id}>
              <LevelSlider
                value={player.level}
                onChange={level => send({ type: "player/level", id: player.id, level })}
              />
              <strong>{player.name}</strong>
              <button className="ghost compact" onClick={() => send({ type: "player/toggle", id: player.id })}>
                {player.active ? "พัก" : "เปิด"}
              </button>
              <button className="ghost compact danger" onClick={() =>
                window.confirm(`ลบ ${player.name}?`) && send({ type: "player/remove", id: player.id })
              }>ลบ</button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel history-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Match history</p>
            <h2>ผลล่าสุด</h2>
          </div>
          <span>{visibleHistory.length} เกม{roomSync.room ? " · บันทึกถาวร" : ""}</span>
        </div>
        <div className="stats-tabs">
          <button className={statsTab === "players" ? "active" : ""} onClick={() => setStatsTab("players")}>ผู้เล่น</button>
          <button className={statsTab === "pairs" ? "active" : ""} onClick={() => setStatsTab("pairs")}>คู่</button>
          <button className={statsTab === "h2h" ? "active" : ""} onClick={() => setStatsTab("h2h")}>H2H</button>
          <button className={statsTab === "history" ? "active" : ""} onClick={() => setStatsTab("history")}>ประวัติ</button>
        </div>
        {statsTab === "players" && <div className="stats-list">{playerStats.map(item => (
          <div className="stat-row" key={item.playerId}>
            <strong>{playerName(item.playerId)}</strong>
            <span>W {item.wins} · L {item.losses} · เล่นจริง {item.games}</span>
            <small>Libero {item.liberoWins}W/{item.liberoLosses}L</small>
          </div>
        ))}</div>}
        {statsTab === "pairs" && <div className="stats-list">{pairStats.map(item => (
          <div className="stat-row" key={item.key}>
            <strong>{item.members.map(playerName).join(" + ")}</strong><span>{item.wins}W · {item.losses}L</span>
          </div>
        ))}</div>}
        {statsTab === "h2h" && <div className="stats-list">{headToHeadStats.map(item => (
          <div className="stat-row" key={item.key}>
            <strong>{playerName(item.players[0])} vs {playerName(item.players[1])}</strong>
            <span>{item.firstWins} : {item.secondWins}</span>
          </div>
        ))}</div>}
        {statsTab === "history" && !visibleHistory.length && <p className="muted">ยังไม่มีผลการแข่งขัน</p>}
        {statsTab === "history" && Object.entries(historyByDate).reverse().map(([date, matches]) => (
          <div className="history-day" key={date}>
            <div className="history-date">
              <strong>{date}</strong>
              <span>{matches.length} เกม</span>
            </div>
            {[...matches].reverse().map(match => {
              const winnerTeam = match.winner === "A" ? match.teamA : match.teamB;
              return (
                <div className="history-row" key={match.id}>
                  <span>คอร์ท {match.courtId} · รอบ {match.round}</span>
                  <strong>{teamLabel(
                    winnerTeam,
                    match.winner === "A" ? match.liberoA ?? null : match.liberoB ?? null
                  ).join(" + ")} ชนะ</strong>
                  <small>ชนะรวม {wins.get(pairKey(winnerTeam)) ?? 0}</small>
                </div>
              );
            })}
          </div>
        ))}
      </section>

      {customCourtId !== null && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-label="เลือกคู่เอง">
            <p className="eyebrow">คอร์ท {customCourtId}</p>
            <h2>เลือกผู้เล่น 2 + 2</h2>
            {!!state.schedule.filter(pair =>
              !pair.members.includes(LIBERO) && !pair.members.some(id => customBusyIds.has(id))
            ).length && (
              <div className="scheduled-picker">
                <strong>คู่จากตาราง</strong>
                {state.schedule.filter(pair =>
                  !pair.members.includes(LIBERO) && !pair.members.some(id => customBusyIds.has(id))
                ).map(pair => (
                  <div className="scheduled-pair" key={pair.id}>
                    <span>{pair.members.map(playerName).join(" + ")}</span>
                    <button onClick={() => chooseScheduledPair(pair.members, "A")}>→ A</button>
                    <button onClick={() => chooseScheduledPair(pair.members, "B")}>→ B</button>
                  </div>
                ))}
              </div>
            )}
            <div className="custom-grid">
              {customPlayers.map((selected, index) => (
                <label key={index}>
                  <span>{index < 2 ? "ทีม A" : "ทีม B"} · คนที่ {(index % 2) + 1}</span>
                  <select
                    value={selected}
                    onChange={event => setCustomPlayers(values =>
                      values.map((value, position) => position === index ? event.target.value : value)
                    )}
                  >
                    <option value="">เลือกผู้เล่น</option>
                    {state.players.filter(player => player.active && !state.courts.some(court =>
                      court.id !== customCourtId && court.status === "playing"
                      && [...(court.teamA ?? []), ...(court.teamB ?? [])].includes(player.id)
                    )).map(player => (
                      <option
                        key={player.id}
                        value={player.id}
                        disabled={customPlayers.some((value, position) => position !== index && value === player.id)}
                      >
                        {player.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setCustomCourtId(null)}>ยกเลิก</button>
              <button className="round-button" onClick={confirmCustom}>ยืนยันคู่</button>
            </div>
          </section>
        </div>
      )}

      {liberoPicker && (
        <div className="modal-backdrop">
          <section className="modal">
            <p className="eyebrow">Dynamic Libero</p>
            <h2>เลือกผู้เล่นที่ว่าง</h2>
            <div className="picker-list">
              {state.players.filter(player => player.active && !state.courts.some(court => court.status === "playing"
                && [
                  ...(court.teamA ?? []),
                  ...(court.teamB ?? []),
                  court.liberoA,
                  court.liberoB
                ].includes(player.id)
              )).map(player => player.id).map(id => (
                <button key={id} onClick={() => {
                  send({ type: "court/libero", ...liberoPicker, playerId: id });
                  setLiberoPicker(null);
                }}>{playerName(id)}</button>
              ))}
            </div>
            <div className="modal-actions"><button className="ghost" onClick={() => setLiberoPicker(null)}>รอต่อไป</button></div>
          </section>
        </div>
      )}
    </main>
  );
}

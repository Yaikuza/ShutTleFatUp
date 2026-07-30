import { useEffect, useReducer, useRef, useState } from "react";
import { appReducer, type AppAction } from "./app/appReducer";
import { LIBERO, pairKey, teamFlag } from "./domain/engine";
import type { AppState, PlayerLevel, Team } from "./domain/types";
import { loadState, saveState } from "./storage";
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
  const [customCourtId, setCustomCourtId] = useState<number | null>(null);
  const [customPlayers, setCustomPlayers] = useState<string[]>(["", "", "", ""]);
  const undoStack = useRef<AppState[]>([]);

  useEffect(() => saveState(state), [state]);

  const send = (action: AppAction) => {
    undoStack.current.push(structuredClone(state));
    if (undoStack.current.length > 30) undoStack.current.shift();
    dispatch(action);
  };

  const undo = () => {
    const previous = undoStack.current.pop();
    if (previous) dispatch({ type: "state/replace", state: previous });
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

  const activeCount = state.players.filter(player => player.active).length;
  const wins = new Map<string, number>();
  for (const match of state.history) {
    const key = pairKey(match.winner === "A" ? match.teamA : match.teamB);
    wins.set(key, (wins.get(key) ?? 0) + 1);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">ShutTle Fat Up</p>
          <h1>Court <span>Beta</span></h1>
        </div>
        <div className="top-actions">
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

      <section className="courts-grid">
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
                  </button>
                  <span className="versus">VS</span>
                  <button className="team team-b" onClick={() => send({ type: "match/finish", courtId: court.id, winner: "B" })}>
                    {teamLabel(court.teamB!, court.liberoB).map(member => <b key={member}>{member}</b>)}
                    <small>{teamFlag(state, court.teamB!)}</small>
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
              {playing && <button className="custom-corner" onClick={() => openCustom(court.id)}>เลือกคู่เอง</button>}
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
            <button className="ghost compact" onClick={() => send({ type: "queue/shuffle" })}>สุ่มคิว</button>
          </div>
          <div className="chips">
            {state.queue.map((id, index) => {
              const player = state.players.find(item => item.id === id);
              if (!player) return null;
              return (
                <span className="queue-chip" key={id}>
                  <i>{index + 1}</i>
                  {state.settings.hellvenMode && levelMeta[player.level].icon}
                  {player.name}
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
          <span>{state.history.length} เกม</span>
        </div>
        {state.history.slice(-8).reverse().map(match => {
          const winnerTeam = match.winner === "A" ? match.teamA : match.teamB;
          return (
            <div className="history-row" key={match.id}>
              <span>คอร์ท {match.courtId} · รอบ {match.round}</span>
              <strong>{winnerTeam.map(playerName).join(" + ")} ชนะ</strong>
              <small>ชนะรวม {wins.get(pairKey(winnerTeam)) ?? 0}</small>
            </div>
          );
        })}
      </section>

      {customCourtId !== null && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-label="เลือกคู่เอง">
            <p className="eyebrow">คอร์ท {customCourtId}</p>
            <h2>เลือกผู้เล่น 2 + 2</h2>
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
                    {state.players.filter(player => player.active).map(player => (
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
    </main>
  );
}

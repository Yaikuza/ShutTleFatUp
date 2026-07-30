import { useEffect, useReducer, useRef, useState } from "react";
import { appReducer, type AppAction } from "./app/appReducer";
import { LevelSlider, levelMeta } from "./components/LevelSlider";
import { StatsPanel } from "./components/StatsPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { CourtsGrid } from "./components/CourtsGrid";
import { LIBERO } from "./domain/engine";
import type { AppState, Team } from "./domain/types";
import { loadState, saveState } from "./storage";
import { useRoomSync } from "./supabase/useRoomSync";
import "./styles.css";

export default function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, loadState);
  const [name, setName] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customCourtId, setCustomCourtId] = useState<number | null>(null);
  const [customPlayers, setCustomPlayers] = useState<string[]>(["", "", "", ""]);
  const [liberoPicker, setLiberoPicker] = useState<{ courtId: number; side: "A" | "B" } | null>(null);
  const [notice, setNotice] = useState("");
  const [confirmAction, setConfirmAction] = useState<{ message: string; run: () => void } | null>(null);
  const undoStack = useRef<AppState[]>([]);
  const draggedQueueId = useRef<string | null>(null);
  const roomSync = useRoomSync(state, dispatch);

  useEffect(() => saveState(state), [state]);
  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme;
    document.documentElement.style.setProperty("--court-color", state.settings.courtColor);
  }, [state.settings.theme, state.settings.courtColor]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!confirmAction && customCourtId === null && !liberoPicker) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setConfirmAction(null);
      setCustomCourtId(null);
      setLiberoPicker(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [confirmAction, customCourtId, liberoPicker]);

  const askConfirm = (message: string, run: () => void) =>
    setConfirmAction({ message, run });

  const send = (action: AppAction) => {
    if (roomSync.status === "saving" && action.type === "match/finish") return;
    if (action.type === "match/finish") navigator.vibrate?.(35);
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
      if (!Array.isArray(imported.players) || !Array.isArray(imported.courts)) {
        setNotice("ไฟล์ข้อมูลไม่ถูกต้อง");
        return;
      }
      send({ type: "state/replace", state: imported });
      setNotice("นำเข้าข้อมูลเรียบร้อย");
    } catch {
      setNotice("ไฟล์ข้อมูลไม่ถูกต้อง");
    }
  };

  const activeCount = state.players.filter(player => player.active).length;
  const visibleHistory = roomSync.room ? roomSync.remoteHistory : state.history;
  const customBusyIds = new Set(state.courts.flatMap(court =>
    customCourtId !== null && court.id !== customCourtId && court.status === "playing"
      ? [...(court.teamA ?? []), ...(court.teamB ?? [])]
      : []
  ));
  const allBusyIds = new Set(state.courts.flatMap(court => court.status === "playing"
    ? [...(court.teamA ?? []), ...(court.teamB ?? []), court.liberoA, court.liberoB]
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
          <span className={`sync-badge sync-${roomSync.status}`} role="status" aria-live="polite">
            {roomSync.room ? `${roomSync.room.code} · ` : ""}
            {roomSync.status}
          </span>
          <button className="ghost" onClick={undo} disabled={!undoStack.current.length}>↩ ย้อนกลับ</button>
          <button className="ghost" onClick={() => setSettingsOpen(value => !value)}>⚙ ตั้งค่า</button>
          <a className="ghost link" href="../">แอปเดิม</a>
        </div>
      </header>

      {settingsOpen && (
        <SettingsPanel
          settings={state.settings}
          configured={roomSync.configured}
          roomCode={roomSync.room?.code}
          syncStatus={roomSync.status}
          syncMessage={roomSync.message}
          onSettingsChange={patch => send({ type: "settings/update", patch })}
          onExport={exportData}
          onImport={file => void importData(file)}
          onReset={() => askConfirm(
            "รีเซตรอบ คิว สนาม และประวัติของ Session นี้? รายชื่อผู้เล่นและสถิติถาวรจะยังอยู่",
            () => {
              send({ type: "session/reset" });
              setNotice("รีเซต Session เรียบร้อย");
            }
          )}
          onCreateRoom={code => void roomSync.createRoom(code)}
          onJoinRoom={code => void roomSync.joinRoom(code)}
          onLeaveRoom={roomSync.leaveRoom}
        />
      )}
      <section className="summary">
        <div><span>รอบ</span><strong>{state.round}</strong></div>
        <div><span>ผู้เล่น active</span><strong>{activeCount}</strong></div>
        <div><span>ในคิว</span><strong>{state.queue.length}</strong></div>
        <button className="round-button" onClick={() => send({ type: "round/start" })}>
          สร้างรอบใหม่
        </button>
      </section>

      <CourtsGrid
        state={state}
        saving={roomSync.status === "saving"}
        onAction={send}
        onCustomMatch={openCustom}
        onLibero={(courtId, side) => setLiberoPicker({ courtId, side })}
      />

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
              <button className="ghost compact danger" disabled={allBusyIds.has(player.id)} onClick={() =>
                askConfirm(`ลบ ${player.name} ออกจากรายชื่อผู้เล่น?`, () => {
                  send({ type: "player/remove", id: player.id });
                  setNotice(`ลบ ${player.name} แล้ว`);
                })
              }>ลบ</button>
            </div>
          ))}
        </div>
      </section>

      <StatsPanel
        history={visibleHistory}
        playerName={playerName}
        permanent={Boolean(roomSync.room)}
      />

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

      {confirmAction && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal confirm-modal" role="alertdialog" aria-modal="true" aria-label="ยืนยันรายการ">
            <p className="eyebrow">ShutTle Fat Up</p>
            <h2>ยืนยันรายการ</h2>
            <p>{confirmAction.message}</p>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setConfirmAction(null)}>ยกเลิก</button>
              <button className="round-button" onClick={() => {
                const run = confirmAction.run;
                setConfirmAction(null);
                run();
              }}>ยืนยัน</button>
            </div>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status" aria-live="polite">{notice}</div>}
    </main>
  );
}

import { useEffect, useReducer, useRef, useState } from "react";
import { appReducer, type AppAction } from "./app/appReducer";
import { StatsPanel } from "./components/StatsPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { CourtsGrid } from "./components/CourtsGrid";
import { QueueSchedule } from "./components/QueueSchedule";
import { PlayersPanel } from "./components/PlayersPanel";
import { CustomMatchPicker, LiberoPicker } from "./components/MatchPickers";
import { LIBERO } from "./domain/engine";
import type { AppState } from "./domain/types";
import { loadState, saveState } from "./storage";
import { useRoomSync } from "./supabase/useRoomSync";
import "./styles.css";

type MobileSheet = "queue" | "players" | "stats" | "settings";

export default function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, loadState);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customCourtId, setCustomCourtId] = useState<number | null>(null);
  const [customPlayers, setCustomPlayers] = useState<string[]>(["", "", "", ""]);
  const [liberoPicker, setLiberoPicker] = useState<{ courtId: number; side: "A" | "B" } | null>(null);
  const [notice, setNotice] = useState("");
  const [confirmAction, setConfirmAction] = useState<{ message: string; run: () => void } | null>(null);
  const [headerCompact, setHeaderCompact] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 760px)").matches);
  const [activeSheet, setActiveSheet] = useState<MobileSheet | null>(null);
  const [sheetClosing, setSheetClosing] = useState(false);
  const undoStack = useRef<AppState[]>([]);
  const sheetCloseTimer = useRef<number | null>(null);
  const roomSync = useRoomSync(state, dispatch);

  const closeMobileSheet = () => {
    if (!activeSheet || sheetClosing) return;
    setSheetClosing(true);
    sheetCloseTimer.current = window.setTimeout(() => {
      setActiveSheet(null);
      setSheetClosing(false);
      sheetCloseTimer.current = null;
    }, 280);
  };

  const toggleMobileSheet = (sheet: MobileSheet) => {
    if (activeSheet === sheet) {
      closeMobileSheet();
      return;
    }
    if (sheetCloseTimer.current !== null) window.clearTimeout(sheetCloseTimer.current);
    sheetCloseTimer.current = null;
    setSheetClosing(false);
    setActiveSheet(sheet);
  };

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
    if (!confirmAction && customCourtId === null && !liberoPicker && !activeSheet) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setConfirmAction(null);
      setCustomCourtId(null);
      setLiberoPicker(null);
      closeMobileSheet();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [activeSheet, confirmAction, customCourtId, liberoPicker]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setHeaderCompact(compact => compact ? window.scrollY > 36 : window.scrollY > 140);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
    };
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => {
      setIsMobile(media.matches);
      if (!media.matches) {
        if (sheetCloseTimer.current !== null) window.clearTimeout(sheetCloseTimer.current);
        sheetCloseTimer.current = null;
        setActiveSheet(null);
        setSheetClosing(false);
      }
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    document.body.classList.toggle("sheet-open", Boolean(activeSheet));
    return () => document.body.classList.remove("sheet-open");
  }, [activeSheet]);
  useEffect(() => () => {
    if (sheetCloseTimer.current !== null) window.clearTimeout(sheetCloseTimer.current);
  }, []);

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
  const allBusyIds = new Set(state.courts.flatMap(court => court.status === "playing"
    ? [...(court.teamA ?? []), ...(court.teamB ?? []), court.liberoA, court.liberoB]
    : []
  ));
  const modalOpen = customCourtId !== null || Boolean(liberoPicker) || Boolean(confirmAction);
  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const toggleSettings = () => {
    if (isMobile) {
      toggleMobileSheet("settings");
      return;
    }
    setSettingsOpen(open => {
      const next = !open;
      if (next && headerCompact) {
        window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      }
      return next;
    });
  };
  const settingsPanel = (
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
  );

  return (
    <main className="app-shell">
      <header className={`topbar ${headerCompact ? "is-compact" : ""}`}>
        <button className="brand-home" onClick={() => scrollTo("courts")} aria-label="กลับไปสนาม">
          <p className="eyebrow">ShutTle Fat Up</p>
          <h1>Court <span>Beta</span></h1>
          <span className="mobile-brand">SFU</span>
        </button>
        <div className="top-actions">
          <span className={`sync-badge sync-${roomSync.status}`} role="status" aria-live="polite">
            {roomSync.room ? `${roomSync.room.code} · ` : ""}
            {roomSync.status}
          </span>
          <button className="ghost" onClick={undo} disabled={!undoStack.current.length}>↩ ย้อนกลับ</button>
          <button className="ghost" onClick={toggleSettings}>⚙ ตั้งค่า</button>
        </div>
        <div className="mini-header" aria-hidden={!headerCompact}>
          <span>รอบ <b>{state.round}</b></span>
          <span>คิว <b>{state.queue.length}</b></span>
          <span className={`mini-sync sync-${roomSync.status}`}>
            {roomSync.room ? roomSync.room.code : roomSync.status}
          </span>
          <button onClick={() => send({ type: "round/start" })}>สร้างรอบ</button>
          <button className="mini-settings" onClick={toggleSettings} aria-label="ตั้งค่า">⚙</button>
        </div>
        <div className="mobile-header">
          <span
            className={`mobile-room sync-${roomSync.status}`}
            title={`สถานะ ${roomSync.status}`}
          >
            <i aria-hidden="true" />
            <b>{roomSync.room?.code ?? "LOCAL"}</b>
            {roomSync.status !== "synced" && <small>{roomSync.status}</small>}
          </span>
          <button onClick={undo} disabled={!undoStack.current.length} aria-label="ย้อนกลับ" title="ย้อนกลับ">↩</button>
          <button onClick={toggleSettings} aria-label="ตั้งค่า" title="ตั้งค่า">⚙</button>
        </div>
      </header>

      {settingsOpen && !isMobile && settingsPanel}
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

      {!isMobile && (
        <>
          <QueueSchedule state={state} playerName={playerName} onAction={send} />
          <PlayersPanel
            players={state.players}
            busyIds={allBusyIds}
            onAction={send}
            onDelete={player => askConfirm(`ลบ ${player.name} ออกจากรายชื่อผู้เล่น?`, () => {
              send({ type: "player/remove", id: player.id });
              setNotice(`ลบ ${player.name} แล้ว`);
            })}
          />
          <StatsPanel
            history={visibleHistory}
            playerName={playerName}
            permanent={Boolean(roomSync.room)}
          />
        </>
      )}

      {customCourtId !== null && (
        <CustomMatchPicker
          state={state}
          courtId={customCourtId}
          selectedPlayers={customPlayers}
          playerName={playerName}
          onSelectedPlayersChange={setCustomPlayers}
          onConfirm={confirmCustom}
          onClose={() => setCustomCourtId(null)}
        />
      )}

      {liberoPicker && (
        <LiberoPicker
          state={state}
          playerName={playerName}
          onChoose={playerId => {
            send({ type: "court/libero", ...liberoPicker, playerId });
            setLiberoPicker(null);
          }}
          onClose={() => setLiberoPicker(null)}
        />
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
      {isMobile && activeSheet && (
        <>
          <button
            className={`mobile-sheet-backdrop ${sheetClosing ? "is-closing" : ""}`}
            aria-label="ปิดหน้าต่าง"
            onClick={closeMobileSheet}
          />
          <section className={`mobile-sheet ${sheetClosing ? "is-closing" : ""}`} role="dialog" aria-modal="true" aria-label={
            activeSheet === "queue" ? "คิวและตารางรอบ"
              : activeSheet === "players" ? "รายชื่อผู้เล่น"
                : activeSheet === "stats" ? "สถิติ"
                  : "ตั้งค่า"
          }>
            <div className="mobile-sheet-handle" />
            <div className="mobile-sheet-body">
              {activeSheet === "queue" && (
                <QueueSchedule state={state} playerName={playerName} onAction={send} />
              )}
              {activeSheet === "players" && (
                <PlayersPanel
                  players={state.players}
                  busyIds={allBusyIds}
                  onAction={send}
                  onDelete={player => askConfirm(`ลบ ${player.name} ออกจากรายชื่อผู้เล่น?`, () => {
                    send({ type: "player/remove", id: player.id });
                    setNotice(`ลบ ${player.name} แล้ว`);
                  })}
                />
              )}
              {activeSheet === "stats" && (
                <StatsPanel
                  history={visibleHistory}
                  playerName={playerName}
                  permanent={Boolean(roomSync.room)}
                />
              )}
              {activeSheet === "settings" && settingsPanel}
            </div>
          </section>
        </>
      )}
      {!modalOpen && (
        <nav className={`mobile-dock ${activeSheet ? "sheet-active" : ""}`} aria-label="เมนูส่วนหลัก">
          <button
            className={activeSheet === "queue" ? "active" : ""}
            aria-expanded={activeSheet === "queue"}
            onClick={() => toggleMobileSheet("queue")}
          >
            <span>⌛</span>
            คิว
            <b>{state.queue.length}</b>
          </button>
          <button
            className={activeSheet === "players" ? "active" : ""}
            aria-expanded={activeSheet === "players"}
            onClick={() => toggleMobileSheet("players")}
          >
            <span>♙</span>
            ผู้เล่น
            <b>{activeCount}</b>
          </button>
          <button
            className={activeSheet === "stats" ? "active" : ""}
            aria-expanded={activeSheet === "stats"}
            onClick={() => toggleMobileSheet("stats")}
          >
            <span>▥</span>
            สถิติ
            <b>{visibleHistory.length}</b>
          </button>
        </nav>
      )}
    </main>
  );
}

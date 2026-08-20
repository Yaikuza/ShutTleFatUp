import { useEffect, useMemo, useRef, useState } from "react";
import type { AppAction } from "../app/appReducer";
import type { AppState } from "../domain/types";
import { levelMeta } from "./LevelSlider";
import { availableScheduleRounds, roundPairViews } from "./roundScheduleView";

interface QueueScheduleProps {
  state: AppState;
  playerName: (id: string) => string;
  onAction: (action: AppAction) => void;
}

export function QueueSchedule({ state, playerName, onAction }: QueueScheduleProps) {
  const draggedQueueId = useRef<string | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const rounds = useMemo(() => availableScheduleRounds(state), [state]);
  const viewedRound = selectedRound ?? state.round;
  const viewedIndex = rounds.indexOf(viewedRound);
  const viewedPairs = useMemo(() => roundPairViews(state, viewedRound), [state, viewedRound]);
  const isCurrentRound = viewedRound === state.round;

  useEffect(() => {
    if (selectedRound !== null && !rounds.includes(selectedRound)) setSelectedRound(null);
  }, [rounds, selectedRound]);

  const moveRound = (direction: -1 | 1) => {
    const nextRound = rounds[viewedIndex + direction];
    if (!nextRound) return;
    setSelectedRound(nextRound === state.round ? null : nextRound);
  };

  return (
    <div id="queue" className="workspace-grid">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Waiting list</p>
            <h2>คิวผู้เล่น</h2>
          </div>
          <div className="inline-actions">
            <button className="ghost compact" onClick={() => onAction({ type: "queue/shuffle" })}>สุ่มคิว</button>
            <button className="ghost compact" onClick={() => onAction({ type: "queue/clear" })}>ล้างคิว</button>
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
                  if (draggedQueueId.current) {
                    onAction({ type: "queue/reorder", fromId: draggedQueueId.current, toId: id });
                  }
                  draggedQueueId.current = null;
                }}
                onDragEnd={() => { draggedQueueId.current = null; }}
              >
                <button disabled={index === 0} onClick={() => onAction({ type: "queue/move", id, direction: -1 })}>↑</button>
                <i>{index + 1}</i>
                {state.settings.hellvenMode && levelMeta[player.level].icon}
                {player.name}
                <button
                  disabled={index === state.queue.length - 1}
                  onClick={() => onAction({ type: "queue/move", id, direction: 1 })}
                >
                  ↓
                </button>
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
            <h2>ตารางคู่</h2>
          </div>
          {isCurrentRound
            ? <button className="round-button compact" onClick={() => onAction({ type: "round/start" })}>สร้างรอบใหม่</button>
            : <span className="round-readonly">อ่านอย่างเดียว</span>}
        </div>
        <div className="round-browser" aria-label="เลือกรอบที่ต้องการดู">
          <button
            className="round-nav-button"
            disabled={viewedIndex <= 0}
            aria-label="ดูรอบก่อนหน้า"
            onClick={() => moveRound(-1)}
          >
            ‹
          </button>
          <div>
            <b>รอบ {viewedRound}</b>
            <span>{isCurrentRound ? "ปัจจุบัน" : "เล่นแล้ว"} · {viewedIndex + 1}/{rounds.length}</span>
          </div>
          <button
            className="round-nav-button"
            disabled={viewedIndex < 0 || viewedIndex >= rounds.length - 1}
            aria-label="ดูรอบถัดไป"
            onClick={() => moveRound(1)}
          >
            ›
          </button>
        </div>
        <div
          className="pair-list round-pair-list"
          onTouchStart={event => {
            const touch = event.touches[0];
            swipeStart.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={event => {
            const start = swipeStart.current;
            swipeStart.current = null;
            if (!start) return;
            const touch = event.changedTouches[0];
            const deltaX = touch.clientX - start.x;
            const deltaY = touch.clientY - start.y;
            if (Math.abs(deltaX) < 45 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
            moveRound(deltaX > 0 ? -1 : 1);
          }}
        >
          {viewedPairs.map(pair => {
            return (
              <div className="pair-row" key={pair.id}>
                <span>{pair.members.map(playerName).join(" + ")}</span>
                <b>{isCurrentRound ? `${pair.games}/${state.settings.gamesPerPair}` : `${pair.games} เกม`}</b>
              </div>
            );
          })}
          {!viewedPairs.length && <p className="muted">
            {isCurrentRound ? "กดสร้างรอบใหม่เพื่อจัดคู่" : "รอบนี้ยังไม่มีผลการแข่งขันที่บันทึกไว้"}
          </p>}
        </div>
        {!isCurrentRound && (
          <button className="ghost compact current-round-button" onClick={() => setSelectedRound(null)}>
            กลับรอบปัจจุบัน
          </button>
        )}
      </section>
    </div>
  );
}

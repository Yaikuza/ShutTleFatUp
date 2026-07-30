import { useRef } from "react";
import type { AppAction } from "../app/appReducer";
import type { AppState } from "../domain/types";
import { levelMeta } from "./LevelSlider";

interface QueueScheduleProps {
  state: AppState;
  playerName: (id: string) => string;
  onAction: (action: AppAction) => void;
}

export function QueueSchedule({ state, playerName, onAction }: QueueScheduleProps) {
  const draggedQueueId = useRef<string | null>(null);

  return (
    <div className="workspace-grid">
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
  );
}

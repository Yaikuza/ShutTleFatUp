import { useState } from "react";
import type { AppAction } from "../app/appReducer";
import type { Player } from "../domain/types";
import { LevelSlider } from "./LevelSlider";

interface PlayersPanelProps {
  players: Player[];
  busyIds: ReadonlySet<string | null>;
  onAction: (action: AppAction) => void;
  onDelete: (player: Player) => void;
}

export function PlayersPanel({ players, busyIds, onAction, onDelete }: PlayersPanelProps) {
  const [name, setName] = useState("");

  const submitPlayer = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    onAction({ type: "player/add", name });
    setName("");
  };

  return (
    <section id="players" className="panel players-panel">
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
        {players.map(player => (
          <div className={`player-row ${player.active ? "" : "inactive"}`} key={player.id}>
            <LevelSlider
              value={player.level}
              onChange={level => onAction({ type: "player/level", id: player.id, level })}
            />
            <strong>{player.name}</strong>
            <button className="ghost compact" onClick={() => onAction({ type: "player/toggle", id: player.id })}>
              {player.active ? "พัก" : "เปิด"}
            </button>
            <button
              className="ghost compact danger"
              disabled={busyIds.has(player.id)}
              onClick={() => onDelete(player)}
            >
              ลบ
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

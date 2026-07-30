import { LIBERO } from "../domain/engine";
import type { AppState, Team } from "../domain/types";

interface CustomMatchPickerProps {
  state: AppState;
  courtId: number;
  selectedPlayers: string[];
  playerName: (id: string) => string;
  onSelectedPlayersChange: (players: string[]) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function CustomMatchPicker({
  state,
  courtId,
  selectedPlayers,
  playerName,
  onSelectedPlayersChange,
  onConfirm,
  onClose
}: CustomMatchPickerProps) {
  const busyIds = new Set(state.courts.flatMap(court =>
    court.id !== courtId && court.status === "playing"
      ? [...(court.teamA ?? []), ...(court.teamB ?? [])]
      : []
  ));
  const scheduledPairs = state.schedule.filter(pair =>
    !pair.members.includes(LIBERO) && !pair.members.some(id => busyIds.has(id))
  );

  const chooseScheduledPair = (members: Team, side: "A" | "B") => {
    if (members.includes(LIBERO)) return;
    if (side === "A") {
      const other = selectedPlayers.slice(2).map(id => members.includes(id) ? "" : id);
      onSelectedPlayersChange([members[0], members[1], other[0], other[1]]);
      return;
    }
    const other = selectedPlayers.slice(0, 2).map(id => members.includes(id) ? "" : id);
    onSelectedPlayersChange([other[0], other[1], members[0], members[1]]);
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-label="เลือกคู่เอง">
        <p className="eyebrow">คอร์ท {courtId}</p>
        <h2>เลือกผู้เล่น 2 + 2</h2>
        {!!scheduledPairs.length && (
          <div className="scheduled-picker">
            <strong>คู่จากตาราง</strong>
            {scheduledPairs.map(pair => (
              <div className="scheduled-pair" key={pair.id}>
                <span>{pair.members.map(playerName).join(" + ")}</span>
                <button onClick={() => chooseScheduledPair(pair.members, "A")}>→ A</button>
                <button onClick={() => chooseScheduledPair(pair.members, "B")}>→ B</button>
              </div>
            ))}
          </div>
        )}
        <div className="custom-grid">
          {selectedPlayers.map((selected, index) => (
            <label key={index}>
              <span>{index < 2 ? "ทีม A" : "ทีม B"} · คนที่ {(index % 2) + 1}</span>
              <select
                value={selected}
                onChange={event => onSelectedPlayersChange(
                  selectedPlayers.map((value, position) => position === index ? event.target.value : value)
                )}
              >
                <option value="">เลือกผู้เล่น</option>
                {state.players.filter(player => player.active && !busyIds.has(player.id)).map(player => (
                  <option
                    key={player.id}
                    value={player.id}
                    disabled={selectedPlayers.some((value, position) => position !== index && value === player.id)}
                  >
                    {player.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>ยกเลิก</button>
          <button className="round-button" onClick={onConfirm}>ยืนยันคู่</button>
        </div>
      </section>
    </div>
  );
}

interface LiberoPickerProps {
  state: AppState;
  playerName: (id: string) => string;
  onChoose: (playerId: string) => void;
  onClose: () => void;
}

export function LiberoPicker({ state, playerName, onChoose, onClose }: LiberoPickerProps) {
  const busyIds = new Set(state.courts.flatMap(court => court.status === "playing"
    ? [...(court.teamA ?? []), ...(court.teamB ?? []), court.liberoA, court.liberoB]
    : []
  ));
  const availablePlayers = state.players.filter(player => player.active && !busyIds.has(player.id));

  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-modal="true" aria-label="เลือก Dynamic Libero">
        <p className="eyebrow">Dynamic Libero</p>
        <h2>เลือกผู้เล่นที่ว่าง</h2>
        <div className="picker-list">
          {availablePlayers.map(player => (
            <button key={player.id} onClick={() => onChoose(player.id)}>{playerName(player.id)}</button>
          ))}
        </div>
        <div className="modal-actions"><button className="ghost" onClick={onClose}>รอต่อไป</button></div>
      </section>
    </div>
  );
}

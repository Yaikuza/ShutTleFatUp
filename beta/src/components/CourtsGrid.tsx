import type { AppAction } from "../app/appReducer";
import { LIBERO, teamFlag } from "../domain/engine";
import type { AppState, Team } from "../domain/types";

export function CourtsGrid({
  state,
  saving,
  onAction,
  onCustomMatch,
  onLibero
}: {
  state: AppState;
  saving: boolean;
  onAction: (action: AppAction) => void;
  onCustomMatch: (courtId: number) => void;
  onLibero: (courtId: number, side: "A" | "B") => void;
}) {
  const playerName = (id: string) =>
    id === LIBERO ? "Libero" : state.players.find(player => player.id === id)?.name ?? id;
  const teamLabel = (team: Team, libero: string | null) =>
    team.map(member => member === LIBERO
      ? `${libero ? playerName(libero) : "เลือกผู้เล่น"} (Libero)`
      : playerName(member)
    );

  return (
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
                <button
                  className="team team-a"
                  disabled={saving}
                  aria-label={`${teamLabel(court.teamA!, court.liberoA).join(" และ ")} ชนะ`}
                  onClick={() => onAction({ type: "match/finish", courtId: court.id, winner: "A" })}
                >
                  {teamLabel(court.teamA!, court.liberoA).map(member => <b key={member}>{member}</b>)}
                  <small>{teamFlag(state, court.teamA!)}</small>
                  {court.teamA!.includes(LIBERO) && (
                    <span className="libero-select" onClick={event => {
                      event.stopPropagation();
                      onLibero(court.id, "A");
                    }}>เปลี่ยน Libero</span>
                  )}
                </button>
                <span className="versus">VS</span>
                <button
                  className="team team-b"
                  disabled={saving}
                  aria-label={`${teamLabel(court.teamB!, court.liberoB).join(" และ ")} ชนะ`}
                  onClick={() => onAction({ type: "match/finish", courtId: court.id, winner: "B" })}
                >
                  {teamLabel(court.teamB!, court.liberoB).map(member => <b key={member}>{member}</b>)}
                  <small>{teamFlag(state, court.teamB!)}</small>
                  {court.teamB!.includes(LIBERO) && (
                    <span className="libero-select" onClick={event => {
                      event.stopPropagation();
                      onLibero(court.id, "B");
                    }}>เปลี่ยน Libero</span>
                  )}
                </button>
              </div>
            ) : (
              <div className="empty-court">
                <p>พร้อมรับคู่ถัดไป</p>
                <div className="court-actions">
                  <button onClick={() => onAction({ type: "court/fill", courtId: court.id })}>จัดลงคอร์ท</button>
                  <button className="ghost" onClick={() => onCustomMatch(court.id)}>เลือกคู่เอง</button>
                </div>
              </div>
            )}
            {playing && (
              <div className="court-corners">
                <button onClick={() => onAction({ type: "court/replace", courtId: court.id })}>เปลี่ยนทั้งคอร์ท</button>
                <button onClick={() => onCustomMatch(court.id)}>เลือกคู่เอง</button>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

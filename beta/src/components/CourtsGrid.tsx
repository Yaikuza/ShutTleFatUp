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
  const flagLabel = {
    hell: "Hell",
    human: "Human",
    heaven: "Heaven",
    mixed: "Mixed"
  } as const;

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
              <div className="court-title">
                <small>COURT</small>
                <span>{court.id}</span>
              </div>
              <span className={`court-status ${playing ? "is-playing" : ""}`}>
                <i aria-hidden="true" />
                {playing ? `กำลังเล่น · รอบ ${court.startedRound}` : "ว่าง พร้อมจัดคู่"}
              </span>
            </header>
            {playing ? (
              <>
                <div className="court-floor">
                  <svg className="court-lines" viewBox="0 0 1340 610" preserveAspectRatio="none" aria-hidden="true">
                    <rect x="4" y="4" width="1332" height="602" rx="5" />
                    <path d="M4 46H1336M4 564H1336" />
                    <path d="M76 4V606M472 4V606M868 4V606M1264 4V606" />
                    <path d="M4 305H472M868 305H1336" />
                    <path className="court-net" d="M670 4V606" />
                  </svg>
                  <div className="match">
                    <div className="team team-a">
                      <button
                        className="team-result"
                        disabled={saving}
                        aria-label={`${teamLabel(court.teamA!, court.liberoA).join(" และ ")} ชนะ`}
                        onClick={() => onAction({ type: "match/finish", courtId: court.id, winner: "A" })}
                      >
                        <span className="team-side">ทีม A</span>
                        <span className="team-players">
                          {teamLabel(court.teamA!, court.liberoA).map((member, index) =>
                            <b key={`${member}-${index}`}>{member}</b>
                          )}
                        </span>
                        <span className={`level-badge level-${teamFlag(state, court.teamA!)}`}>
                          {flagLabel[teamFlag(state, court.teamA!)]}
                        </span>
                        <span className="winner-hint">แตะเมื่อทีมนี้ชนะ</span>
                      </button>
                      {court.teamA!.includes(LIBERO) && (
                        <button className="libero-select" onClick={() => onLibero(court.id, "A")}>
                          เปลี่ยนผู้เล่น Libero
                        </button>
                      )}
                    </div>
                    <span className="versus" aria-hidden="true">VS</span>
                    <div className="team team-b">
                      <button
                        className="team-result"
                        disabled={saving}
                        aria-label={`${teamLabel(court.teamB!, court.liberoB).join(" และ ")} ชนะ`}
                        onClick={() => onAction({ type: "match/finish", courtId: court.id, winner: "B" })}
                      >
                        <span className="team-side">ทีม B</span>
                        <span className="team-players">
                          {teamLabel(court.teamB!, court.liberoB).map((member, index) =>
                            <b key={`${member}-${index}`}>{member}</b>
                          )}
                        </span>
                        <span className={`level-badge level-${teamFlag(state, court.teamB!)}`}>
                          {flagLabel[teamFlag(state, court.teamB!)]}
                        </span>
                        <span className="winner-hint">แตะเมื่อทีมนี้ชนะ</span>
                      </button>
                      {court.teamB!.includes(LIBERO) && (
                        <button className="libero-select" onClick={() => onLibero(court.id, "B")}>
                          เปลี่ยนผู้เล่น Libero
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="court-toolbar">
                  <button onClick={() => onAction({ type: "court/replace", courtId: court.id })}>
                    ↻ เปลี่ยนทั้งคอร์ท
                  </button>
                  <button onClick={() => onCustomMatch(court.id)}>✦ เลือกคู่เอง</button>
                </div>
              </>
            ) : (
              <div className="empty-court">
                <span className="empty-court-mark" aria-hidden="true">↗</span>
                <strong>สนามพร้อมใช้งาน</strong>
                <p>จัดคู่ถัดไปลงสนาม หรือเลือกผู้เล่นด้วยตัวเอง</p>
                <div className="court-actions">
                  <button onClick={() => onAction({ type: "court/fill", courtId: court.id })}>จัดคู่ถัดไป</button>
                  <button className="ghost" onClick={() => onCustomMatch(court.id)}>เลือกคู่เอง</button>
                </div>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

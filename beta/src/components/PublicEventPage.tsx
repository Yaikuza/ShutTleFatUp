import { useEffect, useState } from "react";
import {
  getPublicPlayEvent,
  setPublicAttendance,
  type AttendanceResponse,
  type PublicPlayEvent
} from "../supabase/playEventRepository";

function eventDateLabel(date: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok"
  }).format(new Date(`${date}T12:00:00+07:00`));
}

function shortTime(value: string | null): string {
  return value ? value.slice(0, 5) : "";
}

export function PublicEventPage({ publicCode }: { publicCode: string }) {
  const playerKey = `sfu_event_player:${publicCode.toUpperCase()}`;
  const [data, setData] = useState<PublicPlayEvent | null>(null);
  const [playerId, setPlayerId] = useState(() => localStorage.getItem(playerKey) ?? "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await getPublicPlayEvent(publicCode);
      setData(next);
      setError("");
      if (playerId && !next.players.some(player => player.id === playerId)) {
        setPlayerId("");
        localStorage.removeItem(playerKey);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "โหลดกิจกรรมไม่สำเร็จ");
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 5000);
    return () => window.clearInterval(timer);
  }, [publicCode]);

  const update = async (response: AttendanceResponse, checkIn = false) => {
    if (!playerId || saving) return;
    setSaving(true);
    try {
      const next = await setPublicAttendance(publicCode, playerId, response, checkIn);
      localStorage.setItem(playerKey, playerId);
      setData(next);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <main className="event-page"><div className="event-loading">กำลังโหลดกิจกรรม…</div></main>;
  if (!data) return (
    <main className="event-page">
      <section className="event-card event-error">
        <p className="eyebrow">ShutTle Fat Up</p>
        <h1>เปิดกิจกรรมไม่ได้</h1>
        <p>{error || "ไม่พบกิจกรรมนี้"}</p>
      </section>
    </main>
  );

  const activeAttendance = data.attendance.filter(item => item.response !== "cancelled");
  const selected = data.attendance.find(item => item.player_id === playerId);
  const going = activeAttendance.filter(item => item.response === "going");
  const maybe = activeAttendance.filter(item => item.response === "maybe");
  const checkedIn = activeAttendance.filter(item => item.checked_in_at);
  const full = Boolean(data.event.capacity && going.length >= data.event.capacity && selected?.response !== "going");

  return (
    <main className="event-page">
      <section className="event-hero event-card">
        <div className="event-brand"><span>SFU</span><small>PLAY DAY</small></div>
        <p className="eyebrow">Badminton session</p>
        <h1>{data.event.title}</h1>
        <div className="event-meta">
          <span><b>วันที่</b>{eventDateLabel(data.event.play_date)}</span>
          <span><b>เวลา</b>{shortTime(data.event.starts_at)}{data.event.ends_at ? `–${shortTime(data.event.ends_at)}` : ""}</span>
          {data.event.location && <span><b>สนาม</b>{data.event.location}</span>}
        </div>
        <div className="event-count">
          <strong>{going.length}{data.event.capacity ? `/${data.event.capacity}` : ""}</strong>
          <span>คนลงชื่อมาเล่น</span>
        </div>
      </section>

      <section className="event-card event-response">
        <div>
          <p className="eyebrow">Your status</p>
          <h2>{selected?.checked_in_at ? "เช็กอินแล้ว" : selected ? "สถานะของคุณ" : "เลือกชื่อของคุณ"}</h2>
        </div>
        <select value={playerId} onChange={event => {
          setPlayerId(event.target.value);
          if (event.target.value) localStorage.setItem(playerKey, event.target.value);
        }}>
          <option value="">เลือกชื่อผู้เล่น</option>
          {data.players.map(player => <option value={player.id} key={player.id}>{player.name}</option>)}
        </select>
        <div className="event-response-actions">
          <button disabled={!playerId || saving || full} className={selected?.response === "going" ? "active" : ""} onClick={() => void update("going")}>มาเล่น</button>
          <button disabled={!playerId || saving} className={selected?.response === "maybe" ? "active" : ""} onClick={() => void update("maybe")}>อาจจะมา</button>
          <button disabled={!playerId || saving || selected?.response !== "going"} className="checkin" onClick={() => void update("going", true)}>
            {selected?.checked_in_at ? "ถึงสนามแล้ว ✓" : "ถึงสนามแล้ว"}
          </button>
          <button disabled={!playerId || saving || !selected} className="cancel" onClick={() => void update("cancelled")}>ยกเลิก</button>
        </div>
        {full && <p className="event-note">รายชื่อเต็มแล้ว กรุณาเลือก “อาจจะมา” หรือติดต่อผู้จัด</p>}
        {error && <p className="event-note error" role="alert">{error}</p>}
      </section>

      <section className="event-card event-roster">
        <header><div><p className="eyebrow">Attendance</p><h2>รายชื่อผู้เล่น</h2></div><span>{checkedIn.length} ถึงแล้ว</span></header>
        <div className="event-roster-list">
          {going.map((item, index) => (
            <div className={item.checked_in_at ? "arrived" : ""} key={item.player_id}>
              <i>{index + 1}</i><strong>{item.player_name}</strong>
              <span>{item.queued_at ? "เข้าคิวแล้ว" : item.checked_in_at ? "ถึงแล้ว" : "มาเล่น"}</span>
            </div>
          ))}
          {maybe.map(item => (
            <div className="maybe" key={item.player_id}><i>?</i><strong>{item.player_name}</strong><span>อาจจะมา</span></div>
          ))}
          {!activeAttendance.length && <p className="muted">ยังไม่มีผู้ลงชื่อ</p>}
        </div>
      </section>
      <a className="event-admin-link" href="./">เปิดหน้าควบคุมสนาม</a>
    </main>
  );
}

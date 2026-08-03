import { useEffect, useState } from "react";
import { bangkokDateKey } from "../domain/date";
import {
  createPlayEvent,
  approveEventGuest,
  confirmGuestPayment,
  listEventAttendance,
  listPlayEvents,
  markAttendanceQueued,
  setPublicAttendance,
  subscribeToEventAttendance,
  isPlayEventExpired,
  type EventAttendance,
  type PlayEvent
} from "../supabase/playEventRepository";
import { leaveRoomChannel } from "../supabase/roomRepository";

function errorMessage(caught: unknown, fallback: string): string {
  if (caught && typeof caught === "object" && "message" in caught && typeof caught.message === "string") {
    return caught.message;
  }
  return fallback;
}

export function PlayDayPanel({
  room,
  activeEventId,
  onActivateEvent,
  onEndSession,
  onQueuePlayer
}: {
  room: { id: string; code: string } | null;
  activeEventId: string | null;
  onActivateEvent: (eventId: string, queuedPlayerIds: string[]) => Promise<void>;
  onEndSession: () => Promise<void>;
  onQueuePlayer: (playerId: string) => Promise<void>;
}) {
  const [events, setEvents] = useState<PlayEvent[]>([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [attendance, setAttendance] = useState<EventAttendance[]>([]);
  const [creating, setCreating] = useState(false);
  const [busyPlayer, setBusyPlayer] = useState("");
  const [guestName, setGuestName] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: "ตีแบดประจำสัปดาห์",
    playDate: bangkokDateKey(),
    startsAt: "18:00",
    endsAt: "20:00",
    location: "",
    capacity: "",
    checkinMode: "manual" as "manual" | "auto"
  });

  const selected = events.find(event => event.id === selectedId) ?? events[0] ?? null;
  const selectedExpired = selected ? isPlayEventExpired(selected) : false;

  const loadEvents = async () => {
    if (!room) return;
    setEventsLoaded(false);
    try {
      const next = (await listPlayEvents(room.id)).filter(event => !isPlayEventExpired(event));
      setEvents(next);
      setSelectedId(current => next.some(event => event.id === current) ? current : next[0]?.id ?? "");
      setEventsLoaded(true);
      setError("");
    } catch (caught) {
      setError(errorMessage(caught, "โหลดวันเล่นไม่สำเร็จ"));
    }
  };

  const loadAttendance = async (eventId: string) => {
    try {
      setAttendance(await listEventAttendance(eventId));
    } catch (caught) {
      setError(errorMessage(caught, "โหลดรายชื่อไม่สำเร็จ"));
    }
  };

  useEffect(() => { void loadEvents(); }, [room?.id]);
  useEffect(() => {
    if (eventsLoaded && activeEventId && !events.some(event => event.id === activeEventId)) void onEndSession();
  }, [activeEventId, events, eventsLoaded]);
  useEffect(() => {
    if (!selected) {
      setAttendance([]);
      return;
    }
    void loadAttendance(selected.id);
    const channel = subscribeToEventAttendance(selected.id, () => void loadAttendance(selected.id));
    return () => { void leaveRoomChannel(channel); };
  }, [selected?.id]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!room || !form.title.trim() || creating) return;
    setCreating(true);
    try {
      const created = await createPlayEvent(room, {
        ...form,
        capacity: form.capacity ? Number(form.capacity) : undefined
      });
      setEvents(current => [created, ...current]);
      setSelectedId(created.id);
      setError("");
    } catch (caught) {
      setError(errorMessage(caught, "สร้างวันเล่นไม่สำเร็จ"));
    } finally {
      setCreating(false);
    }
  };

  const share = async () => {
    if (!selected) return;
    const url = `${window.location.origin}${window.location.pathname}#/event/${selected.public_code}`;
    const going = attendance.filter(item => item.response === "going");
    const names = going.map((item, index) => `${index + 1}. ${item.player_name}`).join("\n");
    const text = `🏸 ${selected.title}\n📅 ${selected.play_date} · ${selected.starts_at.slice(0, 5)}\n${selected.location ? `📍 ${selected.location}\n` : ""}\nลงชื่อแล้ว ${going.length}${selected.capacity ? `/${selected.capacity}` : ""} คน${names ? `\n${names}` : ""}\n\nลงชื่อและเช็กอิน:\n${url}`;
    try {
      if (navigator.share) await navigator.share({ title: selected.title, text });
      else {
        await navigator.clipboard.writeText(text);
        setError("คัดลอกข้อความแล้ว นำไปวางใน LINE ได้เลย");
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError("แชร์ไม่สำเร็จ กรุณาลองอีกครั้ง");
    }
  };

  const queuePlayer = async (item: EventAttendance) => {
    if (!room || !selected || selectedExpired || busyPlayer) return;
    setBusyPlayer(item.player_id);
    try {
      if (activeEventId !== selected.id) await activateSelectedEvent();
      const updated = item.is_guest
        ? await approveEventGuest(room.id, selected.id, item.player_id)
        : await markAttendanceQueued(room.id, selected.id, item.player_id);
      await onQueuePlayer(updated.player_id);
      setAttendance(current => current.map(entry => entry.player_id === item.player_id ? updated : entry));
      setError("");
    } catch (caught) {
      setError(errorMessage(caught, "นำผู้เล่นเข้าคิวไม่สำเร็จ"));
    } finally {
      setBusyPlayer("");
    }
  };

  const checkInPlayer = async (item: EventAttendance) => {
    if (!selected || selectedExpired || busyPlayer || item.is_guest) return;
    setBusyPlayer(item.player_id);
    try {
      const next = await setPublicAttendance(selected.public_code, item.player_id, "going", true);
      setAttendance(next.attendance);
      setError("");
    } catch (caught) {
      setError(errorMessage(caught, "เช็กอินไม่สำเร็จ"));
    } finally {
      setBusyPlayer("");
    }
  };

  const activateSelectedEvent = async () => {
    if (!selected || selectedExpired) return;
    try {
      const latest = await listEventAttendance(selected.id);
      setAttendance(latest);
      await onActivateEvent(selected.id, latest.filter(item => item.queued_at).map(item => item.player_id));
      setError("");
    } catch (caught) {
      setError(errorMessage(caught, "เริ่ม Session ไม่สำเร็จ"));
    }
  };

  const confirmPayment = async (item: EventAttendance) => {
    if (!room || !selected || busyPlayer || item.payment_status === "confirmed") return;
    setBusyPlayer(item.player_id);
    try {
      const updated = await confirmGuestPayment(room.id, selected.id, item.player_id);
      setAttendance(current => current.map(entry => entry.player_id === item.player_id ? updated : entry));
      setError("");
    } catch (caught) {
      setError(errorMessage(caught, "ยืนยันการชำระเงินไม่สำเร็จ"));
    } finally { setBusyPlayer(""); }
  };

  if (!room) return (
    <section className="panel play-day-panel">
      <p className="eyebrow">Play day</p><h2>ลงชื่อและเช็กอิน</h2>
      <p className="muted">เชื่อมต่อหรือสร้างห้องใน Settings ก่อนสร้างวันเล่น</p>
    </section>
  );

  const going = attendance.filter(item => item.response === "going");
  const arrived = going.filter(item => item.checked_in_at);
  const waiting = going.filter(item => !item.checked_in_at && !item.is_guest);

  return (
    <section className="panel play-day-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Play day</p><h2>ลงชื่อและเช็กอิน</h2></div>
        <span>{room.code}</span>
      </div>

      {events.length > 0 && (
        <select className="play-event-select" value={selected?.id ?? ""} onChange={event => setSelectedId(event.target.value)}>
          {events.map(item => <option value={item.id} key={item.id}>{item.play_date} · {item.title} · {item.location || "ยังไม่ระบุสนาม"} · {item.public_code}</option>)}
        </select>
      )}

      {selected && (
        <>
          <div className="play-event-summary">
            <div><strong>{selected.title}</strong><span>{selected.play_date} · {selected.starts_at.slice(0, 5)} · สนาม: {selected.location || "ยังไม่ระบุ"} · Session: {selected.public_code}</span></div>
            <div className="play-event-actions">
              <button
                className={activeEventId === selected.id ? "session-active" : "ghost"}
                disabled={activeEventId === selected.id || selectedExpired}
                onClick={() => void activateSelectedEvent()}
              >
                {activeEventId === selected.id ? "Session สนาม ✓" : "ใช้เป็น Session"}
              </button>
              <button className="round-button" onClick={() => void share()}>แชร์ไป LINE</button>
              <button className="ghost" disabled title="ยังไม่มีบัญชีผู้รับเงิน">QR ชำระเงิน (รอบัญชีผู้รับ)</button>
              {activeEventId === selected.id && <button className="ghost danger" onClick={() => void onEndSession()}>จบ Session</button>}
            </div>
          </div>
          {selectedExpired && <p className="play-event-message">กิจกรรมจบแล้ว · การเช็กอินและเข้าคิวถูกปิด</p>}
        </>
      )}

      {selected && (
        <div className="attendance-board">
          <div className="attendance-column arrived">
            <header><strong>ถึงสนามแล้ว</strong><span>{arrived.length}</span></header>
            {arrived.map(item => (
              <div className="attendance-person" key={item.player_id}>
                <b>{item.player_name}</b>
                {item.queued_at
                  ? <span>{item.guest_fee_baht ? `100 บาท · ${item.payment_status === "confirmed" ? "รับเงินแล้ว" : "รอยืนยันเงิน"}` : "เข้าคิวแล้ว"}</span>
                  : <button disabled={selectedExpired || Boolean(busyPlayer)} onClick={() => void queuePlayer(item)}>{item.is_guest ? "อนุมัติ + เข้าคิว" : "เข้าคิว"}</button>}
                {item.guest_fee_baht > 0 && item.payment_status === "pending" && <button disabled={Boolean(busyPlayer)} onClick={() => void confirmPayment(item)}>ยืนยันเงิน</button>}
              </div>
            ))}
            {!arrived.length && <small>ยังไม่มีคนเช็กอิน</small>}
          </div>
          <div className="attendance-column">
            <header><strong>ยังมาไม่ถึง</strong><span>{waiting.length}</span></header>
            {waiting.map(item => (
              <div className="attendance-person" key={item.player_id}>
                <b>{item.player_name}</b>
                <button disabled={selectedExpired || Boolean(busyPlayer)} onClick={() => void checkInPlayer(item)}>
                  {busyPlayer === item.player_id ? "กำลังเช็กอิน…" : "ถึงแล้ว"}
                </button>
              </div>
            ))}
            {!waiting.length && <small>ไม่มีรายชื่อรอ</small>}
          </div>
        </div>
      )}

      <details className="play-event-create" open={!events.length}>
        <summary>สร้างวันเล่นใหม่</summary>
        <form onSubmit={create}>
          <label>ชื่อกิจกรรม<input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} required /></label>
          <label>วันที่<input type="date" value={form.playDate} onChange={event => setForm({ ...form, playDate: event.target.value })} required /></label>
          <label>เริ่ม<input type="time" value={form.startsAt} onChange={event => setForm({ ...form, startsAt: event.target.value })} required /></label>
          <label>จบ<input type="time" value={form.endsAt} onChange={event => setForm({ ...form, endsAt: event.target.value })} /></label>
          <label>สนาม<input value={form.location} onChange={event => setForm({ ...form, location: event.target.value })} /></label>
          <label>รับสูงสุด<input type="number" min="1" value={form.capacity} onChange={event => setForm({ ...form, capacity: event.target.value })} placeholder="ไม่จำกัด" /></label>
          <label>เช็กอิน<select value={form.checkinMode} onChange={event => setForm({ ...form, checkinMode: event.target.value as "manual" | "auto" })}><option value="manual">ผู้จัดกดเข้าคิว (แนะนำ)</option><option value="auto">เช็กอินแล้วเข้าคิวอัตโนมัติ</option></select></label>
          <button className="round-button" disabled={creating}>{creating ? "กำลังสร้าง…" : "สร้างและรับลิงก์"}</button>
        </form>
      </details>
      {error && <p className={`play-event-message ${error.startsWith("คัดลอก") ? "success" : ""}`} role="status">{error}</p>}
    </section>
  );
}

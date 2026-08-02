import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./client";
import { ensureAnonymousUser, joinRemoteRoom } from "./roomRepository";

export type PlayEventStatus = "open" | "closed" | "finished";
export type AttendanceResponse = "going" | "maybe" | "cancelled";

export type PlayEvent = {
  id: string;
  room_id: string;
  public_code: string;
  title: string;
  play_date: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  capacity: number | null;
  status: PlayEventStatus;
  checkin_mode: "manual" | "auto";
  created_at: string;
};

export type EventAttendance = {
  event_id: string;
  player_id: string;
  player_name: string;
  response: AttendanceResponse;
  checked_in_at: string | null;
  queued_at: string | null;
  is_guest: boolean;
  guest_fee_baht: number;
  payment_status: "not_required" | "pending" | "confirmed";
  updated_at: string;
};

export type EventPlayer = { id: string; name: string };

export type PublicPlayEvent = {
  event: PlayEvent;
  players: EventPlayer[];
  attendance: EventAttendance[];
};

export async function createPlayEvent(
  room: { id: string; code: string },
  input: {
    title: string;
    playDate: string;
    startsAt: string;
    endsAt?: string;
    location: string;
    capacity?: number;
    checkinMode?: "manual" | "auto";
  }
): Promise<PlayEvent> {
  if (!supabase) throw new Error("Supabase is not configured");
  await ensureAnonymousUser();
  await joinRemoteRoom(room.code);
  const { data, error } = await supabase.rpc("create_play_event_with_mode", {
    p_room_id: room.id,
    p_title: input.title,
    p_play_date: input.playDate,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt || null,
    p_location: input.location,
    p_capacity: input.capacity ?? null,
    p_checkin_mode: input.checkinMode ?? "manual"
  }).single();
  if (error) throw error;
  return data as PlayEvent;
}

export async function registerEventGuest(publicCode: string, name: string): Promise<PublicPlayEvent> {
  if (!supabase) throw new Error("Supabase is not configured");
  await ensureAnonymousUser();
  const { data, error } = await supabase.rpc("register_event_guest", {
    p_public_code: publicCode.toUpperCase(), p_name: name
  }).single();
  if (error) throw error;
  return data as PublicPlayEvent;
}

export async function approveEventGuest(roomId: string, eventId: string, guestId: string): Promise<EventAttendance> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.rpc("approve_event_guest", {
    p_room_id: roomId, p_event_id: eventId, p_guest_id: guestId
  }).single();
  if (error) throw error;
  return data as EventAttendance;
}

export async function confirmGuestPayment(roomId: string, eventId: string, playerId: string): Promise<EventAttendance> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.rpc("confirm_guest_payment", {
    p_room_id: roomId, p_event_id: eventId, p_player_id: playerId
  }).single();
  if (error) throw error;
  return data as EventAttendance;
}

export async function listPlayEvents(roomId: string): Promise<PlayEvent[]> {
  if (!supabase) return [];
  await ensureAnonymousUser();
  const { data, error } = await supabase
    .from("play_events")
    .select("*")
    .eq("room_id", roomId)
    .order("play_date", { ascending: false })
    .order("starts_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PlayEvent[];
}

export async function listEventAttendance(eventId: string): Promise<EventAttendance[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("play_event_attendance")
    .select("*")
    .eq("event_id", eventId)
    .order("updated_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as EventAttendance[];
}

export async function getPublicPlayEvent(publicCode: string): Promise<PublicPlayEvent> {
  if (!supabase) throw new Error("Supabase is not configured");
  await ensureAnonymousUser();
  const { data, error } = await supabase.rpc("get_public_play_event", {
    p_public_code: publicCode.toUpperCase()
  }).single();
  if (error) throw error;
  if (!data) throw new Error("ไม่พบกิจกรรมนี้");
  return data as PublicPlayEvent;
}

export async function setPublicAttendance(
  publicCode: string,
  playerId: string,
  response: AttendanceResponse,
  checkIn = false
): Promise<PublicPlayEvent> {
  if (!supabase) throw new Error("Supabase is not configured");
  await ensureAnonymousUser();
  const { data, error } = await supabase.rpc("set_public_play_attendance", {
    p_public_code: publicCode.toUpperCase(),
    p_player_id: playerId,
    p_response: response,
    p_check_in: checkIn
  }).single();
  if (error) throw error;
  return data as PublicPlayEvent;
}

export async function markAttendanceQueued(
  roomId: string,
  eventId: string,
  playerId: string
): Promise<EventAttendance> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.rpc("mark_play_attendance_queued", {
    p_room_id: roomId,
    p_event_id: eventId,
    p_player_id: playerId
  }).single();
  if (error) throw error;
  return data as EventAttendance;
}

export function subscribeToEventAttendance(
  eventId: string,
  onChange: () => void
): RealtimeChannel | null {
  if (!supabase) return null;
  return supabase
    .channel(`play-event:${eventId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "play_event_attendance", filter: `event_id=eq.${eventId}` },
      onChange
    )
    .subscribe();
}

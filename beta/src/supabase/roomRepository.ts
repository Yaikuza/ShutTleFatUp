import type { RealtimeChannel } from "@supabase/supabase-js";
import type { AppState, MatchHistory } from "../domain/types";
import { supabase } from "./client";

export type RemoteRoom = {
  id: string;
  code: string;
  state: AppState;
  version: number;
  updated_at: string;
};

async function ensureAnonymousUser(): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data } = await supabase.auth.getSession();
  if (data.session) return;
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
}

export async function createRemoteRoom(code: string, state: AppState): Promise<RemoteRoom> {
  if (!supabase) throw new Error("Supabase is not configured");
  await ensureAnonymousUser();
  const { data, error } = await supabase.rpc("create_room", {
    p_code: code.toUpperCase(),
    p_state: state
  }).single();
  if (error) throw error;
  return data as RemoteRoom;
}

export async function joinRemoteRoom(code: string): Promise<RemoteRoom> {
  if (!supabase) throw new Error("Supabase is not configured");
  await ensureAnonymousUser();
  const { data, error } = await supabase.rpc("join_room", {
    p_code: code.toUpperCase()
  }).single();
  if (error) throw error;
  return data as RemoteRoom;
}

export async function saveRemoteRoom(
  roomId: string,
  state: AppState,
  expectedVersion: number
): Promise<RemoteRoom | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("rooms")
    .update({
      state,
      version: expectedVersion + 1,
      updated_at: new Date().toISOString()
    })
    .eq("id", roomId)
    .eq("version", expectedVersion)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as RemoteRoom | null;
}

export async function saveRemoteMatches(roomId: string, matches: MatchHistory[]): Promise<void> {
  if (!supabase || !matches.length) return;
  const rows = matches.map(match => ({
    id: match.id,
    room_id: roomId,
    round: match.round,
    court_id: match.courtId,
    team_a: match.teamA,
    team_b: match.teamB,
    libero_a: match.liberoA ?? null,
    libero_b: match.liberoB ?? null,
    winner: match.winner,
    played_at: match.playedAt
  }));
  const { error } = await supabase.from("room_matches").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

export async function listRemoteMatches(roomId: string): Promise<MatchHistory[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("room_matches")
    .select("id, round, court_id, team_a, team_b, libero_a, libero_b, winner, played_at")
    .eq("room_id", roomId)
    .order("played_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id,
    round: row.round,
    courtId: row.court_id,
    teamA: row.team_a,
    teamB: row.team_b,
    liberoA: row.libero_a,
    liberoB: row.libero_b,
    winner: row.winner,
    playedAt: row.played_at
  })) as MatchHistory[];
}

export function subscribeToRoom(
  roomId: string,
  onState: (room: RemoteRoom) => void
): RealtimeChannel | null {
  if (!supabase) return null;
  return supabase
    .channel(`room:${roomId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
      payload => onState(payload.new as RemoteRoom)
    )
    .subscribe();
}

export async function leaveRoomChannel(channel: RealtimeChannel | null): Promise<void> {
  if (supabase && channel) await supabase.removeChannel(channel);
}

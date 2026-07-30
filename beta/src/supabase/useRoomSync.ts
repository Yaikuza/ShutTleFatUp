import { useEffect, useRef, useState, type Dispatch } from "react";
import type { AppAction } from "../app/appReducer";
import type { AppState, MatchHistory } from "../domain/types";
import { isSupabaseConfigured } from "./client";
import {
  createRemoteRoom,
  joinRemoteRoom,
  listRemoteMatches,
  leaveRoomChannel,
  saveRemoteMatches,
  saveRemoteRoom,
  subscribeToRoom,
  type RemoteRoom
} from "./roomRepository";

type RoomMeta = Pick<RemoteRoom, "id" | "code" | "version">;
export type SyncStatus = "local" | "connecting" | "synced" | "saving" | "offline" | "error";

const ROOM_KEY = "bdm_rotation_beta_room";

function loadRoomMeta(): RoomMeta | null {
  try {
    const value = localStorage.getItem(ROOM_KEY);
    return value ? JSON.parse(value) as RoomMeta : null;
  } catch {
    return null;
  }
}

export function useRoomSync(state: AppState, dispatch: Dispatch<AppAction>) {
  const [room, setRoom] = useState<RoomMeta | null>(loadRoomMeta);
  const [status, setStatus] = useState<SyncStatus>(room ? "connecting" : "local");
  const [message, setMessage] = useState("");
  const [remoteHistory, setRemoteHistory] = useState<MatchHistory[]>([]);
  const [saveSignal, setSaveSignal] = useState(0);
  const versionRef = useRef(room?.version ?? 0);
  const lastRemoteState = useRef("");
  const connectedRoomId = useRef<string | null>(null);
  const saveInFlight = useRef(false);
  const savePending = useRef(false);

  const applyRemote = (remote: RemoteRoom) => {
    versionRef.current = remote.version;
    lastRemoteState.current = JSON.stringify(remote.state);
    const meta = { id: remote.id, code: remote.code, version: remote.version };
    connectedRoomId.current = remote.id;
    setRoom(meta);
    localStorage.setItem(ROOM_KEY, JSON.stringify(meta));
    dispatch({ type: "state/replace", state: remote.state });
    setStatus("synced");
  };

  const createRoom = async (code: string) => {
    if (!isSupabaseConfigured || code.trim().length !== 6) return;
    setStatus("connecting");
    setMessage("");
    try {
      const remote = await createRemoteRoom(code, state);
      applyRemote(remote);
    } catch (error) {
      setStatus("error");
      const detail = error instanceof Error ? error.message : "";
      setMessage(
        detail.toLowerCase().includes("duplicate") || detail.toLowerCase().includes("unique")
          ? "ห้องนี้มีอยู่แล้ว กดเข้าห้องได้เลย"
          : detail || "สร้างห้องไม่สำเร็จ"
      );
    }
  };

  const joinRoom = async (code: string) => {
    if (!isSupabaseConfigured || code.trim().length !== 6) return;
    setStatus("connecting");
    setMessage("");
    try {
      applyRemote(await joinRemoteRoom(code));
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "เข้าห้องไม่สำเร็จ");
    }
  };

  const leaveRoom = () => {
    localStorage.removeItem(ROOM_KEY);
    setRoom(null);
    versionRef.current = 0;
    lastRemoteState.current = "";
    connectedRoomId.current = null;
    saveInFlight.current = false;
    savePending.current = false;
    setStatus("local");
    setMessage("");
    setRemoteHistory([]);
  };

  useEffect(() => {
    if (!room || !isSupabaseConfigured) return;
    let active = true;
    listRemoteMatches(room.id)
      .then(matches => { if (active) setRemoteHistory(matches); })
      .catch(() => { if (active) setMessage("โหลดสถิติถาวรไม่สำเร็จ กรุณาตรวจ schema Supabase"); });
    return () => { active = false; };
  }, [room?.id]);

  useEffect(() => {
    if (!room || !isSupabaseConfigured || !state.history.length) return;
    const missing = state.history.filter(match => !remoteHistory.some(saved => saved.id === match.id));
    if (!missing.length) return;
    const timer = window.setTimeout(() => {
      saveRemoteMatches(room.id, missing)
        .then(() => listRemoteMatches(room.id))
        .then(setRemoteHistory)
        .catch(() => setMessage("ผลเกมเก็บในเครื่องแล้ว แต่ยังบันทึกสถิติถาวรไม่สำเร็จ"));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [state.history, room?.id, remoteHistory]);

  useEffect(() => {
    if (!room || !isSupabaseConfigured) return;
    let active = true;
    setStatus("connecting");
    joinRemoteRoom(room.code)
      .then(remote => { if (active) applyRemote(remote); })
      .catch(() => { if (active) setStatus("offline"); });
    const channel = subscribeToRoom(room.id, remote => {
      if (remote.version > versionRef.current) applyRemote(remote);
    });
    return () => {
      active = false;
      void leaveRoomChannel(channel);
    };
  }, [room?.id]);

  useEffect(() => {
    if (!room || !isSupabaseConfigured || connectedRoomId.current !== room.id) return;
    if (saveInFlight.current) {
      savePending.current = true;
      return;
    }
    const serialized = JSON.stringify(state);
    if (!lastRemoteState.current) {
      lastRemoteState.current = serialized;
      return;
    }
    if (serialized === lastRemoteState.current) return;
    const timer = window.setTimeout(async () => {
      if (saveInFlight.current) return;
      saveInFlight.current = true;
      setStatus("saving");
      try {
        const saved = await saveRemoteRoom(room.id, state, versionRef.current);
        if (!saved) {
          applyRemote(await joinRemoteRoom(room.code));
          setMessage("มีการแก้จากอีกเครื่อง ระบบโหลดข้อมูลล่าสุดแล้ว");
          return;
        }
        versionRef.current = saved.version;
        lastRemoteState.current = JSON.stringify(saved.state);
        const meta = { id: saved.id, code: saved.code, version: saved.version };
        setRoom(meta);
        localStorage.setItem(ROOM_KEY, JSON.stringify(meta));
        setStatus("synced");
      } catch {
        setStatus("offline");
        setMessage("บันทึกในเครื่องแล้ว รอเชื่อมต่อเพื่อ sync");
      } finally {
        saveInFlight.current = false;
        if (savePending.current) {
          savePending.current = false;
          setSaveSignal(value => value + 1);
        }
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [state, room?.id, room?.code, saveSignal]);

  return {
    configured: isSupabaseConfigured,
    room,
    status,
    message,
    remoteHistory,
    createRoom,
    joinRoom,
    leaveRoom
  };
}

import { useEffect, useRef, useState, type Dispatch } from "react";
import type { AppAction } from "../app/appReducer";
import type { AppState } from "../domain/types";
import { isSupabaseConfigured } from "./client";
import {
  createRemoteRoom,
  joinRemoteRoom,
  leaveRoomChannel,
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

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function useRoomSync(state: AppState, dispatch: Dispatch<AppAction>) {
  const [room, setRoom] = useState<RoomMeta | null>(loadRoomMeta);
  const [status, setStatus] = useState<SyncStatus>(room ? "connecting" : "local");
  const [message, setMessage] = useState("");
  const versionRef = useRef(room?.version ?? 0);
  const lastRemoteState = useRef("");

  const applyRemote = (remote: RemoteRoom) => {
    versionRef.current = remote.version;
    lastRemoteState.current = JSON.stringify(remote.state);
    const meta = { id: remote.id, code: remote.code, version: remote.version };
    setRoom(meta);
    localStorage.setItem(ROOM_KEY, JSON.stringify(meta));
    dispatch({ type: "state/replace", state: remote.state });
    setStatus("synced");
  };

  const createRoom = async () => {
    if (!isSupabaseConfigured) return;
    setStatus("connecting");
    setMessage("");
    try {
      const remote = await createRemoteRoom(randomCode(), state);
      applyRemote(remote);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "สร้างห้องไม่สำเร็จ");
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
    setStatus("local");
    setMessage("");
  };

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
    if (!room || !isSupabaseConfigured || status === "connecting") return;
    const serialized = JSON.stringify(state);
    if (!lastRemoteState.current) {
      lastRemoteState.current = serialized;
      return;
    }
    if (serialized === lastRemoteState.current) return;
    const timer = window.setTimeout(async () => {
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
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [state, room?.id, status]);

  return {
    configured: isSupabaseConfigured,
    room,
    status,
    message,
    createRoom,
    joinRoom,
    leaveRoom
  };
}

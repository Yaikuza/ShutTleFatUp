import { useEffect, useRef, useState, type Dispatch } from "react";
import type { AppAction } from "../app/appReducer";
import { appReducer } from "../app/appReducer";
import type { AppState, MatchHistory } from "../domain/types";
import { normalizeState } from "../storage";
import { isSupabaseConfigured } from "./client";
import {
  createRemoteRoom,
  joinRemoteRoom,
  listRemoteMatches,
  leaveRoomChannel,
  saveRemoteMatches,
  saveRemoteRoom,
  submitRemoteAction,
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
  const versionRef = useRef(room?.version ?? 0);
  const lastRemoteState = useRef("");
  const connectedRoomId = useRef<string | null>(null);
  const stateRef = useRef(state);
  const actionQueue = useRef<Promise<void>>(Promise.resolve());
  stateRef.current = state;

  const applyRemote = (remote: RemoteRoom) => {
    const normalizedState = normalizeState(remote.state);
    versionRef.current = remote.version;
    lastRemoteState.current = JSON.stringify(normalizedState);
    stateRef.current = normalizedState;
    const meta = { id: remote.id, code: remote.code, version: remote.version };
    connectedRoomId.current = remote.id;
    setRoom(meta);
    localStorage.setItem(ROOM_KEY, JSON.stringify(meta));
    dispatch({ type: "state/replace", state: normalizedState });
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
    setStatus("local");
    setMessage("");
    setRemoteHistory([]);
  };

  const submitAction = (action: AppAction) => {
    if (!room || !isSupabaseConfigured) {
      dispatch(action);
      return;
    }
    setStatus("saving");
    actionQueue.current = actionQueue.current.then(async () => {
      setStatus("saving");
      let base = stateRef.current;
      for (let attempt = 0; attempt < 4; attempt++) {
        const next = appReducer(base, action);
        if (next === base) {
          applyRemote({
            id: room.id,
            code: room.code,
            state: base,
            version: versionRef.current,
            updated_at: new Date().toISOString()
          });
          setMessage("คำสั่งนี้ไม่ถูกใช้ เพราะข้อมูลในห้องเปลี่ยนไปแล้ว");
          return;
        }
        try {
          let saved: RemoteRoom | null;
          let usedLegacySync = false;
          try {
            saved = await submitRemoteAction(room.id, next, action, versionRef.current);
          } catch (error) {
            const detail = error instanceof Error ? error.message.toLowerCase() : "";
            if (!detail.includes("submit_room_action") && !detail.includes("schema cache")) throw error;
            saved = await saveRemoteRoom(room.id, next, versionRef.current);
            usedLegacySync = true;
            setMessage("กำลังใช้ sync แบบเดิม กรุณารัน realtime-actions migration");
          }
          if (saved) {
            applyRemote(saved);
            if (!usedLegacySync) setMessage("");
            return;
          }
          const latest = await joinRemoteRoom(room.code);
          versionRef.current = latest.version;
          base = latest.state;
          stateRef.current = latest.state;
        } catch {
          dispatch(action);
          setStatus("offline");
          setMessage("บันทึก action ในเครื่องแล้ว แต่ยังส่งเข้าห้องไม่สำเร็จ");
          return;
        }
      }
      setStatus("error");
      setMessage("มีการแก้พร้อมกันหลายครั้ง กรุณาลอง action นี้อีกครั้ง");
    });
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

  return {
    configured: isSupabaseConfigured,
    room,
    status,
    message,
    remoteHistory,
    createRoom,
    joinRoom,
    leaveRoom,
    submitAction
  };
}
